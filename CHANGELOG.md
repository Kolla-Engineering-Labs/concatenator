# Changelog

## [0.8.0] - 2026-05-18

### Minor Changes

- ### 📦 Changeset: Discovery-First Traversal & Observability Layer Parity (v0.8.0)

  This release implements a profound architectural overhaul of the Concatenator project, focused on **crawling correctness, UI/CLI path parity, and high-velocity UI performance**. By hardening the underlying ignore system, optimizing React main-thread yielding, and introducing smart Web Worker batching, Concatenator v0.8.0 effortlessly manages massive codebases (up to 10,000+ files) with a fluid, lag-free user experience.

  ***

  ### 🚀 Core Engine Upgrade (Ignore System 3.0)
  - **Discovery-First Traversal**: The core traversal algorithm has been re-architected. Negated files (prefixed with `!`, e.g. `!core`) are now guaranteed to be discovered and displayed in the tree, even if they reside deep within heavily ignored parent directories (e.g. `tests/`).
  - **Forced Recursion Logic**: The crawler now parses all loaded ignore patterns on the fly. When it encounters an ignored directory, it scans the active ignore list to see if any negated patterns target sub-directories or children of that branch. If a sub-pattern is detected, the engine forces recursion into that ignored folder instead of pruning the branch, enabling granular file inclusions.
  - **Heavy Directory Traversal Hardening**: To prevent catastrophic scan times and potential thread lockups in modern JS runtimes, unanchored negated patterns (e.g., `!core`) are explicitly bypassed inside heavy system folders. The bypassed system folders include:
    - `node_modules`, `.git`, `.next`, `.expo`, `.gradle`, `.terraform`, `.vagrant`, `bower_components`, `playwright-report`, `test-results`, `venv`, and `vendor`.
  - **Anchored Overrides**: If you need to target a file inside a heavy ignored folder, you must use an **anchored negated pattern** (e.g., `!node_modules/core`). This allows the recursive crawler to directly target the folder, bypassing a massive wildcard scan of the rest of the parent tree.
  - **Windows System-Name Isolation**: Automatically sanitizes and skips reserved Windows device filenames (`NUL`, `CON`, `PRN`, `AUX`, `COM1-9`, `LPT1-9`) during directory crawls, preventing low-level OS hangs and `InvalidStateError` failures.
  - **Path Traversal Security Boundary**: Added explicit input sanitation on the CLI. If a user supplies arguments containing path traversal segments (e.g. `../../`), the process rejects the request and throws a comprehensive `UserError` to secure local files.

  ***

  ### 🌐 Workbench Observability & Stability
  - **Negation Visibility**: Fully integrated negation states into the visual tree. Nodes that represent negated inclusion exceptions render with a green **"Negated"** badge.
  - **Inherited Glob Details**: Ignored files and folders render with a gray **"Ignored"** badge. Hovering over the badge displays a precise tooltip showing exactly which rule triggered the ignore state (e.g., `Ignored by: Matched glob tests/**`).
  - **State Stability Syncing (`syncIgnores`)**: Introduced an asynchronous, non-blocking sync runner in `App.tsx` that batches ignore state evaluation. If a user changes ignore configurations, the `isIgnored` property is synchronized across tens of thousands of loaded files dynamically without causing UI frames to drop.
  - **Refined Toggle Mechanics**: Rewrote toggles in `TreeNode` and `FileTable` to cleanly add, remove, and resolve path-matching variants (`path`, `path/`, `path/**`), ensuring that toggling ignore states inside the Tree and List views performs perfectly.

  ***

  ### ⚡ High-Velocity Ingestion Performance
  - **Aggressive Time-Based Yielding**: During drop ingestion and traversal, the crawler monitors execution time. Every 30ms, it yields execution back to the browser's main thread, maintaining fluid 30 FPS scrolling, mouse events, and live typing in the search/ignore fields.
  - **Throttled Progress UI Updates**: React progress bar updates are throttled to 100ms intervals, avoiding React re-rendering bottlenecks.
  - **Incremental Size-Sorted Ingestion**: Files are sorted by size (smallest first) during import. When ignore rules are edited mid-import, the largest files (processed last) instantly pick up the new rule, bypassing expensive reading entirely.
  - **Memory Safety Guardrails**: Hard limits are enforced during live scans (default: 10,000 files). Exceeding this limit immediately aborts the crawl early to prevent browser memory exhaustion.
  - **Aggressive File Size Safeguards**: The file reader skips files exceeding 30MB during upload, protecting the web context from V8 string memory crashes.
  - **Deduplicated Directory Appends**: Directory nodes are deduplicated against the active Virtual File System prior to insertion, ensuring that multiple drops don't append redundant parent tree nodes.

  ***

  ### 🧠 Precise Hybrid Tokenization & Web Worker Efficiency
  - **CPU Exhaustion Prevention**: Files larger than 500KB and common binary/archive extensions (`.zip`, `.tar`, `.exe`, `.so`, `.png`, `.jpg`, `.pdf`, etc.) completely bypass the CPU-heavy BPE `js-tiktoken` Web Worker.
  - **Fast Heuristic Mode**: These bypassed files fall back to an instantaneous, non-blocking heuristic (`Math.ceil(char count / 4)`). This provides highly accurate estimates for log dumps, database files, and media, without freezing the browser or Web Worker CPU.
  - **Atomic 500ms Response Batching**: Web Worker results are batched every 500ms before React state commits, preventing high-frequency tree-rebuilding cycles from locking the UI thread.
  - **Backtracking Protection**: The Web Worker tokenization divides large text inputs into 50KB chunks, preventing the Tiktoken RegExp engine from encountering catastrophic backtracking and lowering peak memory usage.
  - **O(1) Sampled Content Hashing**: The cache system uses a sampling approach for strings exceeding 3,000 characters (hashing only the first, middle, and last 1000 characters) to keep cache-key creation extremely fast ($O(1)$) and prevent main-thread freeze-ups.

  ***

  ### 🧪 Testing & Coverage Excellence
  - **Unit Test Coverage Booster**: Added 5 dedicated coverage-booster test files, elevating unit, utility, and component branch coverage beyond the strict **85% project target**:
    - `[IgnoreEngine.coverage.test.ts](file:///c:/Projects/Kolla-Engineering-Labs/concatenator/tests/IgnoreEngine.coverage.test.ts)` (fully covers ignore matching, regex compilation, and recursion overrides)
    - `[token.worker.test.ts](file:///c:/Projects/Kolla-Engineering-Labs/concatenator/tests/token.worker.test.ts)` (covers worker fallbacks, BPE o200k/cl100k failure conditions, and chunking boundaries)
    - `[useFileProcessing.coverage.test.ts](file:///c:/Projects/Kolla-Engineering-Labs/concatenator/tests/useFileProcessing.coverage.test.ts)` (tested drop edge cases, lazy reloads, and bounds)
    - `[useFileTree_ignored_dir.test.ts](file:///c:/Projects/Kolla-Engineering-Labs/concatenator/tests/useFileTree_ignored_dir.test.ts)` (audited ignored directory tree rendering)
    - `[useTokenAggregation.test.ts](file:///c:/Projects/Kolla-Engineering-Labs/concatenator/tests/useTokenAggregation.test.ts)` (tested hash mismatches, worker messages, and retries)
  - **E2E Observability Suite**: Playwright end-to-end tests (`e2e/observability.spec.ts`) audit negation rules, token recalculations, and UI visibility toggles across viewports.
  - **CLI Clean Reorganization**: Restructured all CLI-related tests by organizing them inside a clean `tests/cli/` folder, ensuring a professional testing workspace.

## [0.7.0] - 2026-05-13

### Minor Changes

- # Precise Token Counting & Efficiency Analytics

  ## Core Engine
  - **Tiktoken Integration**: Replaced character-based heuristics with precise **BPE (Byte-Pair Encoding)** tokenization using `js-tiktoken`.
  - **o200k_base Support**: Standardized on the `o200k_base` encoding (GPT-4o), ensuring compatibility with modern LLMs.
  - **Resilient Fallback**: Implemented a singleton-initialized encoder with automatic fallback to character estimation for robust operation in all environments.

  ## CLI Enhancements
  - **Precise Metrics**: Updated all CLI commands to report "Precise Tokens" instead of estimates.
  - **Efficiency Analytics**: Added "Tokens Saved" and optimization percentages to the concatenation summary, highlighting BPE boundary gains.
  - **Pre-flight Precision**: Updated `validate --tokens` to provide exact context weight analysis.

  ## Web UI Features
  - **Context Budget Transparency**: Introduced an **Efficiency Badge** ("Context Gained") in the workbench to provide real-time feedback on bundle optimization.
  - **Precise Labels**: Updated all UI token indicators to clearly signify precise, BPE-based counts.
  - **Performance Optimization**: Preserved UI responsiveness by utilizing background Web Workers for tokenization tasks.

  ## Quality & Branding
  - **Comprehensive Testing**: Added 20+ new unit and E2E tests to verify token accuracy and analytics consistency.
  - **Kolla Engineering Labs Protocol**: Refined macOS security reporting and branding across the CLI and documentation.

## [0.6.1] - 2026-05-11

### Minor Changes

- # Stabilization & Versioning Sync

  ## Core Fixes
  - **Build-Time Version Injection**: Implemented a robust version injection mechanism using `esbuild` and `Vite`'s `define` feature. This ensures that standalone binaries (SEA) correctly report their version without requiring an external `package.json` file.
  - **CLI/UI Synchronization**: Resolved an issue where the Web UI would report `v0.0.0` or an outdated version when served from the compiled binary.

  ## UI/UX Enhancements
  - **Sidebar Footer Overhaul**: Moved the footer into the scrollable sidebar area to prevent overlap with the status bar and ensure visibility across all viewport heights.
  - **Metadata Mini-Grid**: Redesigned footer information into a compact, 2-column grid of labeled tiles (Storage, License, Analytics, Source) for a premium, dashboard-like aesthetic.
  - **Content Optimization**: Removed redundant application titles and condensed tracking labels to improve readability in narrow sidebars.
  - **Global Version Indicator**: Introduced a permanent version badge in the `StatusBar` component for better traceability during bug reporting.
  - **UI De-cluttering**: Removed redundant version info from the Security Center module to maintain a cleaner interface.

  ## Documentation Updates
  - **v0.6.0 Roadmap alignment**: Updated `README.md` and `QUICKSTART.md` to reflect the latest distribution patterns and binary verification commands (`verify self`).
  - **Development Environment**: Updated `bug_report.md` template to encourage testing on Node.js v22.

  ## Quality Assurance
  - **New E2E Suite**: Added automated Playwright tests to validate version reporting consistency across the UI.

## [0.6.0] - 2026-05-06

### Minor Changes

- ### Added
  - **Heartbeat Indicator**: A live server-connection dot in the Status Bar that gives instant visibility into the CLI backend's health:
    - 🔘 **Gray / pulsing** — initial check in flight ("Checking…")
    - 🟢 **Green / pulsing** — CLI server is reachable ("Connected")
    - 🟡 **Amber / static** — server unreachable; label is context-aware:
      - **"No server"** — never established a connection (Vite dev mode or CLI not running)
      - **"Reconnecting…"** — connection was previously live and has since dropped
    - Always rendered (not hidden in dev mode) so it can be tested without a CLI binary.
    - `title` + `aria-label` tooltip reflects the current state for screen-reader accessibility.
  - **`useHeartbeat` tri-state**: `isConnected: boolean | null` + `wasEverConnected: boolean` — separates "first check pending" from "confirmed alive" from "lost connection" to drive all indicator states without ambiguity.
  - **Vite dev stub for `/api/security/info`**: a lightweight `configureServer` plugin intercepts the route before the proxy can attempt a connection to port 3000, eliminating the red network error logged in DevTools when running without a CLI backend.
  - **Root Pruning — Reconciliation on Drop** (`src/core/reconciler.ts`): When files or folders are added to the workbench, the ingestion pipeline now reconciles the new entries against the existing Virtual File System using two phases:
    - **Phase 1 — Suffix absorption**: detects when a previously-loaded sub-folder (e.g. `drivers/zip-driver.ts`) was dropped in isolation and the same files now appear under a wider parent drop (e.g. `src/drivers/zip-driver.ts`). Stale shallow entries are removed and replaced by the correct deep paths. Uses a pre-built suffix `Map` for O(1) lookups — O(n + m×depth) overall.
    - **Phase 2 — Parent absorption**: detects when a newly-dropped directory is an ancestor of already-loaded entries (e.g. `src` absorbing a previously-loaded `src/components`). Uses ancestor-walk + a `Set` for O(1) membership — no O(n²) loops.
    - Both phases produce an `Absorption[]` list consumed by the UI Toast below.
  - **Root Pruning — Minimum Common Root** (`src/web/features/concatenator/hooks/useFileTree.ts`): The Tree View already collapses single-child intermediate directories to ensure the displayed root always begins at the deepest common ancestor (no spurious top-level nodes).
  - **Absorption Toast** (`src/web/components/Toast.tsx`): A non-blocking `AbsorptionToast` notification appears top-right whenever Phase 1 or Phase 2 absorptions occur:
    - Groups absorbed children by parent for a single, readable message (e.g. _"Merged 'components, hooks' into 'src'"_).
    - Auto-dismisses after 5 seconds with a slide-in/out Tailwind transition.
    - `role="status"` + `aria-live="polite"` for screen-reader accessibility.
    - Driven by `pendingAbsorptions` state exposed from `useFileProcessing` and consumed in `App.tsx`.

  ### Fixed
  - **Status Bar hidden behind fixed sidebar**: added `lg:pl-[19rem]` (18 rem sidebar + 1 rem padding) to the Status Bar wrapper so all content clears the `position: fixed` sidebar on `lg` breakpoints.
  - **`ApiClient.getSecurityInfo` console 404**: the method now returns `null` silently on a `404` response instead of throwing, matching the pattern already established by `getPulse`.
  - **Tailwind class purging in StatusBar**: replaced dynamically-joined class strings (invisible to the JIT scanner) with fully-static conditional JSX branches so dot colour and animation classes are always included in the production CSS bundle.
  - **Directory entry self-absorption bug**: the Phase 2 parent-absorption loop now snapshots `originalExistingPaths` before iterating new files, preventing a directory entry from the _current_ drop (e.g. `drivers`) from wrongly absorbing its own sibling files (e.g. `drivers/zip-driver.ts`) that were added earlier in the same loop.
  - **O(n²) directory dedup in file-reading loop**: replaced `newFiles.some(f => f.path === dirPath)` with a `Set<string>` (`newDirPaths`) for O(1) deduplication — eliminates quadratic growth when reading 300+ files with deeply-nested paths.
  - **React 18 batching timing issue with absorptions**: `reconcileFiles` is now called with `filesRef.current` (a ref synced on every render) _before_ any `setState`, so `setPendingAbsorptions` can be called directly with the computed result. The previous approach stored absorptions inside a `setFiles` functional updater whose execution is deferred by React 18 automatic batching, causing the Toast to never fire.
  - **Windows-specific `InvalidStateError` in large drops**: implemented a multi-layered fix for "cached state changed" errors during bulk folder ingestion:
    - **Incremental Reading**: File content is now read immediately as files are discovered, preventing handles from going stale during long traversals.
    - **Concurrency Throttling**: Limited parallel directory discovery to 20 simultaneous operations to avoid overwhelming the OS/Browser file handle pool.
    - **Modern File APIs**: Switched from legacy `FileReader` to `File.text()` and `File.arrayBuffer()` for better performance and robustness on Windows.
    - **Reserved Name Safety**: Automatically skips reserved Windows system names (`NUL`, `CON`, `PRN`, etc.) which are known to trigger browser-level state errors when accessed via directory entries.
    - **Isolated Error Recovery**: Each file operation is isolated in its own try/catch, allowing the import to skip problematic files and continue rather than crashing.
  - **Toast Visibility and Re-mounting**: Added a `key` to `AbsorptionToast` based on absorption count and increased entrance delay to `100ms` to ensure the notification always triggers and animates correctly even during heavy React 18 batching.

  ### Tests
  - **`tests/StatusBar.test.tsx`** — 5 new unit tests covering all heartbeat indicator states (Checking, Connected, No server, Reconnecting) and tooltip values.
  - **`tests/ApiClient.test.ts`** — 3 new unit tests for `getSecurityInfo`: success, silent 404, non-404 error propagation.
  - **`e2e/heartbeat.spec.ts`** — new E2E spec covering indicator visibility, aria-label presence, the "Connected" state (live CLI), and the "No server" state (routes intercepted to 503).
  - **`tests/reconciler.test.ts`** — 9 new unit tests for `reconcileFiles` covering: parent absorption, suffix absorption (the isolated sub-folder scenario), false-positive guard (unrelated drops with shared file names), duplicate-path invariant, and empty-input edge cases.
  - **`tests/stability.test.ts`** — new unit tests for Windows-specific stability logic, verifying correct identification of reserved system names (`NUL`, `CON`, etc.).
  - **`tests/AbsorptionToast.test.tsx`** — new unit tests for the root-pruning feedback UI, covering auto-dismiss timing, path grouping logic, and manual dismissal.

## [0.5.0] - 2026-05-03

### Minor Changes

- # 📦 Changeset: Hybrid SEA Architecture & Security Hardening

  ## 🚀 Overview

  This release marks a significant architectural pivot for Concatenator, transitioning from a Node-dependent CLI tool to a **Hybrid Single Executable Application (SEA)**. This allows for zero-dependency distribution while simultaneously hardening the application's security perimeter through OS-level code signing, PGP-signed integrity manifests, and strict local-first network policies.
  - **Hybrid SEA Architecture**: Implemented a single standalone executable (SEA) that embeds the full Node.js runtime and Web Workbench assets. This enables zero-dependency distribution and improved performance in air-gapped environments.
  - **Code Signing Pipeline**: Integrated an automated signing and notarization pipeline for Windows (`signtool`) and macOS (`codesign`/`notarytool`), ensuring binary integrity and a seamless user experience on protected OS environments.
  - **Distribution Workflow**: Standardized the build process to output versioned, platform-specific artifacts in `dist/v{version}/{platform}/`.
  - **Adaptive Input Logic**: The Drop Zone now acts as a native file-picker trigger on touch devices for seamless mobile/cloud browsing.

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
