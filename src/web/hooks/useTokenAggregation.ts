/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react'
import type { FileItem, TreeItem } from '../../core/types'

interface TokenMetadata {
  tokens: number
  isPrecise: boolean
  hash?: string
}

/**
 * Hook to manage hierarchical token aggregation.
 */
export const useTokenAggregation = (
  files: FileItem[],
  isIgnored?: (path: string) => boolean
) => {
  const tokenMap = useMemo(() => {
    const map: Record<string, TokenMetadata> = {}
    for (const file of files) {
      if (file.kind !== 'file') continue
      const content = file.content
      const tokens =
        file.tokens !== undefined
          ? file.tokens
          : typeof content === 'string'
            ? Math.ceil(content.length / 4)
            : 0

      map[file.path] = {
        tokens,
        isPrecise: true,
      }
    }
    return map
  }, [files])

  const aggregateTreeTokens = useCallback(
    (item: TreeItem): TreeItem => {
      if (item.kind === 'file') {
        const meta = tokenMap[item.path]
        const tokens = meta ? meta.tokens : item.tokens || 0
        const isPrecise = meta ? meta.isPrecise : true
        return {
          ...item,
          tokens,
          isPrecise,
        }
      }

      let dirTokens = 0
      let allChildrenPrecise = true

      const children = item.children
        ? item.children.map((child) => {
            const updated = aggregateTreeTokens(child)
            const ignored = isIgnored ? isIgnored(updated.path) : false
            if (!ignored) {
              dirTokens += updated.tokens || 0
              if (updated.isPrecise === false) {
                allChildrenPrecise = false
              }
            }
            return updated
          })
        : []

      return {
        ...item,
        tokens: dirTokens,
        isPrecise: allChildrenPrecise,
        children,
      }
    },
    [tokenMap, isIgnored]
  )

  const isFullyPrecise = useMemo(() => {
    return true
  }, [])

  const computeTreeWeights = useCallback(
    (tree: TreeItem | null): TreeItem | null => {
      if (!tree) return null
      return aggregateTreeTokens(tree)
    },
    [aggregateTreeTokens]
  )

  return {
    tokenMap,
    aggregateTreeTokens,
    computeTreeWeights,
    isFullyPrecise,
  }
}
