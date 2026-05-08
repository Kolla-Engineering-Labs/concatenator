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
class PathTrieNode {
  children = new Map<string, PathTrieNode>()
  isTerminal = false
  path?: string
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

  // Phase 1: Suffix absorption — O((n + m) × depth)
  // Build a reversed Trie of existing paths for fast suffix matching.
  // This handles cases where a file was added via a shallow path (e.g., "main.ts")
  // and is now being added via a deeper path (e.g., "src/main.ts").
  const existingTrie = new PathTrieNode()
  for (const existingPath of filesMap.keys()) {
    let current = existingTrie
    // Normalize and split to handle cross-platform paths reliably
    const parts = existingPath.split(/[/\\]/).filter(Boolean)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      if (!current.children.has(part)) {
        current.children.set(part, new PathTrieNode())
      }
      current = current.children.get(part)!
    }
    current.isTerminal = true
    current.path = existingPath
  }

  // For each new file, walk the Trie with its reversed segments to find suffix matches.
  for (const newFile of newFiles) {
    const parts = newFile.path.split(/[/\\]/).filter(Boolean)
    let current = existingTrie
    // Check suffixes of newFile.path. Stop before the last segment to avoid
    // absorbing the identical path (handled by final map merge).
    // This logic correctly distinguishes between "dir1/file.txt" and "dir2/file.txt"
    // because the Trie branches at the directory level.
    for (let i = parts.length - 1; i > 0; i--) {
      const part = parts[i]
      current = current.children.get(part)!
      if (!current) break

      if (current.isTerminal && current.path) {
        const existingPath = current.path
        if (filesMap.has(existingPath)) {
          const parentPrefix = parts.slice(0, i).join('/')
          absorptions.push({ child: existingPath, parent: parentPrefix })
          filesMap.delete(existingPath)
        }
      }
    }
  }

  // Phase 2: Parent absorption — O((n + m) × depth)
  // Build a Trie of all new paths for fast prefix matching.
  // This handles cases where a new folder (e.g., "src") is added,
  // absorbing all existing files within it (e.g., "src/App.tsx").
  const newTrie = new PathTrieNode()
  for (const newFile of newFiles) {
    let current = newTrie
    const parts = newFile.path.split(/[/\\]/).filter(Boolean)
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, new PathTrieNode())
      }
      current = current.children.get(part)!
    }
    current.isTerminal = true
    current.path = newFile.path
  }

  // For each remaining existing path, walk the newTrie to see if any prefix is a new file.
  for (const existingPath of [...filesMap.keys()]) {
    const parts = existingPath.split(/[/\\]/).filter(Boolean)
    let current = newTrie
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      current = current.children.get(part)!
      if (!current) break

      if (current.isTerminal && current.path) {
        absorptions.push({ child: existingPath, parent: current.path })
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

  const root = new PathTrieNode()

  for (const path of sorted) {
    // Normalize and split by both / and \ to handle cross-platform absolute paths
    const parts = path.split(/[/\\]/)
    // Remove trailing empty segments (e.g. from trailing slashes) to ensure consistent Trie matching
    while (parts.length > 1 && parts[parts.length - 1] === '') {
      parts.pop()
    }
    let current = root
    let isSubPath = false

    // Walk the Trie to see if any ancestor of the current path is already accepted
    for (const part of parts) {
      if (current.isTerminal) {
        isSubPath = true
        break
      }
      const next = current.children.get(part)
      if (!next) break
      current = next
    }

    // Exact match also counts as sub-path (pruning duplicates)
    if (current.isTerminal) isSubPath = true

    if (isSubPath) {
      pruned.push(path)
    } else {
      remaining.push(path)
      // Add the newly accepted parent path to the Trie
      let currentAdd = root
      for (const part of parts) {
        if (!currentAdd.children.has(part)) {
          currentAdd.children.set(part, new PathTrieNode())
        }
        currentAdd = currentAdd.children.get(part)!
      }
      currentAdd.isTerminal = true
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
