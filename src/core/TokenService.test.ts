/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { TokenService } from './TokenService.js'

describe('TokenService', () => {
  describe('getTokenEstimate', () => {
    it('calculates estimate based on character length / 4', () => {
      expect(TokenService.getTokenEstimate('1234')).toBe(1)
      expect(TokenService.getTokenEstimate('12345')).toBe(2)
      expect(TokenService.getTokenEstimate('')).toBe(0)
    })

    it('handles multi-line strings correctly', () => {
      const multiLine = 'line 1\nline 2\nline 3'
      // length is 20 chars
      expect(TokenService.getTokenEstimate(multiLine)).toBe(5)
    })
  })

  describe('calculateAggregateTokens', () => {
    const fileMap = {
      'src/index.ts': 'console.log("hello")', // 20 chars -> 5 tokens
      'src/utils.ts': 'export const a = 1', // 18 chars -> 5 tokens
      'dist/bundle.js': 'var a=1;', // 8 chars -> 2 tokens
      'node_modules/lib/index.js': 'module.exports = {}', // 21 chars -> 6 tokens
    }

    it('calculates total tokens for all files when no ignore patterns provided', () => {
      const total = TokenService.calculateAggregateTokens(fileMap)
      expect(total).toBe(5 + 5 + 2 + 5) // 17 tokens
    })

    it('excludes files matching ignore patterns', () => {
      const ignorePatterns = ['dist/**', 'node_modules/**']
      const total = TokenService.calculateAggregateTokens(
        fileMap,
        ignorePatterns
      )
      expect(total).toBe(5 + 5)
    })

    it('handles empty file map', () => {
      expect(TokenService.calculateAggregateTokens({})).toBe(0)
    })
  })

  describe('generateContextMetadata', () => {
    it('generates metadata string with tokens only', () => {
      const metadata = TokenService.generateContextMetadata(42500)
      expect(metadata).toBe('--- METADATA: Tokens: 42,500 ---')
    })

    it('generates metadata string with tokens and budget', () => {
      const metadata = TokenService.generateContextMetadata(42500, 128000)
      expect(metadata).toBe(
        '--- METADATA: Tokens: 42,500 | Budget: 128,000 ---'
      )
    })
  })
})
