# Concatenator Roadmap

This document outlines the strategic trajectory for Concatenator, mapping the progression from the current release through to v2.0.0. Our overarching objective is to evolve the project from a highly functional utility into an industrial-grade standard for LLM context management, anchored in local-first principles and Clean Architecture.

## v1.0.0: Protocol Stability Release (General Availability)

_Target: Architectural Freeze, Security Auditing, and Zero-Dependency Portability_

v1.0.0 marks the transition to a stable, production-ready standard. The core architecture will be frozen to guarantee backward compatibility.

- **API & Schema Guarantee:** Committing to strict backward compatibility for the `@concatenator/core` engine API, CLI execution flags, and the local-first UI state schemas (localStorage VFS structures).
- **The Pre-Matter Header Resolution:** Complete migration from Post-Matter EOF manifests to Pre-Matter Headers. This structural shift guarantees $O(1)$ stream memory processing, allowing `fflate` to intercept payload manifests and execute `fs.lstatSync` zero-trust boundary checks before any file content is buffered to disk.
- **Phase C: Zero-Trust Security Auditing:** Hardening the local `127.0.0.1` API perimeter, enforcing strict CORS boundaries, and validating ephemeral cryptographic handshakes. All code must explicitly pass Snyk vulnerability scans and SonarCloud quality gates before merge.
- **Phase D: Core Engine Scaling:** Stress-testing the $O(n)$ extraction engine against massive monorepo payloads to guarantee V8 memory stability under heavy stream loads.
- **Phase E: Node 22 SEA Validation:** Final, rigorous validation of the standalone Node 22 Single Executable Application payload, ensuring flawless operation in offline, air-gapped enterprise environments.

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

_Target: Architectural Freeze, Security Auditing, and Zero-Dependency Portability_

v1.0.0 marks the transition to a stable, production-ready standard. The core architecture will be frozen to guarantee backward compatibility.

- **API & Schema Guarantee:** Committing to strict backward compatibility for the `@concatenator/core` engine API, CLI execution flags, and the local-first UI state schemas (localStorage VFS structures).
- **Phase C: Zero-Trust Security Auditing:** Hardening the local `127.0.0.1` API perimeter, enforcing strict CORS boundaries, and validating ephemeral cryptographic handshakes. All code must explicitly pass Snyk vulnerability scans and SonarCloud quality gates before merge.
- **Phase D: Core Engine Scaling:** Stress-testing the $O(n)$ extraction engine against massive monorepo payloads to guarantee V8 memory stability.
- **Phase E: Node 22 SEA Validation:** Final, rigorous validation of the standalone Node 22 Single Executable Application payload, ensuring flawless operation in offline, air-gapped enterprise environments.
- **Open-Source Distribution Baseline:** Formalizing the standard NPM and Homebrew distribution channels for the community edition.

## v2.0.0: The Enterprise Context Engine

_Target: Semantic Intelligence, Deterministic Patching, and SMB Commercialization_

v2.0.0 will shift Concatenator from a static text-bundler into an intelligent, semantic transport layer designed for SMBs requiring strict compliance and data loss prevention (DLP).

- **AST-Aware Chunking (Tree-sitter Pruning):** Integrating native Tree-sitter libraries to perform semantic AST thinning. This extracts structural signatures (imports, types, class definitions) while replacing implementation logic with `pass` statements, drastically reducing token burn.
- **Deterministic Patching Schema:** Augmenting our Post-Matter Manifest to require LLMs to emit changes in a strict, formalized schema (e.g., JSON/YAML) before triggering the `fflate` Web-Stream reconstruction, bypassing the fragility of fuzzy raw-text diff matching.
- **Pre-Context Middleware Compression:** Aggressively compressing internal type definitions and manifest schemas before they reach the model's context window, ensuring the LLM spends its attention entirely on the source code.
- **Deterministic Speculative Edits:** Leveraging the fact that code edits have a strong prior on draft tokens to predict and validate unchanged code blocks during the generation stream, accelerating file application speeds natively on the client side.
- **SMB Premium Pivot:** Commercializing a premium license offering VFS Sandboxing, advanced AST pruning, and cryptographic ephemeral tokens for multi-agent local handshakes, targeting enterprise developers terrified of autonomous agents corrupting their local VFS.
