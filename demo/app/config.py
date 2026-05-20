"""
Demo Configuration

Environment variables:
- DEMO_ENTERPRISE_NSEC: Demo enterprise private key (hex)
- DEMO_REAL_PAYMENTS: "true" to enable real Lightning payments (default: false)
- DEMO_SESSION_TIMEOUT: Session timeout in seconds (default: 600)
"""

import os
from pathlib import Path

# Paths
DEMO_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = DEMO_DIR / "data"

# Demo enterprise identity
# Default: fixed demo keypair (only for demo, not production)
# nsec1demo... = SHA256("signedby-demo-enterprise-2026")[:32]
_DEFAULT_DEMO_NSEC = "7f4e8a3c2b1d9f0e6a5c4d3b2a1908f7e6d5c4b3a2910f8e7d6c5b4a39281706"
DEMO_ENTERPRISE_NSEC = os.getenv("DEMO_ENTERPRISE_NSEC", _DEFAULT_DEMO_NSEC)
DEMO_CLIENT_ID = "demo"

# Payment mode
DEMO_REAL_PAYMENTS = os.getenv("DEMO_REAL_PAYMENTS", "false").lower() == "true"

# Demo preimage for simulated payments
# sha256("signedby-demo-2026")
DEMO_PREIMAGE = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

# Session settings
DEMO_SESSION_TIMEOUT = int(os.getenv("DEMO_SESSION_TIMEOUT", "600"))

# Rate limiting
MAX_SESSIONS_PER_IP_PER_HOUR = 10

# NOSTR relay
NOSTR_RELAY_URL = os.getenv("DEMO_RELAY_URL", "wss://relay.signedbyme.com")

# NIP-05 domain for demo enterprise
DEMO_NIP05_DOMAIN = "signedbyme.com"
