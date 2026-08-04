# Project State: Concatenator

**Current Version:** v0.9.5-alpha (Phase C: CI/CD Perimeter Sealed)
**Last Updated:** 2026-08-04

## Active Context & Architecture

- **Core Engine Separation:** The `engine.ts` God Class is actively queued for dismantling into isolated, pure Strategy Pattern functions (`SessionParser`, `LegacyParser`, `HeaderParser`) within the `@concatenator/core/parsers/` namespace.
- **CLI Command Routing:** Queued refactor for CLI execution into a strict Command Pattern architecture to decouple file system utilities from command flags.
- **Web VFS Memory Optimization:** Planning the replacement of `JSZip` with `fflate` in the browser to stream compression in chunks.
- **Zero-Trust Local Networking:** Queued hardening of `server.ts` to strictly bind to `127.0.0.1` and enforce cryptographic ephemeral tokens.

## Recently Completed Milestones (Stable - Do Not Revisit)

- **VFS Topology Scaffolding (`workbench-ui/src/components/VFSTree.tsx` & `WorkbenchLayout.tsx`):**
  - Scaffolded recursive `VFSTreeRoot`, `VFSDirectoryNode`, and `VFSFileNode` components with persistent directory expansion state via `usePersistentState`.
  - Created `WorkbenchLayout` container and mounted `VFSTreeRoot` inside `App.tsx` consuming the `useVFS` hook.
  - Resolved `verbatimModuleSyntax` and type imports; verified clean bundle compilation (`tsc -b && vite build`) with automatic injection of 5 UI assets into Core Engine perimeter.
- **API Bridge Porting & Hook Lifecycle Decoupling (`workbench-ui/src/hooks/useVFS.ts`):**
  - Scaffolded `useVFS` hook to manage VFS tree traversal state and inject `X-Concatenator-Token` header for zero-trust local network boundary access.
  - Decoupled `fetchPayload` API request logic from React state mutations, handling initial mount via a microtask promise chain with active component unmount guards (`active` flag) to enforce zero synchronous state mutations on mount.
  - Passed 100% of full test suite, lint check, type-check, coverage, and single-executable application (SEA) build pipeline (`concatenator.exe`).
- **Hardening Frontend Foundation (`workbench-ui`):**
  - Updated `workbench-ui/vite.config.ts` to use `import.meta.dirname` for ESM path resolution in the `emitBase64Assets` plugin.
  - Implemented Light/Dark theme matrix CSS custom properties in `workbench-ui/src/index.css` using Tailwind v4 `@theme`.
  - Created `workbench-ui/src/hooks/usePersistentState.ts` for safe localStorage state sync.
- **Vite to SEA Bridge (`workbench-ui/vite.config.ts` & `workbench-ui/src/index.css`):**
  - Configured `workbench-ui/vite.config.ts` with custom `emitBase64Assets` plugin to compile and encode static UI dist assets into `src/cli/webAssets.ts`.
  - Updated `workbench-ui/src/index.css` with Tailwind v4 engine configuration and dark-mode workspace palette.
- **Build-Time Version Injection (`scripts/build-cli.ts` & `src/cli/index.ts`):**
  - Configured `esbuild` `define` in `scripts/build-cli.ts` to inject `__KEL_VERSION__` directly from `package.json` into the AST.
  - Updated `src/cli/index.ts` to declare and consume `__KEL_VERSION__` with fallback to `'dev-build'`, eliminating disk reads and stale hardcoded version strings.
- **V8 Snapshot & Postject Injection (`scripts/build-binary.ts`):**
  - Created cross-platform build script `scripts/build-binary.ts` to orchestrate V8 SEA blob generation (`sea-prep.blob`), clone the host Node executable (`process.execPath`), and inject the blob via `postject`.
  - Realigned segment architecture to restrict `--macho-segment-name NODE_SEA` exclusively to macOS (`darwin`), allowing native PE/ELF mapping on Windows and Linux.
  - Updated `sea-config.json` entrypoints to `dist/bundle.js` and `dist/sea-prep.blob`.
  - Wired `build:sea-bundle`, `build:sea-binary`, and `build:sea` pipeline script chain in `package.json`.
- **Compiler Blueprint & SEA AST Bundling (`scripts/build-cli.ts`):**
  - Created `scripts/build-cli.ts` targeting Node 22 runtime with `esbuild`, bundling CommonJS output (`dist/bundle.js`) with tree shaking enabled.
  - Added `"build:sea-bundle": "tsx scripts/build-cli.ts"` execution hook script to `package.json`.
- **Post-Matter EOF Manifest & Two-Key Verification Sealed:**
  - Implemented pipe-delimited Post-Matter EOF manifest parsing (`extractPostMatterManifest`) and fail-closed validation loop (`validateConcatenation`) in `src/core/engine.ts`.
  - Centralized OS-agnostic CRLF-to-LF line normalization and parser boundary bleed trimming (`.replace(/\r\n/g, '\n').trimEnd()`) inside `computeHash()` in `src/core/builder/BuilderUtils.ts`.
  - Hardened CLI exception boundary in `src/cli/index.ts` to translate Core Engine validation exceptions into POSIX `process.exit(1)`.
  - Updated `tests/smoke-test.sh` payload tamper logic to run a cross-platform Node script mutating bytes inside the file segment boundary; verified 11/11 passing smoke test assertions.
- **CI/CD Perimeter — v0.9.5 Security Gate (`ci.yml`):**
  - Inserted `Run E2E Tests (Playwright)` step immediately after the Vitest unit test step; both steps pass `CONCATENATOR_API_TOKEN` for local Core Engine auth.
  - Scoped `Native Security Audit` to the production boundary (`npm audit --audit-level=high --omit=dev`) on `ubuntu-latest` — isolates audit to dependencies landing in the compiled SEA binary while preserving local dev tooling compatibility.
  - SonarCloud (`SonarSource/sonarcloud-github-action@master`) and Snyk (`snyk/actions/node@master`) steps scaffolded as commented-out blueprints with a `TODO` marker for Phase D / v1.0.0 provisioning. No external tokens required to pass current pipeline.
- **VFS Sandboxing & Symlink Rejection:** Implemented `PathValidator.resolveAndJail()` to mathematically enforce directory traversal protection and symlink rejection via `fs.lstatSync`. Validated against 807 test assertions.
- Multi-Job Matrix SEA Release Pipeline for automated cross-platform builds with GPG detached signing and context-aware macOS Apple Gatekeeper bypassing.
- Explicit CodeQL permissions boundary lock-down (`permissions: contents: read`) in the E2E GitHub Actions workflow.
- Precision Tokenization integration via `js-tiktoken` and Web Worker batching.

## Pending Roadmap Tasks (Immediate Focus)

- **Phase D SaaS Provisioning:** Register Kolla Engineering Labs org accounts on SonarCloud and Snyk; add `SONAR_TOKEN` and `SNYK_TOKEN` to GitHub Actions secrets; uncomment the blueprint blocks in `ci.yml`.
- **The KEL Protocol Decoder Ring:** Draft `SKILLS.md` to act as a machine-readable System Prompt instructing LLMs on Two-Key Verification, neutralized boundaries, and Post-Matter manifest parsing.
