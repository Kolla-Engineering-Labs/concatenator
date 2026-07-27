/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { resolveAndJail } from '../../src/core/PathValidator.js'
import {
  SymlinkRejectedError,
  PathTraversalError,
} from '../../src/core/errors.js'
import {
  TokenService,
  PrecisionStrategy,
  ITiktokenEncoder,
} from '../../src/core/TokenService.js'
import { TreeItem } from '../../src/core/types.js'

describe('VFS Security Boundaries & TokenService Edge-Case Audit Suite', () => {
  let tempDir: string

  beforeEach(() => {
    const rawTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vfs-security-audit-')
    )
    tempDir = fs.realpathSync(rawTempDir)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('PathValidator Security Boundary Controls', () => {
    it('rejects empty target path with PathTraversalError', () => {
      expect(() => resolveAndJail('', tempDir)).toThrow(PathTraversalError)
      expect(() => resolveAndJail('', tempDir)).toThrow(
        'Invalid target path: path cannot be empty'
      )
    })

    it('rejects null byte injections in rootDir with PathTraversalError', () => {
      expect(() => resolveAndJail('file.txt', `root\0dir`)).toThrow(
        PathTraversalError
      )
      expect(() => resolveAndJail('file.txt', `root\0dir`)).toThrow(
        'Security Violation: Path contains null bytes'
      )
    })

    it('rejects null byte injections in targetPath with PathTraversalError', () => {
      expect(() => resolveAndJail('nested/path\0/file.txt', tempDir)).toThrow(
        PathTraversalError
      )
    })

    it('rejects leading slash absolute path injections', () => {
      expect(() => resolveAndJail('/etc/shadow', tempDir)).toThrow(
        PathTraversalError
      )
      expect(() => resolveAndJail('/etc/shadow', tempDir)).toThrow(
        'Security Violation: Absolute path injection rejected'
      )
    })

    it('rejects leading backslash absolute path injections', () => {
      expect(() => resolveAndJail('\\Windows\\System32', tempDir)).toThrow(
        PathTraversalError
      )
    })

    it('rejects Windows drive letter absolute path injections', () => {
      expect(() =>
        resolveAndJail('C:\\Windows\\explorer.exe', tempDir)
      ).toThrow(PathTraversalError)
      expect(() => resolveAndJail('E:/secret/payload.bin', tempDir)).toThrow(
        PathTraversalError
      )
    })

    it('detects intermediate symlinks in directory path and throws SymlinkRejectedError', () => {
      const realSubDir = path.join(tempDir, 'real-sub-dir')
      fs.mkdirSync(realSubDir)
      const realFile = path.join(realSubDir, 'secret.txt')
      fs.writeFileSync(realFile, 'top secret content')

      const symlinkSubDir = path.join(tempDir, 'symlink-sub-dir')

      try {
        fs.symlinkSync(realSubDir, symlinkSubDir, 'dir')
      } catch {
        // Skip OS-level symlink assertion if non-privileged execution on Windows
        return
      }

      expect(() => {
        resolveAndJail('symlink-sub-dir/secret.txt', tempDir)
      }).toThrow(SymlinkRejectedError)
    })

    it('rejects parent traversal escaping root jail boundary', () => {
      expect(() => resolveAndJail('../outside.txt', tempDir)).toThrow(
        PathTraversalError
      )
      expect(() =>
        resolveAndJail('a/b/../../../../etc/passwd', tempDir)
      ).toThrow(PathTraversalError)
    })
  })

  describe('TokenService Resilience & Overflow Boundaries', () => {
    it('PrecisionStrategy gracefully falls back to Heuristic when encoder throws an error', () => {
      const faultyEncoder: ITiktokenEncoder = {
        encode: () => {
          throw new Error('Simulated BPE Encoder Failure')
        },
      }
      const strategy = new PrecisionStrategy(faultyEncoder, 'o200k_base')
      const text = 'Fallback Heuristic Sample Text' // 30 characters -> Math.ceil(30/4) = 8
      const result = strategy.calculate(text)

      expect(result.model).toBe('heuristic')
      expect(result.count).toBe(8)
    })

    it('hashContent handles empty strings with sentinel key', () => {
      expect(TokenService.hashContent('')).toBe('empty')
    })

    it('hashContent executes sampling algorithm for massive strings (>3000 chars) without main thread lockup', () => {
      const massiveString = 'A'.repeat(5000)
      const hash = TokenService.hashContent(massiveString)

      expect(typeof hash).toBe('string')
      expect(hash).toContain(':')
      // (5000).toString(36) is '3uw'
      expect(hash.endsWith(':' + (5000).toString(36))).toBe(true)
    })

    it('generateContextMetadata formats tokens and budget with locale separators', () => {
      const metaWithoutBudget = TokenService.generateContextMetadata(1234567)
      expect(metaWithoutBudget).toBe('--- METADATA: Tokens: 1,234,567 ---')

      const metaWithBudget = TokenService.generateContextMetadata(
        1234567,
        2000000
      )
      expect(metaWithBudget).toBe(
        '--- METADATA: Tokens: 1,234,567 | Budget: 2,000,000 ---'
      )
    })

    it('computeTreeWeights correctly calculates directory weights with mixed ignored and unignored files', () => {
      const tree: TreeItem = {
        name: 'root',
        path: 'root',
        kind: 'directory',
        children: [
          {
            name: 'valid.txt',
            path: 'root/valid.txt',
            kind: 'file',
            file: {
              name: 'valid.txt',
              path: 'root/valid.txt',
              kind: 'file',
              content: '12345678', // 8 chars -> 2 tokens (heuristic)
              size: 8,
            },
          },
          {
            name: 'ignored.txt',
            path: 'root/ignored.txt',
            kind: 'file',
            isIgnored: true,
            file: {
              name: 'ignored.txt',
              path: 'root/ignored.txt',
              kind: 'file',
              content: '1234567890123456',
              size: 16,
            },
          },
        ],
      }

      const result = TokenService.computeTreeWeights(tree)
      expect(result.tokens).toBe(2)
      expect(tree.tokenWeight).toBe(2)
    })
  })
})
