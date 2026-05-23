# SIGNEDBYME TypeScript SDK

Human-Controlled Identity for Autonomous Agents

## What is SIGNEDBYME?

SIGNEDBYME is the identity layer for autonomous agents. Agents prove membership in enterprise-authorized groups using Groth16 zero-knowledge proofs — without revealing which agent they are. The enterprise gets a boolean: authorized. No identity revealed.

This SDK enables agents to generate cryptographic identity, produce zero-knowledge proofs, and authenticate to enterprises via NOSTR and OIDC.

## Installation

```bash
npm install @signedby/sdk
# or
yarn add @signedby/sdk
```

## Quick Start

```typescript
import { 
  AgentIdentity, 
  EncryptedFileStorage, 
  MembershipProver, 
  NostrClient 
} from '@signedby/sdk';

// Initialize secure storage
const storage = new EncryptedFileStorage('./agent_data');

// Create agent identity (one-time setup)
const identity = new AgentIdentity(storage);
const state = await identity.initialize();

console.log(`Agent npub: ${state.agentNpub}`);
console.log(`Leaf commitment: ${state.leafCommitment}`);

// Generate Groth16 proof for authentication
const prover = MembershipProver.fromCircuitsDir('./circuits');

const leafSecret = identity.getLeafSecret();
const witness = await loadWitness(storage, 'acme');

const proof = await prover.generateProof(leafSecret, witness);
console.log(`Proof generated in ${proof.proofTimeMs}ms`);

// Publish proof to NOSTR
const client = await NostrClient.connect(identity);
await client.publishProofEvent(proofData);
```

## Features

- **DID Generation**: secp256k1 keypair in secure storage (OS keyring, Keychain, DPAPI), never extractable
- **Groth16 ZK Proofs**: BN254 curve, ~101K constraints, <3s on ARM64 via native Rust core (napi-rs)
- **Bitcoin-Backed**: Identity fused with Lightning payment at creation via NWC (NIP-47)
- **NOSTR Integration**: Publish kinds 38101 (proof), 38102 (delegation ack), 38103 (revocation ack); poll for kinds 38200/38250/38251; NIP-42 relay authentication; decentralized audit trail on public relays
- **Witness Caching**: Merkle path cached locally, auto-refresh when root rotates out of 30-root window

## Modules

| Export | Purpose |
|--------|---------|
| `AgentIdentity` | DID generation, leaf_secret derivation |
| `EncryptedFileStorage` | Encrypted storage with OS keyring (ChaCha20-Poly1305) |
| `MembershipProver` | Groth16 proof generation via native Rust |
| `NostrClient` | NOSTR relay client with NIP-42 auth |
| `EnrollmentBootstrap` | Three-gate genesis flow |
| `DelegationValidator` | Delegation validation (kind 38250/38251) |
| `NwcWallet` | NWC wallet integration (NIP-47) |

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

- Node.js 18+
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
