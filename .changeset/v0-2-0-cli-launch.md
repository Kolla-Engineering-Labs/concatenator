---
'concatenator': minor
---

v0.2.0: Professional CLI Launch

This release introduces a powerful command-line interface for headless workflows and CI/CD integration.

### New Features

**CLI Commands**
- `concatenator concat <path>` - Bundle directories into LLM-ready files with `-o`, `-e`, and `-v` options
- `concatenator extract <file>` - Restore projects via file explosion or ZIP output with `--zip`, `--dry-run`, and `--force` flags
- `concatenator validate <file>` - Verify concatenated file integrity with segmented marker analysis

**Validation & Safety**
- Segmented validation with foreign marker detection for handling multi-session files
- Dynamic session boundary system preventing self-hosting conflicts
- Unified dry-run mode for safe extraction previews
- `--force` flag for controlled overwrites

**Developer Experience**
- Professional error messages with actionable guidance
- Multi-level verbosity (`-v`, `-vv`) for debugging
- Exit codes for shell scripting integration

Install globally: `npm link` or run via `npm run dev:cli -- [command]`