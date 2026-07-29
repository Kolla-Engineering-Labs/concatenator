# Project State: Concatenator

**Current Version:** v0.9.0-alpha (Phase C: Security & Decoupling Sprint)
**Last Updated:** 2026-07-28

## Active Context & Architecture

- **Core Engine Separation:** The `engine.ts` God Class is actively queued for dismantling into isolated, pure Strategy Pattern functions (`SessionParser`, `LegacyParser`, `HeaderParser`) within the `@concatenator/core/parsers/` namespace.
- **CLI Command Routing:** Queued refactor for CLI execution into a strict Command Pattern architecture to decouple file system utilities from command flags.
- **Web VFS Memory Optimization:** Planning the replacement of `JSZip` with `fflate` in the browser to stream compression in chunks.
- **Zero-Trust Local Networking:** Queued hardening of `server.ts` to strictly bind to `127.0.0.1` and enforce cryptographic ephemeral tokens.

## Recently Completed Milestones (Stable - Do Not Revisit)

- **VFS Sandboxing & Symlink Rejection:** Implemented `PathValidator.resolveAndJail()` to mathematically enforce directory traversal protection and symlink rejection via `fs.lstatSync`. Validated against 807 test assertions.
- Multi-Job Matrix SEA Release Pipeline for automated cross-platform builds with GPG detached signing and context-aware macOS Apple Gatekeeper bypassing.
- Explicit CodeQL permissions boundary lock-down (`permissions: contents: read`) in the E2E GitHub Actions workflow.
- Precision Tokenization integration via `js-tiktoken` and Web Worker batching.

## Pending Roadmap Tasks (Immediate Focus)

- **The KEL Protocol Decoder Ring:** Draft `SKILLS.md` to act as a machine-readable System Prompt instructing LLMs on Two-Key Verification, neutralized boundaries, and Post-Matter manifest parsing.
- **Pipeline Governance (v0.9.5 Prep):** Initialize Husky pre-commit hooks, Changesets for deterministic semantic versioning, and Snyk/SonarCloud quality gates.
- Finalize the Post-Matter EOF manifest pipeline, shifting from JSON boundaries to pipe-delimited hashes for two-key extraction verification.
