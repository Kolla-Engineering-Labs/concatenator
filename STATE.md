# Project State: Concatenator

**Current Version:** v0.8.1
**Last Updated:** 2026-07-26

## Active Context & Architecture

- **Core Engine (Ignore System 3.0):** Features Discovery-First Traversal, forcing recursion for negated patterns (`!core`) while bypassing heavy system folders[cite: 1].
- **Tokenization Pipeline:** Utilizes precise BPE encoding via `js-tiktoken` (`o200k_base`), with an atomic 500ms batching system in the Web Worker to prevent UI thread lockups[cite: 1].
- **VFS Management:** Flat-map state architecture featuring root pruning and dynamic directory absorption[cite: 1].

## Recently Completed Milestones (Stable - Do Not Revisit)

- Migration from `micromatch` to ESM-native `picomatch` for glob evaluation[cite: 1].
- Implementation of the `VFSHydrator.ts` pure batch resolution layer for O(1) map lookups of ignore sources[cite: 1].
- Integration of a decoupled `PulseEmitter.ts` to prevent synchronous I/O event loop blockages[cite: 1].
- Multi-Job Matrix SEA Release Pipeline (`.github/workflows/release-sea-binaries.yml`) for automated cross-platform builds (Linux, macOS, Windows) with GPG detached signing (`SHA256SUMS.asc`) and GitHub Release automation.
- v0.8.0 Audit Matrix test suite implementation across `VFSHydrator.ts` (15k node scale & DTO mapping), `IgnoreEngine.ts` (Discovery-First Traversal & forced recursion), `FileTable.tsx` (ephemeral rule suspensions), and `token.worker.ts` / `useTokenAggregation.ts` (500ms hybrid batch throttling).
- Phase C Security Sprint: Implemented strict symlink rejection in `PathValidator.resolveAndJail()`, deterministic `SymlinkRejectedError` & `PathTraversalError` security errors, mathematical `path.relative()` boundary enforcement, null byte sanitization, percent character preservation, ENOENT trap handling for non-existent target files during extraction, and comprehensive unit tests (`PathValidator.test.ts`).
- CI/CD Pipeline Modernization: Pinned Node.js 22 LTS (`node-version: '22.x'`) globally across all workflow jobs, resolved coverage artifact failure by enforcing `npm run test:coverage` prior to `upload-artifact`, updated third-party actions to latest major versions, and added `vitest.config.ts`.
- CI/CD Matrix Stabilization: Mathematically enforced Unix line endings (`* text=auto eol=lf`) in `.gitattributes` and configured `if-no-files-found: ignore` for the Playwright artifact upload in `.github/workflows/ci.yml` to prevent ghost artifact failures.
- Dedicated E2E Workflow Separation: Created `.github/workflows/e2e.yml` for isolated Playwright E2E execution on `ubuntu-latest` (Node 22 LTS) with `if: always()` report artifact upload, removed all Playwright steps from `.github/workflows/ci.yml`, and updated documentation across `README.md`, `ARCHITECT.md`, `CONTRIBUTING.md`, and `e2e/README.md`.
- CodeQL Workflow Permission Hardening: Configured explicit top-level read-only permissions boundary (`permissions: contents: read`) in `.github/workflows/e2e.yml` to adhere to CodeQL security requirements.
- macOS Ad-Hoc Signature Verification Awareness: Updated `verifyBinary` in `scripts/sign-utils.ts` to check `isSigningEnabled(platform)`, executing `spctl` for certified builds and `codesign --verify --verbose` for ad-hoc builds with appropriate logging. Updated test suite in `tests/scripts_sign_utils.test.ts`.
- Programmatic esbuild SEA Bundling Refactor: Refactored bundling in `scripts/build-sea.js` to use `buildSync` directly from `esbuild`, removing shell execution and tsx fallback, natively passing `define: { PROCESS_IS_UNSIGNED: String(isUnsigned) }`, and triggering `process.exit(1)` on bundling errors to halt CI/CD pipelines.

## Pending Roadmap Tasks (Immediate Focus)

- Implement automatic pre-filtering in `IgnoreEngine` for zero-signal lockfiles (`package-lock.json`, `pnpm-lock.yaml`)[cite: 1].
- Refactor the `concatenator verify` CLI command for Sovereign Key Discovery[cite: 1].
- Build the VFS bootstrap system to parse `.concatenator/pulse.json` for automatic job recovery[cite: 1].
