/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { FileItem, TreeItem } from '../../core/types'
import { TokenService } from '../../core/TokenService'
import { logger } from '../../lib/logger'

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

  // Worker state
  const [worker, setWorker] = useState<Worker | null>(null)

  // Queue for precision counting
  const dirtyQueueRef = useRef<Set<string>>(new Set())
  const processingPathsRef = useRef<Set<string>>(new Set())

  // Pending results for debounced update
  const pendingResultsRef = useRef<Record<string, TokenMetadata>>({})
  const processResultsTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [queueTrigger, setQueueTrigger] = useState(0)

  // Initialize worker
  useEffect(() => {
    const w = new Worker(
      new URL('../workers/token.worker.ts', import.meta.url),
      { type: 'module' }
    )

    w.onerror = (err) => {
      logger.error(
        '[Worker] Initialization error:',
        err instanceof Error ? err : new Error(String(err))
      )
    }

    setWorker(w)

    return () => {
      w.terminate()
      setWorker(null)
    }
  }, []) // Persistent worker for the hook's lifecycle

  // Handle worker messages with latest files
  useEffect(() => {
    if (!worker) return

    worker.onmessage = (e: MessageEvent) => {
      const { results } = e.data
      if (!results || !Array.isArray(results)) return

      // Optimization: Create a lookup map once for the entire batch of results
      const fileLookup = new Map<string, string>()
      if (results.length > 5) {
        // Only worth it for larger batches
        for (const file of files) {
          if (file.kind === 'file' && typeof file.content === 'string') {
            fileLookup.set(file.path, file.content)
          }
        }
      }

      results.forEach(
        (res: {
          id: string
          tokens: number
          isPrecise: boolean
          success: boolean
        }) => {
          processingPathsRef.current.delete(res.id)

          if (res.success) {
            pendingResultsRef.current[res.id] = {
              tokens: res.tokens,
              isPrecise: res.isPrecise,
            }

            // Update hash cache for future optimization
            let content: string | undefined
            if (fileLookup.size > 0) {
              content = fileLookup.get(res.id)
            } else {
              const file = files.find((f) => f.path === res.id)
              if (file && typeof file.content === 'string')
                content = file.content
            }

            if (content) {
              const hash = TokenService.hashContent(content)
              hashCacheRef.current.set(hash, res.tokens)
            }
          } else {
            pendingResultsRef.current[res.id] = {
              tokens: res.tokens,
              isPrecise: true, // Mark as "processed" even if failed to avoid loops
            }
          }
        }
      )

      if (processResultsTimerRef.current)
        clearTimeout(processResultsTimerRef.current)

      processResultsTimerRef.current = setTimeout(() => {
        const resultsToCommit = { ...pendingResultsRef.current }
        setTokenMap((prev) => ({ ...prev, ...resultsToCommit }))
        pendingResultsRef.current = {}
        processResultsTimerRef.current = null
      }, 200)
    }
  }, [worker, files])

  // Process files when they change
  useEffect(() => {
    const newMetadata: Record<string, TokenMetadata> = {}
    let hasChanges = false
    let addedToQueue = false

    // Optimization: avoid expensive hashing if we already have a precise result
    for (const file of files) {
      if (
        file.kind !== 'file' ||
        !file.content ||
        typeof file.content !== 'string'
      ) {
        continue
      }

      const current = tokenMap[file.path]

      // If already precise or already being processed by worker, skip
      if (current?.isPrecise || processingPathsRef.current.has(file.path))
        continue

      // Only hash if we don't have a precise result
      const hash = TokenService.hashContent(file.content)
      const cached = hashCacheRef.current.get(hash)

      if (cached !== undefined) {
        if (!current || current.tokens !== cached) {
          newMetadata[file.path] = { tokens: cached, isPrecise: true }
          hasChanges = true
        }
        continue
      }

      if (!current) {
        // Immediate Heuristic
        newMetadata[file.path] = {
          tokens: TokenService.getTokenEstimate(file.content),
          isPrecise: false,
        }
        dirtyQueueRef.current.add(file.path)
        hasChanges = true
        addedToQueue = true
      } else if (!current.isPrecise && !dirtyQueueRef.current.has(file.path)) {
        // Already has heuristic, but not yet precise and not in current queue
        dirtyQueueRef.current.add(file.path)
        addedToQueue = true
      }
    }

    if (hasChanges) {
      setTokenMap((prev) => ({ ...prev, ...newMetadata }))
    }

    if (addedToQueue) {
      setQueueTrigger((prev) => prev + 1)
    }
  }, [files, tokenMap])

  // Background processing of the dirty queue
  useEffect(() => {
    if (!worker || dirtyQueueRef.current.size === 0) return

    // Small delay to allow multiple fast file changes to batch into one worker cycle
    const timer = setTimeout(() => {
      const allDirty: string[] = Array.from(dirtyQueueRef.current)
      dirtyQueueRef.current.clear()

      if (allDirty.length > 0) {
        // Optimization: Create a lookup map once to avoid O(N^2) search in allDirty loop
        const fileLookup = new Map<string, string>()
        for (const file of files) {
          if (
            file.kind === 'file' &&
            typeof file.content === 'string' &&
            file.content
          ) {
            fileLookup.set(file.path, file.content)
          }
        }

        const filesToProcess = allDirty
          .map((path) => {
            const content = fileLookup.get(path)
            if (content === undefined) return null
            processingPathsRef.current.add(path)
            return { id: path, content }
          })
          .filter(Boolean) as Array<{ id: string; content: string }>

        if (filesToProcess.length > 0) {
          // Send in batches of 500 to avoid blocking the worker bridge
          const BATCH_SIZE = 500
          for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
            const batch = filesToProcess.slice(i, i + BATCH_SIZE)
            worker.postMessage({ files: batch })
          }
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [worker, queueTrigger, files])

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
