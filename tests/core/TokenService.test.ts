/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { TokenService } from '../../src/core/TokenService'
import { TreeItem } from '../../src/core/types'

describe('TokenService', () => {
  describe('getTokenEstimate', () => {
    it('should return 0 for empty content', () => {
      expect(TokenService.getTokenEstimate('')).toBe(0)
    })

    it('should estimate 1 token per 4 characters', () => {
      expect(TokenService.getTokenEstimate('1234')).toBe(1)
      expect(TokenService.getTokenEstimate('12345')).toBe(2)
    })
  })

  describe('getPreciseTokenCount', () => {
    it('should handle complex text', () => {
      const content = 'Hello, world! This is a test of the BPE-lite tokenizer.'
      const count = TokenService.getPreciseTokenCount(content)
      expect(count).toBeGreaterThan(0)
    })
  })

  describe('computeTreeWeights', () => {
    it('should bubble up weights in a nested structure', () => {
      const tree: TreeItem = {
        name: 'root',
        path: 'root',
        kind: 'directory',
        children: [
          {
            name: 'src',
            path: 'root/src',
            kind: 'directory',
            children: [
              {
                name: 'a.ts',
                path: 'root/src/a.ts',
                kind: 'file',
                file: {
                  name: 'a.ts',
                  path: 'root/src/a.ts',
                  kind: 'file',
                  content: '12341234',
                  size: 8,
                },
              },
              {
                name: 'b.ts',
                path: 'root/src/b.ts',
                kind: 'file',
                file: {
                  name: 'b.ts',
                  path: 'root/src/b.ts',
                  kind: 'file',
                  content: '1234',
                  size: 4,
                },
              },
            ],
          },
        ],
      }

      // 12341234 -> 2 tokens, 1234 -> 1 token. Total should be 3.
      TokenService.computeTreeWeights(tree)

      expect(tree.tokenWeight).toBe(3)
      const src = tree.children![0]
      expect(src.tokenWeight).toBe(3)
      expect(src.children![0].tokenWeight).toBe(2)
      expect(src.children![1].tokenWeight).toBe(1)
    })

    it('should respect isIgnored flag and return 0 for ignored nodes', () => {
      const tree: TreeItem = {
        name: 'root',
        path: 'root',
        kind: 'directory',
        children: [
          {
            name: 'ignored.ts',
            path: 'root/ignored.ts',
            kind: 'file',
            isIgnored: true,
            file: {
              name: 'ignored.ts',
              path: 'root/ignored.ts',
              kind: 'file',
              content: '12341234',
              size: 8,
            },
          },
        ],
      }

      TokenService.computeTreeWeights(tree)
      expect(tree.tokenWeight).toBe(0)
    })

    it('should use tokenMap for precise counts', () => {
      const tree: TreeItem = {
        name: 'root',
        path: 'root',
        kind: 'directory',
        children: [{ name: 'a.ts', path: 'root/a.ts', kind: 'file' }],
      }
      const tokenMap = {
        'root/a.ts': { tokens: 100, isPrecise: true },
      }

      TokenService.computeTreeWeights(tree, tokenMap)
      expect(tree.tokenWeight).toBe(100)
      expect(tree.isPrecise).toBe(true)
    })
  })

  describe('hashContent', () => {
    it('should generate a deterministic hash', () => {
      const content = 'hello world'
      const hash1 = TokenService.hashContent(content)
      const hash2 = TokenService.hashContent(content)
      expect(hash1).toBe(hash2)
      expect(hash1).not.toBe(TokenService.hashContent('hello world!'))
    })
  })

  describe('calculateAggregateTokens', () => {
    it('should calculate total tokens excluding ignored files', () => {
      const fileMap = {
        'src/a.ts': '12341234', // 2 tokens
        'dist/b.js': '1234', // 1 token
      }
      const total = TokenService.calculateAggregateTokens(fileMap, ['dist/**'])
      expect(total).toBe(2)
    })
  })

  describe('generateContextMetadata', () => {
    it('should format metadata correctly', () => {
      expect(TokenService.generateContextMetadata(1000)).toBe(
        '--- METADATA: Tokens: 1,000 ---'
      )
      expect(TokenService.generateContextMetadata(1000, 5000)).toBe(
        '--- METADATA: Tokens: 1,000 | Budget: 5,000 ---'
      )
    })
  })

  describe('computeTreeWeights - Ignored Directory', () => {
    it('should return 0 for ignored directories', () => {
      const tree: TreeItem = {
        name: 'dist',
        path: 'dist',
        kind: 'directory',
        isIgnored: true,
        children: [
          {
            name: 'b.js',
            path: 'dist/b.js',
            kind: 'file',
            file: { content: '1234' } as any,
          },
        ],
      }
      const result = TokenService.computeTreeWeights(tree)
      expect(result.tokens).toBe(0)
    })
  })

  describe('computeTreeWeights - Additional Branches', () => {
    it('should handle missing children or file data', () => {
      const tree: TreeItem = {
        name: 'empty-dir',
        path: 'dir',
        kind: 'directory',
        children: [],
      }
      TokenService.computeTreeWeights(tree)
      expect(tree.tokenWeight).toBe(0)

      const fileNode: TreeItem = {
        name: 'no-file.ts',
        path: 'no-file.ts',
        kind: 'file',
        // Missing 'file' property
      }
      TokenService.computeTreeWeights(fileNode)
      expect(fileNode.tokenWeight).toBe(0)
    })

    it('should propagate precision from multiple children', () => {
      const tree: TreeItem = {
        name: 'root',
        path: 'root',
        kind: 'directory',
        children: [
          {
            name: 'a.ts',
            path: 'a.ts',
            kind: 'file',
            file: { content: '12341234', size: 8 } as any,
          },
          {
            name: 'b.ts',
            path: 'b.ts',
            kind: 'file',
            file: { content: '1234', size: 4 } as any,
          },
        ],
      }
      // Manually set precision state if we want to test propagation
      TokenService.computeTreeWeights(tree)
      expect(tree.tokenWeight).toBe(3) // 2 from a.ts + 1 from b.ts
      expect(tree.isPrecise).toBe(false) // Default estimation is imprecise

      // Test with pre-calculated tokens in file object
      const preciseTree: TreeItem = {
        name: 'root',
        path: 'root',
        kind: 'directory',
        children: [
          {
            name: 'a.ts',
            path: 'a.ts',
            kind: 'file',
            file: { tokens: 50, isPrecise: true } as any,
          },
        ],
      }
      TokenService.computeTreeWeights(preciseTree)
      expect(preciseTree.tokenWeight).toBe(50)
      expect(preciseTree.isPrecise).toBe(true)
    })
  })
})
