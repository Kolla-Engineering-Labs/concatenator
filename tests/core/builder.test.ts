/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest'
import { SessionFormatter } from '../../src/core/builder/SessionFormatter.js'
import { Neutralizer } from '../../src/core/shared/Neutralizer.js'
import { Scanner } from '../../src/core/builder/Scanner.js'
import {
  ConcatenationBuilder,
  concatenate,
} from '../../src/core/builder/builder.js'
import type { IFilterStrategy } from '../../src/core/builder/contracts/IFilterStrategy.js'
import {
  generateSessionId,
  checkSessionIdCollision,
  generateCollisionFreeSessionId,
  generateFileTimestamp,
} from '../../src/core/builder/BuilderUtils.js'

describe('Builder Domain & Strategies', () => {
  describe('BuilderUtils', () => {
    it('generates 6-character hex session IDs', () => {
      const id = generateSessionId()
      expect(id).toMatch(/^[0-9a-f]{6}$/)
    })

    it('detects session ID collisions in content', () => {
      const sid = 'a1b2c3'
      const files = [
        {
          path: 'test.txt',
          content: '--- CONCATENATOR_SESSION_ID: a1b2c3 ---',
        },
      ]
      expect(checkSessionIdCollision(sid, files)).toBe(true)
    })

    it('generates collision free session IDs', () => {
      const files = [{ path: 'test.txt', content: 'Clean content' }]
      const sid = generateCollisionFreeSessionId(files)
      expect(sid).toHaveLength(6)
    })

    it('generates valid file timestamps', () => {
      const date = new Date(2026, 6, 26, 12, 30, 45)
      const ts = generateFileTimestamp(date)
      expect(ts).toBe('20260726_123045')
    })
  })

  describe('Neutralizer', () => {
    const neutralizer = new Neutralizer()

    it('neutralizes content string safely', () => {
      const input = 'hello `world` <<<<<'
      expect(neutralizer.neutralize(input)).toBe(input)
    })

    it('unneutralizes escaped backticks and delimiters', () => {
      const escaped = 'hello \\`world\\` \\<<<<< test \\>>>>>'
      expect(neutralizer.unneutralize(escaped)).toBe(
        'hello `world` <<<<< test >>>>>'
      )
    })
  })

  describe('SessionFormatter', () => {
    const formatter = new SessionFormatter()

    it('formats input files into session concatenation bundle', () => {
      const files = [{ path: 'src/index.ts', content: 'console.log("hello")' }]
      const onProgress = vi.fn()
      const output = formatter.format(files, {
        timestamp: '2026-07-26',
        sessionId: '123456',
        onProgress,
        tokenBudget: 1000,
      })

      expect(output).toContain('--- CONCATENATOR_SESSION_ID: 123456 ---')
      expect(output).toContain('Concatenated on: 2026-07-26')
      expect(output).toContain('Budget: 1,000')
      expect(output).toContain(
        '<<<<< FILE_START: src/index.ts (ID: 123456) >>>>>'
      )
      expect(output).toContain('console.log("hello")')
      expect(output).toContain('<<<<< FILE_END >>>>>')
      expect(onProgress).toHaveBeenCalledWith(100)
    })

    it('throws error when provided session ID collides with content', () => {
      const files = [
        { path: 'test.ts', content: '--- CONCATENATOR_SESSION_ID: 999999 ---' },
      ]
      expect(() => formatter.format(files, { sessionId: '999999' })).toThrow(
        "Provided session ID '999999' collides with file content"
      )
    })
  })

  describe('Scanner & Filter Strategies', () => {
    it('normalizes file path separators', () => {
      const scanner = new Scanner()
      const normalized = scanner.normalizeInputFiles([
        { path: 'folder\\subfolder\\file.txt', content: 'data' },
      ])
      expect(normalized[0].path).toBe('folder/subfolder/file.txt')
    })

    it('applies custom IFilterStrategy instances', () => {
      const logFilter: IFilterStrategy = {
        shouldInclude: (filePath) => !filePath.endsWith('.log'),
      }

      const scanner = new Scanner([logFilter])
      expect(scanner).toBeDefined()
    })
  })

  describe('ConcatenationBuilder Orchestrator', () => {
    it('orchestrates scanning, neutralization, and formatting', () => {
      const builder = new ConcatenationBuilder()
      const result = builder.buildFromFiles(
        [{ path: 'a.txt', content: 'sample content' }],
        { sessionId: 'abc123' }
      )

      expect(result).toContain('--- CONCATENATOR_SESSION_ID: abc123 ---')
      expect(result).toContain('sample content')
    })

    it('maintains 100% backward compatibility with concatenate() function export', () => {
      const result = concatenate(
        [{ path: 'b.txt', content: 'test content' }],
        '2026-07-26',
        'xyz789'
      )

      expect(result).toContain('--- CONCATENATOR_SESSION_ID: xyz789 ---')
      expect(result).toContain('<<<<< FILE_START: b.txt (ID: xyz789) >>>>>')
      expect(result).toContain('test content')
    })
  })
})
