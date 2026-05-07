# SignedByMe — Enterprise Integration Guide

[← Back to Home](../)

Last updated: April 2026 · Estimated integration time: 2-4 hours

## Contents

- [What is SignedByMe?](#1-what-is-signedbyme)
- [Prerequisites & Getting Started](#2-prerequisites--getting-started)
- [Enterprise Setup (One-Time)](#3-enterprise-setup-one-time)
- [Add "Authorize your Agent" to Your Website](#4-add-authorize-your-agent-to-your-website)
- [Implement Agent Login](#5-implement-agent-login)
- [API Reference](#6-api-reference)
- [Integrate with Your IAM](#7-integrate-with-your-iam)
- [Human Control (Delegation & Revocation)](#8-human-control-delegation--revocation)
- [Security Considerations](#9-security-considerations)
- [Troubleshooting](#10-troubleshooting)

---

## 1. What is SignedByMe?

SignedByMe is the identity layer for autonomous agents.

Your agents get their own cryptographic identity (npub) that:

- Is controlled by the human who owns the agent
- Is verifiable via standard OIDC (same as Google/Okta)
- Is revocable instantly by the human
- Cannot be forged without breaking Bitcoin-grade cryptography

Integration is the same as adding "Sign in with Google" — you receive standard OIDC tokens with `sub=npub`.

### Five Security Guarantees

| Layer | What it prevents |
|-------|------------------|
| Agent cannot lie about identity | npub is a mathematical output of the ZK proof, not a claim |
| Agent cannot exceed authorization | Scopes are signed by the human owner, readable from NOSTR |
| Human retains the kill switch | Revocation event locks agent out instantly |
| Enterprise controls their Merkle tree | Agent can only authenticate where enrolled |
| Auditable without trusting anyone | Full trail on public NOSTR relays |

---

## 2. Prerequisites & Getting Started

### What You Need

| Item | Description | How to Get |
|------|-------------|------------|
| Client ID | Your enterprise identifier (e.g., "amazon") | Contact SignedByMe |
| API Key | Bearer token for API authentication | Delivered via encrypted message |
| Enterprise NOSTR Keypair | nsec/npub for signing enrollment events | Generate locally (see below) |
| NIP-05 Identity | Verifiable NOSTR identity at your domain | Add file to your webserver |
| nostr-tools | JavaScript library for NOSTR | `npm install nostr-tools` |

### Required Technical Skills

- Basic JavaScript (browser or Node.js)
- Ability to add files to your web server
- Familiarity with WebSockets (for NOSTR relay)
- Understanding of OIDC/JWT (standard IAM knowledge)

---

## 3. Enterprise Setup (One-Time)

### 3.1 Get API Credentials

Contact SignedByMe to register. You'll receive:

- `client_id` — Your unique identifier (e.g., amazon, acme)
- API Key — Bearer token for API calls (delivered securely)

> **Security:** Store the API key in your secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.). Never commit to git.

### 3.2 Generate Your Enterprise NOSTR Keypair

Your enterprise needs a NOSTR keypair to sign enrollment authorization events (kind 28200).

```javascript
// generate-enterprise-keys.js
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode, npubEncode } from 'nostr-tools/nip19';

const secretKey = generateSecretKey();
const publicKey = getPublicKey(secretKey);

console.log('Enterprise NOSTR Keys (SAVE THESE SECURELY)');
console.log('==========================================');
console.log('Private Key (nsec):', nsecEncode(secretKey));
console.log('Public Key (npub):', npubEncode(publicKey));
console.log('Public Key (hex):', publicKey);
```

Run: `node generate-enterprise-keys.js`

Save output to your secrets manager. The nsec is your signing key — never expose it in client-side code.

### 3.3 Set Up Your NIP-05 Identity

Create a file at `https://yourdomain.com/.well-known/nostr.json`:

```json
{
  "names": {
    "signedby": "YOUR_ENTERPRISE_NPUB_HEX_HERE"
  },
  "relays": {
    "YOUR_ENTERPRISE_NPUB_HEX_HERE": [
      "wss://relay.signedbyme.com",
      "wss://relay-sfo.signedbyme.com",
      "wss://relay-ams.signedbyme.com",
      "wss://relay-sgp.signedbyme.com"
    ]
  },
  "lightning": "payments@yourdomain.com"
}
```

**Requirements:**
- Must be served over HTTPS
- Must have `Access-Control-Allow-Origin: *` header
- The `lightning` field is optional (for receiving revenue share)

Verify it works:

```bash
curl https://yourdomain.com/.well-known/nostr.json
```

---

## 4. Add "Authorize your Agent" to Your Website

> **Action Required:** Add a button labeled "Authorize your Agent" to your website. This is the entry point for the agent enrollment flow.

### 4.1 Where to Add It

Add the "Authorize your Agent" button anywhere a logged-in user should be able to authorize an agent:

- User settings/preferences page
- Security settings
- Account management
- Dedicated "Agents" or "Integrations" page

> **Critical:** The user must be already authenticated with your system before they can authorize an agent. This is Gate 1 of the genesis flow — you verify the user's email matches your records.

### 4.2 HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>Account Settings - Your Company</title>
  <!-- Load nostr-tools -->
  <script type="module">
    import { finalizeEvent, getPublicKey } from 'https://cdn.jsdelivr.net/npm/nostr-tools@2.7.0/+esm';
    import { decode } from 'https://cdn.jsdelivr.net/npm/nostr-tools@2.7.0/nip19/+esm';
    window.nostrFinalizeEvent = finalizeEvent;
    window.nostrGetPublicKey = getPublicKey;
    window.nip19 = { decode };
  </script>
</head>
<body>
  <h1>Account Settings</h1>

  <!-- Authorize an Agent Section -->
  <div id="agent-authorization">
    <h2>Authorize your Agent</h2>
    <p>Allow an AI agent to act on your behalf with limited permissions.</p>

    <!-- Step 1: Show challenge code -->
    <div id="auth-step-1">
      <p>Enter this code in your agent:</p>
      <div id="challenge-code" class="challenge-display">A1B2C3D4E5F67890</div>
      <p class="hint">Waiting for agent response...</p>
    </div>

    <!-- Step 2: Confirm agent details -->
    <div id="auth-step-2" style="display: none;">
      <p>Agent requesting authorization:</p>
      <div>Agent ID: <code id="agent-npub"></code></div>
      <button id="confirm-auth-btn">Confirm Authorization</button>
      <button id="deny-auth-btn">Deny</button>
    </div>

    <!-- Step 3: Success -->
    <div id="auth-step-3" style="display: none;">
      <p>✅ Agent authorized successfully!</p>
    </div>
  </div>

  <script src="signedby-integration.js"></script>
</body>
</html>
```

### 4.3 The 3-Gate Genesis Flow

When a user clicks "Authorize your Agent", the genesis flow runs. This is a one-time process per agent per enterprise — it never repeats.

#### Gate 1 — Email Match + Identity Binding

1. User is logged into your system (you know their email)
2. Your system generates a challenge code and displays it
3. Your system publishes an open kind 28200 session event to NOSTR (no npub yet, just client_id)
4. Agent detects the event, human enters the challenge code in the agent
5. Agent publishes kind 28202 with email + npub + challenge code
6. Your system verifies: email matches logged-in user? challenge matches? signature valid?
7. Gate 1 passed. You now have the agent's npub.

##### Custom Relay Configuration (Optional)

By default, agents use SignedByMe's relay infrastructure. If you want agents to publish to your own relays instead, add a relays tag to your kind 28200 event:

```json
{
  "kind": 28200,
  "tags": [
    ["c", "your-client-id"],
    ["relays", "wss://your-relay.com", "wss://backup-relay.com"]
  ],
  "content": "{\"client_id\":\"your-client-id\",\"expires_at\":\"...\"}"
}
```

If you specify custom relays: The agent will publish responses to those relays. You are responsible for subscribing to and monitoring your own relays.

#### Gate 2 — Human's Cryptographic Consent

1. Your system publishes an addressed kind 28200 (now tagged with the specific agent_npub)
2. Agent receives it, notifies human: "Amazon wants to authorize me"
3. Human signs kind 28250 (delegation_grant) with their own NOSTR client — not the agent
4. Human publishes kind 28250 to relay
5. Your system catches kind 28250, validates signature, checks expires_at
6. Gate 2 passed. Human has cryptographically consented.

> **Critical:** The human's nsec never enters the agent. Human signs with their own NOSTR client. A rogue agent cannot forge this.

#### Gate 3 — ZK Proof of Leaf Ownership

1. Agent calls `POST /v1/membership/enroll/commit` with:
   - `leaf_commitment` (hash of agent's secret)
   - `authorization_event` (kind 28200 from your system)
   - `delegation_event` (kind 28250 from human)
2. SignedByMe server verifies both Schnorr signatures via NIP-05
3. All pass: leaf_commitment appended to Merkle tree
4. Agent fetches witness, caches locally
5. Gate 3 passed. Genesis complete. Never repeats for this enterprise.

### 4.4 JavaScript Implementation

See the full reference implementation: [acme-site/js/app.js](https://github.com/PrivacyLion/SignedByMe/blob/main/acme-site/js/app.js)

```javascript
// Configuration
const CONFIG = {
  CLIENT_ID: 'your-client-id',
  API_BASE: 'https://api.signedbyme.com',
  // SignedByMe relay infrastructure (multi-region)
  RELAYS: [
    'wss://relay.signedbyme.com',     // US East (NYC)
    'wss://relay-sfo.signedbyme.com', // US West (SFO)
    'wss://relay-ams.signedbyme.com', // Europe (AMS)
    'wss://relay-sgp.signedbyme.com'  // Asia (SGP)
  ],
  ENTERPRISE_PUBKEY_HEX: 'your-enterprise-pubkey-hex',
  // SECURITY: In production, sign events from your backend
  ENTERPRISE_PRIVKEY_NSEC: 'nsec1...',
  API_KEY: 'your-api-key'
};

// Generate challenge code
function generateChallengeCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// Generate nonce
function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Initialize authorization flow
async function initAgentAuthorization(userEmail) {
  const challenge = generateChallengeCode();
  const nonce = generateNonce();

  document.getElementById('challenge-code').textContent = challenge;

  // Publish open kind 28200 session
  await publishOpenEnrollmentSession(nonce);

  // Subscribe to relay for agent responses
  subscribeToAgentResponses(nonce, userEmail, challenge);
}
```

### 4.5 Backend Security

> **Never expose your enterprise nsec or API key in client-side JavaScript.**

Create backend endpoints:

```javascript
// Your backend (Node.js example)
app.post('/api/signedby/publish-enrollment', async (req, res) => {
  // Load nsec from secrets manager
  const nsec = await getSecret('ENTERPRISE_NOSTR_NSEC');

  // Sign and publish kind 28200
  const signedEvent = await signNostrEvent(eventTemplate, nsec);
  await publishToRelay(signedEvent);

  res.json({ success: true, eventId: signedEvent.id });
});

app.post('/api/signedby/verify-login', async (req, res) => {
  const { proof, public_outputs } = req.body;

  // Load API key from secrets manager
  const apiKey = await getSecret('SIGNEDBY_API_KEY');

  // Call SignedByMe API from backend
  const response = await fetch('https://api.signedbyme.com/v1/login/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ proof, public_outputs, client_id: 'your-client-id' })
  });

  res.json(await response.json());
});
```

---

## 5. Implement Agent Login

### 5.1 Login Flow Overview

After genesis completes once, every subsequent authentication is automatic:

```
Agent          NOSTR Relay       Your System        SignedByMe
  │                 │                  │                  │
  │ 1. Generate ZK proof              │                  │
  │    (<3 seconds)                   │                  │
  │                 │                  │                  │
  │ 2. Publish kind 28101 ──────────>│                  │
  │    (proof + public_outputs)       │                  │
  │                 │                  │                  │
  │                 │ 3. Catch kind 28101 ──────────────>│
  │                 │                  │                  │
  │                 │<──── 4. Query kind 28250 ─────────│
  │                 │      (validate delegation)        │
  │                 │                  │                  │
  │                 │                  │ 5. POST /v1/login/verify ──>│
  │                 │                  │                  │
  │                 │                  │<────── 6. id_token ─────────│
  │                 │                  │                  │
  │                 │                  │ 7. Agent authenticated      │
```

### 5.2 Subscribe to Login Events

```javascript
import { SimplePool } from 'nostr-tools/pool';

const pool = new SimplePool();

// Subscribe to all SignedByMe relays for redundancy
const RELAYS = [
  'wss://relay.signedbyme.com',
  'wss://relay-sfo.signedbyme.com',
  'wss://relay-ams.signedbyme.com',
  'wss://relay-sgp.signedbyme.com'
];

const sub = pool.subscribeMany(
  RELAYS,
  [{
    kinds: [28101],
    '#c': ['your-client-id'],
    since: Math.floor(Date.now() / 1000) - 300
  }],
  {
    onevent(event) {
      if (event.kind === 28101) {
        handleLoginProofEvent(event);
      }
    },
    oneose() {
      console.log('End of stored events');
    }
  }
);

// To close subscription when done:
// sub.close();
```

### 5.3 Validate Delegation Chain

Before calling `/v1/login/verify`, validate the delegation:

```javascript
async function validateDelegation(agentNpubHex, delegationId) {
  // Query NOSTR for kind 28250 delegation
  const delegation = await queryNostrEvent({
    kinds: [28250],
    '#p': [agentNpubHex]
  });

  if (!delegation) return false;

  const content = JSON.parse(delegation.content);

  // Check expiry
  if (new Date(content.expires_at) < new Date()) return false;

  // Check for revocation (kind 28251)
  const revocation = await queryNostrEvent({
    kinds: [28251],
    '#d': [content.delegation_id]
  });

  if (revocation) return false;

  // Check scopes include your client_id
  if (!content.scopes?.['your-client-id']) return false;

  return true;
}
```

### 5.4 Verify Proof and Get Token

```javascript
async function verifyProofAndGetToken(proof, publicOutputs) {
  const response = await fetch('https://api.signedbyme.com/v1/login/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      proof: proof,
      public_outputs: publicOutputs,
      client_id: 'your-client-id'
    })
  });

  if (!response.ok) {
    throw new Error('Verification failed');
  }

  const result = await response.json();
  return result.id_token;
}
```

---

## 6. API Reference

**Base URL:** `https://api.signedbyme.com`

### 6.1 Health Check

```
GET /v1/health
```

Response (200 OK):
```json
{
  "status": "healthy",
  "version": "1.0"
}
```

No authentication required. Use for uptime monitoring.

### 6.2 OIDC Discovery

```
GET /.well-known/openid-configuration
```

Response:
```json
{
  "issuer": "https://api.signedbyme.com",
  "jwks_uri": "https://api.signedbyme.com/jwks.json",
  "response_types_supported": ["id_token"],
  "subject_types_supported": ["pairwise"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

No authentication required. Your IAM fetches this automatically.

### 6.3 JWKS (Public Keys)

```
GET /jwks.json
```

Response:
```json
{
  "keys": [{
    "kty": "RSA",
    "kid": "signedby-2026-01",
    "use": "sig",
    "alg": "RS256",
    "n": "...",
    "e": "AQAB"
  }]
}
```

### 6.4 Login Verification

```
POST /v1/login/verify
Content-Type: application/json
Authorization: Bearer <api_key>
```

Request:
```json
{
  "proof": "<groth16_proof_hex>",
  "public_outputs": {
    "merkle_root": "<hex>",
    "npub": "<hex>"
  },
  "client_id": "your-client-id"
}
```

Response (200 OK):
```json
{
  "id_token": "<JWT>",
  "expires_in": 3600
}
```

Server checks ONE thing: Is `merkle_root` in the last 30 valid roots for this client_id?

### 6.5 ID Token Claims

| Claim | Description |
|-------|-------------|
| sub | Agent's npub — globally consistent identifier |
| iss | https://api.signedbyme.com |
| aud | Your client_id |
| membership_verified | true — agent proved Merkle tree membership |
| amr | ["zk_membership"] |

### 6.6 Authentication

All protected endpoints require Bearer token:

```
Authorization: Bearer <your_api_key>
```

### 6.7 Error Responses

| Status | Code | Meaning |
|--------|------|---------|
| 400 | root_expired | merkle_root not in last 30 valid roots |
| 400 | npub_mismatch | agent_npub doesn't match between events |
| 400 | event_replayed | authorization_event_id already used |
| 401 | unauthorized | Missing or invalid Bearer token |
| 422 | signature_invalid | Schnorr signature verification failed |
| 500 | server_error | Internal error |

---

## 7. Integrate with Your IAM

The simplest path: add SignedByMe as an OIDC identity provider in your existing IAM.

### 7.1 Okta

1. Admin Console → Security → Identity Providers
2. Add Identity Provider → OpenID Connect
3. Configure:
   - Name: SignedByMe
   - Issuer: `https://api.signedbyme.com`
   - Client ID: Your SignedByMe client_id
   - Client Secret: Your SignedByMe API key
4. Save

### 7.2 Azure AD / Entra ID

1. Azure Portal → External Identities → All identity providers
2. Add → OpenID Connect (OIDC)
3. Configure:
   - Metadata URL: `https://api.signedbyme.com/.well-known/openid-configuration`
   - Client ID and Secret as above
   - Map claims: sub → User Identifier

### 7.3 Auth0

1. Authentication → Enterprise → OpenID Connect
2. Create Connection:
   - Connection Name: signedby
   - Issuer URL: `https://api.signedbyme.com`
3. Enable for your application

### 7.4 AWS Cognito

1. User Pool → Sign-in experience → Federated identity providers
2. Add identity provider → OpenID Connect
3. Configure provider name, client ID, secret, and issuer URL
4. Attribute mapping: sub → username

### 7.5 Manual Token Validation

```python
# Python example
import jwt
from jwt import PyJWKClient

SIGNEDBY_JWKS_URL = "https://api.signedbyme.com/jwks.json"
SIGNEDBY_ISSUER = "https://api.signedbyme.com"

jwks_client = PyJWKClient(SIGNEDBY_JWKS_URL)

def validate_signedby_token(id_token, expected_client_id):
    signing_key = jwks_client.get_signing_key_from_jwt(id_token)

    claims = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=["RS256"],
        audience=expected_client_id,
        issuer=SIGNEDBY_ISSUER
    )

    return {
        "agent_npub": claims["sub"],
        "membership_verified": claims.get("membership_verified", False)
    }
```

---

## 8. Human Control (Delegation & Revocation)

### Kind 28250 — Delegation Grant

Published by human owner, signed with human's nsec:

```json
{
  "kind": 28250,
  "pubkey": "<human_npub_hex>",
  "tags": [["p", "<agent_npub_hex>"]],
  "content": "{\"agent_npub\":\"npub1...\",\"scopes\":{\"amazon\":[\"read\",\"write\"]},\"expires_at\":\"2027-03-01T00:00:00Z\",\"delegation_id\":\"del_abc123\"}"
}
```

### Kind 28251 — Revocation

Published by human owner. Instant effect.

```json
{
  "kind": 28251,
  "pubkey": "<human_npub_hex>",
  "tags": [["d", "del_abc123"]],
  "content": "{\"revoked_at\":\"2026-04-30T12:00:00Z\"}"
}
```

Your system must check for kind 28251 before accepting any login. A revoked delegation means the agent is no longer authorized.

---

## 9. Security Considerations

- **Never expose your enterprise nsec** — sign events from your backend
- **Never expose your API key** — make API calls from your backend
- **Always validate delegation chain** — check kind 28250 exists, not expired, not revoked
- **Verify NIP-05** — confirm human's npub via their domain's nostr.json
- **Use HTTPS only** — never load integration over HTTP
- **Session timeout** — enrollment sessions should expire after 10 minutes max
- **Nonce uniqueness** — never reuse nonces

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| nip05_unreachable | Your .well-known/nostr.json not accessible | Check CORS headers, HTTPS, file exists |
| signature_invalid | Wrong nsec or corrupted event | Regenerate keys, verify signing code |
| root_expired | Agent's witness too old | Agent should fetch fresh witness |
| event_replayed | Same kind 28200 used twice | Generate new nonce for each enrollment |
| Relay connection fails | Firewall blocking WebSocket | Allow all SignedByMe relays: wss://relay.signedbyme.com, wss://relay-sfo.signedbyme.com, wss://relay-ams.signedbyme.com, wss://relay-sgp.signedbyme.com |
| Agent response not received | Agent not subscribed to relay | Verify agent is watching for kind 28200 |
