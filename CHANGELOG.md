# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Professional CLI Architecture**: Replaced manual `process.argv` parsing with structured [Commander.js](https://github.com/tj/commander.js/) implementation
  - Three primary commands: `concat`, `extract`, `validate`
  - Consistent flag syntax: `-o, --output`, `-e, --exclude`, `-v, --verbose`, `-z, --zip`, `-d, --dry-run`
  - Global error handling with clean error messages
  - Version display from `package.json`
  - Shebang support for `#!/usr/bin/env npx tsx` execution
  - Development script: `npm run dev:cli`
- **ESM Module Resolution**: Updated all relative imports to use `.js` extensions for proper Node.js ESM compatibility

### Changed

- **CLI Command Structure**: Breaking change from flag-based interface (`--undo`, `--zip`, `--dry-run`) to explicit command structure:
  - `concatenator <directory> [output]` → `concatenator concat <path> -o <file>`
  - `concatenator --undo <file>` → `concatenator extract <file>`
  - `concatenator --undo --dry-run <file>` → `concatenator validate <file>` or `extract --dry-run`

## [0.1.1] - 2026-04-20

### Added

- **De-concatenation Error Handling**: Warning messages when files are skipped due to missing end markers (e.g., LLM hallucinations or deletions). Console logging for all skipped files with their paths.
- **Duplicate Path Handling**: De-concatenation now gracefully handles duplicate file paths by appending counter suffixes (e.g., `file(1).js`, `file(2).js`) to prevent ZIP library errors.
- **Documentation**: Added error handling documentation explaining parser behavior for corrupted/missing markers during de-concatenation.
- **API Transparency**: Documented File System Access API usage with explicit user permission control — directory access granted per-session through native browser picker dialogs.
- **Hidden File Documentation**: Clarified that hidden files (dotfiles) are included by default and explained how to exclude them via the ignore list.

### Changed

- **Default Ignore List**: Removed `LICENSE` from default ignore list to allow importing license files.

### Added

- Initial open-source documentation suite:
  - `CONTRIBUTING.md` — Development setup, testing guidelines, and PR process
  - `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
  - `SECURITY.md` — Vulnerability reporting and security best practices
  - `QUICKSTART.md` — 3-minute getting started guide
  - `PULL_REQUEST_TEMPLATE.md` — Structured PR template
  - `.github/ISSUE_TEMPLATE/bug_report.md` — Bug report template with browser/log level fields
  - `.github/ISSUE_TEMPLATE/feature_request.md` — Feature request template
  - `CHANGELOG.md` — This file

### Security

- Documented "in-memory only" API key storage policy
- Added path traversal protection details
- Specified GitHub Private Vulnerability Reporting workflow

## [0.1.0] - 2026-04-15

### Added

- Initial release of Concatenator
- **Full-Circle File Management**: Merge directory structures into LLM-ready **.txt** or **.pdf** files, with the ability to instantly reconstruct and download the entire file tree as a **ZIP archive** from a single **Concatenator .txt file**
- **Smart Ignore System**: Regex and string-based file exclusion with persistent sync
- **File System Access API** integration with drag-and-drop support
- **Dual Theme Support**: Light and dark modes
- **BYOK (Bring Your Own Key)**: In-memory API key management for Gemini, OpenAI, and Anthropic
- **Hardware Safety Guardrails**: Configurable Max File Limit (500–20,000 files)
- **Rate Limiting**: Production API protection
- **Path Traversal Protection**: Strict input validation for file operations

[unreleased]: https://github.com/Kolla-Engineering-Labs/concatenator/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Kolla-Engineering-Labs/concatenator/releases/tag/v0.1.0
