/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { FileItem, TreeItem } from '../../core/types'
import { TokenService } from '../../core/TokenService'
import { logger } from '../../lib/logger'
import { isBinaryFile } from '../../lib/utils'
import TokenWorker from '../workers/token.worker.ts?worker'

interface TokenMetadata {
  tokens: number
  isPrecise: boolean
  hash?: string
}

interface WorkerResult {
  id: string
  tokens: number
  isPrecise: boolean
  success: boolean
  hash?: string
}

/**
 * Hook to manage hierarchical token aggregation with background worker precision.
 */
export const useTokenAggregation = (
  files: FileItem[],
  isIgnored?: (path: string) => boolean
) => {
  const [tokenMap, setTokenMap] = useState<Record<string, TokenMetadata>>({})
  const hashCacheRef = useRef<
    Map<string, { tokens: number; isPrecise: boolean }>
  >(new Map())
  const contentHashesRef = useRef<Map<string, string>>(new Map())
  const [worker, setWorker] = useState<Worker | null>(null)
  const dirtyQueueRef = useRef<Set<string>>(new Set())
  const processingPathsRef = useRef<Set<string>>(new Set())

  // Refs for stable access in async handlers and effect optimization
  const filesRef = useRef(files)
  filesRef.current = files
  const tokenMapRef = useRef(tokenMap)
  tokenMapRef.current = tokenMap

  useEffect(() => {
    try {
      const w = new TokenWorker()
      w.onerror = (err) => logger.error('[Worker] Initialization error:', err)
      setWorker(w)
      return () => {
        w.terminate()
        setWorker(null)
      }
    } catch (err) {
      logger.error('[Worker] Failed to create TokenWorker:', err)
    }
  }, [])

  // 1. Worker Result Listener (Atomic Updates)
  useEffect(() => {
    if (!worker) return

    const resultsBuffer: Record<string, TokenMetadata> = {}
    let bufferTimer: NodeJS.Timeout | null = null

    worker.onmessage = (e: MessageEvent) => {
      const { results } = e.data
      if (!results || !Array.isArray(results)) return

      results.forEach((r: WorkerResult) => {
        processingPathsRef.current.delete(r.id)

        if (!r.success) {
          logger.warn(`[TokenAggregation] File ${r.id} returned success: false`)
          return
        }

        resultsBuffer[r.id] = {
          tokens: r.tokens,
          isPrecise: r.isPrecise,
          hash: r.hash,
        }
        if (r.hash) {
          hashCacheRef.current.set(r.hash, {
            tokens: r.tokens,
            isPrecise: r.isPrecise,
          })
        }
      })

      // Use a non-clearing interval or a leading-edge throttle for the buffer flush
      if (!bufferTimer) {
        bufferTimer = setTimeout(() => {
          bufferTimer = null
          const updates = { ...resultsBuffer }
          // Clear buffer
          Object.keys(resultsBuffer).forEach((k) => delete resultsBuffer[k])

          setTokenMap((prev) => {
            const next = { ...prev, ...updates }
            Object.keys(updates).forEach((id) => {
              processingPathsRef.current.delete(id)

              // Check for "edit during flight"
              const file = filesRef.current.find((f) => f.path === id)
              if (file && file.content && typeof file.content === 'string') {
                const currentHash = TokenService.hashContent(file.content)
                if (currentHash !== updates[id].hash) {
                  dirtyQueueRef.current.add(id)
                }
              }
            })
            return next
          })
        }, 500) // Batch worker responses every 500ms to prevent massive tree rebuilds from locking the UI
      }
    }

    return () => {
      worker.onmessage = null
      if (bufferTimer) clearTimeout(bufferTimer)
    }
  }, [worker])

  // 2. Initial Sync (Heuristics & Cleanup)
  useEffect(() => {
    const newMetadata: Record<string, TokenMetadata> = {}
    let hasChanges = false

    const currentPaths = new Set(files.map((f) => f.path))

    // Cleanup stale hashes
    for (const path of contentHashesRef.current.keys()) {
      if (!currentPaths.has(path)) contentHashesRef.current.delete(path)
    }

    for (const file of files) {
      if (file.kind !== 'file' || file.content === undefined) continue
      const content = file.content
      if (typeof content !== 'string') {
        // Binary or missing content: treat as precise (heuristic is the only option here)
        // to avoid blocking the global precision indicator.
        const current = tokenMapRef.current[file.path]
        if (!current) {
          newMetadata[file.path] = {
            tokens: file.tokens || 0,
            isPrecise: true,
          }
          hasChanges = true
        }
        continue
      }

      let hash = contentHashesRef.current.get(file.path)
      if (hash === undefined) {
        hash = TokenService.hashContent(content)
        contentHashesRef.current.set(file.path, hash)
      }

      const current = tokenMapRef.current[file.path]
      const currentlyIgnored = file.isIgnored ?? false

      if (!current || current.hash !== hash) {
        const cached = hashCacheRef.current.get(hash)
        if (cached) {
          newMetadata[file.path] = {
            tokens: cached.tokens,
            isPrecise: true,
            hash,
          }
        } else if (content.length > 500 * 1024 || isBinaryFile(file.path)) {
          // Skip precision worker for files over 500KB or binary files to prevent browser/worker CPU exhaustion.
          // For such files, the heuristic (char count / 4) is extremely close and perfectly sufficient.
          newMetadata[file.path] = {
            tokens: Math.ceil(content.length / 4),
            isPrecise: true,
            hash,
          }
        } else {
          newMetadata[file.path] = {
            tokens: TokenService.getTokenEstimate(content),
            isPrecise: false,
            hash,
          }
          if (!currentlyIgnored) {
            dirtyQueueRef.current.add(file.path)
          }
        }
        hasChanges = true
      } else if (
        !current.isPrecise &&
        !currentlyIgnored &&
        !processingPathsRef.current.has(file.path) &&
        !dirtyQueueRef.current.has(file.path)
      ) {
        dirtyQueueRef.current.add(file.path)
      }
    }

    setTokenMap((prev) => {
      let changed = false
      const next = { ...prev }

      // Cleanup stale entries
      Object.keys(next).forEach((p) => {
        if (!currentPaths.has(p)) {
          delete next[p]
          changed = true
        }
      })

      if (hasChanges) return { ...next, ...newMetadata }
      return changed ? next : prev
    })

    // Cleanup: If things became ignored, remove them from the dirty queue
    const toRemove: string[] = []
    for (const p of dirtyQueueRef.current) {
      const f = filesRef.current.find((file) => file.path === p)
      if (!f || f.isIgnored) toRemove.push(p)
    }
    toRemove.forEach((p) => dirtyQueueRef.current.delete(p))
  }, [files, isIgnored]) // Added isIgnored to deps to trigger re-sync on ignore changes

  const isIgnoredRef = useRef(isIgnored)
  isIgnoredRef.current = isIgnored

  // 3. Background Processing (Stable Loop)
  useEffect(() => {
    if (!worker) return

    let isProcessingBatch = false
    const processQueue = async () => {
      if (isProcessingBatch || dirtyQueueRef.current.size === 0) return
      isProcessingBatch = true

      const allDirty = Array.from(dirtyQueueRef.current) as string[]

      const currentFiles = filesRef.current

      // Prioritize: Move non-ignored files to the front of the batch
      // and filter out any that became ignored since they were added to the queue
      // Filter out ignored files using the O(1) file property instead of expensive regex
      const prioritizedAndFiltered = allDirty.filter((path: string) => {
        const file = currentFiles.find((f) => f.path === path)
        return file && !file.isIgnored
      })

      if (prioritizedAndFiltered.length === 0) {
        dirtyQueueRef.current.clear()
        isProcessingBatch = false
        return
      }

      const fileLookup = new Map<string, string>()
      currentFiles.forEach((f) => {
        if (f.kind === 'file' && typeof f.content === 'string')
          fileLookup.set(f.path, f.content)
      })

      let currentBatchSize = 0
      const MAX_BATCH_BYTES = 2 * 1024 * 1024 // 2MB max per postMessage to prevent main thread GC locking

      const batch: Array<{ id: string; content: string; hash: string }> = []

      for (const path of prioritizedAndFiltered) {
        const content = fileLookup.get(path)
        if (content === undefined) {
          dirtyQueueRef.current.delete(path)
          continue
        }

        // Stop adding to batch if we exceed the payload limit (unless it's the very first file)
        if (
          batch.length > 0 &&
          currentBatchSize + content.length > MAX_BATCH_BYTES
        ) {
          break
        }

        dirtyQueueRef.current.delete(path)
        processingPathsRef.current.add(path)
        const hash =
          contentHashesRef.current.get(path) ||
          TokenService.hashContent(content)
        batch.push({ id: path, content, hash })
        currentBatchSize += content.length
      }

      if (batch.length > 0) {
        worker.postMessage({ files: batch })
      } else {
        isProcessingBatch = false
      }
      isProcessingBatch = false
    }

    const interval = setInterval(processQueue, 500)
    return () => clearInterval(interval)
  }, [worker])

  const computeTreeWeights = useCallback(
    (node: TreeItem) => TokenService.computeTreeWeights(node, tokenMap),
    [tokenMap]
  )

  return { tokenMap, computeTreeWeights }
}
