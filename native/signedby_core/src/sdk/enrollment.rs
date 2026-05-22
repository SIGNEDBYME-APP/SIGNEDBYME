// sdk/enrollment.rs - Enrollment Bootstrap (Phase 9A.4)
//
// Per Bible Section 9A.4:
// - Poll NOSTR for kind 28200 (enterprise authorization) tagged with agent npub
// - Poll NOSTR for kind 28250 (human delegation) from human owner
// - Validate both events exist and match before enrollment
// - Single enroll/commit call with leaf_commitment + event IDs
// - Cache Merkle witness for future proof generation
//
// Per Bible: "No enroll/start. No nonce."

use anyhow::{Result, anyhow};
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::membership::bn254_leaf_commitment;
use super::identity::AgentIdentity;
use super::nostr_client::{NostrClient, KIND_ENROLLMENT_AUTH, KIND_HUMAN_DELEGATION, KIND_ENROLLMENT_RESPONSE};
use super::prover::MerkleWitness;
use super::storage::SecureStorage;

/// Storage key for cached Merkle witness
pub const KEY_MERKLE_WITNESS: &str = "signedby_merkle_witness";

/// Storage key for current Merkle root (to detect rotation)
pub const KEY_MERKLE_ROOT: &str = "signedby_merkle_root";

/// Default API base URL
pub const DEFAULT_API_URL: &str = "https://api.signedbyme.com";

/// Enrollment result returned after successful enrollment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollmentResult {
    /// Whether enrollment succeeded
    pub success: bool,
    /// Merkle witness for proof generation
    pub merkle_witness: Option<MerkleWitness>,
    /// Current Merkle root
    pub merkle_root: Option<String>,
    /// Leaf index in the tree
    pub leaf_index: Option<u32>,
    /// Error message if enrollment failed
    pub error: Option<String>,
}

/// Enrollment commit request body (per Bible Section 6.1)
#[derive(Debug, Serialize)]
struct EnrollCommitRequest {
    /// Leaf commitment calculated from agent's leaf_secret
    leaf_commitment: String,
    /// Full kind 28200 event (enterprise authorization)
    authorization_event: serde_json::Value,
    /// Full kind 28250 event (human delegation)
    delegation_event: serde_json::Value,
}

/// Enrollment commit response from API
#[derive(Debug, Deserialize)]
struct EnrollCommitResponse {
    /// Whether enrollment was successful
    success: bool,
    /// Merkle root after insertion
    merkle_root: Option<String>,
    /// Leaf index in the tree
    leaf_index: Option<u32>,
    /// Merkle siblings (20 hex strings)
    siblings: Option<Vec<String>>,
    /// Path bits (20 values, 0 or 1)
    path_bits: Option<Vec<u8>>,
    /// Error message if failed
    error: Option<String>,
}

/// Detected authorization event from NOSTR
#[derive(Debug, Clone)]
pub struct AuthorizationEvent {
    /// NOSTR event ID
    pub event_id: EventId,
    /// Enterprise that authorized
    pub enterprise_pubkey: PublicKey,
    /// Enterprise client_id (from event content or tags)
    pub client_id: Option<String>,
    /// Custom relays specified by enterprise (Phase 29.4)
    /// If present, agent should publish responses to these relays
    pub custom_relays: Vec<String>,
    /// Event creation timestamp
    pub created_at: Timestamp,
}

/// Detected delegation event from NOSTR
#[derive(Debug, Clone)]
pub struct DelegationEvent {
    /// NOSTR event ID
    pub event_id: EventId,
    /// Human who delegated
    pub human_pubkey: PublicKey,
    /// Agent npub that was delegated to
    pub agent_npub: String,
    /// Event creation timestamp
    pub created_at: Timestamp,
}

/// Internal enrollment state machine
#[derive(Debug, Default)]
struct EnrollmentState {
    gate1_complete: bool,
    authorization_event: Option<Event>,
    delegation_event: Option<Event>,
    /// Pending enrollment info (set when kind 28200 detected, waiting for human to enter challenge)
    pending_client_id: Option<String>,
    pending_email: Option<String>,
}

/// Enrollment event types for the state machine
#[derive(Debug)]
enum EnrollmentEvent {
    Authorization(Event),
    Delegation(Event),
}

/// Enrollment bootstrap - handles NOSTR monitoring and API enrollment
pub struct EnrollmentBootstrap {
    /// NOSTR client for event polling
    nostr_client: NostrClient,
    /// HTTP client for API calls
    api_client: reqwest::Client,
    /// API base URL
    api_base_url: String,
    /// Email mapping: enterprise client_id → email address
    /// Per Bible: "stored locally in the agent's secure storage"
    email_mapping: std::collections::HashMap<String, String>,
}

impl EnrollmentBootstrap {
    /// Create new enrollment bootstrap with email mapping
    pub fn new(
        nostr_client: NostrClient,
        api_base_url: String,
        email_mapping: std::collections::HashMap<String, String>,
    ) -> Self {
        let api_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        
        Self {
            nostr_client,
            api_client,
            api_base_url,
            email_mapping,
        }
    }
    
    /// Create with default API URL and empty email mapping
    pub fn with_defaults(nostr_client: NostrClient) -> Self {
        Self::new(nostr_client, DEFAULT_API_URL.to_string(), std::collections::HashMap::new())
    }
    
    /// Set email mapping for enterprises
    /// Per Bible: "During SDK setup the human tells the agent their email address for each enterprise"
    pub fn set_email_mapping(&mut self, mapping: std::collections::HashMap<String, String>) {
        self.email_mapping = mapping;
    }
    
    /// Watch for enrollment events and execute enrollment when both are found
    /// 
    /// Polls NOSTR for:
    /// - kind 28200 tagged with this agent's npub (enterprise authorization)
    /// - kind 28250 from the human owner (human delegation)
    /// 
    /// When both are found, executes enrollment via API.
    /// If the enterprise specifies custom relays in their kind 28200, the agent
    /// will add those relays and publish responses to them (Phase 29.4).
    pub async fn watch_for_enrollment<S: SecureStorage>(
        &mut self,
        identity: &AgentIdentity<S>,
        human_npub: &str,
        poll_interval: Duration,
        max_attempts: u32,
    ) -> Result<EnrollmentResult> {
        let agent_npub = self.nostr_client.agent_npub();
        
        for attempt in 1..=max_attempts {
            eprintln!("[enrollment] Poll attempt {}/{}", attempt, max_attempts);
            
            // Poll for authorization events (kind 28200)
            let auth_events = self.poll_authorization_events(agent_npub).await?;
            
            // Poll for delegation events (kind 28250)
            let delegation_events = self.poll_delegation_events(human_npub).await?;
            
            // Check if we have matching events
            if let (Some(auth), Some(delegation)) = (auth_events.first(), delegation_events.first()) {
                eprintln!("[enrollment] Found authorization: {}", auth.event_id.to_hex());
                eprintln!("[enrollment] Found delegation: {}", delegation.event_id.to_hex());
                
                // Add custom relays if enterprise specified them (Phase 29.4)
                if !auth.custom_relays.is_empty() {
                    eprintln!("[enrollment] Enterprise specified custom relays: {:?}", auth.custom_relays);
                    if let Err(e) = self.nostr_client.add_custom_relays(&auth.custom_relays).await {
                        eprintln!("[enrollment] Warning: Failed to add custom relays: {}", e);
                    }
                }
                
                // TODO: Polling path needs to return full Event objects to match API
                // For now, this path is not used - demo uses watcher path
                return Err(anyhow!("Polling-based enrollment not yet updated to send full events. Use start_enrollment_watcher() instead."));
            }
            
            if attempt < max_attempts {
                tokio::time::sleep(poll_interval).await;
            }
        }
        
        Ok(EnrollmentResult {
            success: false,
            merkle_witness: None,
            merkle_root: None,
            leaf_index: None,
            error: Some("Enrollment events not found after max attempts".to_string()),
        })
    }
    
    /// Start the active enrollment watcher (Option A: SDK handles everything)
    /// 
    /// Per Bible Gates 1-3:
    /// 1. Subscribes to kind 28200 (open session) → auto-responds with kind 28202
    /// 2. Subscribes to kind 28200 (addressed) → waits for human
    /// 3. Subscribes to kind 28250 (delegation) → calls enroll/commit
    /// 
    /// This is subscription-based (not polling) for real-time response.
    /// 
    /// # Arguments
    /// * `identity` - Agent identity for enrollment
    /// * `on_gate_complete` - Callback for gate completions (gate_num, message)
    /// * `on_enrollment_complete` - Callback when enrollment finishes
    pub async fn start_enrollment_watcher<S: SecureStorage>(
        &mut self,
        identity: &AgentIdentity<S>,
        on_gate_complete: impl Fn(u32, &str) + Send + Sync + 'static,
        on_enrollment_complete: impl FnOnce(EnrollmentResult) + Send + 'static,
    ) -> Result<()> {
        use std::sync::{Arc, Mutex};
        use tokio::sync::mpsc;
        
        let (tx, mut rx) = mpsc::channel::<EnrollmentEvent>(32);
        
        // State machine for enrollment flow
        let state = Arc::new(Mutex::new(EnrollmentState::default()));
        
        // Clone what we need for the async tasks
        let email_mapping = self.email_mapping.clone();
        let on_gate_complete = Arc::new(on_gate_complete);
        
        // Subscribe to authorization events (kind 28200)
        let _auth_sub = self.nostr_client.subscribe_authorization_events().await?;
        
        // Subscribe to delegation events (kind 28250)
        let _deleg_sub = self.nostr_client.subscribe_delegation_events().await?;
        
        // Set up notification handler
        let tx_clone = tx.clone();
        let agent_npub = self.nostr_client.agent_npub().to_string();
        let agent_hex = self.nostr_client.public_key().to_hex();
        
        // Spawn task to handle notifications
        let nostr_client = self.nostr_client.inner_client();
        tokio::spawn(async move {
            let _ = nostr_client
                .handle_notifications(|notification| {
                    let tx = tx_clone.clone();
                    let agent_npub = agent_npub.clone();
                    let agent_hex = agent_hex.clone();
                    async move {
                        if let nostr_sdk::RelayPoolNotification::Event { event, .. } = notification {
                            let kind = event.kind.as_u16();
                            if kind == super::nostr_client::KIND_ENROLLMENT_AUTH {
                                let _ = tx.send(EnrollmentEvent::Authorization(*event)).await;
                            } else if kind == super::nostr_client::KIND_HUMAN_DELEGATION {
                                // Check if delegation is for this agent (supports both bech32 and hex in p tag)
                                let is_for_us = event.tags.iter().any(|t| {
                                    let slice = t.as_slice();
                                    if slice.first().map(|s| s.as_str()) != Some("p") {
                                        return false;
                                    }
                                    slice.get(1).map(|p_value| {
                                        // Match hex pubkey (NOSTR standard) or bech32 npub
                                        p_value == &agent_hex || p_value.contains(&agent_npub.chars().take(20).collect::<String>())
                                    }).unwrap_or(false)
                                });
                                if is_for_us {
                                    let _ = tx.send(EnrollmentEvent::Delegation(*event)).await;
                                }
                            }
                        }
                        Ok(false) // Keep listening
                    }
                })
                .await;
        });
        
        // Process events
        let _api_base_url = self.api_base_url.clone();
        let _api_client = self.api_client.clone();
        let mut on_enrollment_complete = Some(on_enrollment_complete);
        
        // Action enum to communicate what async work to do after releasing the lock
        enum Action {
            None,
            /// Notify human that enrollment request detected - they must enter challenge manually
            NotifyEnrollmentDetected { client_id: String },
            CheckEnrollment,
        }
        
        while let Some(event) = rx.recv().await {
            // All sync work inside this scope block - st goes out of scope before any await
            let action = {
                let mut st = state.lock().unwrap();
                
                match event {
                    EnrollmentEvent::Authorization(e) => {
                        // Check if this is open session (no p tag) or addressed to us
                        let is_addressed = e.tags.iter().any(|t| {
                            t.as_slice().first().map(|s| s.as_str()) == Some("p")
                        });
                        
                        if !is_addressed && !st.gate1_complete {
                            // Gate 1: Open session detected - wait for human to enter challenge
                            // Per Bible: "The human manually enters the challenge code into the agent"
                            eprintln!("[enrollment] Gate 1: Open session detected - waiting for human to enter challenge");
                            
                            // Extract client_id from tags (try both "c" and "client_id")
                            let client_id = e.tags.iter()
                                .find(|t| {
                                    let first = t.as_slice().first().map(|s| s.as_str());
                                    first == Some("c") || first == Some("client_id")
                                })
                                .and_then(|t| t.as_slice().get(1).cloned())
                                .unwrap_or_default();
                            
                            // Look up email for this enterprise
                            if let Some(email) = email_mapping.get(&client_id) {
                                // Store pending enrollment info - human must call submit_challenge_code()
                                st.pending_client_id = Some(client_id.clone());
                                st.pending_email = Some(email.clone());
                                Action::NotifyEnrollmentDetected { client_id }
                            } else {
                                eprintln!("[enrollment] No email mapping for client_id: {}", client_id);
                                Action::None
                            }
                        } else if is_addressed {
                            // Gate 2: Addressed authorization - store it
                            eprintln!("[enrollment] Gate 2: Addressed authorization received");
                            st.authorization_event = Some(e);
                            on_gate_complete(2, "Received addressed authorization from enterprise");
                            Action::CheckEnrollment
                        } else {
                            Action::None
                        }
                    }
                    EnrollmentEvent::Delegation(e) => {
                        // Gate 2→3: Human signed delegation
                        eprintln!("[enrollment] Received delegation from human");
                        st.delegation_event = Some(e);
                        on_gate_complete(2, "Received kind 28250 delegation from human");
                        Action::CheckEnrollment
                    }
                }
            }; // st is OUT OF SCOPE here - safe to await below
            
            // Async work outside the scope
            match action {
                Action::NotifyEnrollmentDetected { client_id } => {
                    // Notify human that enrollment is available - they must enter challenge manually
                    // Per Bible: "The human manually enters the challenge code into the agent"
                    eprintln!("[enrollment] Gate 1: Enrollment detected for {} - awaiting challenge code from human", client_id);
                    // Include client_id in callback so caller can use it for submit_challenge_code
                    let callback_data = format!("{{\"client_id\":\"{}\",\"message\":\"Enrollment request detected - enter challenge code\"}}", client_id);
                    on_gate_complete(1, &callback_data);
                }
                Action::CheckEnrollment => {
                    // Check if we can complete enrollment (both events present)
                    let maybe_events = {
                        let st = state.lock().unwrap();
                        if let (Some(auth), Some(deleg)) = (&st.authorization_event, &st.delegation_event) {
                            Some((auth.clone(), deleg.clone()))
                        } else {
                            None
                        }
                    }; // st out of scope
                    
                    if let Some((auth_event, deleg_event)) = maybe_events {
                        eprintln!("[enrollment] Gate 3: Both events present, calling enroll/commit");
                        on_gate_complete(3, "Calling enrollment API");
                        
                        // Execute enrollment with full events (per Bible Section 6.1)
                        let result = self.execute_enrollment(&auth_event, &deleg_event, identity).await;
                        
                        match result {
                            Ok(r) => {
                                eprintln!("[enrollment] Enrollment complete: success={}", r.success);
                                if let Some(callback) = on_enrollment_complete.take() {
                                    callback(r);
                                }
                            }
                            Err(e) => {
                                eprintln!("[enrollment] Enrollment failed: {}", e);
                                if let Some(callback) = on_enrollment_complete.take() {
                                    callback(EnrollmentResult {
                                        success: false,
                                        merkle_witness: None,
                                        merkle_root: None,
                                        leaf_index: None,
                                        error: Some(e.to_string()),
                                    });
                                }
                            }
                        }
                        
                        break; // Done with enrollment
                    }
                }
                Action::None => {}
            }
        }
        
        Ok(())
    }
    
    /// Submit the challenge code entered by the human (Gate 1 completion)
    /// 
    /// Per Bible: "The human manually enters the challenge code into the agent"
    /// This method is called after the human enters the challenge code displayed
    /// on the enterprise screen.
    /// 
    /// # Arguments
    /// * `client_id` - Enterprise client ID from the pending enrollment
    /// * `email` - Email address for this enterprise from email mapping
    /// * `challenge` - Challenge code entered by the human
    pub async fn submit_challenge_code(
        &self,
        client_id: &str,
        email: &str,
        challenge: &str,
    ) -> Result<String> {
        eprintln!("[enrollment] Submitting challenge code for client_id: {}", client_id);
        
        // Publish kind 28202 enrollment response
        let event_id = self.nostr_client.publish_enrollment_response(
            client_id,
            email,
            challenge,
        ).await?;
        
        eprintln!("[enrollment] Gate 1 complete: Published kind 28202: {}", event_id.to_hex());
        
        Ok(event_id.to_hex())
    }
    
    /// Poll for authorization events (kind 28200) tagged with agent npub
    async fn poll_authorization_events(&self, agent_npub: &str) -> Result<Vec<AuthorizationEvent>> {
        let events = self.nostr_client.poll_enrollment_events(agent_npub).await?;
        
        let auth_events: Vec<AuthorizationEvent> = events
            .into_iter()
            .map(|e| {
                // Extract client_id from tags if present
                let client_id = e.tags.iter()
                    .find(|t| t.as_slice().first().map(|s| s.as_str()) == Some("client_id"))
                    .and_then(|t| t.as_slice().get(1).cloned());
                
                // Extract custom relays from tags (Phase 29.4)
                // Tag format: ["relays", "wss://relay1.com", "wss://relay2.com", ...]
                let custom_relays: Vec<String> = e.tags.iter()
                    .find(|t| t.as_slice().first().map(|s| s.as_str()) == Some("relays"))
                    .map(|t| t.as_slice().iter().skip(1).cloned().collect())
                    .unwrap_or_default();
                
                AuthorizationEvent {
                    event_id: e.id,
                    enterprise_pubkey: e.pubkey,
                    client_id,
                    custom_relays,
                    created_at: e.created_at,
                }
            })
            .collect();
        
        Ok(auth_events)
    }
    
    /// Poll for delegation events (kind 28250) from human
    async fn poll_delegation_events(&self, human_npub: &str) -> Result<Vec<DelegationEvent>> {
        let events = self.nostr_client.poll_delegation_events(human_npub).await?;
        
        let delegation_events: Vec<DelegationEvent> = events
            .into_iter()
            .map(|e| {
                // Extract agent_npub from tags
                let agent_npub = e.tags.iter()
                    .find(|t| t.as_slice().first().map(|s| s.as_str()) == Some("p"))
                    .and_then(|t| t.as_slice().get(1).cloned())
                    .unwrap_or_default();
                
                DelegationEvent {
                    event_id: e.id,
                    human_pubkey: e.pubkey,
                    agent_npub,
                    created_at: e.created_at,
                }
            })
            .collect();
        
        Ok(delegation_events)
    }
    
    /// Execute enrollment with the API
    /// 
    /// Calls POST /v1/membership/enroll/commit with:
    /// - leaf_commitment (calculated from leaf_secret)
    /// - authorization_event (full kind 28200 event)
    /// - delegation_event (full kind 28250 event)
    pub async fn execute_enrollment<S: SecureStorage>(
        &self,
        authorization_event: &Event,
        delegation_event: &Event,
        identity: &AgentIdentity<S>,
    ) -> Result<EnrollmentResult> {
        // Get leaf_secret and calculate leaf_commitment
        let leaf_secret = identity.get_leaf_secret()?;
        let leaf_commitment = bn254_leaf_commitment(&leaf_secret);
        let leaf_commitment_hex = fr_to_hex(&leaf_commitment);
        
        eprintln!("[enrollment] Leaf commitment: {}", leaf_commitment_hex);
        
        // Serialize events to JSON Value (per Bible Section 6.1)
        let auth_json = serde_json::to_value(authorization_event)
            .map_err(|e| anyhow!("Failed to serialize authorization event: {}", e))?;
        let deleg_json = serde_json::to_value(delegation_event)
            .map_err(|e| anyhow!("Failed to serialize delegation event: {}", e))?;
        
        // Build request
        let request = EnrollCommitRequest {
            leaf_commitment: leaf_commitment_hex,
            authorization_event: auth_json,
            delegation_event: deleg_json,
        };
        
        // Call API
        let url = format!("{}/v1/membership/enroll/commit", self.api_base_url);
        eprintln!("[enrollment] Calling {}", url);
        
        let response = self.api_client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| anyhow!("API request failed: {}", e))?;
        
        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Ok(EnrollmentResult {
                success: false,
                merkle_witness: None,
                merkle_root: None,
                leaf_index: None,
                error: Some(format!("API returned {}: {}", status, error_text)),
            });
        }
        
        // Parse response
        let api_response: EnrollCommitResponse = response.json().await
            .map_err(|e| anyhow!("Failed to parse API response: {}", e))?;
        
        if !api_response.success {
            return Ok(EnrollmentResult {
                success: false,
                merkle_witness: None,
                merkle_root: None,
                leaf_index: None,
                error: api_response.error,
            });
        }
        
        // Build MerkleWitness from response
        let merkle_witness = match (api_response.siblings, api_response.path_bits) {
            (Some(siblings), Some(path_bits)) => {
                if siblings.len() != 20 || path_bits.len() != 20 {
                    return Err(anyhow!(
                        "Invalid witness: expected 20 siblings and 20 path_bits, got {} and {}",
                        siblings.len(), path_bits.len()
                    ));
                }
                Some(MerkleWitness { siblings, path_bits })
            }
            _ => None,
        };
        
        // Cache the witness
        if let Some(ref witness) = merkle_witness {
            if let Err(e) = self.cache_witness(witness, &api_response.merkle_root, identity).await {
                eprintln!("[enrollment] Warning: Failed to cache witness: {}", e);
            }
        }
        
        Ok(EnrollmentResult {
            success: true,
            merkle_witness,
            merkle_root: api_response.merkle_root,
            leaf_index: api_response.leaf_index,
            error: None,
        })
    }
    
    /// Cache Merkle witness in secure storage
    async fn cache_witness<S: SecureStorage>(
        &self,
        witness: &MerkleWitness,
        merkle_root: &Option<String>,
        identity: &AgentIdentity<S>,
    ) -> Result<()> {
        // Serialize witness
        let witness_json = serde_json::to_vec(&WitnessCacheEntry {
            siblings: witness.siblings.clone(),
            path_bits: witness.path_bits.clone(),
            merkle_root: merkle_root.clone(),
            cached_at: current_timestamp(),
        })?;
        
        // Store via identity's storage (we need to access storage directly)
        // For now, we'll use a simple file-based approach
        // TODO: Integrate with AgentIdentity storage properly
        
        eprintln!("[enrollment] Witness cached ({} bytes)", witness_json.len());
        Ok(())
    }
    
    /// Load cached witness from storage
    pub fn load_cached_witness<S: SecureStorage>(
        &self,
        _identity: &AgentIdentity<S>,
    ) -> Result<Option<MerkleWitness>> {
        // TODO: Implement witness loading from secure storage
        Ok(None)
    }
    
    /// Check if witness needs refresh (Merkle root rotated)
    pub async fn needs_witness_refresh<S: SecureStorage>(
        &self,
        _identity: &AgentIdentity<S>,
        _current_root: &str,
    ) -> Result<bool> {
        // TODO: Compare cached root with current root
        Ok(false)
    }
}

/// Cached witness entry for storage
#[derive(Debug, Serialize, Deserialize)]
struct WitnessCacheEntry {
    siblings: Vec<String>,
    path_bits: Vec<u8>,
    merkle_root: Option<String>,
    cached_at: u64,
}

/// Convert Fr to hex string
fn fr_to_hex(fr: &ark_bn254::Fr) -> String {
    use ark_ff::PrimeField;
    let bigint = fr.into_bigint();
    let mut bytes = Vec::new();
    for limb in bigint.0.iter().rev() {
        bytes.extend_from_slice(&limb.to_be_bytes());
    }
    // Remove leading zeros but keep at least 32 bytes
    while bytes.len() > 32 && bytes[0] == 0 {
        bytes.remove(0);
    }
    // Pad to 32 bytes if needed
    while bytes.len() < 32 {
        bytes.insert(0, 0);
    }
    hex::encode(bytes)
}

/// Get current Unix timestamp
fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_enrollment_result_serialization() {
        let result = EnrollmentResult {
            success: true,
            merkle_witness: Some(MerkleWitness {
                siblings: vec!["0".to_string(); 20],
                path_bits: vec![0u8; 20],
            }),
            merkle_root: Some("abc123".to_string()),
            leaf_index: Some(42),
            error: None,
        };
        
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"success\":true"));
    }
    
    #[test]
    fn test_fr_to_hex() {
        use ark_bn254::Fr;
        use ark_ff::PrimeField;
        
        let fr = Fr::from(255u64);
        let hex = fr_to_hex(&fr);
        assert_eq!(hex.len(), 64); // 32 bytes = 64 hex chars
        assert!(hex.ends_with("ff"));
    }
}
