# SIGNEDBYME TypeScript SDK

Self-signing digital signatures with zero-knowledge proofs.

## Installation

```bash
npm install @signedby/sdk
# or
yarn add @signedby/sdk
```

## Quick Start

```typescript
import { SignedByAgent, SignedByClient } from '@signedby/sdk';

// Initialize agent
const agent = await SignedByAgent.init({
  storagePath: './agent_data'
});

// Set email mapping for enterprises
agent.setEmailMapping({
  'example.com': 'user@example.com'
});

// Connect to SIGNEDBYME relays
await agent.connectRelays();

// Watch for authorization requests
for await (const authRequest of agent.watchForAuthorizations()) {
  console.log(`Authorization from ${authRequest.enterprise}`);
}

// Authenticate
const client = new SignedByClient('https://api.signedbyme.com');
const token = await client.authenticate({
  clientId: 'example',
  proof: await agent.generateProof()
});
console.log(`Authenticated: ${token.sub}`);
```

## Features

- **Agent Management**: DID generation, secure storage
- **Groth16 ZK Proofs**: Native Rust core via napi-rs
- **NOSTR Integration**: Automatic relay management
- **OIDC Compatible**: Standard JWT id_tokens

## Requirements

- Node.js 18+
- Platform-specific native bindings (included)

## Supported Platforms

- Linux x64 (glibc)
- Linux ARM64 (glibc)
- macOS x64 (Intel)
- macOS ARM64 (Apple Silicon)
- Windows x64

## Documentation

Full documentation: [https://docs.signedbyme.com](https://docs.signedbyme.com)

## License

SSAL-1.0 (SignedByMe Source-Available License)

## Links

- [GitHub](https://github.com/SIGNEDBYME-APP/SIGNEDBYME)
- [Website](https://signedbyme.com)
