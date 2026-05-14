# 📥 Quickstart Guide

Get up and running with Concatenator in **3 minutes**.

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org) (v22 or later)
- A modern browser (**Chrome/Edge recommended** for full File System Access API support)

> [!NOTE]
> **Chromium Required**: For the best experience with the **File System Access API**, use a Chromium-based browser (Chrome, Edge, Brave). Firefox and Safari users will use a standard file picker fallback. 🌐

## Install & Run (2 minutes)

```bash
# 1. Clone the repository
git clone https://github.com/Kolla-Engineering-Labs/concatenator.git
cd concatenator

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app will open at `http://localhost:5173`.

## 📦 Option C: Standalone Binary (Fastest)

Don't want to install Node.js? Download the pre-built binary for your platform from the [Releases](https://github.com/Kolla-Engineering-Labs/concatenator/releases) page.

```bash
# Windows
.\concatenator.exe ui

# macOS / Linux (Recommended for macOS security checks)
./concatenator start

# Verify binary integrity
./concatenator verify self

# Or specify a path
./concatenator ui ./src
```

> [!IMPORTANT]
> **macOS Security**: If you are using an ad-hoc signed binary, you may see a "Developer Cannot be Verified" warning. Use `./concatenator start` to automatically trigger security guidance, or see our [macOS Security Guide](./docs/MACOS_SECURITY.md). 🛡️

> [!TIP]
> **Setup**: Copy `.env.example` to `.env` and add a `CONCATENATOR_API_TOKEN`. This token secures your local file operations. See [API Security](./CONTRIBUTING.md#api-security) for help generating the token. 🔑

## 🚀 Quick Usage (1-Minute Guide)

Choose your preferred interface:

### Option A: Web Interface (Recommended for First-Time Users)

#### 1. Concatenate Files

- **Drag & Drop**: Drop your project folder onto the upload zone.
- **Analyze**: Review file sizes and **Precise Token Counts** in real-time. Toggle between **Tree** and **List** views to inspect your project structure. The Tree View automatically prunes redundant levels to start at the **Minimum Common Root**.
- **Quick Look**: Click the preview icon next to any file to instantly inspect its content (Code, PDF, or SVG) without leaving the app.
- **Filter**: Use the **Ignore List** to filter out unwanted noise (e.g., `node_modules`, `.git`).
- **Export**: Choose your format and click **"Concatenate & Download."**
  - **Select `.txt`**: Best for Claude, GPT-4o, and general data recovery.
  - **Select `.pdf`**: Recommended for **Google Gemini** or archiving.

> [!TIP]
> **LLM "Cheat Code":** While most LLMs handle text perfectly, **Google Gemini** can occasionally struggle with massive raw `.txt` uploads. Using the **PDF Export** allows Gemini to use superior native document processing for better context retention. 💡

---

### 2. De-concatenate Files (TXT Only)

- **Switch Mode**: Toggle the application to **"De-concatenate"** mode.
- **Upload**: Drop a previously generated **Concatenator .txt file**.
- **Recover**: The ZIP archive is generated automatically for download.

> [!NOTE]
> PDF exports are intended for final consumption; they do not support de-concatenation.

---

### Option B: CLI (For Automation & Scripting)

Perfect for CI/CD pipelines, batch processing, or terminal-centric workflows.

#### Setup

```bash
# Link the CLI globally
npm link

# Verify installation
concatenator --help
```

You can also compile a standalone executable that doesn't require Node.js:

```bash
npm run build:exe
```

# Quick CLI Examples

```bash
# Concatenate with token budget (warns if > 100k tokens)
concatenator concat -o context.txt --max-tokens 100000 ./src

# Concatenate with verbose token reporting (-vv for per-file breakdown)
concatenator concat -o context.txt -vv ./src

# Pre-flight Audit: See token weight of a directory without bundling
concatenator validate ./src --tokens

# Multi-path concatenation (automatically prunes redundant sub-paths)
concatenator concat -o bundle.txt ./src ./lib ./src/components

# Extract and restore files
concatenator extract -o ./restored bundle.txt

# Extract as ZIP archive
concatenator extract --zip -o backup.zip bundle.txt

# Validate file integrity
concatenator validate bundle.txt
```

> [!TIP]
> Use `npm run dev:cli -- [command]` from the project directory during development instead of `npm link`.

## Next Steps

- **Read the full [README](./README.md)** for advanced features (PDF export, ignore patterns)
- **Set up your [development environment](./CONTRIBUTING.md)** to contribute
- **Review [security practices](./SECURITY.md)** for environment variable handling
- **Check the [CHANGELOG](./CHANGELOG.md)** for recent updates and release notes

---

That's it! You're ready to streamline your code context workflow. 🚀
