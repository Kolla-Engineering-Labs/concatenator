/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { concatenate, deconcatenate, sanitizePath, dedupePath } from './engine'

describe('engine', () => {
  describe('concatenate', () => {
    it('concatenates files with delimiters', () => {
      const files = [
        { path: 'file1.txt', content: 'Hello' },
        { path: 'file2.txt', content: 'World' },
      ]
      const result = concatenate(files, '2024-01-01')

      expect(result).toContain('Concatenated on: 2024-01-01')
      expect(result).toContain('<<<<< CONCATENATOR_FILE_START: file1.txt >>>>>')
      expect(result).toContain('Hello')
      expect(result).toContain('<<<<< CONCATENATOR_FILE_END >>>>>')
      expect(result).toContain('<<<<< CONCATENATOR_FILE_START: file2.txt >>>>>')
      expect(result).toContain('World')
    })
  })

  describe('deconcatenate', () => {
    it('extracts files from concatenated content', () => {
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
      const malformed = '<<<<< CONCATENATOR_FILE_START: file.txt >>>>>missing end marker'
      const result = deconcatenate(malformed)
      expect(result.foundAny).toBe(false)
      expect(result.skippedPaths).toContain('file.txt')
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
