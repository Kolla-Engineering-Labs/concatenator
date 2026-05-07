/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileItem } from './types'

export interface Absorption {
  child: string
  parent: string
}

/**
 * Reconciles new files with existing ones, pruning redundant roots.
 *
 * Root Pruning Rules:
 * 1. If a new file/folder is a parent of an existing entry, the existing entry is "absorbed".
 * 2. If a new file/folder is a child of an existing entry, it's merged into the existing structure.
 */
export function reconcileFiles(
  existingFiles: FileItem[],
  newFiles: FileItem[]
): { files: FileItem[]; absorptions: Absorption[] } {
  const absorptions: Absorption[] = []
  const filesMap = new Map<string, FileItem>()

  for (const file of existingFiles) {
    filesMap.set(file.path, file)
  }

  // Phase 1: Suffix absorption — O(n + m×depth)
  // Build a map of every suffix of every new path → its parent prefix.
  // E.g. new path "src/drivers/zip-driver.ts" contributes:
  //   "drivers/zip-driver.ts" → "src"
  //   "zip-driver.ts"         → "src/drivers"
  // Then each existing path is looked up in O(1).
  const suffixToParent = new Map<string, string>()
  for (const newFile of newFiles) {
    const parts = newFile.path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const suffix = parts.slice(i).join('/')
      if (suffix && !suffixToParent.has(suffix)) {
        suffixToParent.set(suffix, parts.slice(0, i).join('/'))
      }
    }
  }

  for (const existingPath of [...filesMap.keys()]) {
    const parentPrefix = suffixToParent.get(existingPath)
    if (parentPrefix !== undefined) {
      absorptions.push({ child: existingPath, parent: parentPrefix })
      filesMap.delete(existingPath)
    }
  }

  // Phase 2: Parent absorption — O(n + m×depth)
  // Build a set of every new directory prefix so we can check in O(1)
  // whether a new file is a parent directory of an existing entry.
  // We must only check against the *original* existing paths (snapshot
  // before any new files are added) so directory entries from the current
  // drop cannot absorb their own sibling files.
  const originalExistingPaths = new Set(filesMap.keys())

  // Build a prefix set from new paths for fast parent-of-existing checks.
  const newPrefixSet = new Set<string>()
  for (const newFile of newFiles) {
    newPrefixSet.add(newFile.path)
  }

  for (const existingPath of originalExistingPaths) {
    if (!filesMap.has(existingPath)) continue // already absorbed in Phase 1
    // Walk up the existing path to see if any ancestor is in the new drop
    const parts = existingPath.split('/')
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/')
      if (ancestor && newPrefixSet.has(ancestor)) {
        absorptions.push({ child: existingPath, parent: ancestor })
        filesMap.delete(existingPath)
        break
      }
    }
  }

  for (const newFile of newFiles) {
    filesMap.set(newFile.path, newFile)
  }

  return {
    files: Array.from(filesMap.values()),
    absorptions,
  }
}

/**
 * Prunes redundant sub-paths from a list of paths.
 * Expects absolute paths for reliable subsumption logic.
 * Returns only the most senior (highest-level) unique paths.
 */
export function prunePaths(paths: string[]): {
  pruned: string[]
  remaining: string[]
} {
  // Sort by length so we check parents before children
  const sorted = [...paths].sort((a, b) => a.length - b.length)
  const remaining: string[] = []
  const pruned: string[] = []

  for (const path of sorted) {
    // Check if current path is a child of any already accepted parent path
    const isSubPath = remaining.some((parent) => {
      if (path === parent) return true
      // Ensure we match directory boundaries to avoid partial matches (e.g., /src-old vs /src)
      const parentWithSlash =
        parent.endsWith('/') || parent.endsWith('\\') ? parent : parent + '/' // We'll handle both slashes just in case, though they should be normalized

      // On Windows, paths might have backslashes.
      // It's safer to use a normalized check or platform-specific separator.
      return (
        path.startsWith(parentWithSlash) ||
        path.startsWith(parent.replace(/\//g, '\\') + '\\')
      )
    })

    if (isSubPath) {
      pruned.push(path)
    } else {
      remaining.push(path)
    }
  }

  return { pruned, remaining }
}

/**
 * Calculates the minimum common root path for a list of files.
 */
export function findMinimumCommonRoot(paths: string[]): string {
  if (paths.length === 0) return ''
  if (paths.length === 1) {
    const lastSlash = paths[0].lastIndexOf('/')
    return lastSlash === -1 ? '' : paths[0].substring(0, lastSlash)
  }

  const sortedPaths = [...paths].sort()
  const first = sortedPaths[0].split('/')
  const last = sortedPaths[sortedPaths.length - 1].split('/')

  let i = 0
  while (i < first.length && i < last.length && first[i] === last[i]) {
    i++
  }

  return first.slice(0, i).join('/')
}
