# E2E Tests for Concatenator

This directory contains end-to-end tests using Playwright for the Concatenator application.

## Test Structure

```
e2e/
├── README.md                    # This file
├── concatenate.spec.ts          # Concatenate mode tests
├── deconcatenate.spec.ts        # De-concatenate mode tests
├── ui-interactions.spec.ts      # UI interaction tests
├── file-chooser.spec.ts         # File chooser dialog tests
├── helpers/
│   └── file-upload.ts           # File upload helpers
└── fixtures/
    └── test-data.ts             # Test data fixtures
```

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run tests with UI mode (for debugging)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Run specific test file
```bash
npx playwright test concatenate.spec.ts
```

### Run tests in debug mode
```bash
npm run test:e2e:debug
```

## Test Coverage

### Concatenate Mode Tests (`concatenate.spec.ts`)

1. **File Upload via Drag and Drop**
   - Accept directory drag and drop
   - Handle nested directory structure
   - Show processing state during upload

2. **Ignore List Management**
   - Add ignore patterns
   - Remove ignore patterns
   - Support regex ignore patterns

3. **Theme Toggle**
   - Toggle between light and dark mode
   - Persist theme preference

4. **Settings Modal**
   - Open and close settings modal
   - Save API keys to localStorage
   - Load saved API keys on page load

5. **View Mode Toggle**
   - Switch between list and tree view
   - Persist view mode preference

6. **File Actions**
   - Ignore individual files from the list
   - Remove files from selection
   - Clear all files

7. **Concatenate & Download**
   - Enable concatenate button when files are present
   - Download concatenated file

### De-concatenate Mode Tests (`deconcatenate.spec.ts`)

1. **Mode Switching**
   - Switch to de-concatenate mode
   - Clear files when switching modes

2. **File Upload**
   - Accept concatenated text file via drag and drop
   - Show error for invalid file format

3. **ZIP Download**
   - Download files as ZIP after de-concatenation
   - Preserve directory structure in ZIP
   - Handle special characters in filenames

4. **Large File Handling**
   - Handle large concatenated files
   - Handle files with large content

5. **Error Handling**
   - Handle empty concatenated file
   - Handle malformed file markers
   - Handle binary-looking content gracefully

6. **UI State**
   - Show appropriate dropzone message
   - Not show ignore list in de-concatenate mode
   - Not show file view initially

### UI Interactions (`ui-interactions.spec.ts`)

1. **Minimize/Maximize Panels**
   - Minimize and maximize dropzone
   - Minimize and maximize ignore list

2. **Keyboard Interactions**
   - Add ignore pattern with Enter key
   - Close settings modal with Escape key

3. **Responsive Behavior**
   - Adapt layout on mobile viewport
   - Handle file list on narrow screens

4. **Drag and Drop Visual Feedback**
   - Show visual feedback on drag over
   - Handle drag leave gracefully

5. **localStorage Persistence**
   - Persist minimize state of dropzone
   - Persist minimize state of ignore list

6. **Concurrent Actions**
   - Handle rapid mode switching
   - Handle mode switch during file processing

7. **Accessibility**
   - Proper button titles
   - Focusable elements
   - Settings inputs have labels

### File Chooser Tests (`file-chooser.spec.ts`)

#### File Upload via File Chooser

1. **Single File Upload** - Upload a single file via native file chooser
2. **Multiple Files Upload** - Upload multiple files at once
3. **Upload with Directory Structure** - Preserve nested directory paths during upload
4. **De-concatenate File Upload** - Upload concatenated files in de-concatenate mode
5. **Non-txt File Rejection** - Reject non-text files in de-concatenate mode

#### File Upload with Test Fixtures

1. **Simple Project Fixture** - Upload using `SIMPLE_PROJECT` fixture data
2. **React Project Fixture** - Upload using `REACT_PROJECT` fixture data

## Test Fixtures

The `fixtures/test-data.ts` file provides reusable test data:

- `SIMPLE_PROJECT` - Basic project with a few files
- `REACT_PROJECT` - React/TypeScript project structure
- `PYTHON_PROJECT` - Python project with tests
- `FILES_WITH_EXTENSIONS_TO_IGNORE` - Files with various extensions
- `FILES_WITH_SPECIAL_NAMES` - Files with spaces, dashes, etc.
- `LARGE_BATCH` - 50 files for testing performance
- `NESTED_DEEP_STRUCTURE` - Deeply nested directory structure
- `BINARY_LIKE_CONTENT` - Files with special content

## File Upload Helpers

The `helpers/file-upload.ts` provides utilities for simulating file uploads:

- `dragAndDropDirectory(files)` - Simulates drag-and-drop
- `setFilesOnInput(files)` - Uses native file input
- `uploadSingleFile(name, content)` - Upload a single file

## Tips for Writing Tests

1. **Use fixtures** for common test data
2. **Use helpers** for file upload operations
3. **Add proper timeouts** for file processing operations
4. **Clean up** temporary files after tests
5. **Use semantic selectors** (role, text) instead of CSS when possible

## Known Limitations

1. Drag-and-drop directory simulation is limited by browser APIs
2. Actual file system operations require temp file creation
3. ZIP content verification requires reading the downloaded file
