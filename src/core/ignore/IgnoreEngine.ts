/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import picomatch from 'picomatch'
import { IgnoreSource } from '../types.js'

export type PatternInput = string | { pattern: string; source: IgnoreSource }

/**
 * Internal representation of a compiled ignore rule.
 * Negated rules (prefixed with `!`) un-ignore a previously ignored path
 * when they match — "last match wins" semantics identical to .gitignore.
 */
interface CompiledPattern {
  match: string | RegExp
  negated: boolean
  anchored: boolean
  rootAnchored: boolean
  source: IgnoreSource
  patterns?: RegExp[]
  unanchoredPatterns?: RegExp[]
}

/**
 * IgnoreEngine provides logic to determine if a file path should be ignored
 * based on a list of patterns (strings, globs, regular expressions, or
 * negation overrides prefixed with `!`).
 *
 * Evaluation uses **last-match-wins** semantics:
 *   1. Iterate all rules in order.
 *   2. When a rule matches the path, set `isIgnored = !rule.negated`.
 *   3. A later negation rule (`!pattern`) can un-ignore what a prior rule matched.
 *
 * This mirrors standard `.gitignore` / `.concatenate-ignore` behaviour.
 */
export class IgnoreEngine {
  private rules: CompiledPattern[]

  constructor(
    patterns: PatternInput[],
    defaultSource: IgnoreSource = 'default'
  ) {
    this.rules = patterns
      .map((entry) => {
        if (typeof entry === 'object' && entry !== null) {
          return { rawPattern: entry.pattern.trim(), source: entry.source }
        }
        return { rawPattern: String(entry).trim(), source: defaultSource }
      })
      .filter(
        ({ rawPattern }) => rawPattern.length > 0 && !rawPattern.startsWith('#')
      )
      .map(({ rawPattern, source }) => {
        const negated = rawPattern.startsWith('!')
        const clean = negated ? rawPattern.slice(1) : rawPattern
        const rootAnchored = clean.startsWith('/')

        // A pattern is anchored if it starts with a slash,
        // or if it contains a slash in the middle (not at the very end).
        // e.g. "dist/" is NOT anchored, but "dist/bin" IS anchored.
        const hasInternalSlash = clean.slice(0, -1).includes('/')
        const anchored = rootAnchored || hasInternalSlash

        const match = this.compile(clean)
        let compiledPatterns: RegExp[] | undefined = undefined
        let compiledUnanchored: RegExp[] | undefined = undefined

        if (typeof match === 'string') {
          const ignoreStr = match.replace(/\/$/, '')
          const rawPatterns = [ignoreStr, `${ignoreStr}/**`]
          const rawUnanchored = [
            ...rawPatterns,
            ...rawPatterns.map((p) => `**/${p}`),
            ...rawPatterns.map((p) => `**/${p}/**`),
            ...rawPatterns.map((p) => `${p}/**`),
          ]
          compiledPatterns = rawPatterns
            .map((p) => picomatch.makeRe(p, { dot: true }))
            .filter(Boolean) as RegExp[]
          compiledUnanchored = rawUnanchored
            .map((p) => picomatch.makeRe(p, { dot: true }))
            .filter(Boolean) as RegExp[]
        }

        return {
          match,
          negated,
          anchored,
          rootAnchored,
          source,
          patterns: compiledPatterns,
          unanchoredPatterns: compiledUnanchored,
        }
      })
  }

  // ─── Compilation ────────────────────────────────────────────────────────────

  private compile(rawPattern: string): string | RegExp {
    // Check if it's a regex first to avoid corrupting backslashes used for escaping
    if (rawPattern.startsWith('/') && rawPattern.includes('/', 1)) {
      // Regex with flags: /pattern/gi
      const lastSlash = rawPattern.lastIndexOf('/')
      if (lastSlash > 1 && lastSlash < rawPattern.length - 1) {
        const body = rawPattern.slice(1, lastSlash)
        const flags = rawPattern.slice(lastSlash + 1)
        if (/^[gimsuy]+$/.test(flags)) {
          try {
            return new RegExp(body, flags)
          } catch {
            /* fall through */
          }
        }
      }

      // Plain regex: /pattern/
      if (rawPattern.endsWith('/') && rawPattern.length > 2) {
        try {
          return new RegExp(rawPattern.slice(1, -1))
        } catch {
          /* fall through */
        }
      }
    }

    // For plain patterns and globs, normalize backslashes to forward slashes
    const normalized = rawPattern.replace(/\\/g, '/')

    // Strip a leading slash from plain patterns (e.g. `/dist` → `dist`)
    return normalized.replace(/^\//, '')
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Returns the compiled match values (without negation metadata). */
  get patterns(): (string | RegExp)[] {
    return this.rules.map((r) => r.match)
  }

  /**
   * Returns `true` if the path is ignored after applying all rules in order
   * (last-match-wins). A `!negation` rule can un-ignore a previously matched path.
   */
  isIgnored(path: string): boolean {
    if (!path) return false
    const { normalizedPath, fileName, segments } = this.normalizePath(path)
    if (segments.length === 0) return false

    let ignored = false
    for (const rule of this.rules) {
      if (this.isMatch(rule, normalizedPath, fileName, segments)) {
        ignored = !rule.negated
      }
    }

    return ignored
  }

  /**
   * Identifies which rule specifically ignored a path (if any).
   * Returns the matching rule pattern (e.g. `*.log`) or `undefined`.
   */
  getIgnoreReason(path: string): string | undefined {
    if (!path) return undefined
    const { normalizedPath, fileName, segments } = this.normalizePath(path)
    if (segments.length === 0) return undefined

    let lastMatchRule: string | undefined = undefined
    let currentlyIgnored = false

    for (const rule of this.rules) {
      if (this.isMatch(rule, normalizedPath, fileName, segments)) {
        lastMatchRule =
          rule.match instanceof RegExp
            ? rule.match.toString()
            : (rule.negated ? '!' : '') + rule.match
        currentlyIgnored = !rule.negated
      }
    }

    return currentlyIgnored ? lastMatchRule : undefined
  }

  /**
   * Returns true if the directory at 'path' should be traversed.
   * A directory should be traversed if it's NOT ignored, OR if it IS ignored but
   * there's a negation rule that could potentially match something inside it.
   */
  shouldRecurse(path: string): boolean {
    if (!path || path === '.') return true
    if (!this.isIgnored(path)) return true

    const { normalizedPath, segments } = this.normalizePath(path)
    const prefix = normalizedPath + '/'

    const heavyDirs = [
      'node_modules',
      '.git',
      '.next',
      '.expo',
      '.gradle',
      '.terraform',
      '.vagrant',
      'bower_components',
      'playwright-report',
      'test-results',
      'venv',
      'vendor',
    ]

    const isHeavy = segments.some((s) => heavyDirs.includes(s))

    return this.rules.some((rule) => {
      if (!rule.negated) return false

      // Regex negation: assume it could match subpaths, so recurse.
      if (rule.match instanceof RegExp) return true

      const pattern = rule.match as string

      // If this is a heavy system directory, do not recurse for unanchored negated patterns.
      if (isHeavy && !rule.anchored) return false

      // Unanchored negated patterns can match anywhere inside the ignored directory.
      if (!rule.anchored) return true

      // Anchored negated pattern matches this directory prefix.
      if (rule.anchored && pattern.startsWith(prefix)) return true

      return false
    })
  }

  /**
   * Detailed ignore result including the reason, negation status, and source.
   */
  getIgnoreResult(path: string): {
    ignored: boolean
    negated: boolean
    reason?: string
    source?: IgnoreSource
  } {
    if (!path) return { ignored: false, negated: false }
    const { normalizedPath, fileName, segments } = this.normalizePath(path)

    let ignored = false
    let negated = false
    let reason: string | undefined = undefined
    let source: IgnoreSource | undefined = undefined

    for (const rule of this.rules) {
      if (this.isMatch(rule, normalizedPath, fileName, segments)) {
        ignored = !rule.negated
        negated = rule.negated
        reason = rule.negated ? undefined : String(rule.match)
        source = rule.source
      }
    }

    return { ignored, negated, reason, source }
  }

  /**
   * Returns `true` if the path is specifically un-ignored by a negation rule.
   */
  isExplicitlyNegated(path: string): boolean {
    if (!path) return false
    const { normalizedPath, fileName, segments } = this.normalizePath(path)

    let negated = false
    for (const rule of this.rules) {
      if (this.isMatch(rule, normalizedPath, fileName, segments)) {
        if (rule.negated) {
          negated = true
        } else {
          // If a later non-negated rule matches, it overrides the negation
          negated = false
        }
      }
    }
    return negated
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private normalizePath(path: string) {
    const normalizedPath = path.replace(/\\/g, '/').replace(/^\//, '')
    const segments = normalizedPath.split('/').filter(Boolean)
    const fileName = segments[segments.length - 1] || ''
    return { normalizedPath, fileName, segments }
  }

  private isMatch(
    rule: CompiledPattern,
    normalizedPath: string,
    fileName: string,
    segments: string[]
  ): boolean {
    const pattern = rule.match
    if (pattern instanceof RegExp) {
      return (
        pattern.test(normalizedPath) ||
        pattern.test(fileName) ||
        segments.some((s) => pattern.test(s))
      )
    }

    // Determine anchoring from the compiled metadata
    const isAnchored = rule.anchored

    if (!rule.patterns || !rule.unanchoredPatterns) return false

    // 1. Check direct match (anchored)
    if (rule.patterns.some((re) => re.test(normalizedPath))) {
      return true
    }

    // 2. Check unanchored match (anywhere in the tree)
    if (!isAnchored) {
      // Matches the filename directly
      if (rule.patterns.some((re) => re.test(fileName))) {
        return true
      }
      // Matches any segment of the path
      if (segments.some((s) => rule.patterns!.some((re) => re.test(s)))) {
        return true
      }
      // Matches the path via unanchored globs
      if (rule.unanchoredPatterns.some((re) => re.test(normalizedPath))) {
        return true
      }
    }

    // BUT only if the pattern IS NOT root-anchored (i.e., didn't start with /).
    // If it was root-anchored, it MUST match from the root.
    const isRootAnchored = rule.rootAnchored
    if (isAnchored && !isRootAnchored && normalizedPath.includes('/')) {
      const firstSlash = normalizedPath.indexOf('/')
      const firstSegment = normalizedPath.slice(0, firstSlash)
      const subPath = normalizedPath.slice(firstSlash + 1)

      const commonFolders = [
        'src',
        'lib',
        'test',
        'tests',
        'bin',
        'node_modules',
        'dist',
        'build',
        'target',
        'public',
        'assets',
      ]
      if (!commonFolders.includes(firstSegment)) {
        if (rule.patterns.some((re) => re.test(subPath))) {
          return true
        }
      }
    }

    // 4. Special case for '/**' suffix (anchored match for the directory itself)
    const ignoreStr = (pattern as string).replace(/\/$/, '')
    if (ignoreStr.endsWith('/**')) {
      const parentPath = ignoreStr.slice(0, -3)
      if (normalizedPath === parentPath) return true

      // Also handle project prefix for parent path
      if (normalizedPath.includes('/')) {
        const firstSlash = normalizedPath.indexOf('/')
        const firstSegment = normalizedPath.slice(0, firstSlash)
        const subPath = normalizedPath.slice(firstSlash + 1)

        const commonFolders = [
          'src',
          'lib',
          'test',
          'tests',
          'bin',
          'node_modules',
          'dist',
          'build',
          'target',
          'public',
          'assets',
        ]
        if (!commonFolders.includes(firstSegment)) {
          if (subPath === parentPath) return true
        }
      }
    }

    return false
  }

  /**
   * Parses a raw ignore file content into an array of patterns.
   */
  static parseIgnoreFile(content: string): string[] {
    if (!content) return []
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  }

  /**
   * Formats an array of patterns into a raw ignore file string.
   */
  static stringifyIgnoreFile(patterns: string[]): string {
    return patterns.join('\n')
  }
}
