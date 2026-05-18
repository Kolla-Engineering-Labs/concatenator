/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsDefault from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULT_IGNORE_LIST, BINARY_EXTENSIONS } from './constants.js'
import { IgnoreEngine } from './ignore/IgnoreEngine.js'

export interface VFSFileSystem {
  lstatSync: typeof fsDefault.lstatSync
  readdirSync: typeof fsDefault.readdirSync
  realpathSync: typeof fsDefault.realpathSync
}

export interface VFSNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  size?: number
  isIgnored: boolean
  isNegated: boolean
  reason?: string
  children?: VFSNode[]
}

export class VFSManager {
  private baseDir: string
  private ignoreEngine: IgnoreEngine
  private maxFiles: number

  private static HARD_IGNORED_EXTENSIONS = BINARY_EXTENSIONS

  constructor(
    baseDir: string,
    additionalIgnores: string[] = [],
    maxFiles: number = 10000,
    private fs: VFSFileSystem = fsDefault
  ) {
    this.baseDir = this.fs.realpathSync(resolve(baseDir))
    this.maxFiles = maxFiles

    const allPatterns = [...DEFAULT_IGNORE_LIST, ...additionalIgnores]
    this.ignoreEngine = new IgnoreEngine(allPatterns)
  }

  private isHardIgnored(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    return VFSManager.HARD_IGNORED_EXTENSIONS.includes(ext)
  }

  private checkNodeIgnoreState(
    relPath: string,
    name: string
  ): { isIgnored: boolean; isNegated: boolean; reason?: string } {
    if (!relPath || relPath === '.')
      return { isIgnored: false, isNegated: false }

    if (this.isHardIgnored(name)) {
      return {
        isIgnored: true,
        isNegated: false,
        reason: 'Binary File Detected',
      }
    }

    const { ignored, reason: matchedPattern } =
      this.ignoreEngine.getIgnoreResult(relPath)
    const isNegated = this.ignoreEngine.isExplicitlyNegated(relPath)

    let reason: string | undefined = undefined
    if (ignored && matchedPattern) {
      const patternStr = String(matchedPattern)
      if (patternStr.startsWith('/') && patternStr.endsWith('/')) {
        reason = `Matched regex ${patternStr}`
      } else {
        reason = `Matched glob ${patternStr}`
      }
    }

    return { isIgnored: ignored, isNegated, reason }
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

      const { isIgnored, isNegated, reason } = this.checkNodeIgnoreState(
        relPath,
        name
      )

      let kind: 'file' | 'directory'
      let size = 0
      let children: VFSNode[] | undefined = undefined

      try {
        const lstats = this.fs.lstatSync(currentPath)

        if (lstats.isSymbolicLink()) {
          return {
            name,
            path: relPath || '.',
            kind: 'file',
            size: 0,
            isIgnored: true,
            isNegated: false,
            children: undefined,
          }
        }

        if (lstats.isDirectory()) {
          kind = 'directory'
          children = []

          if (this.ignoreEngine.shouldRecurse(relPath)) {
            try {
              const entries = this.fs.readdirSync(currentPath)
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
            } catch {
              // Skip children if readdir fails
            }
          }
        } else if (lstats.isFile()) {
          kind = 'file'
          size = lstats.size
          fileCount++
        } else {
          return null
        }
      } catch {
        return null
      }

      return {
        name,
        path: relPath || '.',
        kind,
        size: kind === 'file' ? size : undefined,
        children: kind === 'directory' ? children : undefined,
        isIgnored,
        isNegated,
        reason,
      }
    }

    const tree = buildTree(this.baseDir, '')
    return {
      tree: tree || {
        name: 'root',
        path: '.',
        kind: 'directory',
        children: [],
        isIgnored: false,
        isNegated: false,
      },
      partial,
    }
  }
}
