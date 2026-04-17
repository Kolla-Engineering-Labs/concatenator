# 🛡️ Security Policy

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

### 🔑 API Key Safety

Concatenator implements an **"in-memory only"** storage policy for all API keys:

- **No persistent storage**: API keys entered in the Settings modal are held only in memory for the current browser session
- **No browser storage**: Keys are never written to `localStorage`, `sessionStorage`, cookies, or IndexedDB
- **Session-scoped**: Keys must be re-entered after each page reload
- **No server transmission**: API keys are not transmitted to our servers (they are used directly from the browser for any LLM integrations)

> [!NOTE]
> This design prioritizes your security over convenience. While you must re-enter keys on each session, you can be confident they won't persist in browser storage or be accessible to other websites.

> [!TIP]
> **Key Management**: Use a `.env` file for local development to avoid re-entering keys while keeping them out of browser memory. [Get a Gemini API Key here](https://aistudio.google.com/app/apikey) 💡

### Recommendations

1. **Use environment variables** for local development when possible (defined in `.env` file). This avoids re-entering keys on every page reload while keeping them out of browser storage. See `.env.example` for the required format.
2. **Never commit API keys** to version control - the `.env` file is already in `.gitignore`
3. **Use API key rotation** regularly if your provider supports it
4. **Report any suspected key exposure** immediately to your API provider

### 📂 File System Security
- **No silent file access**: All file operations require explicit user interaction (drag-and-drop or file picker)
- **No persistent permissions**: The browser does not retain file system permissions between sessions
- **Path Traversal Protection**: All paths are sanitized and verified to stay within the user-granted scope

## Security-Related Configuration

### Rate Limiting

The production server implements rate limiting to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/ignore-list` | 100 requests | 15 minutes |
| Static files | 1000 requests | 1 minute |

These limits are disabled in development mode for testing purposes.

### Path Traversal Protection

All file path operations include strict validation to prevent path traversal attacks:

- Worker IDs are sanitized to allow only numeric characters
- File paths are resolved and verified to stay within allowed directories
- Path traversal attempts are rejected with 400 errors

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

Last updated: 2026-04-16
