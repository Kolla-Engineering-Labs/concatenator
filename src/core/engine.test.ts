/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import {
  concatenate,
  deconcatenate,
  sanitizePath,
  dedupePath,
  generateSessionId,
} from './engine'

describe('engine', () => {
  describe('generateSessionId', () => {
    it('generates a 6-character hex string', () => {
      const id = generateSessionId()
      expect(id).toMatch(/^[0-9a-f]{6}$/)
    })

    it('generates different IDs on each call', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 10; i++) {
        ids.add(generateSessionId())
      }
      expect(ids.size).toBe(10)
    })
  })

  describe('concatenate', () => {
    it('concatenates files with session-based manifest header', () => {
      const files = [
        { path: 'file1.txt', content: 'Hello' },
        { path: 'file2.txt', content: 'World' },
      ]
      const result = concatenate(files, '2024-01-01')

      // Check manifest header
      expect(result).toMatch(/--- CONCATENATOR_SESSION_ID: [0-9a-f]{6} ---/)
      expect(result).toContain('Concatenated on: 2024-01-01')

      // Check session-specific markers
      expect(result).toMatch(/<<<<< FILE_START: file1\.txt \(ID: [0-9a-f]{6}\) >>>>>/)
      expect(result).toContain('Hello')
      expect(result).toContain('<<<<< FILE_END >>>>>')
      expect(result).toMatch(/<<<<< FILE_START: file2\.txt \(ID: [0-9a-f]{6}\) >>>>>/)
      expect(result).toContain('World')
    })

    it('uses provided session ID when given', () => {
      const files = [{ path: 'test.txt', content: 'content' }]
      const result = concatenate(files, '2024-01-01', 'abc123')

      expect(result).toContain('--- CONCATENATOR_SESSION_ID: abc123 ---')
      expect(result).toContain('<<<<< FILE_START: test.txt (ID: abc123) >>>>>')
    })

    it('throws error when session ID manifest header collides with content', () => {
      const files = [
        { path: 'test.txt', content: '--- CONCATENATOR_SESSION_ID: abc123 ---' },
      ]
      expect(() => concatenate(files, '2024-01-01', 'abc123')).toThrow(
        "Provided session ID 'abc123' collides with file content"
      )
    })

    it('throws error when session ID marker core collides with content', () => {
      // The marker core pattern (ID: {sessionId}){END_DELIMITER} would cause parsing issues
      const files = [{ path: 'test.txt', content: 'some (ID: abc123) >>>>> text' }]
      expect(() => concatenate(files, '2024-01-01', 'abc123')).toThrow(
        "Provided session ID 'abc123' collides with file content"
      )
    })

    it('does not throw for raw session ID appearing in content (only checks complete patterns)', () => {
      // Raw session ID in content is fine - only the complete manifest/marker patterns matter
      const files = [{ path: 'test.txt', content: 'This contains abc123 and more text' }]
      // Should not throw because abc123 doesn't appear in a problematic pattern
      const result = concatenate(files, '2024-01-01', 'abc123')
      expect(result).toContain('--- CONCATENATOR_SESSION_ID: abc123 ---')
    })
  })

  describe('deconcatenate', () => {
    it('extracts files from session-based concatenated content', () => {
      const files = [
        { path: 'file1.txt', content: 'Hello' },
        { path: 'file2.txt', content: 'World' },
      ]
      const concatenated = concatenate(files, '2024-01-01')
      const result = deconcatenate(concatenated)

      expect(result.foundAny).toBe(true)
      expect(result.files).toHaveLength(2)
      expect(result.files[0].path).toBe('file1.txt')
      expect(result.files[0].content).toBe('Hello')
      expect(result.files[1].path).toBe('file2.txt')
      expect(result.files[1].content).toBe('World')
    })

    it('handles empty input', () => {
      const result = deconcatenate('')
      expect(result.foundAny).toBe(false)
      expect(result.files).toHaveLength(0)
    })

    it('handles malformed content gracefully', () => {
      const malformed = '--- CONCATENATOR_SESSION_ID: abc123 ---\n\n<<<<< FILE_START: file.txt (ID: abc123) >>>>>missing end marker'
      const result = deconcatenate(malformed)
      expect(result.foundAny).toBe(false)
      expect(result.skippedPaths).toContain('file.txt')
    })

    it('ignores foreign/legacy delimiters (self-hosting test)', () => {
      // This simulates concatenating the concatenator's own source code
      // which contains the old delimiter strings in constants
      const files = [
        { path: 'src/constants.ts', content: "const START_DELIMITER = '<<<<< FILE_START: '" },
        { path: 'src/engine.ts', content: 'function deconcatenate() { /* uses markers */ }' },
      ]

      // Create a new session-based concatenation
      const concatenated = concatenate(files, '2024-01-01', 'xyz789')

      // Add some fake old-format delimiters in the middle (simulating self-hosting paradox)
      const poisonedContent = concatenated.replace(
        '<<<<< FILE_START: src/engine.ts (ID: xyz789) >>>>>',
        '<<<<< FILE_START: src/engine.ts (ID: xyz789) >>>>>\n<<<<< FILE_START: fake.txt >>>>>fake content<<<<< FILE_END >>>>>\n'
      )

      const result = deconcatenate(poisonedContent)

      // Should only extract the real files from our session, ignore the fake old-format one
      expect(result.foundAny).toBe(true)
      expect(result.files).toHaveLength(2)
      expect(result.files.map(f => f.path)).toContain('src/constants.ts')
      expect(result.files.map(f => f.path)).toContain('src/engine.ts')
      // fake.txt should not appear because it's not in our session
      expect(result.files.map(f => f.path)).not.toContain('fake.txt')
    })

    it('handles backwards compatibility with legacy format', () => {
      // Old format without manifest header
      const legacyContent = `Concatenated on: 2024-01-01

<<<<< FILE_START: legacy.txt >>>>>
legacy content
<<<<< FILE_END >>>>>
`
      const result = deconcatenate(legacyContent)

      expect(result.foundAny).toBe(true)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('legacy.txt')
      expect(result.files[0].content).toBe('legacy content')
    })
  })

  describe('round-trip', () => {
    it('preserves file content through concatenate and deconcatenate', () => {
      const originalFiles = [
        { path: 'src/utils.ts', content: 'export const add = (a: number, b: number) => a + b' },
        { path: 'src/main.ts', content: 'import { add } from "./utils"\n\nconsole.log(add(2, 3))' },
        { path: 'README.md', content: '# My Project\n\nA sample project.' },
      ]

      // Concatenate
      const concatenated = concatenate(originalFiles)

      // Deconcatenate
      const result = deconcatenate(concatenated)

      // Verify
      expect(result.foundAny).toBe(true)
      expect(result.files).toHaveLength(3)
      expect(result.skippedPaths).toHaveLength(0)

      // Match paths and content
      for (const original of originalFiles) {
        const extracted = result.files.find(f => f.path === original.path)
        expect(extracted).toBeDefined()
        expect(extracted!.content).toBe(original.content)
      }
    })

    it('handles nested directory structures', () => {
      const originalFiles = [
        { path: 'deep/nested/path/file.txt', content: 'Deep content' },
        { path: 'root.txt', content: 'Root content' },
      ]

      const concatenated = concatenate(originalFiles)
      const result = deconcatenate(concatenated)

      expect(result.files).toHaveLength(2)
      expect(result.files.map(f => f.path).sort()).toEqual(['deep/nested/path/file.txt', 'root.txt'].sort())
    })

    it('handles special characters in content', () => {
      const originalFiles = [
        { path: 'special.txt', content: 'Special <>&"\' chars and unicode: 🎉 日本語' },
        { path: 'code.txt', content: 'function test() {\n  return "test";\n}' },
      ]

      const concatenated = concatenate(originalFiles)
      const result = deconcatenate(concatenated)

      expect(result.files).toHaveLength(2)
      expect(result.files[0].content).toBe(originalFiles[0].content)
      expect(result.files[1].content).toBe(originalFiles[1].content)
    })
  })

  describe('sanitizePath', () => {
    it('normalizes backslashes to forward slashes', () => {
      expect(sanitizePath('src\\utils\\file.ts')).toBe('src/utils/file.ts')
    })

    it('removes leading slashes', () => {
      expect(sanitizePath('/absolute/path')).toBe('absolute/path')
    })

    it('removes Windows drive letters', () => {
      expect(sanitizePath('C:/Users/test/file.txt')).toBe('Users/test/file.txt')
    })

    it('resolves parent directory traversal', () => {
      expect(sanitizePath('src/../file.txt')).toBe('file.txt')
      expect(sanitizePath('src/a/../../file.txt')).toBe('file.txt')
    })

    it('removes null bytes', () => {
      expect(sanitizePath('file\0.txt')).toBe('file.txt')
    })
  })

  describe('dedupePath', () => {
    it('returns original path if not duplicate', () => {
      const existing = new Set<string>()
      expect(dedupePath('file.txt', existing)).toBe('file.txt')
    })

    it('appends counter for duplicates', () => {
      const existing = new Set<string>(['file.txt'])
      expect(dedupePath('file.txt', existing)).toBe('file(1).txt')
    })

    it('increments counter for multiple duplicates', () => {
      const existing = new Set<string>(['file.txt', 'file(1).txt'])
      expect(dedupePath('file.txt', existing)).toBe('file(2).txt')
    })

    it('handles files without extensions', () => {
      const existing = new Set<string>(['README'])
      expect(dedupePath('README', existing)).toBe('README(1)')
    })
  })
})
