# SIGNEDBYME Rust SDK

Self-signing digital signatures with zero-knowledge proofs.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
signedby-sdk = "0.1"
```

## Quick Start

```rust
use signedby_sdk::{SignedByClient, ProofGenerator};

// Initialize client
let client = SignedByClient::new("https://api.signedbyme.com")?;

// Generate proof
let proof = ProofGenerator::generate(
    &leaf_secret,
    &witness,
    &merkle_root,
)?;

// Verify
let result = client.verify(&proof).await?;
println!("Verified: sub={}", result.id_token.sub);
```

## Features

- **Groth16 ZK Proofs**: BN254 curve, ~101K constraints
- **NOSTR Integration**: Publish and verify NOSTR events
- **OIDC Compatible**: Standard JWT id_tokens

## Documentation

Full documentation: [https://signedbyme.com/docs/sdk-quickstart.html](https://signedbyme.com/docs/sdk-quickstart.html)

## License

SSAL-1.0 (SignedByMe Source-Available License)

## Links

- [GitHub](https://github.com/SIGNEDBYME-APP/SIGNEDBYME)
- [Website](https://signedbyme.com)
