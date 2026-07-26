# Concatenator Roadmap

This document outlines the strategic trajectory for Concatenator, mapping the progression from the current v0.8.0 release through to v2.0.0. Our overarching objective is to evolve the project from a highly functional utility into an industrial-grade standard for LLM context management, anchored in local-first principles and Clean Architecture.

## v0.9.0: The Security & Decoupling Sprint (Phase C)

_Target: Structural Integrity and VFS Hardening_

The primary objective of v0.9.0 is to dismantle existing technical debt—specifically the identified "God Classes"—and lock down the Virtual File System (VFS) against malicious inputs.

### Architectural Refactoring (The God Class Dismantling)

- **`engine.ts` Restructuring:** Transition from a monolithic module to a Strategy Pattern implementation. Extract `SessionParser`, `LegacyParser`, and `HeaderParser` into isolated pure functions within a new `parsers/` namespace under `@concatenator/core`.
- **CLI Router Decentralization:** Refactor `cli/index.ts` and `cli-utils.ts` into a command-pattern driven architecture. Establish a `commands/` directory containing isolated execution logic for `pack`, `unpack`, etc.
- **Web VFS Strangler Fig:** Begin the systemic decoupling of `useFileProcessing.ts` (currently 1.5k lines). Extract pure ZIP stream orchestration and token math into framework-agnostic utility classes, transitioning the React hook into a lightweight state machine delegating to a decoupled `VFSOperations` class.

### VFS Sandboxing & Threat Mitigation

- **Directory Traversal Guardrails:** Hardening the De-concatenate VFS to strictly prevent relative path escaping (`../`) and unauthorized "Franken-project" overwrites.
- **Injection Neutralization Audits:** Mathematical verification of our backtick and marker escaping protocols to ensure zero-day prompt injection resilience against complex LLM payloads.

## v0.9.5: Operations, Governance & Pipeline Maturity

_Target: Enterprise Readiness and Quality Gating_

This release focuses on solidifying our CI/CD pipeline and ensuring the codebase is ready for widespread adoption and contribution.

- **CI/CD Lockdown:** Strict enforcement of Husky pre-commit hooks, SonarCloud static analysis for code smells, and Snyk vulnerability scanning in all automated workflows.
- **Semantic Release Governance:** Finalizing the Changesets integration for automated, deterministic semantic versioning and changelog generation.
- **Test Coverage Baselines:** Establishing and enforcing minimum coverage thresholds across the newly decoupled core engine and CLI namespaces.

## v1.0.0: Protocol Stability Release (General Availability)

_Target: Architectural Freeze and Zero-Dependency Portability_

v1.0.0 marks the transition to a stable, production-ready standard. The core architecture will be frozen to guarantee backward compatibility.

- **API & Schema Guarantee:** Committing to strict backward compatibility for the `@concatenator/core` engine API, CLI execution flags, and the local-first UI state schemas (localStorage VFS structures).
- **Node 22 SEA Validation:** Final, rigorous validation of the standalone Node 22 Single Executable Application payload, ensuring flawless operation in offline, air-gapped enterprise environments.
- **Open-Source Distribution Baseline:** Formalizing the standard NPM and Homebrew distribution channels for the community edition.
