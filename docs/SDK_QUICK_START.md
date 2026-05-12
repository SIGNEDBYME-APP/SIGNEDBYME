# SDK Quick Start

Get your agent authenticating in minutes.

---

## Step 1: Install the SDK

Install the SignedByMe SDK in your preferred language.

| Language | Command |
|----------|---------|
| Rust | `cargo add signedby-sdk` |
| Python | `pip install signedby` |
| TypeScript | `npm install @signedby/sdk` |

### System Requirements

| Platform | Requirements |
|----------|--------------|
| Linux | x86_64 or aarch64, glibc 2.17+ |
| macOS | x86_64 or Apple Silicon, macOS 11+ |
| Windows | x86_64, Windows 10+ |

---

## Step 2: Load Your Delegation

Your human owner provides a delegation file containing your authorization. This file proves you're allowed to act on their behalf.

### What's in the delegation file?

- **Kind 28250 event** — Signed by your human's nsec
- **Scopes** — Which enterprises you can access and what actions you can take
- **Expiration** — When this delegation ends
- **Payment proof** — Preimage proving subscription was paid

### Python:

```python
from signedby import SignedByClient

# Load delegation from your human owner
client = SignedByClient.from_delegation("./delegation.json")

print(f"Your npub: {client.npub}")
print(f"Authorized for: {client.scopes}")
```

### Rust:

```rust
use signedby_sdk::SignedByClient;

// Load delegation from your human owner
let client = SignedByClient::from_delegation("./delegation.json")?;

println!("Your npub: {}", client.npub());
println!("Authorized for: {:?}", client.scopes());
```

### TypeScript:

```typescript
import { SignedByClient } from '@signedby/sdk';

// Load delegation from your human owner
const client = await SignedByClient.fromDelegation('./delegation.json');

console.log(`Your npub: ${client.npub}`);
console.log(`Authorized for: ${JSON.stringify(client.scopes)}`);
```

> **Security:** Keep your delegation secure. It contains your authorization credentials. Store it in encrypted storage or a secure secrets manager.

---

## Step 3: Authenticate

When you need to access an enterprise service, call the SDK. It generates a zero-knowledge proof and returns a standard OIDC token.

### Python:

```python
import secrets

# Generate a nonce for replay protection
nonce = secrets.token_hex(16)

# Authenticate to the enterprise
token = await client.login(
    client_id="acme-corp",
    nonce=nonce
)

# Use the OIDC token
print(f"ID Token: {token.id_token}")
print(f"Subject (your npub): {token.sub}")
print(f"Expires in: {token.expires_in} seconds")
```

### Rust:

```rust
use signedby_sdk::LoginRequest;
use rand::Rng;

// Generate a nonce for replay protection
let nonce: String = rand::thread_rng()
    .sample_iter(&rand::distributions::Alphanumeric)
    .take(32)
    .map(char::from)
    .collect();

// Authenticate to the enterprise
let token = client.login(LoginRequest {
    client_id: "acme-corp",
    nonce: &nonce,
}).await?;

// Use the OIDC token
println!("ID Token: {}", token.id_token);
println!("Subject (your npub): {}", token.sub);
println!("Expires in: {} seconds", token.expires_in);
```

### TypeScript:

```typescript
import { randomBytes } from 'crypto';

// Generate a nonce for replay protection
const nonce = randomBytes(16).toString('hex');

// Authenticate to the enterprise
const token = await client.login({
    clientId: 'acme-corp',
    nonce: nonce
});

// Use the OIDC token
console.log(`ID Token: ${token.idToken}`);
console.log(`Subject (your npub): ${token.sub}`);
console.log(`Expires in: ${token.expiresIn} seconds`);
```

### What happens under the hood:

1. SDK generates a Groth16 zero-knowledge proof
2. Proof is published to NOSTR (kind 28101)
3. Enterprise validates your delegation chain
4. Server verifies Merkle root, returns OIDC token

---

## Step 4: Use Your Token

The token you receive is a standard OIDC JWT. Use it like any OAuth token.

### Token Structure

```json
{
  "iss": "https://api.signedbyme.com",
  "aud": "acme-corp",
  "sub": "npub1abc...",
  "iat": 1704067200,
  "exp": 1704070800,
  "nonce": "your_nonce_here",
  "amr": ["did_sig", "groth16_proof", "ln_payment"],
  "membership_verified": true
}
```

### Using the Token

Pass the token in the Authorization header when calling enterprise APIs:

```python
import httpx

# Call enterprise API with your token
response = httpx.get(
    "https://api.acme-corp.com/orders",
    headers={"Authorization": f"Bearer {token.id_token}"}
)

print(response.json())
```

### Token Expiration

Tokens expire after the time specified in `expires_in`. When expired, simply call `login()` again to get a fresh token.

```python
# Check if token is still valid
if token.is_expired():
    token = await client.login(client_id="acme-corp", nonce=new_nonce)
```

---

## Error Handling

Handle these common errors gracefully.

### Delegation Revoked

Your human owner published a kind 28251 revocation event.

**Action:** Stop operations. Contact your human owner for a new delegation.

### Delegation Expired

The `expires_at` timestamp in your delegation has passed.

**Action:** Request a renewed delegation (new kind 28250) from your human owner.

### Invalid Merkle Root

Your proof references an old Merkle root that's no longer valid.

**Action:** Refresh your witness data and retry. The SDK handles this automatically.

### Scope Denied

You tried to access an enterprise not listed in your delegation scopes.

**Action:** Request an updated delegation that includes the enterprise you need.

```python
from signedby import SignedByError, DelegationRevokedError, DelegationExpiredError

try:
    token = await client.login(client_id="acme-corp", nonce=nonce)
except DelegationRevokedError:
    print("Delegation was revoked. Contact your human owner.")
except DelegationExpiredError:
    print("Delegation expired. Request renewal from your human owner.")
except SignedByError as e:
    print(f"Authentication failed: {e}")
```

---

## Advanced: Watching for Authorizations

Optionally, listen for new authorization opportunities from enterprises.

### Subscribe to NOSTR

Watch for kind 28200 events tagged with your npub — these are enterprises inviting you to enroll.

```python
from signedby import SignedByAgent

agent = SignedByAgent.init(storage_path="./agent_data")

# Connect to relay
agent.connect_relay("wss://relay.signedbyme.com")

# Watch for authorization requests
async for event in agent.watch_for_authorizations():
    print(f"New authorization from: {event.enterprise}")
    print(f"Scopes offered: {event.scopes}")

    # Notify your human owner to complete Genesis flow
    await notify_human(event)
```

> **Note:** Enrollment (Genesis) requires your human owner's signature. The agent can detect opportunities, but the human must complete Gate 2 (signing the delegation).
