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
      const parts = file.path.split('/').filter((p) => p !== '')
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
            isIgnored: isLast ? file.isIgnored : isIgnored(currentPath),
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

    if (
      root.children &&
      root.children.length === 1 &&
      root.children[0].kind === 'directory'
    ) {
      return root.children[0]
    }

    return root
  }, [filteredFiles, isIgnored, tokenMap])

  return fileTree
}
