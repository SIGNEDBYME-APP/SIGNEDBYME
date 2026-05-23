# Security

## Reporting Vulnerabilities

Report security issues to: security@signedbyme.com

Do not open public issues for security vulnerabilities.

## Security Model

SIGNEDBYME implements a three-gate security model:

### Gate 1: Enterprise Authorization
Enterprise signs a NOSTR event (kind 38200) authorizing the agent. Without this signature, enrollment is rejected.

### Gate 2: Human Delegation
Human owner signs a delegation event granting specific permissions to the agent. Agent cannot exceed delegated scope.

### Gate 3: Zero-Knowledge Proof
Agent generates Groth16 proof proving Merkle tree membership without revealing identity. Server verifies membership via root hash only.

## Cryptographic Components

| Component | Implementation |
|-----------|---------------|
| ZK Proofs | Groth16 over BN254 |
| Hash | Poseidon2 |
| Signatures | secp256k1 (Schnorr for NOSTR) |
| Key Storage | Hardware-backed (Keystore/Enclave) |

## What the Server Does NOT Do

Per the security model:
- Server does NOT perform Groth16 proof verification
- Server only checks Merkle root membership
- All ZK verification happens client-side
- Server cannot learn which agent authenticated

## Key Security Properties

1. **Private keys never leave device** — Created in secure hardware, never extractable
2. **Replay protection** — Session nonces prevent proof reuse
3. **Domain binding** — Proofs bound to specific relying party
4. **Instant revocation** — NOSTR event revokes access in seconds
5. **Economic Sybil resistance** — Bitcoin payment required for identity creation

## Audit Status

- Cryptographic review: Complete
- Penetration testing: Scheduled

## Dependencies

Security-critical dependencies:
- `ark-groth16` — Groth16 prover/verifier
- `ark-bn254` — BN254 curve operations
- `secp256k1` — Signature verification
- `circom` — Circuit compiler

See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for full list.
