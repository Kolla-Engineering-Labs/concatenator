/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import {
  TokenService,
  HeuristicStrategy,
  PrecisionStrategy,
  ITiktokenEncoder,
} from '../../src/core/TokenService'
import { TreeItem } from '../../src/core/types'

describe('TokenService', () => {
  beforeEach(async () => {
    // Reset to default heuristic mode
    await TokenService.loadPrecisionStrategy(undefined)
  })

  describe('getTokenEstimate', () => {
    it('should return 0 for empty content', () => {
      expect(TokenService.getTokenEstimate('')).toBe(0)
    })

    it('should estimate 1 token per 4 characters', () => {
      expect(TokenService.getTokenEstimate('1234')).toBe(1)
      expect(TokenService.getTokenEstimate('12345')).toBe(2)
    })
  })

  describe('getTokenCount', () => {
    it('should return 0 for empty content', () => {
      expect(TokenService.getTokenCount('').count).toBe(0)
      // Default heuristic: Math.ceil(length / 4)
      // '1234' is length 4 => 1
      // '12345' is length 5 => 2
      // Using precise: 1234 is 1 token in cl100k
      expect(TokenService.getTokenCount('1234').count).toBe(1)
    })
  })

  describe('Strategy Pattern', () => {
    it('HeuristicStrategy calculates tokens correctly', () => {
      const strategy = new HeuristicStrategy()
      expect(strategy.calculate('Hello World').count).toBe(3) // 11 chars / 4 = ceil(2.75) = 3
    })

    it('PrecisionStrategy uses the provided encoder', () => {
      const mockEncoder: ITiktokenEncoder = {
        encode: (text: string) => new Uint32Array(text.split(' ').length),
      }
      const strategy = new PrecisionStrategy(mockEncoder)
      expect(strategy.calculate('Hello World from Vitest').count).toBe(4)
    })
  })

  describe('Precision Mode', () => {
    it('swaps to precision mode after loading', async () => {
      await TokenService.loadPrecisionStrategy(getEncoding('o200k_base'))

      expect(TokenService.isPrecise()).toBe(true)
      // cl100k_base for "hello" is 1 token (same in o200k_base)
      expect(TokenService.getTokenCount('hello').count).toBe(1)
      // "Concatenator" is 3 tokens in cl100k_base / o200k_base
      expect(TokenService.getTokenCount('Concatenator').count).toBe(3)
    })
  })

  describe('computeTreeWeights', () => {
    beforeEach(async () => {
      await TokenService.loadPrecisionStrategy(getEncoding('cl100k_base'))
    })

    it('should bubble up weights in a nested structure', async () => {
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

      // After loadPrecisionStrategy:
      // '12341234' -> 3 tokens (cl100k_base)
      // '1234' -> 2 tokens (cl100k_base)
      // Total: 5
      TokenService.computeTreeWeights(tree)

      expect(tree.tokenWeight).toBe(5)
      const src = tree.children![0]
      expect(src.tokenWeight).toBe(5)
      expect(src.children![0].tokenWeight).toBe(3)
      expect(src.children![1].tokenWeight).toBe(2)
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
    beforeEach(async () => {
      await TokenService.loadPrecisionStrategy(getEncoding('cl100k_base'))
    })

    it('should calculate total tokens excluding ignored files', () => {
      const fileMap = {
        'src/a.ts': '12341234', // 3 tokens
        'dist/b.js': '1234', // 2 tokens
      }
      const total = TokenService.calculateAggregateTokens(fileMap, ['dist/**'])
      expect(total).toBe(3)
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
})
