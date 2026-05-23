# Authentication Flow

How agents authenticate to enterprises using SignedByMe.

---

## Overview

SignedByMe uses a hybrid flow combining:

- **Decentralized Identifiers (DIDs)** — Agent-controlled cryptographic identity
- **Groth16 Zero-Knowledge Proofs** — Cryptographic proof of Merkle tree membership
- **NOSTR** — Decentralized event publishing and delegation verification
- **OIDC** — Standard token format for enterprise integration

---

## The Two Flows

### Genesis Flow (One-Time)

Runs once per enterprise. Establishes the agent's identity in the enterprise's Merkle tree.

### Login Flow (Every Authentication)

Runs every time the agent needs access. Generates a ZK proof and receives an OIDC token.

---

## Genesis Flow — Three Gates

The genesis flow runs once per agent per enterprise. It never repeats.

### Gate 1 — Email Match + Identity Binding

1. Human logs into enterprise with their own credentials
2. Enterprise shows "Authorize an Agent" and displays a challenge code
3. Enterprise publishes open kind 38200 session event (no npub, just client_id)
4. Human enters challenge code into their agent
5. Agent publishes kind 38202 with email + npub + challenge code
6. Enterprise verifies: email matches logged-in user? challenge matches? signature valid?
7. **Gate 1 passed.** Enterprise now has the agent's npub.

### Gate 2 — Human's Cryptographic Consent

1. Enterprise publishes addressed kind 38200 (tagged with specific agent_npub)
2. Agent notifies human: "Amazon wants to authorize me"
3. Human signs kind 38250 with their own NOSTR client
4. Human publishes kind 38250 to relay
5. Enterprise catches kind 38250, validates signature
6. **Gate 2 passed.** Human has cryptographically consented.

> **Critical:** The human's nsec never enters the agent. Human signs with their own NOSTR client. A rogue agent cannot forge this.

### Gate 3 — ZK Proof of Leaf Ownership

1. Agent calls `POST /v1/membership/enroll/commit` with:
   - `leaf_commitment` (hash of agent's secret)
   - `authorization_event` (kind 38200 from enterprise)
   - `delegation_event` (kind 38250 from human)
2. Server verifies both Schnorr signatures via NIP-05
3. Server appends leaf_commitment to Merkle tree
4. Agent fetches witness, caches locally
5. **Gate 3 passed.** Genesis complete.

---

## Login Flow

After genesis, every authentication is automatic.

```
Agent          NOSTR Relay       Enterprise        SignedByMe
  │                 │                 │                 │
  │ 1. Generate ZK proof             │                 │
  │    (<3 seconds)                  │                 │
  │                 │                 │                 │
  │ 2. Publish kind 38101 ─────────>│                 │
  │    (proof + public_outputs)      │                 │
  │                 │                 │                 │
  │                 │ 3. Catch 38101 │                 │
  │                 │                 │                 │
  │                 │<── 4. Query 38250 ───────────────│
  │                 │    (validate delegation)        │
  │                 │                 │                 │
  │                 │                 │ 5. POST /v1/login/verify ─>│
  │                 │                 │                 │
  │                 │                 │<───── 6. id_token ─────────│
  │                 │                 │                 │
  │                 │                 │ 7. Agent authenticated     │
```

### Step by Step

1. **Agent generates Groth16 proof** — Proves Merkle tree membership without revealing which leaf
2. **Agent publishes kind 38101** — Contains proof + public_outputs (merkle_root, npub) + delegation_id
3. **Enterprise catches kind 38101** — Subscribed to relay for proof events
4. **Enterprise validates delegation** — Queries NOSTR for kind 38250, checks expiry, checks for revocation
5. **Enterprise calls /v1/login/verify** — Sends proof and public_outputs to SignedByMe
6. **Server returns id_token** — OIDC JWT with sub=npub
7. **Agent authenticated** — Enterprise grants access based on scopes in delegation

---

## Delegation Validation

Before calling `/v1/login/verify`, enterprise must validate the delegation chain:

```javascript
async function validateDelegation(agentNpubHex, delegationId) {
  // 1. Query NOSTR for kind 38250
  const delegation = await queryNostr({
    kinds: [38250],
    '#p': [agentNpubHex]
  });

  if (!delegation) return false;

  const content = JSON.parse(delegation.content);

  // 2. Check expiry
  if (new Date(content.expires_at) < new Date()) return false;

  // 3. Check for revocation (kind 38251)
  const revocation = await queryNostr({
    kinds: [38251],
    '#d': [content.delegation_id]
  });

  if (revocation) return false;

  // 4. Check scopes include this enterprise
  if (!content.scopes?.[CLIENT_ID]) return false;

  // 5. Verify human's NIP-05 (optional but recommended)
  const nip05Valid = await verifyNip05(delegation.pubkey);

  return nip05Valid;
}
```

---

## Server-Side Verification

The server performs a single check:

```
POST /v1/login/verify
Body: { proof, public_outputs: { merkle_root, npub }, client_id }

Server checks:
  1. merkle_root is in the last 30 valid roots for this client_id

Returns: OIDC id_token
```

**Why only one check?**

The cryptographic chain is self-verifying:
- npub is a mathematical output of the Groth16 circuit
- The agent signed the kind 38101 proof_event with the nsec derived from leaf_secret
- If the proof is valid and the root is recent, the agent is who they claim to be

Server-side Groth16 verification is redundant.

---

## OIDC Token

The id_token is a standard RS256-signed JWT.

### Claims

| Claim | Description |
|-------|-------------|
| `sub` | Agent's npub — globally consistent identifier |
| `iss` | `https://api.signedbyme.com` |
| `aud` | Enterprise's client_id |
| `iat` | Issued at timestamp |
| `exp` | Expiration timestamp |
| `membership_verified` | `true` — agent proved Merkle tree membership |
| `amr` | `["zk_membership"]` — authentication method |

### Example

```json
{
  "iss": "https://api.signedbyme.com",
  "aud": "acme-corp",
  "sub": "npub1abc...",
  "iat": 1704067200,
  "exp": 1704070800,
  "membership_verified": true,
  "amr": ["zk_membership"]
}
```

### Validation

Validate like any OIDC token:

```python
import jwt
from jwt import PyJWKClient

jwks_client = PyJWKClient("https://api.signedbyme.com/jwks.json")

def validate_token(id_token, expected_client_id):
    signing_key = jwks_client.get_signing_key_from_jwt(id_token)

    claims = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=["RS256"],
        audience=expected_client_id,
        issuer="https://api.signedbyme.com"
    )

    return claims
```

---

## Revocation

If the human publishes kind 38251, the delegation is instantly revoked:

1. Human publishes kind 38251 tagged with delegation_id
2. Enterprise catches it on next NOSTR query
3. Enterprise's delegation cache is invalidated
4. Agent's next login fails during delegation validation
5. `/v1/login/verify` is never called

No blocklist. No tree rebuild. No server involvement.

---

## Root Rotation

When a new agent enrolls, a new Merkle root is generated.

- Agent SDK polls `GET /v1/roots/current` once per hour
- If root differs from cached root, agent fetches fresh witness
- Old roots remain valid for 30 rotations (rolling window)
- Agents don't need immediate witness refresh

---

## Summary

| Phase | What happens | Server involvement |
|-------|--------------|-------------------|
| Genesis Gate 1 | Email verification | None |
| Genesis Gate 2 | Human signs delegation | None |
| Genesis Gate 3 | Leaf enrolled | Appends to Merkle tree |
| Login | ZK proof generated | Returns id_token |
| Revocation | Kind 38251 published | None |
