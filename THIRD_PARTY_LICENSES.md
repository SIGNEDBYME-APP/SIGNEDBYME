# Third-Party Licenses

SIGNEDBYME uses the following open-source components. All licenses are permissive (MIT, Apache 2.0, BSD, CC0) and compatible with commercial use.

---

## License Summary

| Component | License | Copyleft? | Commercial OK? |
|-----------|---------|-----------|----------------|
| circom-ecdsa | MIT | No | ✅ Yes |
| circomlib | MIT | No | ✅ Yes |
| arkworks | MIT/Apache 2.0 | No | ✅ Yes |
| secp256k1 | MIT | No | ✅ Yes |
| bitcoin-rs | CC0 | No | ✅ Yes |
| FastAPI | MIT | No | ✅ Yes |
| Pydantic | MIT | No | ✅ Yes |
| PyJWT | MIT | No | ✅ Yes |
| All Rust crates | MIT/Apache 2.0 | No | ✅ Yes |

**No GPL/LGPL/copyleft licenses are used.** All dependencies allow commercial use and proprietary distribution.

---

## Zero-Knowledge Proof Components

### circom-ecdsa
- **Project:** https://github.com/0xPARC/circom-ecdsa
- **Copyright:** 2022 0xPARC
- **License:** MIT
- **Usage:** secp256k1 ECDSA operations in circom circuits for Groth16 proofs
- **Files:** `circuits/circom-ecdsa/`

### circomlib
- **Project:** https://github.com/iden3/circomlib
- **Copyright:** 2018-2024 iden3
- **License:** MIT
- **Usage:** Standard circuit library for circom (comparators, multiplexers, etc.)

### vocdoni-keccak (included in circom-ecdsa)
- **Project:** https://github.com/vocdoni/keccak256-circom
- **Copyright:** 2022 Vocdoni
- **License:** MIT
- **Usage:** Keccak-256 hash implementation in circom (part of circom-ecdsa dependency)

### snarkjs
- **Project:** https://github.com/iden3/snarkjs
- **Copyright:** 2018-2024 iden3
- **License:** MIT
- **Usage:** Groth16 proof generation and verification key format

---

## Rust Dependencies (SDK)

### arkworks
- **Project:** https://github.com/arkworks-rs
- **Copyright:** 2019-2024 arkworks contributors
- **License:** MIT/Apache 2.0
- **Components:** ark-groth16, ark-bn254, ark-ff, ark-ec, ark-snark, ark-serialize
- **Usage:** Groth16 proof verification, BN254 curve operations

### secp256k1
- **Project:** https://github.com/rust-bitcoin/rust-secp256k1
- **Copyright:** 2014-2024 Andrew Poelstra, rust-bitcoin developers
- **License:** CC0 (Public Domain)
- **Usage:** Elliptic curve cryptography for NOSTR key operations

### k256
- **Project:** https://github.com/RustCrypto/elliptic-curves
- **Copyright:** RustCrypto developers
- **License:** MIT/Apache 2.0
- **Usage:** secp256k1 curve operations

### sha2
- **Project:** https://github.com/RustCrypto/hashes
- **Copyright:** RustCrypto developers
- **License:** MIT/Apache 2.0
- **Usage:** SHA-256 hashing

### serde / serde_json
- **Project:** https://github.com/serde-rs/serde
- **Copyright:** 2014-2024 Erick Tryzelaar, David Tolnay
- **License:** MIT/Apache 2.0
- **Usage:** Serialization/deserialization

### thiserror
- **Project:** https://github.com/dtolnay/thiserror
- **Copyright:** 2019-2024 David Tolnay
- **License:** MIT/Apache 2.0
- **Usage:** Error handling

### bech32
- **Project:** https://github.com/rust-bitcoin/rust-bech32
- **Copyright:** 2017-2024 rust-bitcoin developers
- **License:** MIT
- **Usage:** Bech32 encoding for npub/nsec

### jsonwebtoken
- **Project:** https://github.com/Keats/jsonwebtoken
- **Copyright:** 2015-2024 Vincent Prouillet
- **License:** MIT
- **Usage:** JWT encoding/decoding for OIDC tokens

### reqwest
- **Project:** https://github.com/seanmonstar/reqwest
- **Copyright:** 2016-2024 Sean McArthur
- **License:** MIT/Apache 2.0
- **Usage:** HTTP client for OIDC discovery

---

## Python Dependencies (API Server)

### FastAPI
- **Project:** https://github.com/tiangolo/fastapi
- **Copyright:** 2018-2024 Sebastián Ramírez
- **License:** MIT
- **Usage:** Web framework

### Uvicorn
- **Project:** https://github.com/encode/uvicorn
- **Copyright:** 2017-2024 Encode
- **License:** BSD 3-Clause
- **Usage:** ASGI server

### Pydantic
- **Project:** https://github.com/pydantic/pydantic
- **Copyright:** 2017-2024 Samuel Colvin
- **License:** MIT
- **Usage:** Data validation

### PyJWT
- **Project:** https://github.com/jpadilla/pyjwt
- **Copyright:** 2015-2024 José Padilla
- **License:** MIT
- **Usage:** JWT encoding/decoding

### slowapi
- **Project:** https://github.com/laurentS/slowapi
- **Copyright:** 2020-2024 Laurent Savaete
- **License:** MIT
- **Usage:** Rate limiting

### httpx
- **Project:** https://github.com/encode/httpx
- **Copyright:** 2019-2024 Encode
- **License:** BSD 3-Clause
- **Usage:** HTTP client for NIP-05 lookups

---

## TypeScript Dependencies (SDK)

### @noble/curves
- **Project:** https://github.com/paulmillr/noble-curves
- **Copyright:** 2022-2024 Paul Miller
- **License:** MIT
- **Usage:** Elliptic curve cryptography

### @noble/hashes
- **Project:** https://github.com/paulmillr/noble-hashes
- **Copyright:** 2022-2024 Paul Miller
- **License:** MIT
- **Usage:** Cryptographic hashes

---

## Compliance Notes

### What We Must Do
1. ✅ Include this license file in source distributions
2. ✅ Include license notices in binary distributions
3. ✅ Attribute copyright holders as listed above
4. ✅ Not claim endorsement by copyright holders

### What We May Do
- ✅ Use commercially
- ✅ Modify and create derivative works
- ✅ Distribute in source or binary form
- ✅ Sublicense (for MIT/Apache 2.0)
- ✅ Use without sharing our source code (no copyleft)

### What We Must NOT Do
- ❌ Remove copyright notices from dependencies
- ❌ Use trademarks without permission
- ❌ Hold contributors liable for damages

---

## Full License Texts

The full text of each license is available at:
- **Apache 2.0:** https://www.apache.org/licenses/LICENSE-2.0
- **MIT:** https://opensource.org/licenses/MIT
- **BSD 3-Clause:** https://opensource.org/licenses/BSD-3-Clause
- **CC0:** https://creativecommons.org/publicdomain/zero/1.0/

---

*Last updated: 2026-05-05*
