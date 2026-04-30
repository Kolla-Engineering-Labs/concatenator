/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Internal representation of a compiled ignore rule.
 * Negated rules (prefixed with `!`) un-ignore a previously ignored path
 * when they match — "last match wins" semantics identical to .gitignore.
 */
interface CompiledPattern {
  match: string | RegExp
  negated: boolean
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

  constructor(patterns: string[]) {
    this.rules = patterns.map((rawPattern) => {
      const negated = rawPattern.startsWith('!')
      const clean = negated ? rawPattern.slice(1) : rawPattern
      return { match: this.compile(clean), negated }
    })
  }

  // ─── Compilation ────────────────────────────────────────────────────────────

  private compile(rawPattern: string): string | RegExp {
    // Regex with flags: /pattern/gi
    if (rawPattern.startsWith('/') && rawPattern.includes('/', 1)) {
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
    }

    // Plain regex: /pattern/
    if (
      rawPattern.startsWith('/') &&
      rawPattern.endsWith('/') &&
      rawPattern.length > 2
    ) {
      try {
        return new RegExp(rawPattern.slice(1, -1))
      } catch {
        /* fall through */
      }
    }

    // Strip a leading slash from plain patterns (e.g. `/dist` → `dist`)
    return rawPattern.replace(/^\//, '')
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
      if (this.matchesRule(rule, normalizedPath, fileName, segments)) {
        ignored = !rule.negated
      }
    }
    return ignored
  }

  /**
   * Returns `true` when a path is **not** ignored because the last matching
   * rule was a negation. Useful as a UI hint to show explicitly un-ignored files.
   */
  isExplicitlyNegated(path: string): boolean {
    if (!path) return false
    const { normalizedPath, fileName, segments } = this.normalizePath(path)
    if (segments.length === 0) return false

    let lastMatchNegated = false
    let anyMatch = false
    for (const rule of this.rules) {
      if (this.matchesRule(rule, normalizedPath, fileName, segments)) {
        lastMatchNegated = rule.negated
        anyMatch = true
      }
    }
    return anyMatch && lastMatchNegated
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private normalizePath(path: string): {
    normalizedPath: string
    fileName: string
    segments: string[]
  } {
    const normalizedPath = path.replace(/\\/g, '/').replace(/^\//, '')
    const segments = normalizedPath.split('/').filter(Boolean)
    const fileName = segments.length > 0 ? segments[segments.length - 1] : ''
    return { normalizedPath, fileName, segments }
  }

  private matchesRule(
    rule: CompiledPattern,
    normalizedPath: string,
    fileName: string,
    segments: string[]
  ): boolean {
    const { match } = rule

    // ── Regex ────────────────────────────────────────────────────────────────
    if (match instanceof RegExp) {
      return (
        match.test(normalizedPath) ||
        match.test(fileName) ||
        segments.some((s) => match.test(s))
      )
    }

    const ignoreStr = match.replace(/\/$/, '')

    // ── Glob ─────────────────────────────────────────────────────────────────
    if (ignoreStr.includes('*') || ignoreStr.includes('?')) {
      const patternRegex = this.globToRegex(ignoreStr)

      if (!ignoreStr.includes('/') && patternRegex.test(fileName)) return true
      if (patternRegex.test(normalizedPath)) return true

      // `path/**` should also match `path` itself
      if (ignoreStr.endsWith('/**')) {
        const parentPath = ignoreStr.slice(0, -3)
        if (
          normalizedPath === parentPath ||
          normalizedPath.startsWith(parentPath + '/')
        )
          return true
      }

      return segments.some((s) => patternRegex.test(s))
    }

    // ── Path-anchored plain pattern ───────────────────────────────────────────
    if (ignoreStr.includes('/')) {
      return (
        normalizedPath === ignoreStr || normalizedPath.endsWith('/' + ignoreStr)
      )
    }

    // ── Segment / filename exact match ───────────────────────────────────────
    return segments.some((s) => s === ignoreStr) || fileName === ignoreStr
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`)
  }

  // ─── Static helpers ──────────────────────────────────────────────────────────

  /**
   * Parse a standard ignore-style file (newline-separated patterns, `#` comments).
   * Negation lines (`!pattern`) are preserved as-is; only `#` lines are stripped.
   */
  static parseIgnoreFile(content: string): string[] {
    if (!content) return []
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
  }
}
