# Architecture

Technical overview of SignedByMe's cryptographic foundations.

---

## Overview

SignedByMe is the identity layer for autonomous agents. Five cryptographic layers prevent different attack vectors:

| Layer | What it prevents |
|-------|------------------|
| Agent cannot lie about identity | npub is a mathematical output of the ZK proof, not a claim. Forging requires breaking Groth16. |
| Agent cannot exceed authorization | Kind 38250 scopes are signed by the human owner. Enterprise reads from NOSTR. Agent cannot claim broader permissions than the human granted. |
| Human retains the kill switch | Kind 38251 revocation locks the agent out instantly. No IT ticket. No admin portal. Cryptographic revocation in seconds. |
| Enterprise controls their Merkle tree | Agent can only authenticate where its leaf was enrolled. Cannot self-enroll or access unapproved services. |
| Auditable without trusting anyone | Full trail on public NOSTR relays. CISO verifies independently without asking SignedByMe for anything. |

---

## The Three Pillars

### 1. Self-Signing Identity (DID)

Every agent has a DID created in a secure runtime environment (TEE or encrypted storage). The key never leaves the agent.

**Identity derivation:**
```
DID → leaf_secret → nsec (inside ZKP) → npub
```

No certificate authority. No enterprise control. No revocation by anyone except the human owner.

### 2. Zero-Knowledge Membership Proof

The agent proves it belongs to an enterprise-authorized group without revealing which agent it is.

- **Proof system:** Groth16 over BN254
- **Hash function:** Poseidon2
- **Constraints:** ~101,206 (actual measured)
- **Circuit status:** Frozen

The enterprise gets a boolean: authorized. No identity revealed. OIDC id_token returned.

### 3. Bitcoin-Backed Economic Proof

Monthly Lightning subscription preimage fused into the agent's initial ZKP at leaf creation. The economic commitment and the cryptographic identity are one inseparable thing.

Cannot create fake agent identities without paying real Bitcoin.

---

## The Identity Chain

Everything in the system derives from one chain:

```
DID private key (in TEE/secure storage, never extracted)
    │
    ▼  deterministic derivation
leaf_secret (5 BN254 field elements, in secure storage)
    │
    ▼  Poseidon2(leaf_secret[0..5])
leaf_commitment (256-bit hash — the ONLY thing server ever sees at enrollment)
    │
    ▼  Groth16 circuit (leaf_secret is private input)
    ├── merkle_root (public output — proves membership in enterprise tree)
    └── npub (public output — agent's NOSTR identity)
                │
                ▼
        OIDC id_token (sub = npub)
```

### Key Derivation

- **nsec:** `nsec = Poseidon2(leaf_secret[0..2])` — private input to circuit, derived fresh from leaf_secret every time
- **npub:** `secp256k1_pubkey(nsec)` — agent's globally consistent pseudonymous identifier

### What the Server Sees

| Server sees | Server never sees |
|-------------|-------------------|
| leaf_commitment (opaque hash at enrollment) | DID |
| Groth16 proof bytes (transiently, then discarded) | leaf_secret |
| merkle_root | nsec |
| npub | Which leaf in the tree |
| | Any real-world identity |

---

## Membership Circuit (Groth16/circom)

The circuit is frozen. Structure will not change.

| Parameter | Value |
|-----------|-------|
| Curve | BN254 |
| Hash | Poseidon2 |
| Constraints | ~101,206 |
| Public outputs | merkle_root, npub (2 only) |
| Private inputs | leaf_secret[5], siblings[20], path_bits[20], nsec[1] |
| Tree depth | 20 levels (2^20 = ~1M leaf capacity) |
| Proving key | membership_final.zkey (~88MB) |
| Proving time | <3 seconds on modern hardware |

---

## Merkle Tree

- **Append-only.** Incremental. SQLite-backed on the API server.
- **Depth 20.** ~1M leaf slots per enterprise tree.
- **Rolling window:** Server accepts proofs against the last 30 valid roots.
- **Root rotation:** New leaf appended → recompute path → new root registered → old roots remain valid for 30 rotations.

### Revocation

Kind 38251 is the only revocation mechanism.

1. Human publishes kind 38251 tagged with the delegation_id
2. Enterprise catches it on their next NOSTR query
3. Agent's next login fails before /v1/login/verify is ever called

No blocklist. No tree rebuild. No server involvement. The human is the only party who can revoke.

---

## Login Verification

```
POST /v1/login/verify
Body: { proof, public_outputs: { merkle_root, npub }, client_id }

Server checks:
  1. merkle_root is in the last 30 valid roots for this client_id

Returns: OIDC id_token { sub: npub, membership_verified: true, ... }
```

Stateless. No sessions. No preimage checks. No Groth16 verification on server. One call.

**Why no server-side proof verification?**

The cryptographic chain (DID → leaf_secret → nsec inside circuit → npub public output → signs proof_event) is self-verifying. The npub in the proof_event signature matches the npub in the circuit output. Server-side Groth16 verification is redundant.

---

## Three NOSTR Keypairs

**Server has zero NOSTR keys.**

| Keypair | Who holds it | Used for | Verified via |
|---------|--------------|----------|--------------|
| Human nsec/npub | Human owner | Signs kind 38250 (delegation), kind 38251 (revocation) | NIP-05 at human's domain |
| Agent nsec/npub | Derived from leaf_secret inside circuit | Signs kind 38101/38102/38103 | npub is public output of ZK proof |
| Enterprise nsec/npub | Enterprise | Signs kind 38200 (enrollment authorization) | NIP-05 at enterprise domain |

---

## NOSTR Event Kinds

| Kind | Name | Publisher | Purpose |
|------|------|-----------|---------|
| 38101 | proof_event | Agent | ZK proof + public_outputs + delegation_id reference |
| 38102 | auth_complete | Agent | Audit trail — login flow completed |
| 38103 | login_complete | Agent | Audit chain closure |
| 38200 | enrollment_authorization | Enterprise | Authorization for agent enrollment |
| 38202 | enrollment_response | Agent | Agent's response during genesis (email + npub) |
| 38250 | delegation_grant | Human | Grants agent authority for specific enterprises |
| 38251 | delegation_revocation | Human | Revokes a specific delegation |

---

## The Mathematical Guarantee

Every SignedByMe agent identity was born from a real Bitcoin Lightning payment. The economic commitment is fused into the cryptographic identity at creation — unforgeable without simultaneously breaking:

- SHA-256
- Groth16 over BN254 with ~101,000 constraints
- secp256k1

These are the same mathematical foundations that secure the Bitcoin network itself.

**Not a policy promise. A mathematical guarantee.**
