# SIGNEDBYME Python SDK

Self-signing digital signatures with zero-knowledge proofs.

## Installation

```bash
pip install signedby
```

## Quick Start

```python
from signedby import SignedByAgent, SignedByClient

# Initialize agent
agent = SignedByAgent.init(storage_path="./agent_data")

# Set email mapping for enterprises
agent.set_email_mapping({
    "example.com": "user@example.com"
})

# Connect to SIGNEDBYME relays
agent.connect_relays()

# Watch for authorization requests
async for auth_request in agent.watch_for_authorizations():
    print(f"Authorization from {auth_request.enterprise}")
    
# Authenticate
client = SignedByClient(api_url="https://api.signedbyme.com")
token = await client.authenticate(
    client_id="example",
    proof=agent.generate_proof()
)
print(f"Authenticated: {token.sub}")
```

## Features

- **Agent Management**: DID generation, secure storage
- **Groth16 ZK Proofs**: Native Rust core via PyO3
- **NOSTR Integration**: Automatic relay management
- **OIDC Compatible**: Standard JWT id_tokens

## Requirements

- Python 3.9+
- Rust toolchain (for building native extension)

## Documentation

Full documentation: [https://docs.signedbyme.com](https://docs.signedbyme.com)

## License

SSAL-1.0 (SignedByMe Source-Available License)

## Links

- [GitHub](https://github.com/SIGNEDBYME-APP/SIGNEDBYME)
- [Website](https://signedbyme.com)
