/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { IgnoreEngine } from './ignore/IgnoreEngine.js'
import { SecurityViolation } from './errors.js'
import { BINARY_EXTENSIONS, MAX_FILE_SIZE } from './constants.js'
import { FileStatus } from './types.js'

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
  status: FileStatus
  reason?: string
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
    this.resolvedRoot = fs.realpathSync(this.logicalRoot)
    this.followSymlinks = options.followSymlinks ?? false
    this.ignoreEngine = options.ignoreEngine
  }

  /**
   * Asserts that a given path is physically located within the root directory.
   * Prevents directory traversal attacks via ".." or malicious symlinks.
   */
  private assertPathWithinRoot(targetPath: string): string {
    const resolvedTarget = fs.realpathSync(resolve(targetPath))
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
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        // Use logicalRoot with path.relative for robust relative path calculation.
        // This avoids issues where the system might have symlinked parent paths (like macOS /var -> /private/var).
        const relativePath = relative(this.logicalRoot, fullPath).replace(
          /\\/g,
          '/'
        )

        let status: FileStatus = 'included'
        let reason: string | undefined = undefined

        // Check if path is ignored
        const ignoreResult = this.ignoreEngine.getIgnoreResult(relativePath)
        if (ignoreResult.ignored) {
          status = 'ignored'
          reason = `Matches ${ignoreResult.reason}`
        }

        let kind: 'file' | 'directory'
        let stats: fs.Stats

        try {
          // Use lstat to check for symlink without resolving
          const lstats = fs.lstatSync(fullPath)

          if (lstats.isSymbolicLink()) {
            if (!this.followSymlinks) {
              continue
            }
            // Resolve symlink, security-check it, then stat the real target
            const resolvedPath = this.assertPathWithinRoot(fullPath)
            stats = fs.statSync(resolvedPath)
          } else {
            stats = lstats
          }

          if (stats.isDirectory()) {
            kind = 'directory'
          } else if (stats.isFile()) {
            kind = 'file'

            // Further checks for files
            if (status === 'included') {
              // Binary Check
              const ext = entry.name
                .toLowerCase()
                .substring(entry.name.lastIndexOf('.'))
              if (BINARY_EXTENSIONS.includes(ext)) {
                status = 'rejected'
                reason = 'Binary File Detected'
              } else if (stats.size > MAX_FILE_SIZE) {
                status = 'rejected'
                reason = `Size Exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB Limit`
              }
            }
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
            status,
            reason,
          }

          if (onEntry) {
            onEntry(crawlerEntry)
          }
          results.push(crawlerEntry)

          if (
            kind === 'directory' &&
            this.ignoreEngine.shouldRecurse(relativePath)
          ) {
            walk(fullPath)
          }
        } catch (error: unknown) {
          if (
            error instanceof SecurityViolation ||
            (error instanceof Error && error.name === 'SecurityViolation')
          ) {
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
