# Project State: Concatenator

**Current Version:** v0.8.0
**Last Updated:** 2026-07-24

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
- Phase C Security Sprint: Implemented strict symlink rejection in `PathValidator.resolveAndJail()`, deterministic `SymlinkRejectedError` & `PathTraversalError` security errors, ENOENT trap handling for non-existent target files during extraction, and telemetry logging across the VFS de-concatenation engine.
- CI/CD Pipeline Modernization: Pinned Node.js 22 LTS (`node-version: '22.x'`) globally across all workflow jobs, resolved coverage artifact failure by enforcing `npm run test:coverage` prior to `upload-artifact`, updated third-party actions to latest major versions, and added `vitest.config.ts`.

## Pending Roadmap Tasks (Immediate Focus)

- Implement automatic pre-filtering in `IgnoreEngine` for zero-signal lockfiles (`package-lock.json`, `pnpm-lock.yaml`)[cite: 1].
- Refactor the `concatenator verify` CLI command for Sovereign Key Discovery[cite: 1].
- Build the VFS bootstrap system to parse `.concatenator/pulse.json` for automatic job recovery[cite: 1].
