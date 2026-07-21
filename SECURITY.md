# 🛡️ Security Policy

## Table of Contents

- [Reporting a Vulnerability](#reporting-a-vulnerability)
- [Security Best Practices for Users](#security-best-practices-for-users)
- [Security-Related Configuration](#security-related-configuration)
- [Known Security Considerations](#known-security-considerations)
- [Security Updates](#security-updates)
- [Acknowledgments](#acknowledgments)

## 🛡️ Reporting a Vulnerability

We take the security of Concatenator seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### GitHub Private Vulnerability Reporting (Required)

We use GitHub's native **Private Vulnerability Reporting** feature to ensure secure, confidential disclosure:

1. Navigate to the repository's **Security** tab
2. Click **"Report a vulnerability"** to open the submission form
3. Alternatively, [Submit Here](https://github.com/Kolla-Engineering-Labs/concatenator/security/advisories/new)

> [!IMPORTANT]
> We do not accept security vulnerability reports via public GitHub Issues or email. All security reports must go through GitHub's Private Vulnerability Reporting to ensure proper handling and coordination.

## Security Best Practices for Users

### 📂 File System Security

- **No silent file access**: All file operations require explicit user interaction (drag-and-drop or file picker)
- **No persistent permissions**: The browser does not retain file system permissions between sessions
- **Path Traversal Protection**: All paths are sanitized and verified to stay within the user-granted scope using standard resolution (`fs.realpathSync`) to block ".." or malicious symlink escapes.

### 🛡️ Network & API Security

Concatenator implements a multi-layered defense to protect your local machine from unauthorized access when running the API server:

- **Localhost Binding**: The API server binds strictly to `127.0.0.1`. This ensures that external machines on your local network (LAN) cannot probe or access the server.
- **Readiness Probe (`/api/health` or `/health`)**: A lightweight endpoint providing server status, version, and uptime. It is explicitly excluded from the API Token Guard to allow the CLI to verify server readiness before launching the browser. No sensitive data or file access is exposed via this probe.
- **API Token Guard**: All sensitive API endpoints (VFS, file read, config) are protected by a mandatory `X-Concatenator-Token` header.
  - **How it works**: The server reads a token from the `CONCATENATOR_API_TOKEN` environment variable.
  - **Protection**: This prevents malicious websites or local bots from triggering filesystem operations on your machine via CSRF or simple automated probing. See the [API Security guide](./CONTRIBUTING.md#api-security) for instructions on generating and setting this token.

### 🖋️ Binary Integrity (Code Signing)

Concatenator binaries for Windows and macOS are cryptographically signed to ensure that the code has not been tampered with after being built.

- **Windows**: Signed using `signtool.exe` with a valid developer certificate.
- **macOS**: Signed using `codesign` and notarized by Apple for official releases. Community or development builds may use **ad-hoc signing** to preserve user privacy and autonomy. See [macOS Security & Non-Certified Builds](./docs/MACOS_SECURITY.md) for more information.

Always verify the publisher in your OS security prompts before running the executable.

### Binary Verification

Beyond OS-level signing, we provide a **GPG-signed manifest** for every official release. This allows you to verify binary integrity even if OS certificate chains are compromised or unavailable (e.g., in air-gapped systems). We explicitly encourage establishing cryptographic chain-of-custody before executing standalone binaries on Enterprise systems.

- **Manifest File**: `SHA256SUMS.asc` (Standard SHA-256 hashes inside a PGP Clearsigned Message).
- **Architect PGP Fingerprint**: `4A21 4627 3B7B 0A35 4C41  4753 5B22 4C5F 51E6 10EF`

#### Verification via NPM (Recommended)
You can run our verification command directly from the npm/source layer. This allows you to establish trust in the standalone binary using the distributed npm package before executing it:

```bash
npx @kolla/concatenator verify ./concatenator-windows-x64.exe
```

For deeper cryptographic debugging, append the `--verbose` flag:
```bash
npx @kolla/concatenator verify ./concatenator-windows-x64.exe --verbose
```

#### Verification via Standard OS Tools
Alternatively, you can verify the binaries using standard OS tools and GitHub attestation features to maintain your organization's chain-of-custody protocols:

```bash
# 1. Verify the PGP signature of the manifest
gpg --import public.key
gpg --verify SHA256SUMS.asc

# 2. Verify the SHA256 hash of the binary matches the manifest
shasum -a 256 -c SHA256SUMS.asc

# 3. (Optional) Verify via GitHub Attestations if artifacts were downloaded from GitHub Releases
gh attestation verify ./concatenator-windows-x64.exe -o Kolla-Engineering-Labs
```

- **Pre-Release Audit**: Our build pipeline includes a `npm run test:release` audit that orchestrates GPG signature verification and SHA256 integrity checks on release candidates before they are finalized.

## Security-Related Configuration

### Rate Limiting

The production server implements rate limiting to prevent abuse:

| Endpoint           | Limit         | Window     |
| ------------------ | ------------- | ---------- |
| `/api/ignore-list` | 100 requests  | 15 minutes |
| Static files       | 1000 requests | 1 minute   |

These limits are disabled in development mode for testing purposes.

### Path Traversal Protection

All file path operations include strict validation to prevent path traversal attacks:

- Worker IDs are sanitized to allow only numeric characters
- **Unified Crawler**: Standardized filesystem traversal via the `UnifiedCrawler` class enforces strict boundary checks at the engine level.
- **Symlink Policy**: By default, symbolic links are **not followed** to prevent infinite loops or unauthorized access to sensitive files outside the target directory. Use the `--follow-symlinks` flag in the CLI only when necessary.
- Path traversal attempts are rejected with 403 Forbidden or 400 Bad Request errors.

## Known Security Considerations

### File Content Security

> [!CAUTION]
> Concatenator processes file contents in the browser. Be aware:

- **No automatic scanning**: Files are not scanned for malware or malicious content
- **Binary files**: While primarily designed for text files, binary files can be processed
- **Large files**: The Max File Limit setting (default 10,000 files) helps prevent memory exhaustion

### Browser Compatibility

The File System Access API requires a modern Chromium-based browser:

- **Chrome/Edge**: Full support
- **Firefox**: Limited support (fallback to traditional file inputs)
- **Safari**: Limited support (fallback to traditional file inputs)

## Security Updates

Security updates will be released as patch versions (e.g., `1.0.1`). We recommend:

1. Watching this repository for releases
2. Keeping your local installation up to date
3. Reviewing the [CHANGELOG](./CHANGELOG.md) for security-related fixes

## Acknowledgments

We thank the security researchers and community members who have responsibly disclosed vulnerabilities. Your efforts help keep Concatenator safe for all users.

---

Last updated: 2026-05-10
