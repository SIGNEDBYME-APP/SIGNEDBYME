# Security

Security model, threat model, and responsible disclosure.

---

## Security Model

SignedByMe provides five cryptographic security guarantees:

| Guarantee | Mechanism |
|-----------|-----------|
| **Agent cannot fake identity** | npub is a mathematical output of the Groth16 ZK proof, not a self-reported claim. Forging requires breaking the proof system. |
| **Agent cannot exceed authorization** | Scopes are signed by the human owner in kind 38250. Enterprise reads from NOSTR. Agent cannot claim broader permissions than granted. |
| **Human retains the kill switch** | Kind 38251 revocation locks the agent out instantly. Cryptographic revocation — no IT tickets, no admin portals. |
| **Enterprise controls access boundaries** | Agent can only authenticate where its leaf was enrolled. Cannot self-enroll or access unapproved services. |
| **Fully auditable without trust** | Complete audit trail on public NOSTR relays. Anyone can verify independently. |

---

## Cryptographic Foundations

### Groth16 Circuit

- **Curve:** BN254
- **Hash:** Poseidon2
- **Constraints:** ~101,206
- **Security level:** 128-bit

The circuit is frozen. The same mathematical foundations that secure the Bitcoin network secure SignedByMe.

### Key Derivation

```
DID private key (in TEE/secure storage)
    │
    ▼
leaf_secret (5 BN254 field elements)
    │
    ├── Poseidon2(leaf_secret[0..5]) → leaf_commitment
    │
    └── Poseidon2(leaf_secret[0..2]) → nsec → npub
```

The nsec exists only transiently during proof generation. Never stored. Never transmitted.

### Signature Scheme

All NOSTR events use Schnorr signatures over secp256k1, verified via NIP-05.

---

## What the Server Never Sees

| Secret | Location | Server Access |
|--------|----------|---------------|
| DID private key | Agent's TEE | Never |
| leaf_secret | Agent's TEE | Never |
| nsec | Derived inside circuit | Never |
| Which leaf in tree | — | Never |
| Real-world identity | — | Never |
| Human's nsec | Human's NOSTR client | Never |

The server sees only:
- `leaf_commitment` (opaque hash at enrollment)
- Groth16 proof bytes (transiently, then discarded — never stored)
- `merkle_root` and `npub` (public outputs)

---

## Threat Model

### What SignedByMe Protects Against

| Threat | Protection |
|--------|------------|
| Agent impersonation | npub is cryptographically bound to ZK proof |
| Scope escalation | Scopes signed by human, verified by enterprise |
| Unauthorized enrollment | Three-gate genesis requires human signature |
| Session hijacking | Stateless — no sessions to hijack |
| Replay attacks | Nonces + delegation_id binding |
| Mass credential theft | No credential database to breach |

### What Requires Additional Measures

| Threat | Mitigation |
|--------|------------|
| Compromised agent TEE | Hardware-level attack; requires physical access |
| Compromised human nsec | Human should use secure NOSTR client |
| Enterprise nsec exposure | Enterprise should sign from backend |
| Network interception | All communications over TLS |

### Human nsec Threat Model

The human's nsec never enters the agent. Human signs kind 38250 (delegation) and kind 38251 (revocation) with their own NOSTR client.

**Independent failure domains:**
- Agent compromised → Agent identity exposed, human nsec safe
- Human NOSTR client compromised → Human identity exposed, agent leaf_secret safe

---

## Enterprise Security Checklist

- [ ] **Never expose enterprise nsec in client-side code** — Sign events from backend
- [ ] **Never expose API key in client-side code** — Make API calls from backend
- [ ] **Validate delegation chain before /v1/login/verify** — Check kind 38250 exists, not expired, not revoked
- [ ] **Verify NIP-05** — Confirm human's npub via their domain's nostr.json
- [ ] **Use HTTPS only** — Never load integration over HTTP
- [ ] **Set session timeout** — Enrollment sessions should expire after 10 minutes max
- [ ] **Never reuse nonces** — Generate fresh nonce for each enrollment

---

## Agent Security Checklist

- [ ] **Store credentials in TEE or encrypted storage** — DID key and leaf_secret never in plaintext
- [ ] **Keep delegation file secure** — Contains authorization credentials
- [ ] **Verify enterprise NIP-05** — Confirm kind 38200 came from legitimate enterprise
- [ ] **Handle revocation gracefully** — Stop operations if delegation is revoked

---

## Responsible Disclosure

If you discover a security vulnerability in SignedByMe:

1. **Do not** disclose publicly until we've had time to address it
2. **Email** security@signedbyme.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your recommended fix (optional)
3. **We will respond** within 48 hours with acknowledgment
4. **We will coordinate** a disclosure timeline with you

### Scope

In scope:
- API server vulnerabilities
- SDK vulnerabilities
- Cryptographic weaknesses
- NOSTR protocol issues affecting SignedByMe

Out of scope:
- Social engineering attacks
- Denial of service
- Issues requiring physical access to user devices

### Recognition

We maintain a security acknowledgments page for responsible disclosures.

---

## Security Updates

Security-related updates are announced via:
- GitHub Security Advisories
- signedbyme.com/security

Subscribe to the repository for notifications.
