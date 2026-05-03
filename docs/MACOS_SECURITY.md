# macOS Security & Non-Certified Builds

## Overview

Concatenator is built as a local-first tool that prioritizes user privacy and developer autonomy. To maintain this stance and avoid dependencies on centralized ecosystems (and the associated "Apple Tax"), we distribute macOS binaries that are **ad-hoc signed** rather than notarized by Apple.

## Why We Skip Apple Notarization

1.  **Privacy**: Notarization requires submitting the binary to Apple's servers. We believe in keeping the build pipeline as local as possible.
2.  **Primary Proof of Integrity**: Instead of relying on a centralized certificate authority, we use a **GPG-signed SHA-256 manifest**. This cryptographically verifiable proof serves as the absolute source of truth for the binary's authenticity.
3.  **Cost & Complexity**: Apple Notarization requires a paid Developer Program membership ($99/year), which can be a barrier for open-source and indie contributors.

## Verifying Binary Integrity

Since the binary is not notarized, macOS will mark it as "quarantined" upon download. You can verify the integrity yourself using SHA-256:

Compare this with the hash provided in the [releases](https://github.com/Kolla-Engineering-Labs/concatenator/releases) or use our built-in verification tool:

```bash
./concatenator verify self
```

This will automatically check the current binary against the signed `SHA256SUMS.asc` manifest.

### 2. Bypass Gatekeeper

The SHA-256 hash in our GPG-signed manifest is the **Primary Proof of Integrity**. This proof overrides the OS's "Unsigned" or "Damaged" warnings. If the hashes match, the binary is safe. You can remove the quarantine flag using:

```bash
xattr -d com.apple.quarantine /path/to/concatenator
```

## Security Brief

When running an unsigned build for the first time, the CLI will detect the quarantine state and provide a "Security Brief" with instructions on how to proceed. This ensures that you are always in control of your machine's security posture without sacrificing the benefits of using a high-performance local tool.

See our general [Security Policy](../SECURITY.md) for more information on our defense-in-depth approach.

---

_Built with ❤️ by Kolla Engineering Labs._
