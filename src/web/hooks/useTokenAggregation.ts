/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { FileItem, TreeItem } from '../../core/types'
import { TokenService } from '../../core/TokenService'

interface TokenMetadata {
  tokens: number
  isPrecise: boolean
}

/**
 * Hook to manage hierarchical token aggregation with background worker precision.
 */
export const useTokenAggregation = (files: FileItem[]) => {
  // State for tracking file tokens (path -> metadata)
  const [tokenMap, setTokenMap] = useState<Record<string, TokenMetadata>>({})

  // Cache for hashed content results
  const hashCacheRef = useRef<Map<string, number>>(new Map())

  // Worker reference
  const workerRef = useRef<Worker | null>(null)

  // Queue for precision counting
  const dirtyQueueRef = useRef<Set<string>>(new Set())

  // Pending results for debounced update
  const pendingResultsRef = useRef<Record<string, TokenMetadata>>({})
  const processResultsTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize/Update worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/token.worker.ts', import.meta.url),
      { type: 'module' }
    )

    workerRef.current.onmessage = (e: MessageEvent) => {
      const { results } = e.data

      results.forEach(
        (res: { id: string; tokens: number; success: boolean }) => {
          if (res.success) {
            pendingResultsRef.current[res.id] = {
              tokens: res.tokens,
              isPrecise: true,
            }

            // Update hash cache
            const file = files.find((f) => f.path === res.id)
            if (file && typeof file.content === 'string') {
              const hash = TokenService.hashContent(file.content)
              hashCacheRef.current.set(hash, res.tokens)
            }
          }
        }
      )

      if (processResultsTimerRef.current)
        clearTimeout(processResultsTimerRef.current)

      processResultsTimerRef.current = setTimeout(() => {
        setTokenMap((prev) => ({ ...prev, ...pendingResultsRef.current }))
        pendingResultsRef.current = {}
        processResultsTimerRef.current = null
      }, 200)
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [files])

  // Process files when they change
  useEffect(() => {
    const newMetadata: Record<string, TokenMetadata> = {}
    let hasChanges = false

    files.forEach((file) => {
      if (
        file.kind !== 'file' ||
        !file.content ||
        typeof file.content !== 'string'
      )
        return

      const hash = TokenService.hashContent(file.content)
      const cached = hashCacheRef.current.get(hash)

      if (cached !== undefined) {
        if (!tokenMap[file.path] || tokenMap[file.path].tokens !== cached) {
          newMetadata[file.path] = { tokens: cached, isPrecise: true }
          hasChanges = true
        }
        return
      }

      const current = tokenMap[file.path]
      if (!current) {
        // Immediate Heuristic
        newMetadata[file.path] = {
          tokens: TokenService.getTokenEstimate(file.content),
          isPrecise: false,
        }
        dirtyQueueRef.current.add(file.path)
        hasChanges = true
      }
    })

    if (hasChanges) {
      setTokenMap((prev) => ({ ...prev, ...newMetadata }))
    }
  }, [files, tokenMap])

  // Background processing of the dirty queue
  useEffect(() => {
    if (dirtyQueueRef.current.size === 0 || !workerRef.current) return

    const timer = setTimeout(() => {
      const batch = Array.from(dirtyQueueRef.current)
        .map((path) => {
          const file = files.find((f) => f.path === path)
          if (file && typeof file.content === 'string') {
            return { id: path, content: file.content }
          }
          return null
        })
        .filter(Boolean) as Array<{ id: string; content: string }>

      if (batch.length > 0) {
        workerRef.current?.postMessage({ files: batch })
      }
      dirtyQueueRef.current.clear()
    }, 500) // Small delay to batch uploads

    return () => clearTimeout(timer)
  }, [files])

  /**
   * Recursive function to compute directory weights from the token map.
   * This is memoized to prevent expensive re-calculations.
   */
  const computeTreeWeights = useCallback(
    (node: TreeItem): { tokens: number; isPrecise: boolean } => {
      return TokenService.computeTreeWeights(node, tokenMap)
    },
    [tokenMap]
  )

  return {
    tokenMap,
    computeTreeWeights,
  }
}
