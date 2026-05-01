/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lstatSync, readdirSync, realpathSync } from 'fs'
import { join, resolve } from 'path'
import micromatch from 'micromatch'
import { DEFAULT_IGNORE_LIST } from './constants.js'

export interface VFSNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  size?: number
  isIgnored?: boolean
  isNegated?: boolean
  children?: VFSNode[]
}

export class VFSManager {
  private baseDir: string
  private ignorePatterns: string[]
  private ignoreRegexes: RegExp[]
  private negationPatterns: string[]
  private maxFiles: number

  private static HARD_IGNORED_EXTENSIONS = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.pdf',
    '.zip',
    '.exe',
    '.dll',
  ]

  constructor(
    baseDir: string,
    additionalIgnores: string[] = [],
    maxFiles: number = 10000
  ) {
    this.baseDir = realpathSync(resolve(baseDir))
    this.maxFiles = maxFiles

    const allPatterns = [...DEFAULT_IGNORE_LIST, ...additionalIgnores]

    this.ignorePatterns = []
    this.ignoreRegexes = []
    this.negationPatterns = []

    for (const rawPattern of allPatterns) {
      const pattern = rawPattern.trim()
      if (!pattern) continue

      if (pattern.startsWith('!')) {
        this.negationPatterns.push(pattern.substring(1))
      } else if (pattern.startsWith('/') && pattern.endsWith('/')) {
        try {
          this.ignoreRegexes.push(new RegExp(pattern.slice(1, -1)))
        } catch {
          this.ignorePatterns.push(pattern)
        }
      } else {
        this.ignorePatterns.push(pattern)
      }
    }
  }

  private isHardIgnored(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    return VFSManager.HARD_IGNORED_EXTENSIONS.includes(ext)
  }

  private checkNodeIgnoreState(
    relPath: string,
    name: string
  ): { isIgnored: boolean; isNegated: boolean } {
    if (!relPath || relPath === '.')
      return { isIgnored: false, isNegated: false }

    if (this.isHardIgnored(name)) {
      return { isIgnored: true, isNegated: false }
    }

    const matchesRegex = this.ignoreRegexes.some(
      (r) => r.test(relPath) || r.test(name)
    )
    const matchesGlob =
      micromatch.isMatch(relPath, this.ignorePatterns, {
        matchBase: true,
        dot: true,
      }) || this.ignorePatterns.some((p) => relPath.startsWith(p + '/'))

    if (matchesRegex || matchesGlob) {
      if (this.negationPatterns.length > 0) {
        const negated =
          micromatch.isMatch(relPath, this.negationPatterns, {
            matchBase: true,
            dot: true,
          }) || this.negationPatterns.some((p) => relPath.startsWith(p + '/'))
        if (negated) {
          return { isIgnored: false, isNegated: true }
        }
      }
      return { isIgnored: true, isNegated: false }
    }

    // Not ignored — check if it explicitly matches a negation pattern
    if (this.negationPatterns.length > 0) {
      const negated = micromatch.isMatch(relPath, this.negationPatterns, {
        matchBase: true,
        dot: true,
      })
      if (negated) {
        return { isIgnored: false, isNegated: true }
      }
    }

    return { isIgnored: false, isNegated: false }
  }

  public getTree(): { tree: VFSNode; partial: boolean } {
    let fileCount = 0
    let partial = false

    const buildTree = (
      currentPath: string,
      relPath: string
    ): VFSNode | null => {
      if (fileCount >= this.maxFiles) {
        partial = true
        return null
      }

      const name =
        currentPath === this.baseDir
          ? this.baseDir.split(/[/\\]/).pop() || 'root'
          : currentPath.split(/[/\\]/).pop() || ''

      const { isIgnored, isNegated } = this.checkNodeIgnoreState(relPath, name)

      let kind: 'file' | 'directory'
      let size = 0
      let children: VFSNode[] | undefined = undefined

      try {
        // Use lstatSync so symlinks are NOT automatically resolved/followed.
        // This ensures VFS parity with the CLI (followSymlinks: false by default).
        const lstats = lstatSync(currentPath)

        if (lstats.isSymbolicLink()) {
          // Symlinks are shown in the tree as ignored ghost entries — not traversed.
          return {
            name,
            path: relPath || '.',
            kind: 'file',
            size: 0,
            isIgnored: true,
          }
        }

        if (lstats.isDirectory()) {
          kind = 'directory'
          children = []

          // Don't traverse into ignored directories — return them as empty.
          if (!isIgnored) {
            const entries = readdirSync(currentPath)
            for (const entry of entries) {
              if (fileCount >= this.maxFiles) {
                partial = true
                break
              }
              const childFullPath = join(currentPath, entry)
              const childRelPath = relPath ? `${relPath}/${entry}` : entry
              const childNode = buildTree(childFullPath, childRelPath)
              if (childNode) {
                children.push(childNode)
              }
            }
          }
        } else if (lstats.isFile()) {
          kind = 'file'
          size = lstats.size
          fileCount++
        } else {
          // Skip sockets, FIFOs, device files, etc.
          return null
        }
      } catch {
        return null
      }

      return {
        name,
        path: relPath || '.',
        kind,
        ...(kind === 'file' ? { size } : { children }),
        ...(isIgnored ? { isIgnored: true } : {}),
        ...(isNegated ? { isNegated: true } : {}),
      }
    }

    const tree = buildTree(this.baseDir, '')
    return {
      tree: tree || {
        name: 'root',
        path: '.',
        kind: 'directory',
        children: [],
      },
      partial,
    }
  }
}
