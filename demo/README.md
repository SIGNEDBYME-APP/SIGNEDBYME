# SignedByMe Demo API

Standalone demo service for the "Authorize Your Agent" demo on signedbyme.com.

**This is completely separate from production. Production API code is untouched.**

## Setup

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Generate demo enterprise keypair and add to `.env`:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the demo API:
   ```bash
   uvicorn demo.app.main:app --host 0.0.0.0 --port 8001
   ```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/demo/login` | POST | Enterprise login simulation |
| `/v1/demo/start/{session_id}` | POST | Start genesis flow |
| `/v1/demo/gate1-complete/{session_id}` | POST | Complete Gate 1 |
| `/v1/demo/gate2-complete/{session_id}` | POST | Complete Gate 2 |
| `/v1/demo/status/{session_id}` | GET | Poll flow status |
| `/v1/demo/verify/{session_id}` | POST | Complete login verification |

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DEMO_ENTERPRISE_NSEC` | Demo enterprise private key (hex) | - |
| `DEMO_REAL_PAYMENTS` | Enable real Lightning | `false` |
| `DEMO_SESSION_TIMEOUT` | Session timeout (seconds) | `600` |
| `DEMO_RELAY_URL` | NOSTR relay URL | `wss://relay.signedbyme.com` |

## Architecture

```
website/index.html (wizard UI)
        ↓ calls
demo/app/ (this service)
        ↓ uses copied
enrollment/login/merkle logic
```

Production API code: **untouched**
