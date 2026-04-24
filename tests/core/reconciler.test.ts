/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import {
  reconcileFiles,
  prunePaths,
  findMinimumCommonRoot,
} from '../../src/core/reconciler'
import { FileItem } from '../../src/core/types'

describe('reconciler', () => {
  describe('reconcileFiles', () => {
    it('should absorb children when a parent is added', () => {
      const existing: FileItem[] = [
        {
          path: 'src/components/Button.tsx',
          name: 'Button.tsx',
          kind: 'file',
          content: '',
          size: 0,
        },
        {
          path: 'src/components/Input.tsx',
          name: 'Input.tsx',
          kind: 'file',
          content: '',
          size: 0,
        },
      ]
      const newFiles: FileItem[] = [
        {
          path: 'src/components',
          name: 'components',
          kind: 'directory',
          content: '',
          size: 0,
        },
      ]

      const result = reconcileFiles(existing, newFiles)

      expect(result.files.length).toBe(1)
      expect(result.files[0].path).toBe('src/components')
      expect(result.absorptions.length).toBe(2)
      expect(result.absorptions).toContainEqual({
        child: 'src/components/Button.tsx',
        parent: 'src/components',
      })
    })

    it('should merge new files into existing structure', () => {
      const existing: FileItem[] = [
        {
          path: 'src/components',
          name: 'components',
          kind: 'directory',
          content: '',
          size: 0,
        },
      ]
      const newFiles: FileItem[] = [
        {
          path: 'src/components/Button.tsx',
          name: 'Button.tsx',
          kind: 'file',
          content: '',
          size: 0,
        },
      ]

      const result = reconcileFiles(existing, newFiles)

      expect(result.files.length).toBe(2)
      expect(result.files.map((f) => f.path)).toContain('src/components')
      expect(result.files.map((f) => f.path)).toContain(
        'src/components/Button.tsx'
      )
      expect(result.absorptions.length).toBe(0)
    })
  })

  describe('prunePaths', () => {
    it('should remove redundant sub-paths', () => {
      const paths = [
        'C:/Projects/src',
        'C:/Projects/src/components',
        'C:/Projects/tests',
        'C:/Projects/src/utils/math.ts',
      ]

      const result = prunePaths(paths)

      expect(result.remaining).toContain('C:/Projects/src')
      expect(result.remaining).toContain('C:/Projects/tests')
      expect(result.pruned).toContain('C:/Projects/src/components')
      expect(result.pruned).toContain('C:/Projects/src/utils/math.ts')
      expect(result.remaining.length).toBe(2)
    })

    it('should handle trailing slashes correctly', () => {
      const paths = ['C:/Projects/src/', 'C:/Projects/src/components']
      const result = prunePaths(paths)
      expect(result.remaining).toContain('C:/Projects/src/')
      expect(result.pruned).toContain('C:/Projects/src/components')
    })

    it('should avoid partial string matches (directory boundary check)', () => {
      const paths = ['C:/src', 'C:/src-old']
      const result = prunePaths(paths)
      expect(result.remaining.length).toBe(2)
      expect(result.remaining).toContain('C:/src')
      expect(result.remaining).toContain('C:/src-old')
    })
  })

  describe('findMinimumCommonRoot', () => {
    it('should find common root for multiple paths', () => {
      const paths = [
        'src/components/Button.tsx',
        'src/utils/math.ts',
        'src/index.ts',
      ]
      expect(findMinimumCommonRoot(paths)).toBe('src')
    })

    it('should return empty string for no common root', () => {
      const paths = ['src/index.ts', 'tests/main.ts']
      expect(findMinimumCommonRoot(paths)).toBe('')
    })

    it('should handle single file', () => {
      const paths = ['src/index.ts']
      expect(findMinimumCommonRoot(paths)).toBe('src')
    })
  })
})
