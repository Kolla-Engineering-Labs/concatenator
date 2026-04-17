# Concatenator

[![CI & Quality Gate](https://github.com/Kolla-Engineering-Labs/concatenator/actions/workflows/ci.yml/badge.svg)](https://github.com/Kolla-Engineering-Labs/concatenator/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Kolla-Engineering-Labs/concatenator/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/Kolla-Engineering-Labs/concatenator/actions/workflows/github-code-scanning/codeql)
[![codecov](https://codecov.io/gh/Kolla-Engineering-Labs/concatenator/graph/badge.svg?token=ubXyDShjEa)](https://codecov.io/gh/Kolla-Engineering-Labs/concatenator)
[![Bundle Analysis](https://img.shields.io/badge/Bundle%20Analysis-View%20Report-blue)](https://app.codecov.io/gh/Kolla-Engineering-Labs/concatenator/bundles)

A professional, minimalist tool designed to streamline the process of merging multiple source files into a single, well-formatted text document and extracting them back. Concatenator is specifically optimized for developers who need to provide large amounts of context to Large Language Models (LLMs) or manage multi-file codebases in a single view.

### 💡 Why Concatenator?
Developers often struggle to provide full codebase context to LLMs due to file-count limits or token fragmentation. Concatenator streamlines this by bundling your project into a single, parseable file—optimizing context retention while providing a "safety net" to restore your files instantly.

## Key Features

- **Full-Circle File Management**: Merge directory structures into LLM-ready `.txt` or `.pdf` files, with the ability to instantly reconstruct and download the entire file tree as a ZIP archive from a single Concatenator `.txt` file.

```mermaid
graph LR
    subgraph "Phase 1: Concatenation"
        A[Original Folder Tree] -->|Merge| B{Concatenator}
        B -->|Export| C[LLM-Ready .txt]
        B -->|Export| D[Portable .pdf]
    end

    subgraph "AI Ingestion"
        C -->|Context| E[Claude / GPT-4o]
        D -->|Context| F[Google Gemini]
    end

    subgraph "Phase 2: Reconstruction"
        C -->|Upload| G{De-concatenator}
        G -->|Parse Metadata| H[In-Memory Rebuild]
        H -->|Zip Stream| I[Generated ZIP Archive]
    end

    style B fill:#2563eb,color:#fff
    style G fill:#2563eb,color:#fff
    style E fill:#d97706,color:#fff
    style F fill:#d97706,color:#fff
    style I fill:#059669,color:#fff

    linkStyle 4,5 stroke:#059669,stroke-width:2px,stroke-dasharray: 5 5
```

- **Multiple Output Formats**:
  - **Text (default)**: Save concatenated files as a plain `.txt` file.
  - **PDF**: Export concatenated files as a formatted PDF document with proper pagination and delimiters.
- **Smart Ignore System**:
  - Exclude common noise (e.g., `node_modules`, `.git`, `package-lock.json`) using simple string matches or powerful Regular Expressions. Syncs between `localStorage` and server-side `.concatenate-ignore`.
- **Advanced Visualization**:
  - Switch between **List View** for flat file management and **Tree View** for hierarchical directory inspection.
  - Real-time filtering and sorting (directories first, then alphabetical).
- **Developer-Centric UI**:
  - Drag-and-drop support for folders and files.
  - Dark Mode optimized for long coding sessions.
  - Automatic de-concatenation upon dropping a compatible `.txt` file.
  - Output format toggle (TEXT/PDF) with localStorage persistence.
- **Hardware Safety Guardrails**: Configurable **Max File Limit** (default: 10,000 files) to prevent browser memory exhaustion.

> [!WARNING]
> **Hardware Safety**: Dragging massive directories without proper ignore patterns can temporarily freeze the browser thread. Always verify your **Max File Limit** settings before large imports. 🛡️

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS 4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/) (`motion/react`)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Backend**: [Express](https://expressjs.com/) (Node.js)
- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **Utilities**: [JSZip](https://stuk.github.io/jszip/) for archive generation, [jsPDF](https://github.com/parallax/jsPDF) for PDF generation

### 🗺️ Architecture Map
```mermaid
graph TD
    subgraph "Presentation Layer (React)"
        App[App.tsx] --> Components[components/]
        Components --> Hooks[hooks/]
    end

    subgraph "Logic Layer (Pure TypeScript)"
        Hooks --> Lib[lib/]
        Lib --> Parsers[Parsers]
        Lib --> Generators[Generators]
        Lib --> Security[In-Memory Security]
    end

    subgraph "Infrastructure & Types"
        Types[types.ts] -.-> Presentation
        Constants[constants.ts] -.-> Logic
    end

    subgraph "Quality & Verification"
        Tests[tests/] -- "Unit Tests" --> Lib
        E2E[e2e/] -- "Browser Tests" --> App
    end

    style App fill:#2563eb,color:#fff
    style Lib fill:#059669,color:#fff
    style Tests fill:#d97706,color:#fff
    style E2E fill:#d97706,color:#fff
```

## Development

### Logging

Concatenator uses a lightweight logging utility (`src/lib/logger.ts`) for debugging:

- **Levels**: `debug` < `info` < `error` (higher levels include lower ones)
- **Default**: `info` (logs info and error, suppresses debug)
- **Format**: `[2026-04-13T12:34:56.789Z] [LEVEL] message`

Set `LOG_LEVEL=debug` in your `.env` to see detailed file parsing logs useful for debugging edge cases.

### Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e
```

## Installation & Setup

To run Concatenator locally, ensure you have [Node.js](https://nodejs.org/) installed, then follow these steps:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Kolla-Engineering-Labs/concatenator.git
   cd concatenator
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory (see the [Environment Variables](#environment-variables) section).

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## Environment Variables

Concatenator uses a hierarchical approach for API key management to ensure flexibility across different environments.

### API Key Handling

**Security Note**: API keys are stored **only in memory** for the current browser session. They are not persisted to `localStorage`, cookies, or any browser storage. This means:
- Keys must be re-entered after each page reload
- Keys are never written to disk in the browser
- Environment variables can still be used for server-side builds

### Hierarchical Resolution
1. **Session Input**: Keys entered in the **Settings Modal** are held in memory and take the highest priority for the current session.
2. **Environment Fallback**: If no in-memory key is set, the app falls back to the `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` defined in your environment.

### Configuration
Create a `.env` file in the root directory and add your API keys:

```env
# .env
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Optional: Logging level (debug | info | error)
LOG_LEVEL=info
```

## Usage

### Concatenating Files
1. Ensure the mode is set to **Concatenate**.
2. (Optional) Adjust the **Max Files** dropdown to set a safety limit (500 - 20,000 files, default: 10,000). This prevents browser memory issues when processing large folders.
3. Drag and drop a folder or multiple files into the upload zone.
4. Review the **Selected Files** list. Use the **Ignore List** to filter out unwanted files.
5. Choose your output format using the **TEXT/PDF** toggle at the bottom (TEXT is default).
6. Click **Concatenate & Download**. The output will be a timestamped file (e.g., `concatenator-20260410_123045.txt` or `concatenator-20260410_123045.pdf`).

**Note**: The Max File Limit applies to both import and concatenation. If you attempt to drag-and-drop or concatenate more files than the selected limit, the operation will be halted and a warning displayed to prevent browser crashes.

### De-concatenating Files
1. Switch the mode to **De-concatenate**.
2. Drop a `.txt` file previously generated by this tool into the upload zone.
3. The app will automatically parse the content, reconstruct the directory structure, and prompt you to download a ZIP archive.

## Contribution

This project is maintained by the **Kolla-Engineering-Labs** team.

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for detailed setup instructions, our testing stack (Vitest + Playwright), and PR process using [Conventional Commits](https://www.conventionalcommits.org/).

- **Quick Start**: Get running in 3 minutes with our [Quickstart Guide](./QUICKSTART.md)
- **Reporting Bugs**: Use GitHub Issues with our [bug report template](https://github.com/Kolla-Engineering-Labs/concatenator/issues/new?template=bug_report.md)
- **Security Issues**: Report privately via [Security](./SECURITY.md) — never via public issues
- **Submitting PRs**: Use branch naming like `feat/description` or `fix/description` following [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) format

---
© 2026 Kolla-Engineering-Labs. All rights reserved.
