---
name: Bug Report
description: Report a bug to help us improve Concatenator
title: '[BUG] '
labels: ['bug']
assignees: []
---

## Bug Description

> _A clear and concise description of what the bug is_

## Steps to Reproduce

> _Provide detailed steps to reproduce the bug_

1. Go to '...'
2. Click on '...'
3. Drag and drop '...'
4. See error

## Expected Behavior

> _A clear and concise description of what you expected to happen_

## Actual Behavior

> _A clear and concise description of what actually happened_

## Screenshots / Logs

> _If applicable, add screenshots or log output to help explain the problem_

### Log Level

> _What log level was set when the issue occurred? Check the browser console or your .env file_

- [ ] `debug` (verbose logging enabled)
- [ ] `info` (default logging level)
- [ ] `error` (only errors logged)
- [ ] Unknown / Not applicable

### Console Output

> _Paste relevant console logs here (if any)_

```
[Paste console output here]
```

## Environment

### Browser

> _Concatenator relies on the File System Access API. Browser version is critical for bug reports._

- **Browser**: <!-- e.g., Chrome, Edge, Firefox, Safari -->
- **Version**: <!-- e.g., 124.0.6367.60 -->
- **OS**: <!-- e.g., Windows 11, macOS 14, Ubuntu 22.04 -->

To find your browser version:

- **Chrome/Edge**: `chrome://version` or `edge://version` in the address bar
- **Firefox**: Menu (≡) → Help → About Firefox
- **Safari**: Safari menu → About Safari

### Application Details

- **Concatenator Version**: <!-- If known, e.g., commit hash or release version -->
- **Running Mode**: <!-- Development (`npm run dev`) or Production build -->
- **Node.js Version** (if running locally): <!-- e.g., v20.12.0 -->

## File Details

> _Since Concatenator processes files, these details help diagnose issues_

- **File Type**: <!-- e.g., .txt, .js, .ts, mixed directory -->
- **Approximate File Count**: <!-- Number of files being processed -->
- **File Size Range**: <!-- Approximate size of files (small <1MB, medium 1-50MB, large >50MB) -->
- **Special Characters**: <!-- Any non-ASCII characters, emojis, or unusual encoding in file names? -->

## Mode

> _Which Concatenator mode were you using?_

- [ ] Concatenate (merging files into one)
- [ ] De-concatenate (extracting from .txt file)

## Ignore List / Configuration

> _Were you using any custom ignore patterns?_

- [ ] Default ignore list only
- [ ] Custom ignore patterns (please list below)

### Custom Patterns (if applicable)

```
[List your custom ignore patterns here]
```

## Additional Context

> _Add any other context about the problem here_

## Checklist

> _Please verify the following before submitting_

- [ ] I have searched existing issues to ensure this bug has not already been reported
- [ ] I have provided clear steps to reproduce the issue
- [ ] I have included my browser version (critical for File System Access API issues)
- [ ] I have checked the browser console for error messages
- [ ] I can reproduce this issue consistently (not a one-time occurrence)
