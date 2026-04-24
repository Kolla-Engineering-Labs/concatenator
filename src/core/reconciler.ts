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
  const existingPathsSet = new Set<string>()

  // Add existing files to map and tracker
  for (const file of existingFiles) {
    filesMap.set(file.path, file)
    existingPathsSet.add(file.path)
  }

  // Process new files
  for (const newFile of newFiles) {
    const newPath = newFile.path

    // Rule 1: New entry is a parent of an existing root entry
    // Check all existing entries to see if they should be swallowed
    for (const existingPath of existingPathsSet) {
      if (
        filesMap.has(existingPath) &&
        existingPath.startsWith(newPath + '/') &&
        newPath !== ''
      ) {
        absorptions.push({ child: existingPath, parent: newPath })
        filesMap.delete(existingPath)
        // No need to delete from existingPathsSet, we check filesMap.has
      }
    }

    // Rule 2: New entry is a child of an existing root entry
    // Naturally handled by merging into the flat Map.
    // The tree view calculates the Minimum Common Root dynamically.

    filesMap.set(newPath, newFile)
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
