/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IgnoreEngine } from './ignore/IgnoreEngine.js'

/**
 * TokenService provides utilities for estimating token counts and generating context metadata.
 */
export class TokenService {
  /**
   * Fast Estimate formula: Math.ceil(content.length / 4)
   * This is a common heuristic for LLM tokens where 1 token is roughly 4 characters.
   */
  static getTokenEstimate(content: string): number {
    if (!content) return 0
    return Math.ceil(content.length / 4)
  }

  /**
   * Precise Tokenization (BPE-lite)
   * A more accurate count based on common BPE patterns (spaces, punctuation, sub-words).
   */
  static getPreciseTokenCount(content: string): number {
    if (!content) return 0

    // BPE-lite: Split by whitespace and common punctuation,
    // then apply a slightly different ratio for longer words.
    // This is a placeholder for a real BPE tokenizer like tiktoken.
    const tokens = content.split(/(\s+|[.,!?;:()[\]{}'"])/g).filter(Boolean)
    let count = 0
    for (const token of tokens) {
      if (token.length > 8) {
        count += Math.ceil(token.length / 3) // Longer technical words usually have more tokens
      } else {
        count += 1
      }
    }
    return count
  }

  /**
   * Create a simple non-crypto hash for content caching
   */
  static hashContent(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0 // Convert to 32bit integer
    }
    return hash.toString(36) + content.length.toString(36)
  }

  /**
   * Calculate the aggregate tokens for a file-map, excluding files that match the ignore list.
   *
   * @param fileMap - A record of file paths to their content
   * @param ignorePatterns - List of patterns to exclude
   * @returns Total estimated token count for non-ignored files
   */
  static calculateAggregateTokens(
    fileMap: Record<string, string>,
    ignorePatterns: string[] = []
  ): number {
    const ignoreEngine = new IgnoreEngine(ignorePatterns)
    let totalTokens = 0

    for (const [path, content] of Object.entries(fileMap)) {
      if (!ignoreEngine.isIgnored(path)) {
        totalTokens += this.getTokenEstimate(content)
      }
    }

    return totalTokens
  }

  /**
   * Generate a "Context Metadata" string to be injected into the bundle header.
   * Example: --- METADATA: Tokens: 42,500 | Budget: 128,000 ---
   *
   * @param tokens - The estimated token count
   * @param budget - Optional token budget
   * @returns Formatted metadata string
   */
  static generateContextMetadata(tokens: number, budget?: number): string {
    const formattedTokens = tokens.toLocaleString()
    const budgetPart = budget ? ` | Budget: ${budget.toLocaleString()}` : ''
    return `--- METADATA: Tokens: ${formattedTokens}${budgetPart} ---`
  }
}
