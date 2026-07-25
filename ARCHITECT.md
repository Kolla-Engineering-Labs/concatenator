# System Knowledge Document: Concatenator (v0.8.0)

## 1. Executive System Overview

**Concatenator** (developed by Kolla Engineering Labs, `kolla-engineering-labs.dev`) is an industrial-grade, local-first utility designed to optimize LLM (Large Language Model) context management. Engineered to solve the friction of feeding codebase segments to reasoning engines, Concatenator bridges the gap between local filesystems and LLM prompts via a bimodal interface consisting of a high-speed CLI and a high-density "workbench" Web UI.

Unlike stateless context dumping utilities, Concatenator operates as a **Stateful Workbench** centered around a Virtual File System (VFS) with the following core missions:

- **Bidirectional Context Pipelines**:
  - **Concatenate Mode**: Recursively crawls, tokenizes, and merges targeted files and folders into structured, standardized plain-text (`.txt`) or PDF (`.pdf`) context bundles.
  - **De-concatenate Mode**: Ingests context bundles and reverse-constructs/re-creates the local system structure, outputting a bit-perfect, reconstructed directory hierarchy encapsulated in a JSZip (`.zip`) archive.
- **Token Physics (Observability)**: Preserves strict token telemetry using a byte pair encoder (BPE) model (`cl100k_base`), calculating precise token weights, tracking "Context Saturation" metrics against user-defined budgets, and bubble-up aggregating directory-level weights.
- **Context Hygiene & Neutralization**: Sanitizes files prior to compilation. It strips binary elements, redacts sensitive entropy (e.g. AWS or OpenAI API keys), and neutralizes structural meta-characters (such as nested code-block backticks) to prevent LLM prompt-injection and structural formatting degradation.
- **Zero-Trust Local Execution**: Operates with absolute data sovereignty. Standard distribution wraps the entire application as a standalone Node 22 Single Executable Application (SEA) that functions 100% offline, binding HTTP utilities strictly to local routing interfaces (`127.0.0.1`) under token-protected authentication.

---

## 2. Final Tech Stack & Active Dependencies

The production design prioritizes dependency-minimalism, optimal performance, and cryptographic isolation:

### Core Runtime & Build Architecture

- **Language**: TypeScript (v5.8.2 Strict Mode).
- **Execution Environment**: Node.js v22 (LTS) / Node.js v24.
- **Distribution Platform**: Node 22 Single Executable Applications (SEA).
- **Bundler**: `esbuild` (v0.25.0), configured to pack dependencies into a standalone, single-file CommonJS (`dist/cli.bundle.js`) file prior to binary injection.
- **Binary Injector**: `postject` (for fusing raw compiled V8 JS blocks into native Node executables).

### Backend Engineering (Local Server Mode)

- **API Wrapper**: Express (`express` `^4.21.2`), decoupled from core domain logic and serving static assets inline from the SEA bundle.
- **Process Watchdog & Dev Runner**: `tsx` (`^4.21.0`) for execution, combined with `concurrently` to run hot-reloading development instances.
- **Encryption & Hash Utilities**: Node native `crypto` for high-performance SHA-256 calculation.
- **File System Access**: Native Node `fs` (using strictly non-blocking streams and system-agnostic path normalizers), coupled with `jszip` (`^3.10.1`) for in-memory reconstruction.

### Frontend Engineering (High-Density UI)

- **Framework**: React 19 (`react` `^19.0.1`, `react-dom` `^19.0.1`).
- **Toolchain & Server**: Vite 6+ (`vite` `^6.2.3`).
- **Styling Engine**: Tailwind CSS v4 (`@tailwindcss/vite` `^4.1.14`), using `@import "tailwindcss";` in `src/index.css`.
- **State & Caching Providers**: Context-based React state coupled with standardized JSON-serialized local state persistence (`localStorage` and `sessionStorage`).
- **Interface & Animation Controls**: `lucide-react` (`^0.546.0`) for high-fidelity technical symbols; `motion` (`^12.23.24`) for smooth modal and list transitions.
- **Glob Matching**: `picomatch` (`^4.0.2`), replacing the prior `micromatch` dependency for uniform ESM-native glob and path-matching. Powers the entire `IgnoreEngine` rule compiler.
- **Product Analytics**: `posthog-js`, configured to operate with maximum privacy parameters (`persistence: 'localStorage'`, `person_profiles: 'identified_only'`, and anonymized IP logging).

### Governance, Verification & Testing

- **Version Management**: Changesets (`.changesets`) for atomic release versioning.
- **Local Code Quality**: Prettier (statically aligned to LF newlines), Snyk (vulnerability tracking), and SonarCloud (static analysis).
- **Test Runners**: Vitest (`^4.1.4`) for core engine coverage; Playwright (`^1.59.1`) for visual E2E verification.
- **CI/CD Quality Gate**: `.github/workflows/ci.yml` executes build, type-checking, linting, formatting, and unit test coverage on PRs and pushes.
- **Dedicated E2E Pipeline**: `.github/workflows/e2e.yml` runs Playwright end-to-end browser tests on `ubuntu-latest` (Node.js 22 LTS) on PRs and pushes to `main`, archiving `playwright-report/` artifacts on every run.
- **SEA CI/CD Release Pipeline**: Multi-Job Matrix workflow (`.github/workflows/release-sea-binaries.yml`) triggering strictly on `v*` tags. Executes Job 1 (`build` matrix across `ubuntu-latest`, `macos-latest`, `windows-latest`) and Job 2 (`publish` dependent aggregation on `ubuntu-latest`) with `SHA256SUMS` manifest generation, GPG detached signing (`SHA256SUMS.asc`), and GitHub Release uploads via `gh release`.

---

## 3. Architecture & State Machine

The entire application adheres to a strict Core-First / Thin-Consumer software pattern:
┌────────────────────────────────────────────────────────┐
│ @concatenator/core │
│ (UnifiedCrawler, TokenService, SecretScanner, VFS) │
└───────────┬────────────────────────────────┬───────────┘
│ (Direct Import) │ (HTTP / Localhost API)
▼ ▼
┌────────────────────────┐ ┌────────────────────────┐
│ @concatenator/cli │ │ @concatenator/web │
│ (Commander.js) │ │ (React 19, Tailwind) │
└────────────────────────┘ └────────────────────────┘

### Data Compilation Pipeline (Concatenate Mode)

1. **Target Discovery**: `UnifiedCrawler` initiates a recursive directory crawl from `rootPath`.
2. **Security Pre-flight**: The path encounters `assertPathWithinRoot`. The real location of each file is resolved using `fs.realpathSync`. If a path breaks the boundaries of the `rootPath` (e.g., directory traversal or external symlinks), execution crashes instantly.
3. **Ignore Evaluation**: Discovered paths are funneled through `IgnoreEngine`. Files containing binary signatures or forbidden asset extensions (e.g. `.png`, `.jpg`, `.pdf`, `.zip`) are hard-ignored. Standard texts (including `.svg` files) are validated against `.gitignore` and `.concatenate-ignore` (prioritizing ordered, trailing negation `!pattern` checks).
4. **VFS Path Reconciliation**: Files are mapped to a flat key-value state (`Record<string, string>`). If overlapping folders are dropped at different depths (e.g. dropping `foo/` and then `foo/bar/` separately), the VFS automatically prunes the roots and merges children under a unified common ancestor to avoid redundant indexing.
5. **Dynamic Token Telemetry**: Upon file entry, `TokenService` applies a fast heuristic estimate (`Characters / 4`). The UI displays these estimates immediately, while offloading paths sequentially to a background `token.worker.ts` which runs a precise BPE calculation. This prevents main-thread blockages during massive crawls.
6. **Masking & Neutralization**: Prior to file-joining, raw content streams pass through `SecretScanner`. Private keys, tokens, and credentials matching high-entropy regex standards are masked. Code block formatting elements (such as triples of backticks) are neutralized.
7. **Bundle Generation**: Outputs the manifest-wrapped text. It places an unforgeable, cryptographically signed SHA-256 metadata manifest (`SHA256SUMS.asc`) at the bundle header and lists each file wrapped in standard delimiters (`--- FILE: path/to/file ---`).

### Reverse Reconstruction Pipeline (De-concatenate Mode)

1. **Signature Alignment**: The de-concatenation pipeline parses the metadata headers from the context bundle to locate the file manifest.
2. **Directory Taint Guard**: Before writing, a pre-flight validator asserts whether the target output folder is clean. If contents are detected and the `--force` (or UI `forceMode`) flag is disabled, it throws a `CRITICAL_WARNING` and halts execution to prevent file-system pollution.
3. **Bit-Perfect Extraction**: The VFS matches file hashes dynamically using Content Addressable Storage (CAS). Files whose hashes match the local directory structure are skipped, executing an idempotent extraction.
4. **Un-Neutralization**: Sanitized strings and escaped backticks are dynamically un-escaped back onto the local file system.

### CLI-to-UI Handshake State Machine

- **Spawning**: Working in UI mode, `concatenator --ui <path>` initializes the API server, binds it locally to `127.0.0.1`, and writes an active `.concatenator.lock` file containing the process ID (PID), chosen port, and an ephemeral auth token to the project root.
- **Token Guard**: The CLI spawns the browser and appends the token as a URL query parameter (`?token=xyz`). The React app parses the query into `sessionStorage` and injects it as an `X-Concatenator-Token` header for all future `/api/*` endpoints.
- **Heartbeat & Self-Reclamation**: A "Dead Man's Switch" uses `setInterval` to trigger `POST /api/heartbeat`. If the API fails to see a valid ping from the active tab for over 15 minutes, or if `isProcessing` is false, it executes `LifecycleManager.prepareShutdown()`, cleans the VFS, unlinks `.concatenator.lock`, and halts.

---

## 4. Core File Layout & Directory Structure

/
├── index.html # Mount target for the React application
├── package.json # Core dependencies, workspace configurations, and build matrixes
├── tsconfig.json # Root compilation rules and bundler declarations
├── vite.config.ts # Bundler rules and proxy configuration (Vite Port 5173 - Proxy to 3000)
├── .gitattributes # Forces LF line-endings project-wide, locks binary flags for exe/zip
├── .gitignore # Excludes lockfiles, compiled outputs, and transient IDE/GPG caches
├── .env.example # Production environment variable blueprint
├── server.ts # Express development backend and static index.html router
├── smoke-test.sh # Zero-cleanup automated bash smoke test pipeline
│
├── .changeset/ # Auto-generated changesets for atomic SemVer management
├── docs/
│ └── MACOS_SECURITY.md # Notarization-free Gatekeeper and xattr quarantine document
│
├── scripts/
│ ├── build-sea.js # Platform-agnostic CJS bundler and postject binary constructor
│ ├── sign-utils.ts # Signing utility backing signtool.exe and macOS codesign loops
│ └── notify.sh # Zero-dependency Markdown-capable curl script for Telegram build-status notices
│
└── src/
├── main.tsx # App entry; initializes PostHog globally outside of the React tree
├── App.tsx # Web container; coordinates ModeProvider and central views
├── vite-env.d.ts # Custom environment variable Type declarations
│
├── core/ # @concatenator/core domains
│ ├── UnifiedCrawler.ts # Boundary-checked, lstat-based recursive directory compiler
│ ├── TokenService.ts # Multi-tiered token algebra (Heuristic / Precise count aggregator)
│ ├── SecretScanner.ts # PII extraction blocks; encapsulates regex masking standards
│ ├── VFSManager.ts # Virtual directory state mapping and depth-absorbed file trees
│ ├── VFSHydrator.ts # Pure hydration layer — single source of truth for ignore resolution (returns Map<string, HydratedFile>)
│ ├── types.ts # Core type definitions including IgnoreSource enum (DEFAULT / FILE / SESSION)
│ ├── LifecycleManager.ts # Graceful server shutdowns, pid management, and lockfile sweeps
│ └── ignore/
│ └── IgnoreEngine.ts # picomatch-based pattern compiler; last-match-wins semantics; supports IgnoreSource tagging
│
├── cli/ # @concatenator/cli domains
│ └── index.ts # Commander.js command schema (concat, extract, validate, ui)
│
└── web/ # @concatenator/web browser assets
├── types/
│ └── workbench.ts # Global UI Types (AppMode, ViewPreference, WorkbenchState)
├── hooks/
│ ├── useLocalStorage.ts # Specialized hook for JSON-serialized browser state
│ ├── useTokenAggregation.ts # Memoized SWR state manager for precise token outputs
│ └── useFileProcessing.ts # Standard dropzone file trackers and Axios fetchers
├── context/
│ └── ModeContext.tsx # Dynamic UI context provider handling path and mode clears
└── components/
├── Sidebar.tsx # Flex-pinned, non-blocking sidebar managing compact ignore clouds
├── ModeSwitch.tsx # Segmented high-contrast UI mode toggler
├── StatusBar.tsx # "Gas Gauge" displaying total tokens, progress, and budgets
├── PreviewPane.tsx # Tree and List views equipped with contextual ignore icons
└── SecurityStatus.tsx # "Security Center" showing build hashes and signature state

---

## 5. Critical Technical Constraints & Edge Cases

During the development, hardening, and testing phases of the Concatenator project, several critical edge cases and security-to-filesystem issues were successfully resolved:

8. **VFS Hydration Pipeline (IgnoreSource Attribution & Manual Overrides)**:
   - _Problem_: UI components previously called `IgnoreEngine.isIgnored()` at render time, losing the metadata about _why_ a file was ignored (user session rule vs. default built-in) and _which source_ triggered the match. This made rendering `reason` and `ignoreSource` badges impossible without duplicate evaluation.
   - _Solution_: Introduced `VFSHydrator.ts` — a pure, side-effect-free batch resolution layer. `hydrateVFS(paths, engine)` iterates all paths once and returns a `Map<string, HydratedFile>` keyed by path. Each entry carries `{ isIgnored, isNegated, reason, ignoreSource }`. UI reconciliation now performs a single O(1) map lookup per file, eliminating redundant engine calls entirely. `IgnoreSource` values (`DEFAULT`, `FILE`, `SESSION`, and `manual override` for user-toggled files) drive the inline badge labels and tooltips rendered in `FileTable` and `TreeNode`.

9. **Context Menu & Rule Suspension Architecture (`suspendRule` / `unsuspendRule`)**:
   - _Problem_: Developers needed granular control to bypass specific built-in or glob ignore rules for individual files without editing global config files or typing complex negation syntax manually.
   - _Solution_: Implemented a contextual right-click menu in `FileTable.tsx` for ignored file rows. Right-clicking an ignored row opens two options:
     - **Include this specific file**: Automatically appends a path-level negation rule (`!path/to/file`) to `ignoreList`.
     - **Disable rule: [matchedRule]**: Invokes `suspendRule(rule)` in `ModeContext`, suspending the rule locally without altering underlying config files.
   - The **"Ignore Files" pill** interface (`IgnoreList.tsx`) renders active ignore rules alongside suspended rules, providing an inline `RotateCcw` control to unsuspend/restore default rules dynamically.

10. **picomatch Migration (micromatch → picomatch)**:
    - _Problem_: `micromatch` introduced a heavyweight transitive dependency tree and was not ESM-native, causing incompatibilities in strict ESM builds.
    - _Solution_: Replaced with `picomatch@^4.0.2`, a zero-dependency, ESM-first glob library. `IgnoreEngine` now uses `picomatch.makeRe()` to compile all glob patterns into native `RegExp` objects at construction time, eliminating runtime glob string parsing on every path evaluation.

11. **The CRLF Prettier/Git Conflict**:
    - _Problem_: Development on Windows generated files with Carriage Return Line Feeds (`CRLF`), triggering formatting anomalies (`prettier --check .`) on standard Unix/Linux and macOS CI/CD environments.
    - _Solution_: Standardized EOL metrics globally by configuring a strict `.gitattributes` file that maps `* text=auto eol=lf` and forcing `.prettierrc` to check `"endOfLine": "lf"`. Legacy index records were purged via an intensive git normalization loop (`git add --renormalize .`).

12. **The "Franken-Project" Path Overlap**:
    - _Problem_: If a child directory (e.g. `bar/`) was dropped, and its parent folder (e.g., `foo/`) was dropped afterward, duplicate file trees appeared at overlapping depths, disrupting the VFS tree and doubling token costs.
    - _Solution_: Created a flat-map virtual filesystem index (`Record<string, string>`) that resolves absolute paths. It automatically executes **Root Pruning**, absorbing child nodes into parent paths and recalculating directory states.

13. **The "Useless Regular-Expression Escape" Bug**:
    - _Problem_: Input parsing configuration arrays using standard string literals (e.g., `'/^\..*_cache$/'`) had their backslashes consumed during compilation, translating to `/^..*_cache$/` which matched arbitrary strings.
    - _Solution_: Fixed by replacing literal configuration patterns with doubly escaped strings `'/^\\..*_cache$/'` or using true, native JS regular expression literals.

14. **VFS Crawler Traversal Breakout Vulnerability**:
    - _Problem_: Early VFS crawlers used standard `fs.statSync()`, resolving symbolic links (symlinks) automatically. This made local web hosts vulnerable to directory-climb attacks (`../../etc/passwd`).
    - _Solution_: Re-engineered VFS traversal around `fs.lstatSync()` so symlinks are ignored by default. It restricts deep link traversal using a realpath check (`assertPathWithinRoot`).

15. **React 19 Double-Initialization Analytics Bug**:
    - _Problem_: React 19's `<StrictMode>` caused components to double-render in development contexts. This resulted in dual-initialization of the analytics client, generating double-pings and duplicate analytics IDs.
    - _Solution_: Moved the `posthog.init()` constructor entirely **outside** the React tree in `main.tsx`, executing the initialization precisely once directly on the global scope before target mounting.

16. **Vite TypeScript Environment Squiggle**:
    - _Problem_: TS compiler threw semantic errors when mapping environment variables (`import.meta.env`), as standard TS was blind to Vite-injected context and configuration macros.
    - _Solution_: Solved by updating the compilation parameters inside `tsconfig.json` to explicitly check `"types": ["vite/client"]`, paired with a dedicated ambient typings shim file `src/vite-env.d.ts`.

17. **Synchronous I/O Event Loop Blockage (The Liveliness Paradox)**:
    - _Problem_: Performing heavy file serialization or deep JSZip processes blocked the local Node event loop. This caused standard `/api/heartbeat` requests to fail, firing false-positive "Server Disconnected" UI overlays.
    - _Solution_: Implemented a decoupled, progress-based **Engine Pulse**. The core writes operational metadata to a local `.concatenator/pulse.json` file. The server provides a lightweight, non-blocking `/api/pulse` stream route that runs on a native browser fallback loop to detect actual thread liveness.

---

## 6. Future Roadmap & Pending Features

The upcoming development cycle focuses on scaling the utility, optimizing performance, and preparing for team-focused corporate compliance:

- **E2E Observability Coverage (In Progress — v0.8.x)**:
  - The `e2e/observability.spec.ts` Playwright suite now validates the Gas Gauge red overage state (token budget exceeded), the `reason` + `ignoreSource` badge rendering for default-ignored directories like `node_modules`, and the negation-discovery pipeline. All tests use the native DOM input upload path to remain WebKit-compatible.

- **Automatic Dependency Pruning / Smart Filters**:
  - Implement active pre-filtering within `IgnoreEngine` to detect and automatically skip high-token, zero-signal system lockfiles or compiled bundles (e.g. `package-lock.json`, `pnpm-lock.yaml`, `*.js.map`).
- **Sovereign Key Discovery Protocol**:
  - Refactor the `concatenator verify` CLI command to automatically fetch the primary architect’s public GPG signing key by checking a standardized, localized path (`GET kolla-engineering-labs.dev/.well-known/gpg-key.asc`) if it's missing from the system's local keychain.
- **Automatic Job Recovery System**:
  - Build a VFS bootstrap system that recognizes incomplete or interrupted operations, parsing the local `.concatenator/pulse.json` file on startup to resume massive file collections or extractions exactly where they were aborted.
- **GPG-Signed Delta-Patching (v1.2.0)**:
  - Abstract the Node 22 Single Executable Application binary wrapper to run as an immutable "Host Shell" that can fetch and hot-swap only the lightweight, verified JavaScript resource blob (`@concatenator/core`). This avoids downloading the heavy 80MB+ Node.js runtime executable during minor updates.
- **Homebrew Tap and Security-Hardened Distribution Channels**:
  - Create official Homebrew Taps (macOS) and Chocolatey packages (Windows) to allow robust, terminal-bound client extraction installations (`brew install`) that bypass standard browser sandboxes and proxy blocks.
- **Contextual Safety HUD & Secretlint Integration**:
  - Embed code-level vulnerability checks directly inside `SecretScanner` using established static security profiles (e.g. Snyk or gitleaks pattern sets).
  - Build a visual **Safety HUD** in the Web UI, highlighting flagged files in the tree alongside clear options to verify, skip, or force-include them before bundling.
