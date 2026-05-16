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
DEMO_ENTERPRISE_NSEC = os.getenv("DEMO_ENTERPRISE_NSEC", "")
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
