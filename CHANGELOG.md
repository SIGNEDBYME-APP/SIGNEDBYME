# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-beta.23] - 2026-05-23

### What's New

**SDK Release**
- Published to all three platforms: npm, PyPI, crates.io
- Fixed CI workflow to use fresh native binary from build artifacts
- Fixed nlohmann/json submodule (updated to v3.12.0)

**E2E Demo**
- Full 8-step agent authorization flow working end-to-end
- All gates passing: 38202 → 38250 → Merkle enrollment → 38101 → 38102/38103 → OIDC token

### Platform Support
- **Linux:** x86_64, glibc 2.17+
- **macOS:** Apple Silicon (ARM64), macOS 11+
- **Windows:** Coming soon

### Installation
```bash
# Rust
cargo add signedby-sdk

# Python
pip install signedby

# TypeScript
npm install @signedby/sdk
```

### Verification
Each ZIP includes `SHA256SUMS.txt`. After extraction:
```bash
sha256sum -c SHA256SUMS.txt
```
