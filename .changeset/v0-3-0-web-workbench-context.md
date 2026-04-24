---
"concatenator": minor
---

# Workbench Context & Hierarchical Token Aggregator

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
