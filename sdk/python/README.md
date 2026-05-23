# SIGNEDBYME Python SDK

Human-Controlled Identity for Autonomous Agents

## What is SIGNEDBYME?

SIGNEDBYME is the identity layer for autonomous agents. Agents prove membership in enterprise-authorized groups using Groth16 zero-knowledge proofs — without revealing which agent they are. The enterprise gets a boolean: authorized. No identity revealed.

This SDK enables agents to generate cryptographic identity, produce zero-knowledge proofs, and authenticate to enterprises via NOSTR and OIDC.

## Installation

```bash
pip install signedby
```

## Quick Start

```python
from signedby import AgentIdentity, EncryptedFileStorage, MembershipProver, NostrClient

# Initialize secure storage
storage = EncryptedFileStorage("./agent_data")

# Create agent identity (one-time setup)
identity = AgentIdentity(storage)
state = identity.initialize()

print(f"Agent npub: {state.agent_npub}")
print(f"Leaf commitment: {state.leaf_commitment}")

# Generate Groth16 proof for authentication
prover = MembershipProver.from_circuits_dir("./circuits")

leaf_secret = identity.get_leaf_secret()
witness = load_witness(storage, "acme")

proof = prover.generate_proof(leaf_secret, witness)
print(f"Proof generated in {proof.proof_time_ms}ms")

# Publish proof to NOSTR (async)
client = await NostrClient.connect(identity)
await client.publish_proof_event(proof_data)
```

## Features

- **DID Generation**: secp256k1 keypair in secure storage (OS keyring, Keychain, DPAPI), never extractable
- **Groth16 ZK Proofs**: BN254 curve, ~101K constraints, <3s on ARM64 via native Rust core (PyO3)
- **Bitcoin-Backed**: Identity fused with Lightning payment at creation via NWC (NIP-47)
- **NOSTR Integration**: Publish kinds 38101 (proof), 38102 (delegation ack), 38103 (revocation ack); poll for kinds 38200/38250/38251; NIP-42 relay authentication; decentralized audit trail on public relays
- **Witness Caching**: Merkle path cached locally, auto-refresh when root rotates out of 30-root window

## Modules

| Module | Purpose |
|--------|---------|
| `signedby.AgentIdentity` | DID generation, leaf_secret derivation |
| `signedby.EncryptedFileStorage` | Encrypted storage with OS keyring (ChaCha20-Poly1305) |
| `signedby.MembershipProver` | Groth16 proof generation via native Rust |
| `signedby.NostrClient` | NOSTR relay client with NIP-42 auth |
| `signedby.EnrollmentBootstrap` | Three-gate genesis flow |
| `signedby.DelegationValidator` | Delegation validation (kind 38250/38251) |
| `signedby.NwcWallet` | NWC wallet integration (NIP-47) |

## SDK Lifecycle

### One-Time Initialization
1. Generate DID in secure storage
2. Derive leaf_secret (5 BN254 field elements)
3. Compute leaf_commitment = Poseidon2(leaf_secret)
4. Load Groth16 proving key (~88MB)
5. Initialize NWC wallet for Lightning

### Enrollment per Enterprise
Three-gate genesis flow — runs once per enterprise:
- **Gate 1**: Email + token verification via kind 38202
- **Gate 2**: Human signs kind 38250 delegation
- **Gate 3**: Leaf appended to Merkle tree

### Authentication
1. Generate Groth16 proof from leaf_secret + cached witness
2. Publish kind 38101 to NOSTR
3. Enterprise validates and calls API
4. Agent receives OIDC id_token

## Requirements

- Python 3.9+
- Native libraries bundled for supported platforms

## Supported Platforms

- Linux x64 (glibc)
- Linux ARM64 (glibc)
- macOS x64 (Intel)
- macOS ARM64 (Apple Silicon)
- Windows x64

## Documentation

- [SDK Quick Start](https://signedbyme.com/docs/sdk-quickstart.html)
- [API Reference](https://signedbyme.com/docs/api-reference.html)
- [Understanding Delegation](https://signedbyme.com/docs/delegation.html)

## License

SSAL-1.0 (SIGNEDBYME Source-Available License)

## Links

- [GitHub](https://github.com/SIGNEDBYME-APP/SIGNEDBYME)
- [Website](https://signedbyme.com)
