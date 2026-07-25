/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { resolveAndJail, PathValidator } from '../../src/core/PathValidator'
import { SymlinkRejectedError, PathTraversalError } from '../../src/core/errors'

describe('PathValidator (resolveAndJail)', () => {
  let tempDir: string

  beforeEach(() => {
    const rawTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'path-validator-test-')
    )
    tempDir = fs.realpathSync(rawTempDir)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('resolves valid relative file path within root jail', () => {
    const filePath = 'src/utils/math.ts'
    const result = resolveAndJail(filePath, tempDir)

    expect(result).toBe(path.resolve(tempDir, filePath))
    expect(result.startsWith(tempDir)).toBe(true)
  })

  it('handles non-existent target files (ENOENT trap) during de-concatenation gracefully', () => {
    const nonExistentPath = 'deep/nested/new-file.txt'
    const result = resolveAndJail(nonExistentPath, tempDir)

    expect(result).toBe(path.resolve(tempDir, nonExistentPath))
  })

  it('rejects symbolic links with a deterministic SymlinkRejectedError', () => {
    const realDir = path.join(tempDir, 'real-folder')
    fs.mkdirSync(realDir)
    const targetFile = path.join(realDir, 'target.txt')
    fs.writeFileSync(targetFile, 'content')

    const symlinkPath = path.join(tempDir, 'link-folder')

    // On Windows, symlink creation might require privileges; try/catch fallback for cross-platform robustness
    try {
      fs.symlinkSync(realDir, symlinkPath, 'dir')
    } catch {
      // If symlink creation fails due to platform permissions, skip OS-level symlink creation test gracefully
      return
    }

    expect(() => {
      resolveAndJail('link-folder/target.txt', tempDir)
    }).toThrow(SymlinkRejectedError)
  })

  it('rejects path traversal attempts escaping root directory with PathTraversalError', () => {
    expect(() => {
      resolveAndJail('../../etc/passwd', tempDir)
    }).toThrow(PathTraversalError)

    expect(() => {
      resolveAndJail('../outside.txt', tempDir)
    }).toThrow(PathTraversalError)
  })

  it('exports PathValidator object with resolveAndJail method', () => {
    expect(PathValidator.resolveAndJail).toBe(resolveAndJail)
  })
})
