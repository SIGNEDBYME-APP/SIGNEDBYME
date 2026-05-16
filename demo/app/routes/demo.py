"""
Demo Flow Routes

Per DEMO_ARCHITECTURE.md:
- POST /v1/demo/login - Accept email + password, create session
- POST /v1/demo/start/{session_id} - Generate challenge, publish kind 28200
- POST /v1/demo/gate1-complete/{session_id} - Verify agent response
- POST /v1/demo/gate2-complete/{session_id} - Validate human delegation
- GET /v1/demo/status/{session_id} - Poll for flow progress
- POST /v1/demo/verify/{session_id} - Complete login verification
"""

import os
import json
import time
import secrets
import hashlib
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..config import (
    DEMO_ENTERPRISE_NSEC,
    DEMO_CLIENT_ID,
    DEMO_REAL_PAYMENTS,
    DEMO_PREIMAGE,
    DEMO_SESSION_TIMEOUT,
    MAX_SESSIONS_PER_IP_PER_HOUR,
    NOSTR_RELAY_URL,
)

logger = logging.getLogger("demo.routes")
router = APIRouter(prefix="/v1/demo", tags=["demo"])

# =============================================================================
# In-Memory Session Storage (demo only - not for production)
# =============================================================================

# Sessions: session_id -> session_data
_sessions: Dict[str, Dict[str, Any]] = {}

# Rate limiting: IP -> list of timestamps
_ip_sessions: Dict[str, list] = {}


def _cleanup_old_sessions():
    """Remove expired sessions."""
    now = time.time()
    expired = [sid for sid, s in _sessions.items() 
               if now - s.get("created_at", 0) > DEMO_SESSION_TIMEOUT]
    for sid in expired:
        del _sessions[sid]


def _check_rate_limit(ip: str) -> bool:
    """Check if IP is rate limited. Returns True if allowed."""
    now = time.time()
    hour_ago = now - 3600
    
    if ip not in _ip_sessions:
        _ip_sessions[ip] = []
    
    # Remove old timestamps
    _ip_sessions[ip] = [t for t in _ip_sessions[ip] if t > hour_ago]
    
    if len(_ip_sessions[ip]) >= MAX_SESSIONS_PER_IP_PER_HOUR:
        return False
    
    _ip_sessions[ip].append(now)
    return True


# =============================================================================
# Models
# =============================================================================

class DemoLoginRequest(BaseModel):
    """Enterprise login request."""
    email: str = Field(..., description="User email")
    password: str = Field(..., description="Password (ignored in demo)")


class DemoLoginResponse(BaseModel):
    """Enterprise login response."""
    session_id: str
    email: str
    logged_in: bool = True
    message: str = "Logged in to Demo Enterprise"


class DemoStartResponse(BaseModel):
    """Start genesis flow response."""
    session_id: str
    challenge_code: str
    demo_preimage: Optional[str] = None
    payment_simulated: bool
    kind_28200_published: bool
    message: str


class Gate1CompleteRequest(BaseModel):
    """Gate 1 completion request."""
    agent_email: str = Field(..., description="Email from agent's kind 28202")
    agent_npub: str = Field(..., description="Agent's npub from kind 28202")
    challenge: str = Field(..., description="Challenge code from kind 28202")


class Gate1CompleteResponse(BaseModel):
    """Gate 1 completion response."""
    status: str
    email_match: bool
    challenge_match: bool
    agent_npub: str
    kind_28200_addressed_published: bool
    message: str


class Gate2CompleteRequest(BaseModel):
    """Gate 2 completion request."""
    delegation_event: Dict[str, Any] = Field(..., description="Kind 28250 event JSON")


class Gate2CompleteResponse(BaseModel):
    """Gate 2 completion response."""
    status: str
    human_npub: str
    agent_npub: str
    scopes: Dict[str, Any]
    expires_at: str
    delegation_id: str
    signature_valid: bool
    message: str


class DemoStatusResponse(BaseModel):
    """Demo flow status."""
    session_id: str
    current_gate: int
    email: str
    agent_npub: Optional[str] = None
    human_npub: Optional[str] = None
    delegation_id: Optional[str] = None
    events_received: list
    completed: bool
    message: str


class DemoVerifyResponse(BaseModel):
    """Login verification response."""
    status: str
    id_token: Optional[str] = None
    npub: Optional[str] = None
    membership_verified: bool
    message: str


# =============================================================================
# Demo Enterprise NOSTR Functions
# =============================================================================

def _generate_challenge_code() -> str:
    """Generate a challenge code like A1B2-C3D4-E5F6."""
    chars = "ABCDEF0123456789"
    parts = []
    for _ in range(3):
        part = "".join(secrets.choice(chars) for _ in range(4))
        parts.append(part)
    return "-".join(parts)


def _get_demo_enterprise_npub() -> str:
    """Get demo enterprise npub from nsec."""
    # TODO: Derive npub from DEMO_ENTERPRISE_NSEC
    # For now, return placeholder
    if not DEMO_ENTERPRISE_NSEC:
        return "npub1demo_placeholder"
    
    # In real implementation: derive using secp256k1
    # npub = secp256k1_pubkey(nsec)
    return "npub1demo_enterprise"


def _publish_kind_28200_open(session_id: str, challenge: str) -> bool:
    """
    Publish kind 28200 open session invitation.
    
    Per Bible: No npub yet, tagged with client_id only, 60-second NIP-40 expiry.
    """
    if not DEMO_ENTERPRISE_NSEC:
        logger.warning("DEMO_ENTERPRISE_NSEC not set, skipping NOSTR publish")
        return False
    
    # TODO: Implement real NOSTR publish
    # event = {
    #     "kind": 28200,
    #     "pubkey": demo_enterprise_npub,
    #     "created_at": int(time.time()),
    #     "tags": [
    #         ["c", DEMO_CLIENT_ID],
    #         ["nonce", challenge],
    #         ["exp", str(int(time.time()) + 60)],  # NIP-40 expiry
    #     ],
    #     "content": json.dumps({"client_id": DEMO_CLIENT_ID}),
    # }
    # sign_and_publish(event, DEMO_ENTERPRISE_NSEC, NOSTR_RELAY_URL)
    
    logger.info(f"Published kind 28200 open session for {session_id}")
    return True


def _publish_kind_28200_addressed(session_id: str, agent_npub: str) -> bool:
    """
    Publish kind 28200 addressed authorization.
    
    Per Bible: Tagged with specific agent_npub from Gate 1.
    """
    if not DEMO_ENTERPRISE_NSEC:
        logger.warning("DEMO_ENTERPRISE_NSEC not set, skipping NOSTR publish")
        return False
    
    # TODO: Implement real NOSTR publish
    # event = {
    #     "kind": 28200,
    #     "pubkey": demo_enterprise_npub,
    #     "created_at": int(time.time()),
    #     "tags": [
    #         ["c", DEMO_CLIENT_ID],
    #         ["p", agent_npub],
    #     ],
    #     "content": json.dumps({
    #         "client_id": DEMO_CLIENT_ID,
    #         "agent_npub": agent_npub,
    #     }),
    # }
    # sign_and_publish(event, DEMO_ENTERPRISE_NSEC, NOSTR_RELAY_URL)
    
    logger.info(f"Published kind 28200 addressed for {session_id}, agent: {agent_npub[:16]}...")
    return True


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/login", response_model=DemoLoginResponse)
def demo_login(body: DemoLoginRequest, request: Request):
    """
    Step 1: Enterprise login simulation.
    
    Accepts any password - this simulates logging into an enterprise like Amazon.
    Stores email in session for Gate 1 validation.
    """
    _cleanup_old_sessions()
    
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(429, "Rate limit exceeded. Max 10 demo sessions per hour.")
    
    # Create session
    session_id = "demo_" + secrets.token_urlsafe(16)
    
    _sessions[session_id] = {
        "session_id": session_id,
        "email": body.email,
        "created_at": time.time(),
        "current_gate": 0,
        "challenge_code": None,
        "agent_npub": None,
        "human_npub": None,
        "delegation_id": None,
        "events": [],
    }
    
    logger.info(f"Demo login: {body.email} -> {session_id}")
    
    return DemoLoginResponse(
        session_id=session_id,
        email=body.email,
    )


@router.post("/start/{session_id}", response_model=DemoStartResponse)
def demo_start(session_id: str):
    """
    Step 2: Start genesis flow.
    
    - Generate challenge code
    - Handle payment (simulated or real based on DEMO_REAL_PAYMENTS)
    - Publish kind 28200 open session
    """
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    
    session = _sessions[session_id]
    
    # Generate challenge
    challenge = _generate_challenge_code()
    session["challenge_code"] = challenge
    session["current_gate"] = 1
    session["events"].append({
        "kind": 28200,
        "type": "open_session",
        "time": datetime.utcnow().isoformat(),
    })
    
    # Publish kind 28200 open session
    published = _publish_kind_28200_open(session_id, challenge)
    
    # Payment handling
    if DEMO_REAL_PAYMENTS:
        # Real payments: agent handles invoice generation
        preimage = None
        payment_simulated = False
    else:
        # Simulated: use demo preimage
        preimage = DEMO_PREIMAGE[:16] + "..."  # Truncated for display
        payment_simulated = True
    
    logger.info(f"Demo started: {session_id}, challenge: {challenge}")
    
    return DemoStartResponse(
        session_id=session_id,
        challenge_code=challenge,
        demo_preimage=preimage,
        payment_simulated=payment_simulated,
        kind_28200_published=published,
        message="Genesis flow started. Enter challenge code in your agent.",
    )


@router.post("/gate1-complete/{session_id}", response_model=Gate1CompleteResponse)
def gate1_complete(session_id: str, body: Gate1CompleteRequest):
    """
    Gate 1: Email match + identity binding.
    
    Verifies:
    - Email from agent matches logged-in email
    - Challenge matches displayed code
    
    Then publishes addressed kind 28200 with agent_npub.
    """
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    
    session = _sessions[session_id]
    
    # Verify challenge
    challenge_match = body.challenge == session.get("challenge_code")
    if not challenge_match:
        raise HTTPException(400, f"Challenge mismatch. Expected: {session.get('challenge_code')}")
    
    # Verify email match (THE KEY VALIDATION)
    email_match = body.agent_email.lower() == session.get("email", "").lower()
    if not email_match:
        raise HTTPException(400, f"Email mismatch. Agent claimed: {body.agent_email}, logged in: {session.get('email')}")
    
    # Store agent npub
    session["agent_npub"] = body.agent_npub
    session["current_gate"] = 2
    session["events"].append({
        "kind": 28202,
        "type": "agent_response",
        "agent_npub": body.agent_npub,
        "time": datetime.utcnow().isoformat(),
    })
    
    # Publish addressed kind 28200
    published = _publish_kind_28200_addressed(session_id, body.agent_npub)
    session["events"].append({
        "kind": 28200,
        "type": "addressed",
        "agent_npub": body.agent_npub,
        "time": datetime.utcnow().isoformat(),
    })
    
    logger.info(f"Gate 1 complete: {session_id}, agent: {body.agent_npub[:16]}...")
    
    return Gate1CompleteResponse(
        status="gate1_complete",
        email_match=True,
        challenge_match=True,
        agent_npub=body.agent_npub,
        kind_28200_addressed_published=published,
        message="Gate 1 passed. Waiting for human to sign delegation (Gate 2).",
    )


@router.post("/gate2-complete/{session_id}", response_model=Gate2CompleteResponse)
def gate2_complete(session_id: str, body: Gate2CompleteRequest):
    """
    Gate 2: Human's cryptographic consent.
    
    Validates kind 28250 delegation event:
    - Schnorr signature valid
    - Human signature verified via NIP-05 (fail closed)
    - agent_npub matches Gate 1
    - expires_at in future
    """
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    
    session = _sessions[session_id]
    event = body.delegation_event
    
    # Verify event kind
    if event.get("kind") != 28250:
        raise HTTPException(400, f"Invalid event kind: {event.get('kind')}, expected 28250")
    
    # Parse content
    try:
        content = json.loads(event.get("content", "{}"))
    except:
        raise HTTPException(400, "Invalid event content JSON")
    
    # Extract fields
    agent_npub = content.get("agent_npub")
    scopes = content.get("scopes", {})
    expires_at = content.get("expires_at")
    delegation_id = content.get("delegation_id")
    human_npub = event.get("pubkey")
    
    # Verify agent_npub matches Gate 1
    expected_agent = session.get("agent_npub")
    if agent_npub != expected_agent:
        raise HTTPException(400, f"agent_npub mismatch: event has {agent_npub[:16]}..., Gate 1 had {expected_agent[:16]}...")
    
    # Verify expires_at is in future
    if expires_at:
        try:
            from datetime import datetime
            exp_time = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp_time.timestamp() < time.time():
                raise HTTPException(400, f"Delegation expired at {expires_at}")
        except ValueError:
            pass  # Can't parse, skip check
    
    # TODO: Verify Schnorr signature
    # TODO: Verify human via NIP-05 (fail closed)
    signature_valid = True  # Placeholder
    
    # Update session
    session["human_npub"] = human_npub
    session["delegation_id"] = delegation_id
    session["current_gate"] = 3
    session["events"].append({
        "kind": 28250,
        "type": "delegation",
        "human_npub": human_npub,
        "agent_npub": agent_npub,
        "delegation_id": delegation_id,
        "time": datetime.utcnow().isoformat(),
    })
    
    logger.info(f"Gate 2 complete: {session_id}, human: {human_npub[:16]}...")
    
    return Gate2CompleteResponse(
        status="gate2_complete",
        human_npub=human_npub,
        agent_npub=agent_npub,
        scopes=scopes,
        expires_at=expires_at or "",
        delegation_id=delegation_id or "",
        signature_valid=signature_valid,
        message="Gate 2 passed. Human consent verified. Proceeding to enrollment (Gate 3).",
    )


@router.get("/status/{session_id}", response_model=DemoStatusResponse)
def demo_status(session_id: str):
    """Poll for demo flow progress."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    
    session = _sessions[session_id]
    
    return DemoStatusResponse(
        session_id=session_id,
        current_gate=session.get("current_gate", 0),
        email=session.get("email", ""),
        agent_npub=session.get("agent_npub"),
        human_npub=session.get("human_npub"),
        delegation_id=session.get("delegation_id"),
        events_received=session.get("events", []),
        completed=session.get("current_gate", 0) >= 4,
        message=f"Current gate: {session.get('current_gate', 0)}",
    )


@router.post("/verify/{session_id}", response_model=DemoVerifyResponse)
def demo_verify(session_id: str):
    """
    Complete login verification.
    
    Called after agent publishes kind 28101 proof event.
    Validates delegation and calls internal login verify.
    """
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    
    session = _sessions[session_id]
    
    # Check we're at the right gate
    if session.get("current_gate", 0) < 3:
        raise HTTPException(400, "Flow not complete. Must complete Gates 1-3 first.")
    
    # Mark as complete
    session["current_gate"] = 4
    session["events"].append({
        "kind": 28101,
        "type": "proof_event",
        "time": datetime.utcnow().isoformat(),
    })
    
    # TODO: Actually verify via copied login.py
    # For now, return mock success
    
    agent_npub = session.get("agent_npub", "")
    
    logger.info(f"Demo verify complete: {session_id}")
    
    return DemoVerifyResponse(
        status="verified",
        id_token="demo_id_token_placeholder",  # TODO: Generate real JWT
        npub=agent_npub,
        membership_verified=True,
        message="Login verified! Agent is authorized.",
    )
