# Start Guide for Humans

Complete setup in 10 minutes.

---

## Step 1: Get Your NOSTR Keys

NOSTR is a decentralized protocol. Your keys are your identity — no company controls them. You need keys before you can authorize an agent.

### Download a NOSTR client

| Platform | App | Link |
|----------|-----|------|
| iOS | Damus | [Download from App Store](https://apps.apple.com/app/damus/id1628663131) |
| iOS | Primal | [Download from App Store](https://apps.apple.com/app/primal/id1673134518) |
| Android | Amethyst | [Download from Play Store](https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst) |
| Android | Primal | [Download from Play Store](https://play.google.com/store/apps/details?id=net.primal.android) |
| Web | Primal | [Open in Browser](https://primal.net) |
| Web | noStrudel | [Open in Browser](https://nostrudel.ninja) |

### Create your keys

Open the app. Keys are generated automatically on first launch. No signup. No email. No password.

### Understand your keys

| Key | What it is | Rule |
|-----|------------|------|
| npub | Your public identity | Share freely |
| nsec | Your signing key | NEVER share |

### Back up your nsec

1. Open Settings → Keys (or Profile → Keys)
2. Copy your nsec
3. Paste into your password manager (1Password, Bitwarden, etc.)
4. If you lose your nsec, you lose your identity forever. No recovery.

> ⚠️ **Warning:** Store your nsec safely. This is your NOSTR identity key and cannot be recovered if lost.

### Optional: NIP-05 verification

NIP-05 links your npub to a domain you control (like you@yourdomain.com). Enterprises trust verified humans more.

To set up:

1. Create file: `https://yourdomain.com/.well-known/nostr.json`
2. Add this content:

```json
{
  "names": {
    "you": "your_npub_in_hex_format"
  }
}
```

Convert npub to hex at: [nostrcheck.me/converter](https://nostrcheck.me/converter/)

---

## Step 2: Install and Configure Your Agent

Your agent runs on your machine (or server). Install the SDK in whichever language you prefer.

### Install the SDK

| Language | Command |
|----------|---------|
| Rust | `cargo add signedby-sdk` |
| Python | `pip install signedby` |
| TypeScript | `npm install @signedby/sdk` |

### Initialize the agent

**Python:**

```python
from signedby import SignedByAgent

agent = SignedByAgent.init(storage_path="./agent_data")
print(f"Agent npub: {agent.npub}")
```

**Rust:**

```rust
use signedby_sdk::SignedByAgent;

let agent = SignedByAgent::init("./agent_data")?;
println!("Agent npub: {}", agent.npub());
```

**TypeScript:**

```typescript
import { SignedByAgent } from '@signedby/sdk';

const agent = await SignedByAgent.init('./agent_data');
console.log(`Agent npub: ${agent.npub}`);
```

### Configure email mapping

Tell the agent which email address you use at each enterprise.

**Python:**

```python
agent.set_email_mapping({
    "amazon.com": "you@gmail.com",
    "acme.com": "you@gmail.com"
})
```

**Rust:**

```rust
agent.set_email_mapping(HashMap::from([
    ("amazon.com", "you@gmail.com"),
    ("acme.com", "you@gmail.com"),
]));
```

**TypeScript:**

```typescript
agent.setEmailMapping({
    'amazon.com': 'you@gmail.com',
    'acme.com': 'you@gmail.com'
});
```

### Start the agent

**Python:**

```python
agent.connect_relay("wss://relay.signedbyme.com")
agent.watch_for_authorizations()
```

**Rust:**

```rust
agent.connect_relay("wss://relay.signedbyme.com")?;
agent.watch_for_authorizations().await?;
```

**TypeScript:**

```typescript
await agent.connectRelay('wss://relay.signedbyme.com');
agent.watchForAuthorizations();
```

> ✅ **Success!** Agent is now running and waiting for authorization requests.

---

## Step 3: Authorize Your Agent (Genesis Flow)

This happens once per enterprise. After Genesis completes, your agent can log in to that enterprise forever (until you revoke it).

### Log into the enterprise

Go to the enterprise website (e.g., Amazon). Log in with your normal credentials. Find "Authorize an Agent" and click it.

### Enter the challenge code

The enterprise shows a 16-character code (e.g., `A1B2C3D4E5F67890`). Enter this code into your running agent when prompted.

### Pay the subscription

Your agent displays a Lightning invoice for $21 in BTC. This is your monthly subscription.

Pay with any Lightning wallet:

| Platform | Wallet | Link |
|----------|--------|------|
| iOS | Wallet of Satoshi | [App Store](https://apps.apple.com/app/wallet-of-satoshi/id1438599608) |
| iOS | Strike | [App Store](https://apps.apple.com/app/strike-bitcoin-payments/id1488724463) |
| Android | Wallet of Satoshi | [Play Store](https://play.google.com/store/apps/details?id=com.livingroomofsatoshi.wallet) |
| Android | Strike | [Play Store](https://play.google.com/store/apps/details?id=zapsolutions.strike) |
| Any | Phoenix | [phoenix.acinq.co](https://phoenix.acinq.co/) |

**How to pay:**

1. Open your Lightning wallet
2. Tap Send or Scan
3. Scan the QR code your agent displays (or paste the invoice string)
4. Confirm the payment

> **Important:** After payment, your wallet receives a preimage (a long string of characters). Your agent captures this automatically. The preimage cryptographically proves you paid and gets included in your delegation.

Your agent earns 20% of this subscription automatically, seeding its economic life.

### Sign the delegation

Your agent will display an unsigned delegation event and a link/QR code. The delegation includes your payment proof. Open your NOSTR client, scan the QR or paste the link. Review the permissions and expiration date. Sign it.

### Done

✅ **Complete!** Your agent handles the rest. Within seconds, you'll see confirmation. Your agent is now enrolled and can authenticate to that enterprise.

---

## Step 4: Stay in Control

You delegated authority, not ownership. You can monitor, revoke, or renew at any time.

### Monitor your agent

Subscribe to your agent's npub in any NOSTR client. Watch for these event kinds:

- **38101** — Agent generated a proof
- **38102** — Authentication complete
- **38103** — Login complete

### Revoke a delegation

If your agent is compromised or you want to cut access, publish a kind 38251 event from your NOSTR client:

```json
{
  "kind": 38251,
  "tags": [["d", "DELEGATION_ID_HERE"]],
  "content": ""
}
```

Replace `DELEGATION_ID_HERE` with the `delegation_id` from your original kind 38250. The agent loses access immediately.

### Renew before expiry

Delegations have an expiration date. Before it expires, sign a new kind 38250 with a new `expires_at`. Your agent's Merkle leaf stays the same — no re-enrollment needed.

### Pay your subscription

Your agent's SDK prompts you when payment is due. Pay via Lightning invoice. The preimage cryptographically binds to your agent's identity.

> **$21/month in BTC** — Your agent earns 20% automatically.
