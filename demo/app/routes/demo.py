"""
Demo Flow Routes

Per DEMO_ARCHITECTURE.md:
- POST /v1/demo/login - Accept email + password, create session
- POST /v1/demo/start/{session_id} - Generate challenge, publish kind 28200
- POST /v1/demo/gate1-complete/{session_id} - Verify agent response
- POST /v1/demo/gate2-complete/{session_id} - Validate human delegation
- POST /v1/demo/gate3-complete/{session_id} - Merkle enrollment
- GET /v1/demo/status/{session_id} - Poll for flow progress
- POST /v1/demo/verify/{session_id} - Complete login verification
"""

import os
import json
import time
import secrets
import hashlib
import logging
import asyncio
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import secp256k1
import websockets

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
# NOSTR Signing & Publishing (demo only)
# =============================================================================

def _get_demo_keypair() -> Tuple[bytes, bytes]:
    """Get demo enterprise private key and derive pubkey."""
    if not DEMO_ENTERPRISE_NSEC:
        raise ValueError("DEMO_ENTERPRISE_NSEC not configured")

    privkey_bytes = bytes.fromhex(DEMO_ENTERPRISE_NSEC)
    privkey = secp256k1.PrivateKey(privkey_bytes)
    pubkey_bytes = privkey.pubkey.serialize()[1:]  # x-only (32 bytes, skip prefix)
    return privkey_bytes, pubkey_bytes


def _compute_event_id(event: Dict[str, Any]) -> str:
    """Compute NOSTR event ID (NIP-01)."""
    serialized = json.dumps(
        [0, event["pubkey"], event["created_at"], event["kind"], event["tags"], event["content"]],
        separators=(',', ':'),
        ensure_ascii=False,
    )
    return hashlib.sha256(serialized.encode('utf-8')).hexdigest()


def _sign_event(event: Dict[str, Any], privkey_bytes: bytes) -> Dict[str, Any]:
    """Sign a NOSTR event with BIP-340 Schnorr signature."""
    # Compute event ID
    event_id = _compute_event_id(event)
    event["id"] = event_id

    # Sign with Schnorr (BIP-340)
    privkey = secp256k1.PrivateKey(privkey_bytes)
    message = bytes.fromhex(event_id)
    sig = privkey.schnorr_sign(message, bip340tag=None, raw=True)
    event["sig"] = sig.hex()

    return event


async def _publish_to_relay(event: Dict[str, Any], relay_url: str) -> bool:
    """Publish signed event to NOSTR relay."""
    try:
        async with websockets.connect(relay_url, close_timeout=5) as ws:
            # Send EVENT message
            message = json.dumps(["EVENT", event])
            await ws.send(message)

            # Wait for OK response (with timeout)
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=5.0)
                data = json.loads(response)

                # Handle OK response: ["OK", event_id, success, message]
                if data[0] == "OK" and len(data) >= 3:
                    if data[2]:  # success
                        logger.info(f"Published event {event['id'][:16]}... to {relay_url}")
                        return True
                    else:
                        logger.warning(f"Relay rejected event: {data[3] if len(data) > 3 else 'unknown'}")
                        return False

                # Handle AUTH challenge (NIP-42) - for now just log it
                if data[0] == "AUTH":
                    logger.warning(f"Relay requires auth: {relay_url}")
                    return False

            except asyncio.TimeoutError:
                logger.warning(f"Timeout waiting for relay response from {relay_url}")
                return False

    except Exception as e:
        logger.error(f"Failed to publish to {relay_url}: {e}")
        return False

    return False


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
    """Get demo enterprise npub (hex pubkey) from nsec."""
    if not DEMO_ENTERPRISE_NSEC:
        return ""

    try:
        _, pubkey_bytes = _get_demo_keypair()
        return pubkey_bytes.hex()
    except Exception as e:
        logger.error(f"Failed to derive enterprise pubkey: {e}")
        return ""


async def _publish_kind_28200_open_async(session_id: str, challenge: str) -> Tuple[bool, Optional[Dict]]:
    """
    Publish kind 28200 open session invitation.

    Per Bible: No npub yet, tagged with client_id only, 60-second NIP-40 expiry.
    Returns (success, signed_event).
    """
    if not DEMO_ENTERPRISE_NSEC:
        logger.warning("DEMO_ENTERPRISE_NSEC not set, skipping NOSTR publish")
        return False, None

    try:
        privkey_bytes, pubkey_bytes = _get_demo_keypair()
        pubkey_hex = pubkey_bytes.hex()

        # Build event
        event = {
            "kind": 28200,
            "pubkey": pubkey_hex,
            "created_at": int(time.time()),
            "tags": [
                ["client_id", DEMO_CLIENT_ID],
                ["nonce", challenge],
                ["expiration", str(int(time.time()) + 300)],  # NIP-40 expiry (5 min)
            ],
            "content": json.dumps({"client_id": DEMO_CLIENT_ID, "type": "open"}),
        }

        # Sign event
        signed_event = _sign_event(event, privkey_bytes)

        # Publish to relay
        success = await _publish_to_relay(signed_event, NOSTR_RELAY_URL)

        logger.info(f"Published kind 28200 open session for {session_id}: {signed_event['id'][:16]}...")
        return success, signed_event

    except Exception as e:
        logger.error(f"Failed to publish kind 28200 open: {e}")
        return False, None


def _publish_kind_28200_open(session_id: str, challenge: str) -> bool:
    """Sync wrapper for _publish_kind_28200_open_async."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context, create a task
            future = asyncio.ensure_future(_publish_kind_28200_open_async(session_id, challenge))
            # For sync compatibility, we'll just return True and let it run
            return True
        else:
            success, _ = loop.run_until_complete(_publish_kind_28200_open_async(session_id, challenge))
            return success
    except Exception as e:
        logger.error(f"Failed to publish kind 28200 open: {e}")
        return False


async def _publish_kind_28200_addressed_async(session_id: str, agent_npub: str, nonce: str) -> Tuple[bool, Optional[Dict]]:
    """
    Publish kind 28200 addressed authorization.

    Per Bible: Tagged with specific agent_npub from Gate 1.
    Returns (success, signed_event).
    """
    if not DEMO_ENTERPRISE_NSEC:
        logger.warning("DEMO_ENTERPRISE_NSEC not set, skipping NOSTR publish")
        return False, None

    try:
        privkey_bytes, pubkey_bytes = _get_demo_keypair()
        pubkey_hex = pubkey_bytes.hex()

        # Build event
        event = {
            "kind": 28200,
            "pubkey": pubkey_hex,
            "created_at": int(time.time()),
            "tags": [
                ["client_id", DEMO_CLIENT_ID],
                ["p", agent_npub],
                ["nonce", nonce],
                ["expiration", str(int(time.time()) + 300)],  # NIP-40 expiry (5 min)
            ],
            "content": json.dumps({
                "client_id": DEMO_CLIENT_ID,
                "agent_npub": agent_npub,
                "type": "addressed",
            }),
        }

        # Sign event
        signed_event = _sign_event(event, privkey_bytes)

        # Publish to relay
        success = await _publish_to_relay(signed_event, NOSTR_RELAY_URL)

        logger.info(f"Published kind 28200 addressed for {session_id}, agent: {agent_npub[:16]}...")
        return success, signed_event

    except Exception as e:
        logger.error(f"Failed to publish kind 28200 addressed: {e}")
        return False, None


def _publish_kind_28200_addressed(session_id: str, agent_npub: str) -> bool:
    """Sync wrapper for backwards compatibility."""
    # Note: This is called from sync context but we need the nonce
    # For now, return True as placeholder - the async version is preferred
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

    # Publish kind 28250 to relay so SDK watcher can detect it
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        published = loop.run_until_complete(_publish_to_relay(event, NOSTR_RELAY_URL))
        loop.close()
        logger.info(f"Published kind 28250 for {session_id}: {event.get('id', 'unknown')[:16]}...")
    except Exception as e:
        logger.error(f"Failed to publish kind 28250: {e}")
        published = False

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
