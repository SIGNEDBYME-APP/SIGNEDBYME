# SIGNEDBYME Rust SDK

Human-Controlled Identity for Autonomous Agents

## What is SIGNEDBYME?

SIGNEDBYME is the identity layer for autonomous agents. Agents prove membership in enterprise-authorized groups using Groth16 zero-knowledge proofs — without revealing which agent they are. The enterprise gets a boolean: authorized. No identity revealed.

This SDK enables agents to generate cryptographic identity, produce zero-knowledge proofs, and authenticate to enterprises via NOSTR and OIDC.

## Installation

```toml
[dependencies]
signedby-sdk = "1.0"
```

## Quick Start

```rust
use signedby_sdk::sdk::{
    AgentIdentity, 
    storage::EncryptedFileStorage,
    prover::{MembershipProver, ProverConfig, MerkleWitness},
    nostr_client::NostrClient,
};
use std::path::PathBuf;

// Initialize secure storage
let storage = EncryptedFileStorage::new(PathBuf::from("./agent_data"))?;

// Create agent identity (one-time setup)
let identity = AgentIdentity::new(storage);
let state = identity.initialize()?;

println!("Agent npub: {}", state.agent_npub);
println!("Leaf commitment: {}", state.leaf_commitment);

// Generate Groth16 proof for authentication
let config = ProverConfig::from_circuits_dir("./circuits");
let prover = MembershipProver::new(config)?;

let leaf_secret = identity.get_leaf_secret()?;
let witness = MerkleWitness { siblings: vec![...], path_bits: vec![...] };

let proof = prover.generate_proof(&leaf_secret, &witness)?;
println!("Proof generated in {}ms", proof.proof_time_ms);

// Publish proof to NOSTR (async)
let client = NostrClient::new(&identity).await?;
client.publish_proof_event(&proof_data).await?;
```

## Features

- **DID Generation**: secp256k1 keypair in secure storage (OS keyring, Keychain, DPAPI), never extractable
- **Groth16 ZK Proofs**: BN254 curve, ~101K constraints, <3s on ARM64 via native C++ FFI
- **Bitcoin-Backed**: Identity fused with Lightning payment at creation via NWC (NIP-47)
- **NOSTR Integration**: Publish kinds 28101 (proof), 28102 (delegation ack), 28103 (revocation ack); poll for kinds 28200/28250/28251; NIP-42 relay authentication; decentralized audit trail on public relays
- **Witness Caching**: Merkle path cached locally, auto-refresh when root rotates out of 30-root window

## Modules

| Module | Purpose |
|--------|---------|
| `sdk::identity` | DID generation, leaf_secret derivation, AgentIdentity |
| `sdk::storage` | Encrypted storage with OS keyring (ChaCha20-Poly1305) |
| `sdk::prover` | Groth16 proof generation via rapidsnark FFI |
| `sdk::nostr_client` | NOSTR relay client with NIP-42 auth |
| `sdk::enrollment` | Three-gate genesis flow |
| `sdk::delegation` | Delegation validation (kind 28250/28251) |
| `sdk::wallet` | NWC wallet integration (NIP-47) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Agent Runtime                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  signedby-sdk                        │   │
│  │                                                      │   │
│  │  DID ──▶ leaf_secret ──▶ Groth16 Proof ──▶ NOSTR    │   │
│  │   │           │               │                      │   │
│  │   ▼           ▼               ▼                      │   │
│  │  Secure     Private        Proves membership         │   │
│  │  Storage    (never         without revealing         │   │
│  │             leaves)        which agent               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Human controls via kind 28250 delegation / 28251 revoke   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ kind 28101 proof event
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Enterprise Server                       │
│                                                             │
│  1. Catch kind 28101 from NOSTR                            │
│  2. Validate delegation (kind 28250)                        │
│  3. Call POST /v1/login/verify                              │
│  4. Receive OIDC id_token (sub = npub)                     │
└─────────────────────────────────────────────────────────────┘
```

## SDK Lifecycle

### One-Time Initialization
1. Generate DID in secure storage
2. Derive leaf_secret (5 BN254 field elements)
3. Compute leaf_commitment = Poseidon2(leaf_secret)
4. Load Groth16 proving key (~88MB)
5. Initialize NWC wallet for Lightning

### Enrollment per Enterprise
Three-gate genesis flow — runs once per enterprise:
- **Gate 1**: Email + token verification via kind 28202
- **Gate 2**: Human signs kind 28250 delegation
- **Gate 3**: Leaf appended to Merkle tree

### Authentication
1. Generate Groth16 proof from leaf_secret + cached witness
2. Publish kind 28101 to NOSTR
3. Enterprise validates and calls API
4. Agent receives OIDC id_token

## Requirements

- Rust 1.70+
- Native libraries: `libmembership_witness.so`, `librapidsnark.so`
- Supported platforms: Linux (x86_64, aarch64), macOS (x86_64, arm64), Windows (x86_64)

## Documentation

- [SDK Quick Start](https://signedbyme.com/docs/sdk-quickstart.html)
- [API Reference](https://signedbyme.com/docs/api-reference.html)
- [Understanding Delegation](https://signedbyme.com/docs/delegation.html)

## License

SSAL-1.0 (SIGNEDBYME Source-Available License)

## Links

- [GitHub](https://github.com/SIGNEDBYME-APP/SIGNEDBYME)
- [Website](https://signedbyme.com)
