# 📥 Quickstart Guide

Get up and running with Concatenator in **3 minutes**.

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org) (v18 or later)
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

The app will open at `http://localhost:3000`.

## 🚀 Quick Usage (1-Minute Guide)

Choose your preferred interface:

### Option A: Web Interface (Recommended for First-Time Users)

#### 1. Concatenate Files

- **Drag & Drop**: Drop your project folder onto the upload zone.
- **Filter**: Review the file tree. Use the **Ignore List** to filter out unwanted noise (e.g., `node_modules`, `.git`, or build artifacts).
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

# Quick CLI Examples

```bash
# Concatenate directory to file (auto-discovers .concatignore or .gitignore)
concatenator concat -o context.txt ./src

# Concatenate with explicit ignore file and exclusions
concatenator concat -o output.txt -i .gitignore -e dist ./project

# Extract and restore files
concatenator extract -o ./restored bundle.txt

# Extract as ZIP archive
concatenator extract --zip -o backup.zip bundle.txt

# Validate file integrity
concatenator validate bundle.txt

# Validate with detailed output (shows foreign markers)
concatenator validate -v bundle.txt

# Very verbose (shows all foreign markers)
concatenator validate -vv bundle.txt
```

> [!TIP]
> Use `npm run dev:cli -- [command]` from the project directory during development instead of `npm link`.

## Next Steps

- **Read the full [README](./README.md)** for advanced features (PDF export, API keys, ignore patterns)
- **Set up your [development environment](./CONTRIBUTING.md)** to contribute
- **Review [security practices](./SECURITY.md)** for API key handling
- **Check the [CHANGELOG](./CHANGELOG.md)** for recent updates and release notes

---

That's it! You're ready to streamline your code context workflow. 🚀
