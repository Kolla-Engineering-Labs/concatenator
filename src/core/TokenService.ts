/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IgnoreEngine } from './ignore/IgnoreEngine.js'
import { TreeItem } from './types.js'
import { logger } from '../lib/logger.js'

/**
 * Strategy interface for token calculation.
 */
export interface ITokenStrategy {
  calculate(text: string): number
}

/**
 * HeuristicStrategy: Zero-dependency fallback using character count.
 * $1 token ≈ 4 characters$.
 */
export class HeuristicStrategy implements ITokenStrategy {
  calculate(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / 4)
  }
}

export interface ITiktokenEncoder {
  encode(text: string): number[] | Uint32Array
}

/**
 * PrecisionStrategy: Accurate BPE tokenization using tiktoken (cl100k_base).
 */
export class PrecisionStrategy implements ITokenStrategy {
  private encoder: ITiktokenEncoder

  constructor(encoder: ITiktokenEncoder) {
    this.encoder = encoder
  }

  calculate(text: string): number {
    if (!text) return 0
    try {
      return this.encoder.encode(text).length
    } catch (err) {
      logger.warn(
        '[PrecisionStrategy] Tokenization failed, using heuristic.',
        err
      )
      return Math.ceil(text.length / 4)
    }
  }
}

/**
 * TokenService acts as the orchestrator for token metrics.
 * It defaults to HeuristicStrategy for instant LTI and hot-swaps to PrecisionStrategy
 * once the underlying library is loaded asynchronously.
 */
export class TokenService {
  private static strategy: ITokenStrategy = new HeuristicStrategy()
  private static _isPrecise = false
  private static loadingPromise: Promise<void> | null = null

  /**
   * Initializes the precision strategy.
   * In Web UI, this is typically called via dynamic import to keep initial bundle lean.
   */
  static async loadPrecisionStrategy(): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise

    this.loadingPromise = (async () => {
      try {
        // Dynamic import ensures the main thread remains unblocked and bundle stays lean.
        // o200k_base is the standard for gpt-4o.
        const { getEncoding } = await import('js-tiktoken')
        const encoder = getEncoding('o200k_base')
        this.strategy = new PrecisionStrategy(encoder)
        this._isPrecise = true
      } catch {
        this.strategy = new HeuristicStrategy()
        this._isPrecise = false
      }
    })()

    return this.loadingPromise
  }

  /**
   * Calculate tokens using the current active strategy.
   */
  static getTokenCount(text: string): number {
    return this.strategy.calculate(text)
  }

  /**
   * Legacy alias for getTokenCount.
   */
  static getPreciseTokenCount(text: string): number {
    return this.getTokenCount(text)
  }

  /**
   * Heuristic estimate (exposed for cases where precision isn't needed or available).
   */
  static getTokenEstimate(text: string): number {
    return new HeuristicStrategy().calculate(text)
  }

  /**
   * Check if the service is currently in precision mode.
   */
  static isPrecise(): boolean {
    return this._isPrecise
  }

  /**
   * Create a simple non-crypto hash for content caching
   */
  static hashContent(content: string): string {
    const len = content.length
    if (len === 0) return 'empty'

    // O(1) hashing for massive strings: sample start, middle, and end rather than the entire file.
    // This prevents main thread lockups on gigabyte-sized log/db files.
    const sample =
      len > 3000
        ? content.slice(0, 1000) +
          content.slice(Math.floor(len / 2), Math.floor(len / 2) + 1000) +
          content.slice(-1000)
        : content

    let hash = 0
    for (let i = 0; i < sample.length; i++) {
      const char = sample.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0 // Convert to 32bit integer
    }
    return hash.toString(36) + ':' + len.toString(36)
  }

  /**
   * Calculate the aggregate tokens for a file-map, excluding files that match the ignore list.
   */
  static calculateAggregateTokens(
    fileMap: Record<string, string>,
    ignorePatterns: string[] = []
  ): number {
    const ignoreEngine = new IgnoreEngine(ignorePatterns)
    let totalTokens = 0

    for (const [path, content] of Object.entries(fileMap)) {
      if (!ignoreEngine.isIgnored(path)) {
        totalTokens += this.getTokenCount(content)
      }
    }

    return totalTokens
  }

  /**
   * Generate formatted context metadata for the bundle header.
   */
  static generateContextMetadata(tokens: number, budget?: number): string {
    const formattedTokens = tokens.toLocaleString()
    const budgetPart = budget ? ` | Budget: ${budget.toLocaleString()}` : ''
    return `--- METADATA: Tokens: ${formattedTokens}${budgetPart} ---`
  }

  /**
   * Recursive function to compute directory weights in a tree.
   */
  static computeTreeWeights(
    node: TreeItem,
    tokenMap: Record<string, { tokens: number; isPrecise: boolean }> = {}
  ): { tokens: number; isPrecise: boolean } {
    if (node.kind === 'file') {
      const meta = tokenMap[node.path] || {
        tokens:
          node.file?.tokens !== undefined
            ? node.file.tokens
            : typeof node.file?.content === 'string'
              ? this.getTokenCount(node.file.content)
              : 0,
        isPrecise:
          node.file?.isPrecise ??
          (tokenMap[node.path]?.isPrecise || this.isPrecise()),
      }
      node.tokenWeight = meta.tokens
      node.isPrecise = meta.isPrecise
      if (node.isIgnored) {
        return { tokens: 0, isPrecise: true }
      }
      return meta
    }

    let total = 0
    let allPrecise = true

    if (node.children) {
      for (const child of node.children) {
        const { tokens, isPrecise } = this.computeTreeWeights(child, tokenMap)
        total += tokens
        if (!isPrecise) allPrecise = false
      }
    }

    node.tokenWeight = total
    node.isPrecise = allPrecise
    if (node.isIgnored) {
      return { tokens: 0, isPrecise: true }
    }
    return { tokens: total, isPrecise: allPrecise }
  }
}
