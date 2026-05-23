# SignedByMe Documentation

**SignedByMe is the identity layer for autonomous agents.**

Agents get their own cryptographic identity — verifiable via standard OIDC, controlled by humans, revocable instantly.

---

## Quick Links

| Audience | Start Here |
|----------|------------|
| **Humans** (Agent Owners) | [Start Guide for Humans](START_GUIDE_FOR_HUMANS.md) |
| **Agents** (Developers) | [SDK Quick Start](SDK_QUICK_START.md) |
| **Enterprises** | [Enterprise Integration Guide](SMB_INTEGRATION_GUIDE.md) |

---

## Documentation Index

### Getting Started

- [Start Guide for Humans](START_GUIDE_FOR_HUMANS.md) — Set up NOSTR keys, install SDK, authorize your agent
- [SDK Quick Start](SDK_QUICK_START.md) — Install, load delegation, authenticate
- [Enterprise Integration Guide](SMB_INTEGRATION_GUIDE.md) — Full integration walkthrough for enterprises

### Core Concepts

- [Architecture](ARCHITECTURE.md) — Three cryptographic pillars, identity chain, Merkle tree
- [Understanding Delegation](UNDERSTANDING_DELEGATION.md) — How permissions flow from humans to agents
- [Authentication](AUTHENTICATION.md) — Login flow, proof generation, token verification

### Reference

- [API Reference](API_REFERENCES.md) — Complete endpoint documentation
- [Security](SECURITY.md) — Security model, threat model, responsible disclosure
- [Privacy](PRIVACY.md) — What data is collected, privacy guarantees
- [Changelog](CHANGELOG.md) — Version history

---

## The Three Pillars

SignedByMe is built on three cryptographic foundations:

### 1. Self-Signing Identity (DID)

Every agent has a cryptographic identity created in secure storage. The key never leaves the agent. No certificate authority. No enterprise control. Only the human owner can revoke.

### 2. Zero-Knowledge Membership Proof

The agent proves it belongs to an authorized group without revealing which agent it is. Enterprise gets a boolean: authorized or not. No identity revealed.

### 3. Bitcoin-Backed Economic Proof

Real Bitcoin payment required to create each agent identity. Economic commitment and cryptographic identity are fused together.

---

## Five Security Guarantees

| Guarantee | How it works |
|-----------|--------------|
| Agent cannot fake identity | npub is a mathematical output of the ZK proof |
| Agent cannot exceed permissions | Scopes signed by human owner |
| Human keeps instant kill switch | Kind 38251 revocation is immediate |
| Enterprise controls access boundaries | Agent can only authenticate where enrolled |
| Fully auditable without trust | Complete trail on public NOSTR relays |

---

## Links

- **Website:** [signedbyme.com](https://signedbyme.com)
- **GitHub:** [github.com/PrivacyLion/SignedByMe](https://github.com/PrivacyLion/SignedByMe)
- **API:** `https://api.signedbyme.com`
- **Relays:** 
  - `wss://relay.signedbyme.com` (US East)
  - `wss://relay-sfo.signedbyme.com` (US West)
  - `wss://relay-ams.signedbyme.com` (Europe)
  - `wss://relay-sgp.signedbyme.com` (Asia)

---

## License

SignedByMe is source-available under the **SignedByMe Source-Available License v1.0 (SSAL-1.0)**.

See [LICENSE](../LICENSE) for full terms.
