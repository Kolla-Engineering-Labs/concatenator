/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IgnoreEngine provides logic to determine if a file path should be ignored
 * based on a list of patterns (strings or regular expressions).
 */
export class IgnoreEngine {
  private compiledPatterns: (string | RegExp)[]

  constructor(patterns: string[]) {
    this.compiledPatterns = patterns.map((rawPattern) => {
      const pattern = rawPattern.replace(/^\//, '')
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        // Simple heuristic for regex: /pattern/
        try {
          return new RegExp(pattern.slice(1, -1))
        } catch {
          return pattern
        }
      }
      // Check for advanced regex format with flags: /pattern/gi
      if (pattern.startsWith('/')) {
        const lastSlash = pattern.lastIndexOf('/')
        if (lastSlash > 0) {
          const body = pattern.slice(1, lastSlash)
          const flags = pattern.slice(lastSlash + 1)
          try {
            return new RegExp(body, flags)
          } catch {
            return pattern
          }
        }
      }
      return pattern
    })
  }

  get patterns() {
    return this.compiledPatterns
  }

  /**
   * Check if a path is ignored by any of the patterns.
   * @param path The file path to check (normalized to forward slashes)
   * @returns true if the path matches any ignore pattern
   */
  isIgnored(path: string): boolean {
    if (!path) return false
    const normalizedPath = path.replace(/\\/g, '/').replace(/^\//, '')
    const segments = normalizedPath.split('/').filter(Boolean)
    const fileName = segments.length > 0 ? segments[segments.length - 1] : ''

    if (segments.length === 0) return false

    return this.compiledPatterns.some((ignore) => {
      if (ignore instanceof RegExp) {
        // Test regex against full path, filename, and each segment
        if (ignore.test(normalizedPath)) return true
        if (ignore.test(fileName)) return true
        return segments.some((segment) => ignore.test(segment))
      }

      const ignoreStr =
        typeof ignore === 'string' ? ignore.replace(/\/$/, '') : ignore

      // Check if pattern contains glob characters
      if (ignoreStr.includes('*') || ignoreStr.includes('?')) {
        // Convert glob pattern to regex
        const globToRegex = (glob: string) => {
          const escaped = glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
            .replace(/\*/g, '.*') // * matches any sequence
            .replace(/\?/g, '.') // ? matches single char
          return new RegExp(`^${escaped}$`)
        }

        const patternRegex = globToRegex(ignoreStr)

        // Match against filename for simple patterns (no / in pattern)
        if (!ignoreStr.includes('/')) {
          if (patternRegex.test(fileName)) return true
        }

        // Also match against full path and each segment
        if (patternRegex.test(normalizedPath)) return true
        
        // Special case: if pattern is "path/**", then "path" itself should be ignored
        if (ignoreStr.endsWith('/**')) {
          const parentPath = ignoreStr.slice(0, -3)
          if (normalizedPath === parentPath || normalizedPath.startsWith(parentPath + '/')) {
            return true
          }
        }
        
        return segments.some((segment) => patternRegex.test(segment))
      }

      // For non-glob patterns, use exact matching against segments and filename
      if (ignoreStr.includes('/')) {
        return (
          normalizedPath === ignoreStr ||
          normalizedPath.endsWith('/' + ignoreStr)
        )
      }

      return (
        segments.some((segment) => segment === ignoreStr) ||
        fileName === ignoreStr
      )
    })
  }

  /**
   * Parse a standard ignore-style file content (newline-separated patterns, comments starting with #).
   * @param content The string content of the ignore file
   * @returns An array of ignore patterns
   */
  static parseIgnoreFile(content: string): string[] {
    if (!content) return []

    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
  }
}
