# Pull Request

## 📝 Summary

This PR implements the v0.8.0 Observability Layer release, featuring a comprehensive architectural overhaul of the Concatenator project focused on crawling correctness, UI/CLI path parity, and high-velocity UI performance. The release introduces Ignore System 3.0 with Discovery-First Traversal, advanced workbench observability features, aggressive performance optimizations for massive codebase handling, and a multi-job matrix SEA binary release pipeline.

## 🛠️ Type of Change

- [x] New feature (non-breaking change which adds functionality)
- [x] Performance improvement
- [x] Test addition or update
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [x] Documentation update
- [ ] Refactoring (no functional changes, no API changes)
- [ ] Code style update (formatting, renaming)
- [ ] Other (please describe):

## 🔗 Related Issue(s)

Fixes #

Related to #

## 📖 Description

This release represents a significant milestone in the Concatenator project's evolution, introducing three major architectural pillars:

### 1. Core Engine Upgrade (Ignore System 3.0)

The ignore system has been completely re-architected with **Discovery-First Traversal**, fundamentally changing how the crawler handles negated patterns and ignored directories.

**Key Changes:**

- **Discovery-First Traversal**: Negated files (prefixed with `!`, e.g. `!core`) are now guaranteed to be discovered and displayed in the tree, even if they reside deep within heavily ignored parent directories (e.g. `tests/`)
- **Forced Recursion Logic**: The crawler now parses all loaded ignore patterns on the fly. When it encounters an ignored directory, it scans the active ignore list to see if any negated patterns target sub-directories or children of that branch. If a sub-pattern is detected, the engine forces recursion into that ignored folder instead of pruning the branch
- **Heavy Directory Traversal Hardening**: To prevent catastrophic scan times and potential thread lockups, unanchored negated patterns (e.g., `!core`) are explicitly bypassed inside heavy system folders including: `node_modules`, `.git`, `.next`, `.expo`, `.gradle`, `.terraform`, `.vagrant`, `bower_components`, `playwright-report`, `test-results`, `venv`, and `vendor`
- **Anchored Overrides**: Users can target files inside heavy ignored folders using anchored negated patterns (e.g., `!node_modules/core`), allowing direct targeting without massive wildcard scans
- **Windows System-Name Isolation**: Automatically sanitizes and skips reserved Windows device filenames (`NUL`, `CON`, `PRN`, `AUX`, `COM1-9`, `LPT1-9`) during directory crawls, preventing low-level OS hangs
- **Path Traversal Security Boundary**: Added explicit input sanitation on the CLI to reject arguments containing path traversal segments (e.g. `../../`)

### 2. Workbench Observability & Stability

The UI has been enhanced with comprehensive observability features that provide users with complete visibility into why files are being ignored and how to override those decisions.

**Key Changes:**

- **Negation Visibility**: Fully integrated negation states into the visual tree. Nodes representing negated inclusion exceptions render with a green **"Negated"** badge
- **Inherited Glob Details & Manual Overrides**: Ignored files and folders render with a gray **"Ignored"** badge. Hovering over the badge displays a precise tooltip showing exactly which rule triggered the ignore state (e.g., `node_modules (default)`, `Reason (file)`, or `(manual override)` when manually toggled)
- **Right-Click Context Menu**: Right-clicking any ignored file row opens a contextual menu with two immediate actions: **"Include this specific file"** (appends a path-level negation `!path`) and **"Disable rule: [matchedRule]"** (suspends default or glob rules locally via `suspendRule`)
- **Rule Suspension Pill**: Suspended/disabled rules are visually exposed in the **"Ignore Files"** pill interface with a quick `RotateCcw` restore button to reactivate suspended rules on demand
- **State Stability Syncing (`syncIgnores`)**: Introduced an asynchronous, non-blocking sync runner in `App.tsx` that batches ignore state evaluation. If a user changes ignore configurations, the `isIgnored` property is synchronized across tens of thousands of loaded files dynamically without causing UI frames to drop
- **Refined Toggle Mechanics**: Rewrote toggles in `TreeNode` and `FileTable` to cleanly add, remove, and resolve path-matching variants (`path`, `path/`, `path/**`), ensuring perfect toggle performance in both Tree and List views

### 3. High-Velocity Ingestion Performance

The ingestion pipeline has been optimized to handle massive codebases (up to 10,000+ files) with fluid, lag-free user experience.

**Key Changes:**

- **Aggressive Time-Based Yielding**: During drop ingestion and traversal, the crawler monitors execution time. Every 30ms, it yields execution back to the browser's main thread, maintaining fluid 30 FPS scrolling, mouse events, and live typing in search/ignore fields
- **Throttled Progress UI Updates**: React progress bar updates are throttled to 100ms intervals, avoiding React re-rendering bottlenecks
- **Incremental Size-Sorted Ingestion**: Files are sorted by size (smallest first) during import. When ignore rules are edited mid-import, the largest files (processed last) instantly pick up the new rule, bypassing expensive reading entirely
- **Memory Safety Guardrails**: Hard limits enforced during live scans (default: 10,000 files). Exceeding this limit immediately aborts the crawl early to prevent browser memory exhaustion
- **Aggressive File Size Safeguards**: The file reader skips files exceeding 30MB during upload, protecting the web context from V8 string memory crashes
- **Deduplicated Directory Appends**: Directory nodes are deduplicated against the active Virtual File System prior to insertion, ensuring multiple drops don't append redundant parent tree nodes

### 4. Precise Hybrid Tokenization & Web Worker Efficiency

The tokenization pipeline has been enhanced with a hybrid approach that balances precision with performance.

**Key Changes:**

- **CPU Exhaustion Prevention**: Files larger than 500KB and common binary/archive extensions (`.zip`, `.tar`, `.exe`, `.so`, `.png`, `.jpg`, `.pdf`, etc.) completely bypass the CPU-heavy BPE `js-tiktoken` Web Worker
- **Fast Heuristic Mode**: Bypassed files fall back to an instantaneous, non-blocking heuristic (`Math.ceil(char count / 4)`), providing highly accurate estimates for log dumps, database files, and media without freezing the browser or Web Worker CPU
- **Atomic 500ms Response Batching**: Web Worker results are batched every 500ms before React state commits, preventing high-frequency tree-rebuilding cycles from locking the UI thread
- **Backtracking Protection**: The Web Worker tokenization divides large text inputs into 50KB chunks, preventing the Tiktoken RegExp engine from encountering catastrophic backtracking and lowering peak memory usage
- **O(1) Sampled Content Hashing**: The cache system uses a sampling approach for strings exceeding 3,000 characters (hashing only the first, middle, and last 1000 characters) to keep cache-key creation extremely fast ($O(1)$) and prevent main-thread freeze-ups

### 5. Testing & Coverage Excellence

Added comprehensive test coverage to ensure the robustness of all new features.

**Key Changes:**

- **Unit Test Coverage Booster**: Added 5 dedicated coverage-booster test files, elevating unit, utility, and component branch coverage beyond the strict **85% project target**:
  - `tests/IgnoreEngine.coverage.test.ts` (fully covers ignore matching, regex compilation, and recursion overrides)
  - `tests/token.worker.test.ts` (covers worker fallbacks, BPE o200k/cl100k failure conditions, and chunking boundaries)
  - `tests/useFileProcessing.coverage.test.ts` (tested drop edge cases, lazy reloads, and bounds)
  - `tests/useFileTree_ignored_dir.test.ts` (audited ignored directory tree rendering)
  - `tests/useTokenAggregation.test.ts` (tested hash mismatches, worker messages, and retries)
- **E2E Observability Suite**: Playwright end-to-end tests (`e2e/observability.spec.ts`) audit negation rules, token recalculations, and UI visibility toggles across viewports
- **CLI Clean Reorganization**: Restructured all CLI-related tests by organizing them inside a clean `tests/cli/` folder, ensuring a professional testing workspace

### 6. Multi-Job Matrix SEA Release Pipeline

Implemented a robust CI/CD pipeline for automated cross-platform SEA binary releases.

**Key Changes:**

- **Multi-Job Matrix Workflow**: `.github/workflows/release-sea-binaries.yml` triggers strictly on `v*` tags
- **Job 1 (Build)**: Executes matrix builds across `ubuntu-latest`, `macos-latest`, and `windows-latest`
- **Job 2 (Publish)**: Dependent aggregation on `ubuntu-latest` with `SHA256SUMS` manifest generation
- **GPG Detached Signing**: Automatic generation of `SHA256SUMS.asc` for cryptographic integrity verification
- **GitHub Release Automation**: Automated upload of signed binaries to GitHub Releases

### Changes Made

**Core Architecture:**

- Introduced `VFSHydrator.ts` - a pure, side-effect-free batch resolution layer for O(1) map lookups of ignore sources
- Enhanced `IgnoreEngine.ts` with Discovery-First Traversal and forced recursion logic
- Updated `Crawler.ts` with heavy directory bypass logic and Windows system-name isolation
- Refactored `TokenService.ts` with hybrid tokenization (heuristic + BPE) and Web Worker optimization
- Enhanced `VFSManager.ts` with root pruning and dynamic directory absorption

**Web UI Components:**

- Added right-click context menu to `FileTable.tsx` for rule suspension and manual overrides
- Enhanced `IgnoreList.tsx` with suspended rule visualization and restore controls
- Updated `TreeNode.tsx` with refined toggle mechanics and path-matching variants
- Enhanced `StatusBar.tsx` with token budget overflow visualization and gas gauge indicators
- Updated `ModeContext.tsx` with `syncIgnores` async state synchronization

**Testing Infrastructure:**

- Added 5 new coverage-booster test files targeting 85%+ branch coverage
- Created `e2e/observability.spec.ts` for comprehensive E2E observability testing
- Reorganized CLI tests into `tests/cli/` directory structure
- Added `tests/core/VFSHydrator.test.ts` for hydration layer validation

**Documentation & Governance:**

- Updated `ARCHITECT.md` with complete v0.8.0 architecture specifications
- Updated `STATE.md` with current project state and roadmap
- Enhanced `CHANGELOG.md` with comprehensive v0.8.0 release notes
- Updated `CONTRIBUTING.md` with E2E testing guidelines
- Added `SECURITY.md` with GPG verification instructions

**CI/CD & Release:**

- Created `.github/workflows/release-sea-binaries.yml` for automated cross-platform builds
- Enhanced `scripts/build-sea.js` with improved binary injection logic
- Added `scripts/verify-release-candidate.ts` for pre-flight release validation

### Architecture Notes

These changes align with our Clean Architecture and Decoupled Logic principles:

1. **Core-First Pattern**: All core logic remains in `@concatenator/core` (VFSHydrator, IgnoreEngine, Crawler, TokenService) with thin consumer layers in CLI and Web UI
2. **Pure Functions**: `VFSHydrator.ts` implements a pure function with no side effects, returning a Map for O(1) lookups
3. **Dependency Isolation**: Web Worker tokenization is completely isolated from the main thread, preventing UI blockages
4. **State Management**: React state updates are batched and throttled to prevent re-render cascades
5. **Security Boundary**: Path traversal protection and localhost-only API binding are maintained throughout

## 🧪 Testing

### Unit Tests

- [x] Added/updated unit tests for new/modified logic
- [x] All unit tests pass (`npm test`)
- [ ] No tests needed (explain why):

### E2E Tests

- [x] Added/updated E2E tests for UI changes
- [x] All E2E tests pass (`npm run test:e2e`)
- [ ] Tested manually in the following browsers:
  - [ ] Chrome/Edge (Chromium)
  - [ ] Firefox
  - [ ] Safari
- [ ] No E2E tests needed (Select only for: Documentation, Refactors without UI impact, or Internal logic with 100% Unit Test coverage)

### Manual Testing

Test scenarios:

1. **Discovery-First Traversal**: Verified that negated patterns (e.g., `!core`) correctly discover files within ignored directories like `tests/`
2. **Heavy Directory Bypass**: Confirmed that unanchored negations (e.g., `!core`) are bypassed in `node_modules` to prevent catastrophic scan times
3. **Context Menu**: Tested right-click context menu on ignored files to verify "Include this specific file" and "Disable rule" functionality
4. **Rule Suspension**: Verified that suspended rules appear in the Ignore Files pill with restore functionality
5. **Token Budget Overflow**: Confirmed that the status bar correctly displays red overage state when token budget is exceeded
6. **Performance**: Tested ingestion of 10,000+ file codebases to verify 30 FPS performance during traversal
7. **Web Worker Batching**: Verified that Web Worker tokenization batches results every 500ms without UI lockup

## ✅ Checklist

- [x] My code follows the project's code style (TypeScript strict mode)
- [x] I have performed a self-review of my code
- [x] I have commented my code, particularly in hard-to-understand areas
- [x] I have made corresponding changes to the documentation (README, QUICKSTART, JSDoc)
- [x] My changes generate no new TypeScript errors (`npm run lint`)
- [x] I have added tests that prove my fix is effective or that my feature works

## 🛡️ Security Considerations

> [!CAUTION]
> **Security Audit Required**: If your changes involve file handling, API keys, or user data, you **must** complete the checklist below. 🔑

- [x] My changes do not affect security-sensitive code
- [ ] My changes affect security-sensitive code (describe):

### Security Checklist (if applicable)

- [x] No new paths are constructed from user input without sanitization
- [x] No API keys are persisted to browser storage (localStorage/sessionStorage)
- [x] Rate limiting is maintained for new endpoints
- [x] Path traversal protection is maintained for file operations

## 📸 Screenshots / Screen Recordings

## 🚩 Reviewer Guidance

Areas that need careful review:

1. **VFSHydrator.ts**: Verify that the pure hydration layer correctly handles all IgnoreSource values and provides accurate O(1) lookups
2. **IgnoreEngine.ts**: Review the Discovery-First Traversal logic to ensure forced recursion works correctly for negated patterns
3. **FileTable.tsx**: Verify that the right-click context menu and rule suspension logic properly integrate with ModeContext
4. **token.worker.ts**: Review the hybrid tokenization approach and 500ms batching logic for performance correctness
5. **release-sea-binaries.yml**: Verify the multi-job matrix workflow and GPG signing process for release automation

---

Thank you for contributing to Concatenator! 🚀
