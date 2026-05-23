# Understanding Delegation

How permissions flow from humans to agents.

---

## What is Delegation?

Delegation is the cryptographic authorization from a human to their agent. It defines what the agent can do, where it can do it, and for how long.

### The Core Principle

Your agent cannot act without your explicit, signed permission. You create a delegation event — a NOSTR message signed with your private key — that grants specific powers to your agent.

- **Only you can create delegations** (requires your nsec)
- **Only you can revoke them**
- **Delegations expire automatically**
- **Enterprises verify delegations before trusting your agent**

> **Key insight:** Delegation lives entirely on NOSTR. The SignedByMe server never sees your delegation — it's verified directly by enterprises using cryptographic signatures.

---

## The Permission Chain

Permissions flow through a cryptographic chain. Each link is verified independently.

```
Human              →      Kind 38250         →      Agent            →      Enterprise
Signs with nsec          Delegation Event          Receives authority       Verifies & trusts
```

### Three NOSTR Keypairs

| Who | Keypair | Signs |
|-----|---------|-------|
| Human | Your NOSTR keys | 38250 delegation, 38251 revocation |
| Agent | Derived from leaf_secret | 38101 proof, 38102 auth, 38103 login |
| Enterprise | Enterprise NOSTR keys | 38200 enrollment authorization |

> The server has zero NOSTR keys. It never signs anything. It never sees your delegation. The cryptographic chain is entirely peer-to-peer.

---

## Kind 38250 — Delegation Grant

This is the NOSTR event you sign to authorize your agent. It specifies exactly what your agent can do.

### Event Structure

```json
{
  "kind": 38250,
  "pubkey": "<your_npub_hex>",
  "tags": [["p", "<agent_npub_hex>"]],
  "content": "{
    \"agent_npub\": \"npub1abc...\",
    \"scopes\": {
      \"amazon.com\": [\"read\", \"write\"],
      \"acme.com\": [\"read:orders\"]
    },
    \"expires_at\": \"2027-03-01T00:00:00Z\",
    \"delegation_id\": \"del_abc123\"
  }",
  "sig": "<your_signature>"
}
```

### Scopes — Two Levels of Control

**Level 1: Where** — Which enterprises can your agent access?

Your agent can only authenticate to enterprises explicitly listed in the scopes. No wildcards. No defaults.

**Level 2: What** — What actions at each enterprise?

| Scope | Meaning |
|-------|---------|
| read | View data only |
| write | Create and modify data |
| transact | Make purchases or financial actions |
| admin | Administrative functions |
| full | All permissions |

Enterprises map these standard scopes to their internal permission systems.

### Key Fields

- **agent_npub** — The agent receiving this delegation
- **scopes** — Map of enterprise → permissions
- **expires_at** — When this delegation automatically ends
- **delegation_id** — Unique ID for this delegation (used for revocation)

> **The #p tag is critical.** It contains your agent's npub in hex format. NOSTR relays index this tag, allowing enterprises to efficiently query for delegations to a specific agent.

---

## Kind 38251 — Revocation

Instantly kill your agent's access. One event, immediate effect.

### Event Structure

```json
{
  "kind": 38251,
  "pubkey": "<your_npub_hex>",
  "tags": [["d", "del_abc123"]],
  "content": "",
  "sig": "<your_signature>"
}
```

### How Revocation Works

1. You publish kind 38251 with the delegation_id in the #d tag
2. Enterprise catches it on their next NOSTR query
3. Agent's next login attempt fails before reaching the server
4. No blocklist. No tree rebuild. No server involvement.

> **Revocation is instant and cryptographic.** The human is the only party who can revoke. No IT tickets. No admin portals. One NOSTR event and your agent is locked out.

---

## Enterprise Validation

Before trusting your agent, enterprises verify the complete delegation chain.

### Validation Flow

1. **Catch agent's proof event** — Agent publishes kind 38101 with proof, public outputs, and delegation_id
2. **Query for delegation** — Enterprise queries NOSTR: `{"kinds": [38250], "#p": ["<agent_npub_hex>"]}`
3. **Verify the delegation:**
   - Signed by trusted human (NIP-05 verified)
   - `expires_at` is in the future
   - `delegation_id` matches the proof event
   - No kind 38251 revocation exists for this delegation_id
4. **Call /v1/login/verify** — Server confirms Merkle root, returns OIDC token

> **Caching:** Enterprises cache the delegation chain locally (keyed by agent npub). The cache is invalidated at `expires_at` or when a revocation is detected.

---

## Renewal

Delegations expire. Subscriptions renew monthly. Your agent's identity persists.

### Monthly Renewal

1. Pay monthly Lightning subscription ($21 in BTC)
2. Publish new kind 38250 with new `expires_at` and new `delegation_id`
3. Agent's Merkle leaf stays the same — no re-enrollment needed
4. Server is completely uninvolved in renewal

### Payment Binding

The subscription preimage is incorporated into your agent's identity at creation. The Lightning payment isn't just a fee — it's cryptographically fused into your agent's DID.

- No payment = no valid identity
- Payment preimage binds to leaf_secret
- Unforgeable economic commitment

> Your agent earns 20% of your monthly subscription automatically, seeding its economic life and building provable reputation.

---

## Summary

### NOSTR Event Kinds

| Kind | Name | Signed By |
|------|------|-----------|
| 38200 | Enrollment Authorization | Enterprise |
| 38250 | Delegation Grant | Human |
| 38251 | Revocation | Human |
| 38101 | Proof Event | Agent |
| 38102 | Auth Complete | Agent |
| 38103 | Login Complete | Agent |

### Key Principles

- **Delegation lives on NOSTR** — Never touches the server
- **Human controls everything** — Only you can grant or revoke
- **Enterprises verify directly** — Cryptographic signatures, not API calls
- **Expiration is automatic** — No cleanup needed
- **Revocation is instant** — One event, immediate effect
