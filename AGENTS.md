# Antigravity Agent Directives: Concatenator

## Tech Stack Constraints

- **Runtime:** Node.js v22 (LTS) / v24. Target output is a Single Executable Application (SEA)[cite: 1].
- **Language:** TypeScript v5.8.2 (Strict Mode)[cite: 1].
- **Frontend:** React 19, Vite 6+, Tailwind CSS v4[cite: 1].
- **Core Dependencies:** `esbuild` for bundling, `js-tiktoken` for BPE tokenization, `picomatch` for glob matching[cite: 1].

## Token Economy & Traversal Rules

1. **Zero Context Dumps:** Never stream full files automatically. Use workspace symbol searches to isolate exact line ranges before reading.
2. **Surgical Edits:** Output only the modified functions or blocks. Never regurgitate an entire file.
3. **Dependency Isolation:** The architecture strictly adheres to a Core-First / Thin-Consumer pattern. Do not mix UI logic with `@concatenator/core` domains[cite: 1].
4. **State Check-in:** You must update `STATE.md` immediately before terminating any feature implementation session.
5. **Terminal Execution Handoff:** You are strictly prohibited from attempting to execute terminal commands. If a task requires a script, installation, or CLI operation, output the exact command inside a standard bash markdown code block. Pause execution and wait for the user to manually run the command and paste the standard output back to you before proceeding.

## Security & Architectural Non-Negotiables

- **API Binding:** The Express API wrapper must bind strictly to `127.0.0.1` under token-protected authentication[cite: 1].
- **Traversal Security:** Always use `fs.realpathSync` to assert paths remain within the root boundary[cite: 1].
- **Sovereign Execution:** The application must function 100% offline with absolute data sovereignty[cite: 1].
