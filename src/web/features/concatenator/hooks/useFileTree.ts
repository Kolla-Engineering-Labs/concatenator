/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react'
import { FileItem, TreeItem } from '../../../../core/types'

const EMPTY_MAP = {}

/**
 * Custom hook to construct a hierarchical tree structure from a flat list of files.
 */
export const useFileTree = (
  filteredFiles: FileItem[],
  isIgnored: (path: string) => boolean,
  isExplicitlyNegated: (path: string) => boolean,
  tokenMap: Record<string, { tokens: number; isPrecise: boolean }> = EMPTY_MAP
) => {
  const fileTree = useMemo(() => {
    const root: TreeItem = {
      name: 'Root',
      path: '',
      kind: 'directory',
      children: [],
      isIgnored: false,
    }

    filteredFiles.forEach((file) => {
      const normalizedPath = file.path.replace(/\\/g, '/')
      const parts = normalizedPath.split('/').filter((p) => p !== '')
      let current = root

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1
        const currentPath = parts.slice(0, index + 1).join('/')

        let existing = current.children?.find((c) => c.name === part)

        if (!existing) {
          existing = {
            name: part,
            path: currentPath,
            kind: isLast ? file.kind : 'directory',
            children: isLast && file.kind === 'file' ? undefined : [],
            isIgnored: isIgnored(currentPath),
            isNegated: isLast
              ? (file as FileItem).isNegated
              : isExplicitlyNegated(currentPath),
            file: isLast ? file : undefined,
          }
          current.children?.push(existing)
        }
        current = existing
      })
    })

    const applyWeights = (
      node: TreeItem
    ): { tokens: number; isPrecise: boolean } => {
      if (node.kind === 'file') {
        const meta = tokenMap[node.path] || {
          tokens: node.file?.tokens || 0,
          isPrecise: node.file?.isPrecise || false,
        }
        node.tokenWeight = meta.tokens
        node.isPrecise = meta.isPrecise
        // If file is ignored, it contributes 0 to parent total
        if (node.isIgnored) {
          return { tokens: 0, isPrecise: true }
        }
        return meta
      }

      let total = 0
      let allPrecise = true

      if (node.children) {
        node.children.forEach((child) => {
          const { tokens, isPrecise } = applyWeights(child)
          total += tokens
          if (!isPrecise) allPrecise = false
        })
      }

      node.tokenWeight = total
      node.isPrecise = allPrecise
      // If directory is ignored, it contributes 0 to parent total
      if (node.isIgnored) {
        return { tokens: 0, isPrecise: true }
      }
      return { tokens: total, isPrecise: allPrecise }
    }

    applyWeights(root)

    const sortTree = (node: TreeItem) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.kind === 'directory' && b.kind === 'file') return -1
          if (a.kind === 'file' && b.kind === 'directory') return 1
          return a.name.localeCompare(b.name)
        })
        node.children.forEach(sortTree)
      }
    }
    sortTree(root)

    // Promote single root directory if it's the only child
    let promotedRoot = root
    while (
      promotedRoot.children?.length === 1 &&
      promotedRoot.children[0].kind === 'directory'
    ) {
      promotedRoot = promotedRoot.children[0]
    }

    return promotedRoot
  }, [filteredFiles, isIgnored, isExplicitlyNegated, tokenMap])

  return fileTree
}
