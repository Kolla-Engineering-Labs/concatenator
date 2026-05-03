/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lstatSync, readdirSync, realpathSync, statSync, Stats } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { IgnoreEngine } from './ignore/IgnoreEngine.js'
import { SecurityViolation } from './errors.js'

export interface CrawlerOptions {
  rootPath: string
  ignoreEngine: IgnoreEngine
  followSymlinks?: boolean
}

export interface CrawlerEntry {
  name: string
  path: string // relative to rootPath
  fullPath: string
  kind: 'file' | 'directory'
  size: number
}

/**
 * UnifiedCrawler provides a shared, secure mechanism for traversing the filesystem.
 * It enforces path-traversal boundaries and handles symbolic links consistently
 * across CLI and UI.
 */
export class UnifiedCrawler {
  private logicalRoot: string
  private resolvedRoot: string
  private followSymlinks: boolean
  private ignoreEngine: IgnoreEngine

  constructor(options: CrawlerOptions) {
    this.logicalRoot = resolve(options.rootPath)
    this.resolvedRoot = realpathSync(this.logicalRoot)
    this.followSymlinks = options.followSymlinks ?? false
    this.ignoreEngine = options.ignoreEngine
  }

  /**
   * Asserts that a given path is physically located within the root directory.
   * Prevents directory traversal attacks via ".." or malicious symlinks.
   */
  private assertPathWithinRoot(targetPath: string): string {
    const resolvedTarget = realpathSync(resolve(targetPath))
    if (!resolvedTarget.startsWith(this.resolvedRoot)) {
      throw new SecurityViolation(
        `Security Violation: Attempted to access path outside root: ${resolvedTarget}`
      )
    }
    return resolvedTarget
  }

  /**
   * Recursively collect entries from the filesystem.
   */
  public collect(
    currentDir: string = this.logicalRoot,
    onEntry?: (entry: CrawlerEntry) => void
  ): CrawlerEntry[] {
    this.assertPathWithinRoot(currentDir)
    const results: CrawlerEntry[] = []

    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        // Use logicalRoot with path.relative for robust relative path calculation.
        // This avoids issues where the system might have symlinked parent paths (like macOS /var -> /private/var).
        const relativePath = relative(this.logicalRoot, fullPath).replace(
          /\\/g,
          '/'
        )

        // Check if path is ignored
        if (this.ignoreEngine.isIgnored(relativePath)) {
          continue
        }

        let kind: 'file' | 'directory'
        let stats: Stats

        try {
          // Use lstat to check for symlink without resolving
          const lstats = lstatSync(fullPath)

          if (lstats.isSymbolicLink()) {
            if (!this.followSymlinks) {
              continue
            }
            // Resolve symlink, security-check it, then stat the real target
            const resolvedPath = this.assertPathWithinRoot(fullPath)
            stats = statSync(resolvedPath)
          } else {
            stats = lstats
          }

          if (stats.isDirectory()) {
            kind = 'directory'
          } else if (stats.isFile()) {
            kind = 'file'
          } else {
            // Skip other types (sockets, pipes, etc.)
            continue
          }

          const crawlerEntry: CrawlerEntry = {
            name: entry.name,
            path: relativePath,
            fullPath,
            kind,
            size: stats.size,
          }

          if (onEntry) {
            onEntry(crawlerEntry)
          }
          results.push(crawlerEntry)

          if (kind === 'directory') {
            walk(fullPath)
          }
        } catch (error) {
          if (error instanceof SecurityViolation) {
            throw error
          }
          // Skip entries that can't be read
          continue
        }
      }
    }

    walk(currentDir)
    return results
  }
}
