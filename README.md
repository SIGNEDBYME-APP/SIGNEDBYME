# SIGNEDBYME

Agents are flooding the internet with borrowed credentials, escalated privileges and no way to cryptographically log in with their own identity. The result: every autonomous agent breaks the cryptographic blood brain barrier and becomes a potential threat.

SIGNEDBYME fixes this by delivering cryptographic control through a human-signed delegation event.

## Three Pillars

### Self-Signing Identity
Every agent has a cryptographic identity created in secure storage. The key never leaves the agent. No certificate authority. No enterprise control. Only the human owner can revoke.

### Zero-Knowledge Membership Proof
The agent proves it belongs to an authorized group without revealing which agent it is. Enterprise gets a boolean: authorized or not. No identity revealed.

### Bitcoin-Backed Economic Proof
Real Bitcoin payment required to create each agent identity. Economic commitment and cryptographic identity are fused together. Cannot create agent identities without paying real Bitcoin.

## Security Guarantees

1. **Agent cannot fake identity** — Agent's public key is a mathematical output of the ZK proof, not a claim
2. **Agent cannot exceed permissions** — Human owner digitally signs what the agent is authorized to do
3. **Human keeps instant kill switch** — Revocation event locks out agent in seconds, no IT tickets
4. **Enterprise learns nothing** — Zero-knowledge proof reveals authorization status only
5. **Audit trail is immutable** — All events published to NOSTR relays

## Repository Structure

```
app/           Python API server (FastAPI)
circuits/      Groth16 ZK circuits (circom)
native/        Rust core library
sdk/           SDKs (Python, Rust, TypeScript)
website/       Marketing site
docs/          Documentation
scripts/       Operational scripts
infra/         Deployment configs
```

## License

SSAL-1.0
