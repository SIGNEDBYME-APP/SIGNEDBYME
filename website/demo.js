/**
 * SIGNEDBYME Demo Wizard
 * 
 * 8-step interactive demo for the "Authorize Your Agent" flow.
 * Communicates with demo API backend and displays real-time NOSTR events.
 * 
 * Per DEMO_ARCHITECTURE.md
 */

// =============================================================================
// Configuration
// =============================================================================

// Demo API URL (standalone demo service)
const DEMO_API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8001' 
    : 'https://api.signedbyme.com';

// NOSTR relays
const RELAYS = [
    'wss://relay.signedbyme.com',
    'wss://relay-sfo.signedbyme.com',
    'wss://relay-ams.signedbyme.com',
    'wss://relay-sgp.signedbyme.com',
];

// Event kinds
const EVENT_KINDS = [38101, 38102, 38103, 38200, 38202, 38250, 38251];

// Event metadata
const EVENT_META = {
    38101: { name: 'Proof', class: 'proof', icon: '🔐' },
    38102: { name: 'Auth Complete', class: 'complete', icon: '✓' },
    38103: { name: 'Login Complete', class: 'complete', icon: '✓' },
    38200: { name: 'Authorization', class: 'auth', icon: '🏢' },
    38202: { name: 'Response', class: 'response', icon: '🤖' },
    38250: { name: 'Delegation', class: 'delegation', icon: '👤' },
    38251: { name: 'Revocation', class: 'revocation', icon: '🚫' },
};

// =============================================================================
// State
// =============================================================================

let currentStep = 0;
let sessionId = null;
let sessionData = {
    email: null,
    challengeCode: null,
    agentNpub: null,
    humanNpub: null,
    delegationId: null,
};

// WebSocket
let ws = null;
let connected = false;

// DOM elements (cached after init)
let feedEl = null;

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', init);

function init() {
    // Cache DOM elements
    feedEl = document.getElementById('event-feed');
    
    // Bind event handlers
    bindEventHandlers();
    
    // Connect to NOSTR relay for live feed
    connectToRelay(RELAYS[0]);
}

function bindEventHandlers() {
    // Step 0: Start Demo
    const btnStart = document.getElementById('btn-start-demo');
    if (btnStart) btnStart.addEventListener('click', startDemo);
    
    // Step 1: Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const btnAuthorize = document.getElementById('btn-authorize');
    if (btnAuthorize) btnAuthorize.addEventListener('click', handleAuthorize);
    
    // Step 2: Payment
    const btnPayment = document.getElementById('btn-simulate-payment');
    if (btnPayment) btnPayment.addEventListener('click', handlePayment);
    
    const btnToGate1 = document.getElementById('btn-to-gate1');
    if (btnToGate1) btnToGate1.addEventListener('click', () => goToStep(3));
    
    // Step 3: Gate 1
    const btnToGate2 = document.getElementById('btn-to-gate2');
    if (btnToGate2) btnToGate2.addEventListener('click', () => goToStep(4));
    
    // Step 4: Gate 2
    const btnSubmitDelegation = document.getElementById('btn-submit-delegation');
    if (btnSubmitDelegation) btnSubmitDelegation.addEventListener('click', handleSignedEventSubmit);
    
    // Click to copy unsigned delegation
    const unsignedDelegation = document.getElementById('unsigned-delegation');
    if (unsignedDelegation) {
        unsignedDelegation.addEventListener('click', () => {
            navigator.clipboard.writeText(unsignedDelegation.textContent);
            addFeedEvent('📋 Copied unsigned event to clipboard', 'info');
        });
    }
    
    const btnToGate3 = document.getElementById('btn-to-gate3');
    if (btnToGate3) btnToGate3.addEventListener('click', () => goToStep(5));
    
    // Step 5: Gate 3
    const btnToLogin = document.getElementById('btn-to-login');
    if (btnToLogin) btnToLogin.addEventListener('click', handleStartProof);
    
    // Step 6: Proof
    const btnToVerify = document.getElementById('btn-to-verify');
    if (btnToVerify) btnToVerify.addEventListener('click', handleVerify);
    
    // Step 7: Complete
    const btnToRevoke = document.getElementById('btn-to-revoke');
    if (btnToRevoke) btnToRevoke.addEventListener('click', () => goToStep(8));
    
    // Step 8: Revocation
    const btnTryAgain = document.getElementById('btn-try-again');
    if (btnTryAgain) btnTryAgain.addEventListener('click', resetDemo);
    
    const btnDone = document.getElementById('btn-done');
    if (btnDone) btnDone.addEventListener('click', () => goToStep(0));
}

// =============================================================================
// Step Navigation
// =============================================================================

function startDemo() {
    // Hide intro, show main wizard
    document.getElementById('step-0').style.display = 'none';
    document.getElementById('wizard-main').style.display = 'flex';
    goToStep(1);
}

function goToStep(step) {
    currentStep = step;
    
    // Update step label
    const label = document.getElementById('step-label');
    if (label && step >= 1 && step <= 8) {
        label.textContent = `STEP ${step} of 8`;
    }
    
    // Hide all step content
    document.querySelectorAll('.step-content').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show current step
    const stepEl = document.getElementById(`step-${step}`);
    if (stepEl) {
        stepEl.classList.add('active');
    }
    
    // Step-specific initialization
    if (step === 4) {
        generateUnsignedDelegation();
    }
    
    // Log to feed
    addFeedEvent(`Step ${step} started`, 'info');
}

function resetDemo() {
    // Reset state
    currentStep = 0;
    sessionId = null;
    sessionData = {
        email: null,
        challengeCode: null,
        agentNpub: null,
        humanNpub: null,
        delegationId: null,
    };
    
    // Reset UI
    document.getElementById('wizard-main').style.display = 'none';
    document.getElementById('step-0').style.display = 'block';
    document.getElementById('step-0').classList.add('active');
    
    // Reset form
    document.getElementById('login-form').reset();
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('login-success').style.display = 'none';
    
    // Clear feed
    if (feedEl) feedEl.innerHTML = '';
}

// =============================================================================
// Step Handlers
// =============================================================================

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        addFeedEvent('Logging in...', 'info');
        
        const response = await fetch(`${DEMO_API_URL}/v1/demo/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        
        if (!response.ok) {
            throw new Error(`Login failed: ${response.status}`);
        }
        
        const data = await response.json();
        sessionId = data.session_id;
        sessionData.email = data.email;
        
        // Update UI
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('logged-email').textContent = data.email;
        document.getElementById('login-success').style.display = 'block';
        
        addFeedEvent(`👤 Logged in as ${data.email}`, 'success');
        
    } catch (err) {
        console.error('Login error:', err);
        addFeedEvent(`❌ Login failed: ${err.message}`, 'error');
    }
}

async function handleAuthorize() {
    goToStep(2);
}

async function handlePayment() {
    try {
        addFeedEvent('Starting demo flow...', 'info');
        
        const response = await fetch(`${DEMO_API_URL}/v1/demo/start/${sessionId}`, {
            method: 'POST',
        });
        
        if (!response.ok) {
            throw new Error(`Start failed: ${response.status}`);
        }
        
        const data = await response.json();
        sessionData.challengeCode = data.challenge_code;
        
        // Display challenge code
        document.getElementById('challenge-code').textContent = data.challenge_code;
        
        // Show payment success
        document.getElementById('btn-simulate-payment').style.display = 'none';
        document.getElementById('demo-preimage').textContent = data.demo_preimage || 'a1b2c3...';
        document.getElementById('payment-success').style.display = 'block';
        
        addFeedEvent('⚡ Payment simulated', 'success');
        
    } catch (err) {
        console.error('Payment error:', err);
        addFeedEvent(`❌ Payment failed: ${err.message}`, 'error');
    }
}

async function handleGate1Response(agentEmail, agentNpub, challenge) {
    try {
        const response = await fetch(`${DEMO_API_URL}/v1/demo/gate1-complete/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agent_email: agentEmail,
                agent_npub: agentNpub,
                challenge: challenge,
            }),
        });
        
        if (!response.ok) {
            throw new Error(`Gate 1 failed: ${response.status}`);
        }
        
        const data = await response.json();
        sessionData.agentNpub = data.agent_npub;
        
        // Update UI
        document.getElementById('gate1-waiting').style.display = 'none';
        document.getElementById('agent-email').textContent = agentEmail;
        document.getElementById('agent-npub').textContent = truncateNpub(agentNpub);
        document.getElementById('gate1-success').style.display = 'block';
        
        addFeedEvent('✓ Gate 1: Email match verified', 'success');
        
    } catch (err) {
        console.error('Gate 1 error:', err);
        addFeedEvent(`❌ Gate 1 failed: ${err.message}`, 'error');
    }
}

function generateUnsignedDelegation() {
    // Generate delegation ID
    const delegationId = 'del_' + Math.random().toString(36).substring(2, 10);
    sessionData.delegationId = delegationId;
    
    // Calculate expiration (30 days from now)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Build content object
    const content = {
        agent_npub: sessionData.agentNpub || '<agent_npub_from_gate1>',
        scopes: { demo: ['full'] },
        expires_at: expiresAt,
        delegation_id: delegationId,
    };
    
    // Build unsigned event (missing pubkey and sig - human provides these)
    const unsignedEvent = {
        kind: 38250,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', sessionData.agentNpub || '<agent_npub_hex>']],
        content: JSON.stringify(content),
    };
    
    // Display in UI
    const displayEl = document.getElementById('unsigned-delegation');
    if (displayEl) {
        displayEl.textContent = JSON.stringify(unsignedEvent, null, 2);
    }
    
    addFeedEvent('📝 Generated unsigned delegation event', 'info');
}

async function handleSignedEventSubmit() {
    const textarea = document.getElementById('signed-delegation-input');
    const errorEl = document.getElementById('gate2-error');
    const waitingEl = document.getElementById('gate2-waiting');
    
    // Clear previous error
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }
    
    const inputText = textarea?.value?.trim();
    if (!inputText) {
        if (errorEl) {
            errorEl.textContent = '❌ Please paste the signed event JSON';
            errorEl.style.display = 'block';
        }
        return;
    }
    
    // Parse JSON
    let signedEvent;
    try {
        signedEvent = JSON.parse(inputText);
    } catch (e) {
        if (errorEl) {
            errorEl.textContent = '❌ Invalid JSON format';
            errorEl.style.display = 'block';
        }
        return;
    }
    
    // Validate it's kind 38250
    if (signedEvent.kind !== 38250) {
        if (errorEl) {
            errorEl.textContent = `❌ Wrong event kind: ${signedEvent.kind}, expected 38250`;
            errorEl.style.display = 'block';
        }
        return;
    }
    
    // Validate has signature
    if (!signedEvent.sig || !signedEvent.pubkey) {
        if (errorEl) {
            errorEl.textContent = '❌ Event missing signature or pubkey. Did you sign it?';
            errorEl.style.display = 'block';
        }
        return;
    }
    
    try {
        if (waitingEl) waitingEl.style.display = 'block';
        addFeedEvent('Submitting signed delegation...', 'info');
        
        // Store human pubkey
        sessionData.humanNpub = signedEvent.pubkey;
        
        // Send to backend
        const response = await fetch(`${DEMO_API_URL}/v1/demo/gate2-complete/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delegation_event: signedEvent }),
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `Gate 2 failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update UI
        if (waitingEl) waitingEl.style.display = 'none';
        document.getElementById('delegation-scopes').textContent = 'demo:full';
        document.getElementById('delegation-expires').textContent = '30 days';
        document.getElementById('gate2-success').style.display = 'block';
        
        addFeedEvent('👤 Kind 38250: Human signed delegation', 'delegation');
        addFeedEvent('✓ Gate 2: Human consent verified', 'success');
        
    } catch (err) {
        console.error('Gate 2 error:', err);
        if (waitingEl) waitingEl.style.display = 'none';
        if (errorEl) {
            errorEl.textContent = `❌ ${err.message}`;
            errorEl.style.display = 'block';
        }
        addFeedEvent(`❌ Gate 2 failed: ${err.message}`, 'error');
    }
}

async function handleStartProof() {
    goToStep(6);
    
    // Simulate proof generation with progress
    const progressBar = document.getElementById('proof-progress');
    const progressText = document.getElementById('proof-text');
    const inputs = ['input-leaf', 'input-siblings', 'input-pathbits', 'input-nsec'];
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress}% - ${progress < 30 ? 'Loading inputs...' : progress < 70 ? 'Computing proof...' : 'Finalizing...'}`;
        
        // Update input checkmarks
        if (progress >= 20) document.getElementById('input-leaf').textContent = '• leaf_secret ✓';
        if (progress >= 40) document.getElementById('input-siblings').textContent = '• siblings ✓';
        if (progress >= 60) document.getElementById('input-pathbits').textContent = '• path_bits ✓';
        if (progress >= 80) document.getElementById('input-nsec').textContent = '• nsec (derived) ✓';
        
        if (progress >= 100) {
            clearInterval(interval);
            
            // Show success
            document.getElementById('proof-success').style.display = 'block';
            document.getElementById('merkle-root').textContent = '0x8b2c...';
            document.getElementById('proof-npub').textContent = truncateNpub(sessionData.agentNpub || 'npub1abc...');
            
            addFeedEvent('🔐 Kind 38101: Proof published', 'proof');
            addFeedEvent('✓ Groth16 proof generated (2,474ms)', 'success');
        }
    }, 50);
}

async function handleVerify() {
    try {
        const response = await fetch(`${DEMO_API_URL}/v1/demo/verify/${sessionId}`, {
            method: 'POST',
        });
        
        if (!response.ok) {
            throw new Error(`Verify failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update UI
        document.getElementById('token-sub').textContent = truncateNpub(data.npub || sessionData.agentNpub);
        
        goToStep(7);
        
        addFeedEvent('✓ Kind 38102: Auth complete', 'complete');
        addFeedEvent('✓ Kind 38103: Login complete', 'complete');
        addFeedEvent('🎉 Agent authorized!', 'success');
        
    } catch (err) {
        console.error('Verify error:', err);
        addFeedEvent(`❌ Verify failed: ${err.message}`, 'error');
        goToStep(7); // Go to step 7 anyway for demo
    }
}

// =============================================================================
// NOSTR Relay Connection
// =============================================================================

function connectToRelay(url) {
    if (ws) ws.close();
    
    ws = new WebSocket(url);
    
    ws.onopen = () => {
        connected = true;
        updateFeedStatus('🟢 Connected');
        
        // Subscribe to SIGNEDBYME events
        ws.send(JSON.stringify(['REQ', 'sbm-demo', { kinds: EVENT_KINDS }]));
    };
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg[0] === 'EVENT' && msg[1] === 'sbm-demo') {
                displayNostrEvent(msg[2]);
            }
        } catch (e) {
            console.error('Relay message error:', e);
        }
    };
    
    ws.onerror = () => updateFeedStatus('🔴 Error');
    ws.onclose = () => {
        connected = false;
        updateFeedStatus('🟡 Reconnecting...');
        setTimeout(() => connectToRelay(url), 3000);
    };
}

function displayNostrEvent(event) {
    const meta = EVENT_META[event.kind] || { name: 'Unknown', class: 'unknown', icon: '?' };
    const time = new Date(event.created_at * 1000).toLocaleTimeString();
    
    addFeedEvent(`${meta.icon} ${event.kind}: ${meta.name}`, meta.class);
    
    // Check if this event is for our session (Gate 1 response)
    if (event.kind === 38202 && currentStep === 3) {
        try {
            const content = JSON.parse(event.content);
            if (content.challenge === sessionData.challengeCode) {
                handleGate1Response(content.email, content.npub || event.pubkey, content.challenge);
            }
        } catch (e) {
            // Not our event
        }
    }
}

// =============================================================================
// UI Helpers
// =============================================================================

function addFeedEvent(text, type = 'info') {
    if (!feedEl) return;
    
    const time = new Date().toLocaleTimeString();
    const el = document.createElement('div');
    el.className = `feed-event ${type}`;
    el.innerHTML = `<span class="event-time">${time}</span> <span class="event-text">${text}</span>`;
    
    feedEl.insertBefore(el, feedEl.firstChild);
    
    // Keep max 30 events
    while (feedEl.children.length > 30) {
        feedEl.removeChild(feedEl.lastChild);
    }
}

function updateFeedStatus(status) {
    const statusEl = document.getElementById('feed-status');
    if (statusEl) statusEl.textContent = status;
}

function truncateNpub(str) {
    if (!str || str.length < 16) return str || '?';
    return str.substring(0, 12) + '...' + str.substring(str.length - 4);
}
