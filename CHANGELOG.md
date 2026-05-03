# Changelog

## [0.5.0] - 2026-05-03

### Minor Changes

- # 📦 Changeset: Hybrid SEA Architecture & Security Hardening

  ## 🚀 Overview

  This release marks a significant architectural pivot for Concatenator, transitioning from a Node-dependent CLI tool to a **Hybrid Single Executable Application (SEA)**. This allows for zero-dependency distribution while simultaneously hardening the application's security perimeter through OS-level code signing, PGP-signed integrity manifests, and strict local-first network policies.
  - **Hybrid SEA Architecture**: Implemented a single standalone executable (SEA) that embeds the full Node.js runtime and Web Workbench assets. This enables zero-dependency distribution and improved performance in air-gapped environments.
  - **Code Signing Pipeline**: Integrated an automated signing and notarization pipeline for Windows (`signtool`) and macOS (`codesign`/`notarytool`), ensuring binary integrity and a seamless user experience on protected OS environments.
  - **Distribution Workflow**: Standardized the build process to output versioned, platform-specific artifacts in `dist/v{version}/{platform}/`.

  ***

  ## 🏗️ Core Architectural Shifts

  ### 1. Hybrid SEA Infrastructure
  - **Standalone Binaries**: Implemented a robust build pipeline (`scripts/build-sea.js`) that utilizes Node.js 22's SEA features to embed the entire Web Workbench and Node runtime into a single executable.
  - **Cross-Platform Support**: Automated generation of versioned artifacts for **Windows (`.exe`)**, **macOS**, and **Linux**, located in `dist/v{version}/{platform}/`.
  - **Resource Embedding**: Optimized asset injection to ensure the Web Workbench remains high-performance even when served from within the binary.

  ### 2. Lifecycle & Process Management
  - **LifecycleManager**: Introduced a centralized singleton to manage graceful shutdowns, signal handling (`SIGINT`, `SIGTERM`), and cleanup of temporary assets.
  - **Pulse System**: Implemented `PulseEmitter.ts` to provide real-time, low-overhead progress telemetry from deep within the traversal engine to both the CLI and the UI.

  ***

  ## 🛡️ Security Hardening & Binary Integrity

  ### 1. Code Signing Pipeline
  - **Windows (SignTool)**: Integrated automated signing with `.pfx` certificates, including timestamping to ensure long-term validity.
  - **macOS (Notarization)**: Full support for Apple's Hardened Runtime and Notarization service via `notarytool`, ensuring a "Gatekeeper-approved" experience.
  - **Ad-Hoc Fallback**: For community builds, we've implemented an ad-hoc signing mechanism to maintain functionality while providing transparent security warnings.

  ### 2. GPG-Signed Manifests (Independent Audit)
  - **Primary Proof of Integrity**: Added a `SHA256SUMS.asc` PGP Clearsigned manifest for every release.
  - **Verification CLI**: Users can now run `concatenator verify self` to cryptographically audit the running binary against the official architect fingerprint.
  - **Release Audit Script**: A new `npm run test:release` command performs a pre-flight dry-run of the entire release package, verifying signatures and hashes before they reach the user.
  - **Path Hardening**: Standardized forward-slash separators in manifest generation output to ensure GPG signing instructions are robust across Windows (PowerShell/Bash) and Unix environments.

  ### 3. Network & API Security
  - **Strict Localhost Binding**: The API server now binds exclusively to `127.0.0.1`, neutralizing LAN-based probing.
  - **Zero-Trust Token Guard**: Standardized the `X-Concatenator-Token` requirement across all sensitive VFS and filesystem operations.
  - **macOS Security Brief**: When the CLI detects it is running in a quarantined state (e.g., after download), it now displays a comprehensive "Security Brief" explaining Gatekeeper status and providing manual verification instructions.

  ***

  ## 💻 CLI Enhancements
  - **`start [path]`**: A new recommended entry point that performs automated security checks before launching the UI.
  - **`verify [target]`**: New command for manual or automated binary integrity verification.
  - **`--pulse`**: A new flag to mirror internal processing telemetry to `stderr`, enabling real-time monitoring in headless CI environments.
  - **`--quiet`**: Suppresses all non-essential logging for cleaner automation.
  - **`--force`**: Expanded to allow overwriting of both files and directories.

  ***

  ## 🌐 Web Workbench (UI) Improvements
  - **Security Status**: A new dashboard component showing build hashes, signing status, and the architect's GPG fingerprint.
  - **Heavy Processing HUD**: An interactive pulse monitor that appears during intensive operations, providing visual feedback on system load and progress.
  - **Session Management**: Added a `SessionExpiredModal` to handle server restarts or token expiration gracefully, preventing data loss during configuration changes.
  - **Ignore Engine UI**: Refined the ignore list management to handle massive exclude patterns without UI lag.

  ***

  ## 🧪 Testing & Quality Assurance
  - **Coverage Hardening**: Achieved **>85% branch coverage** across core modules:
    - `src/core/Crawler.ts`: Hardened path traversal and symlink logic.
    - `src/core/UIServer.ts`: Validated Token Guard and CORS policies.
    - `src/cli/cli-utils.ts`: Comprehensive mocks for filesystem interactions.
  - **E2E CLI Security**: New Playwright tests (`e2e/cli-security.spec.ts`) specifically audit the macOS quarantine detection and security brief messaging.
  - **Cross-Browser Stability**: Increased timeouts and added stability buffers for Firefox and WebKit (Safari) in the E2E suite.

  ***

  ## 📝 Documentation Overhaul
  - **`docs/MACOS_SECURITY.md`**: New detailed rationale explaining our stance on ad-hoc signing vs. centralized notarization.
  - **`SECURITY.md`**: Updated with instructions for GPG verification and the Architect Public Key.
  - **`QUICKSTART.md`**: Refined to prioritize the Standalone Binary (Option C) for new users.
  - **`CONTRIBUTING.md`**: Updated with the new Node.js 22 requirements and signing environment variable specifications.

  ***

  ## ⚙️ Dependencies & Requirements
  - **Node.js**: Minimum version bumped to **v22.0.0** (Required for SEA features).
  - **Esbuild**: Optimized bundling for SEA injection.
  - **Lucide React**: Expanded icon set for security and status indicators.

  ***

  _Build Integrity Verified by Kolla Engineering Labs Audit System._ 🛡️

## [0.4.0] - 2026-04-30

### Minor Changes

- Hardened the local security posture of the Concatenator project by implementing a multi-layered defense system. Key improvements include:
  - **Network Security**: Restricted the API server to strictly bind to `127.0.0.1`, effectively neutralizing LAN-based probing and ensuring the server is only accessible from the host machine.
  - **Authentication Guard**: Introduced a mandatory `X-Concatenator-Token` header for all sensitive VFS and filesystem operations. This prevents malicious websites or unauthorized local processes from triggering unintended file reads or directory traversals.
  - **Unified Crawler Architecture**: Standardized all directory traversal and file discovery logic into a new `UnifiedCrawler` class. This engine enforces `fs.realpathSync` for strict boundary verification to block path-traversal attacks and implements a safe-by-default symlink policy (ignoring links unless `--follow-symlinks` is specified).
  - **CLI Expansion**: Added the `ui [path]` command to allow users to launch the web-based Workbench for any local directory with custom configuration (max files, ignore rules).
  - **Documentation Synchronization**: Performed a complete audit and update of `README.md`, `SECURITY.md`, `QUICKSTART.md`, and `CONTRIBUTING.md` to document the new security requirements, environment variables, and CLI flags.
  - **Test Infrastructure Hardening**: Refactored the integration test suite to utilize dynamic port assignment (`PORT: 0`), preventing port collisions in CI environments and improving server-readiness detection through log-based port extraction.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-04-24

### Minor Changes

- # Workbench Context & Hierarchical Token Aggregator

  This release introduces the **Advanced Workbench**, a high-density file management experience designed for large-scale codebase concatenation and analysis.

  ### Core Features
  - **Hierarchical Token Aggregator**: Implemented a sophisticated file system reconciliation engine that prunes redundant root directories while preserving child-folder structures, providing a lean, non-redundant file hierarchy.
  - **Workbench UI**: Transitioned to a centralized `ModeContext` architecture, enabling seamless state synchronization between Tree and List views.
  - **QuickLook Asset Preview**: Integrated high-fidelity asset visualization for images, PDFs, and SVGs directly within the workbench.
  - **Ignore Engine 2.0**: Standardized ignore-pattern matching across CLI and Web interfaces, featuring full support for `.concatenate-ignore` files and optimized regex performance.
  - **Token Estimation**: Real-time token count calculation and aggregation for files and bundles, providing immediate feedback on LLM context budget.

  ### CLI Enhancements
  - **Input Pruning**: Added proactive path reconciliation to the CLI, filtering out redundant sub-paths and ensuring efficient processing.
  - **Safety Mechanisms**: Hardened de-concatenation workflows with robust overwrite protection and directory auto-discovery.

  ### Stability & Infrastructure
  - **Test Hardening**: Re-architected the E2E test suite with viewport-aware sidebar helpers and refined timing strategies, significantly reducing flakiness in CI environments.
  - **Coverage Excellence**: Achieved **96.1% code coverage** in the core module through rigorous unit and integration testing.
  - **Environment Synchronization**: Resolved persistent state hydration issues and race conditions in local storage management.

## [0.2.0] - 2026-04-21

### Minor Changes

- v0.2.0: Professional CLI Launch

  This release introduces a powerful command-line interface for headless workflows and CI/CD integration.

  ### New Features

  **CLI Commands**
  - `concatenator concat <path>` - Bundle directories into LLM-ready files with `-o`, `-e`, and `-v` options
  - `concatenator extract <file>` - Restore projects via file explosion or ZIP output with `--zip`, `--dry-run`, and `--force` flags
  - `concatenator validate <file>` - Verify concatenated file integrity with segmented marker analysis

  **Validation & Safety**
  - Segmented validation with foreign marker detection for handling multi-session files
  - Dynamic session boundary system preventing self-hosting conflicts
  - Unified dry-run mode for safe extraction previews
  - `--force` flag for controlled overwrites

  **Developer Experience**
  - Professional error messages with actionable guidance
  - Multi-level verbosity (`-v`, `-vv`) for debugging
  - Exit codes for shell scripting integration

  Install globally: `npm link` or run via `npm run dev:cli -- [command]`

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Hardware Safety Guardrails**: Configurable Max File Limit (500–20,000 files)
- **Rate Limiting**: Production API protection
- **Path Traversal Protection**: Strict input validation for file operations

[unreleased]: https://github.com/Kolla-Engineering-Labs/concatenator/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Kolla-Engineering-Labs/concatenator/releases/tag/v0.2.0
[0.1.1]: https://github.com/Kolla-Engineering-Labs/concatenator/releases/tag/v0.1.1
[0.1.0]: https://github.com/Kolla-Engineering-Labs/concatenator/releases/tag/v0.1.0
