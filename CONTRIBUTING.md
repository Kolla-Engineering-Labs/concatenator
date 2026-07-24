# 🤝 Contributing to Concatenator

Thank you for your interest in contributing to Concatenator! This document provides detailed guidelines for setting up your development environment, understanding our architecture, and submitting contributions.

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Project Architecture](#project-architecture)
- [Testing Stack](#testing-stack)
- [Pull Request Process](#pull-request-process)
- [Code Style & Standards](#code-style--standards)
- [Questions?](#questions)

---

## 💻 Development Environment Setup

### 🛠️ Prerequisites

- **Node.js** (v22 or later required for SEA)
- **npm** (comes with Node.js)
- **Git**

### ⚙️ Initial Setup

1. **Fork and clone the repository**:

   ```bash
   git clone https://github.com/Kolla-Engineering-Labs/concatenator.git
   cd concatenator
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env and add your PostHog keys, LOG_LEVEL, and CONCATENATOR_API_TOKEN
   ```

   #### API Security

   > [!IMPORTANT]
   > **API Security**: You MUST set a `CONCATENATOR_API_TOKEN` in your `.env` to run the development server or E2E tests. Generate a random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

   > [!IMPORTANT]
   > **Naming Convention**: When adding new environment variables, use the `VITE_` prefix for client-side access. For PostHog specifically, always use the `VITE_PUBLIC_` prefix (e.g., `VITE_PUBLIC_POSTHOG_KEY`). Always set `person_profiles: 'identified_only'` in local-first / offline-capable app contexts.

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

### ⌨️ Available Scripts

| Command                   | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `npm run dev`             | Start the development server with hot reload   |
| `npm run build`           | Build the production bundle                    |
| `npm run preview`         | Preview the production build locally           |
| `npm run lint`            | Run TypeScript type checking                   |
| `npm test`                | Run unit tests with Vitest                     |
| `npm run test:coverage`   | Run unit tests with coverage report            |
| `npm run test:e2e`        | Run E2E tests with Playwright                  |
| `npm run test:e2e:ui`     | Run E2E tests with Playwright UI mode          |
| `npm run test:e2e:debug`  | Run E2E tests in debug mode                    |
| `npm run test:e2e:headed` | Run E2E tests in headed mode (visible browser) |
| `npm run build:sea`       | Execute the SEA build pipeline for single executable application  |
| `npm run build:exe`       | Build the single executable application (SEA) (alias) |
| `npm run build:manifest`  | Generate SHA256SUMS for built artifacts        |
| `npm run test:release`    | Audit release candidate (GPG + SHA256)         |
| `npm run pre-release`     | Pre-release hook for local verification        |
| `npm run clean`           | Remove build artifacts (dist/, web-assets.ts)  |

---

## 🚀 CI/CD & Automated SEA Release Pipeline

Official releases strictly trigger on tag creation matching `v*` via `.github/workflows/release-sea-binaries.yml`. The release architecture uses a **Multi-Job Matrix Strategy**:

1. **Job 1 (`build`)**: Runs a parallel matrix on `ubuntu-latest`, `macos-latest`, and `windows-latest`. Each runner executes `npm ci` followed by `npm run build:sea`, uploading platform-specific binaries (`concatenator-linux-x64`, `concatenator-macos-x64`, `concatenator-windows-x64.exe`) as GitHub Actions artifacts.
2. **Job 2 (`publish`)**: A dependent job (`needs: build`) running on `ubuntu-latest`. It downloads all platform artifacts into `dist/sea/`, computes `SHA256SUMS`, signs the manifest using the imported repository secrets (`GPG_PRIVATE_KEY` / `GPG_PASSPHRASE`) to generate `SHA256SUMS.asc`, and attaches all payload artifacts to the GitHub Release via `gh release upload`.

---

## 🖋️ Code Signing & Notarization

To ensure binary integrity and avoid "Unknown Publisher" warnings, Concatenator includes an integrated signing pipeline.

### Prerequisites for Signing

The `scripts/build-sea.js` script will attempt to sign the binary if the following environment variables are present:

#### Windows (signtool.exe)

- `SIGNING_CERT_DATA`: Base64 encoded `.pfx` certificate.
- `SIGNING_CERT_PASSWORD`: Password for the certificate.

#### macOS (codesign & notarytool)

- `APPLE_CERT_DATA`: Base64 encoded developer certificate.
- `APPLE_ID`: Your Apple Developer ID.
- `APPLE_PASSWORD`: App-specific password for notarization.
- `APPLE_TEAM_ID`: Your Apple Team ID.

> [!NOTE]
> If these variables are missing, the build will skip certified signing and fall back to **ad-hoc signing** on macOS. This produces a functional binary for local development, but users will encounter Gatekeeper prompts. See [macOS Security & Non-Certified Builds](./docs/MACOS_SECURITY.md) for details. CI builds for official releases MUST have these secrets configured for notarization.

---

## 🏗️ Project Architecture

We value **Clean Architecture** and **Decoupled Logic**. Understanding these principles will help you write code that aligns with the project's philosophy.

### 📂 Directory Structure

```
src/
├── core/                  # @concatenator/core (engine & services)
│   ├── ignore/
│   │   └── IgnoreEngine.ts  # picomatch-based rule compiler, last-match-wins
│   ├── VFSHydrator.ts       # Pure batch hydration layer — returns Map<string, HydratedFile>
│   ├── VFSManager.ts        # VFS flat-map state (root pruning, directory absorption)
│   ├── TokenService.ts      # BPE / heuristic token counting
│   ├── SecretScanner.ts     # PII masking & backtick neutralization
│   ├── types.ts             # Core types: FileItem, IgnoreSource, ValidationResult
│   └── ...
├── cli/                   # @concatenator/cli (Commander.js commands)
│   └── index.ts
├── web/                   # @concatenator/web (React 19 workbench)
│   ├── features/
│   │   └── concatenator/
│   │       ├── components/  # FileTable, TreeNode, UploadZone, QuickLook
│   │       └── hooks/       # useFileProcessing, useFileTree
│   ├── hooks/               # useWorkbench, useTokenAggregation, useLocalStorage
│   ├── components/          # StatusBar, ModeSwitch
│   └── context/             # ModeContext
├── lib/                   # Shared utilities (utils.ts, fileIcons.tsx, logger.ts)
├── App.tsx                # Web container
└── main.tsx               # Entry point (PostHog initialized outside React tree)

e2e/                # End-to-end tests (Playwright)
├── *.spec.ts       # E2E test files
├── fixtures/       # Custom test fixtures and apiContext helpers
└── helpers/        # FileUploadHelper, sidebar helpers

tests/              # Unit tests (Vitest)
└── *.test.ts
```

### 🧩 Architectural Principles

1. **Separation of Concerns**: UI components should focus on presentation. Business logic lives in hooks and `lib/` utilities.

2. **Decoupled Logic**: Functions in `lib/` should be pure and have no side effects. They receive inputs and return outputs without depending on React or browser APIs.

3. **Hook-Based State Management**: Complex state logic is encapsulated in custom hooks (e.g., `useFileOperations`, `useIgnoreList`) rather than scattered across components.

4. **Type Safety**: All functions should have explicit TypeScript types. Avoid `any` when possible.

### Example: Adding a New Feature

When adding functionality, follow this pattern:

```typescript
// 1. Define types in types.ts
export interface MyFeatureOptions {
  files: FileNode[];
  format: 'text' | 'pdf';
}

// 2. Implement pure logic in lib/
// src/lib/myFeature.ts
export function processFeature(options: MyFeatureOptions): Result {
  // Pure function - no React, no side effects
  return transformedData;
}

// 3. Create a hook for state management
// src/hooks/useMyFeature.ts
export function useMyFeature() {
  const [state, setState] = useState(...);

  const execute = useCallback((options) => {
    const result = processFeature(options);
    setState(result);
  }, []);

  return { state, execute };
}

// 4. Use in a component
// src/components/MyFeatureComponent.tsx
export function MyFeatureComponent() {
  const { state, execute } = useMyFeature();
  // Component focuses on UI only
}
```

---

## 🧪 Testing Stack

### 🧪 Unit Tests (Vitest)

We use **Vitest** for unit testing. Unit tests focus on:

- Pure functions in `lib/`
- Custom hooks in `hooks/`
- Utility functions

**Location**: `tests/` directory

**Running unit tests**:

```bash
npm test              # Run once
npm run test:coverage # Run with coverage report
```

**Writing unit tests**:

```typescript
import { describe, it, expect } from 'vitest'
import { parseConcatenatedContent } from '../src/lib/parser'

describe('parseConcatenatedContent', () => {
  it('should extract files from concatenated content', () => {
    const content = '--- FILE: test.js ---\nconst x = 1;'
    const result = parseConcatenatedContent(content)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('test.js')
  })
})
```

### 🎭 E2E Tests (Playwright)

We use **Playwright** for end-to-end testing. E2E tests focus on:

- Critical user flows (concatenation, de-concatenation)
- File System Access API interactions
- Cross-browser compatibility

**Location**: `e2e/` directory

**Running E2E tests**:

```bash
npm run test:e2e          # Headless mode (CI)
npm run test:e2e:ui       # Interactive UI mode
npm run test:e2e:headed   # Visible browser
npm run test:e2e:debug    # Debug mode with step-through
```

**Important notes for E2E tests**:

- Tests use worker-specific `.concatenate-ignore` files to ensure isolation
- The `x-worker-id` header is used to route requests to the correct ignore file
- File System Access API requires Chrome/Edge browsers (Playwright's Chromium is used)

**Writing E2E tests**:

```typescript
import { test, expect, resetIgnoreList } from './fixtures'
import { FileUploadHelper } from './helpers/file-upload'

test('default ignored paths render the reason badge', async ({
  page,
  apiContext,
}) => {
  await resetIgnoreList(apiContext)
  await page.goto('/')

  const uploadHelper = new FileUploadHelper(page)
  try {
    // Use the native DOM input upload path — compatible with all browsers including WebKit.
    // Do NOT use synthetic DataTransfer drops: WebKit's security sandbox blocks programmatic
    // FileSystemEntry construction, making readEntries() and webkitGetAsEntry() non-functional.
    await uploadHelper.setFilesOnInput([
      {
        name: 'index.js',
        path: 'node_modules/lodash/index.js',
        content: '// lodash',
      },
    ])
    const row = page
      .locator('[data-path="node_modules/lodash/index.js"]')
      .first()
    await expect(row).toHaveAttribute('data-ignored', 'true')
    await expect(row.locator('span.font-mono')).toContainText('node_modules')
    await expect(row.locator('span.font-mono')).toContainText('(default)')
  } finally {
    uploadHelper.cleanup()
  }
})
```

### Test Coverage

We aim for high test coverage on core logic. Coverage reports are generated automatically in CI and uploaded to Codecov.

---

## 🚀 Pull Request Process

### Before You Start

1. **Check existing issues**: Look for existing issues or discussions related to your change.
2. **Create an issue** (optional but recommended): For significant changes, create an issue to discuss the approach first.

### 🛤️ Workflow

1. **Create a feature branch**:

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

   **Branch Naming Convention**: Use the format `type/description` where `type` matches [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) types:
   - `feat/` — New features (e.g., `feat/add-maxFilesLimit`)
   - `fix/` — Bug fixes (e.g., `fix/correct-concatenate-ignore-handling`)
   - `docs/` — Documentation changes (e.g., `docs/update-security-policy`)
   - `refactor/` — Code refactoring (e.g., `refactor/simplify-parser-logic`)
   - `test/` — Test additions or fixes (e.g., `test/add-e2e-coverage`)
   - `chore/` — Maintenance tasks (e.g., `chore/update-dependencies`)

2. **Make your changes**:
   - Follow the [Code Style & Standards](#code-style--standards)
   - Keep commits atomic and focused
   - Write clear commit messages

3. **Run quality checks**:

   ```bash
   npm run lint        # TypeScript type checking
   npm test            # Unit tests
   npm run test:e2e    # E2E tests (required for UI flows; see below)
   npm run test:release # Audit release integrity (required for releases)
   ```

   **What constitutes "UI Flows"?** E2E tests are required for changes touching:
   - `src/web/features/concatenator/components/*` — Any React component changes
   - Motion animations — Motion/transition changes
   - File upload / drag-and-drop interactions — always use `FileUploadHelper.setFilesOnInput`; never use synthetic `DataTransfer` or `readEntries()` mocks (WebKit sandbox incompatible)
   - Mode toggles, output format changes, ignore list mutations

4. **Update documentation**:
   - Update `README.md` if adding new features
   - Update `QUICKSTART.md` if changing user-facing behavior
   - Add JSDoc comments for new public functions

5. **Submit your PR**:
   - Use a PR title following [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) format (e.g., `feat: add PDF export option`)
   - Fill out the PR template completely
   - Link any related issues (use `Fixes #123` to auto-close)
   - Ensure all CI checks pass

### PR Review Criteria

Your PR will be reviewed for:

- **Correctness**: Does it solve the stated problem?
- **Architecture**: Does it follow Clean Architecture and Decoupled Logic principles?
- **Testing**: Are there adequate tests? Do they pass?
- **Documentation**: Is the change documented?
- **Security**: Does it maintain our security standards (especially regarding API key handling)?

### After Merge

- Your contribution will be acknowledged in the release notes
- The `main` branch will be automatically deployed (if applicable)

---

## Code Style & Standards

### TypeScript

- Enable strict mode features
- Avoid `any` - use `unknown` with type guards when necessary
- Use explicit return types on exported functions

### React

- Use functional components with hooks
- Keep components focused - split when they grow too large
- Use `useCallback` and `useMemo` appropriately for performance

### CSS/Styling

- Use Tailwind CSS for styling
- Prefer semantic class names over arbitrary values
- All UI components must support both **light and dark themes**

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) format:

```
type(scope): subject

body (optional)

footer (optional)
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

See [conventionalcommits.org](https://www.conventionalcommits.org/en/v1.0.0/#summary) for the full specification.

Examples:

```
feat(parser): add support for binary file detection
fix(ui): resolve dark mode flicker on initial load
docs(readme): update installation instructions
```

---

## Community Standards

All contributors are expected to adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md). Please review it before participating.

## Questions & Reporting Issues

### ❓ General Questions

- Open a [GitHub Discussion](https://github.com/Kolla-Engineering-Labs/concatenator/discussions)

### 🐞 Bug Reports (Non-Security)

For functional bugs, crashes, or unexpected behavior:

- Use the [Bug Report template](https://github.com/Kolla-Engineering-Labs/concatenator/issues/new?template=bug_report.md)
- Provide browser version, steps to reproduce, and log levels

### 🔒 Security Vulnerabilities

**⚠️ Critical**: Do not report security vulnerabilities via public GitHub Issues.

- Use GitHub's **Private Vulnerability Reporting** (Security tab → "Report a vulnerability")
- Or visit: `https://github.com/Kolla-Engineering-Labs/concatenator/security/advisories/new`
- See [SECURITY.md](./SECURITY.md) for our full security policy

### Feature Requests

- Use the [Feature Request template](https://github.com/Kolla-Engineering-Labs/concatenator/issues/new?template=feature_request.md)

---

Thank you for contributing to Concatenator! Your efforts help make this tool better for developers worldwide.
