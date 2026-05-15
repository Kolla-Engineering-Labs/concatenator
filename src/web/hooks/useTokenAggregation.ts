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
export const useTokenAggregation = (files: FileItem[]) => {
  const [tokenMap, setTokenMap] = useState<Record<string, TokenMetadata>>({})
  const hashCacheRef = useRef<
    Map<string, { tokens: number; isPrecise: boolean }>
  >(new Map())
  const contentHashesRef = useRef<Map<string, string>>(new Map())
  const [worker, setWorker] = useState<Worker | null>(null)
  const dirtyQueueRef = useRef<Set<string>>(new Set())
  const processingPathsRef = useRef<Set<string>>(new Set())
  const [queueTrigger, setQueueTrigger] = useState(0)

  // Refs for stable access in async handlers and effect optimization
  const filesRef = useRef(files)
  filesRef.current = files
  const tokenMapRef = useRef(tokenMap)
  tokenMapRef.current = tokenMap

  useEffect(() => {
    const w = new Worker(
      new URL('../workers/token.worker.ts', import.meta.url),
      { type: 'module' }
    )
    w.onerror = (err) => logger.error('[Worker] Initialization error:', err)
    setWorker(w)
    return () => {
      w.terminate()
      setWorker(null)
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
        if (!r.success) {
          processingPathsRef.current.delete(r.id)
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

      if (bufferTimer) clearTimeout(bufferTimer)
      bufferTimer = setTimeout(() => {
        const updates = { ...resultsBuffer }
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
                setQueueTrigger((q) => q + 1)
              }
            }
          })
          return next
        })
      }, 100)
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
    let addedToQueue = false

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

      if (!current || current.hash !== hash) {
        const cached = hashCacheRef.current.get(hash)
        if (cached) {
          newMetadata[file.path] = {
            tokens: cached.tokens,
            isPrecise: true,
            hash,
          }
        } else {
          newMetadata[file.path] = {
            tokens: TokenService.getTokenEstimate(content),
            isPrecise: false,
            hash,
          }
          dirtyQueueRef.current.add(file.path)
          addedToQueue = true
        }
        hasChanges = true
      } else if (
        !current.isPrecise &&
        !processingPathsRef.current.has(file.path) &&
        !dirtyQueueRef.current.has(file.path)
      ) {
        dirtyQueueRef.current.add(file.path)
        addedToQueue = true
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
    if (addedToQueue) setQueueTrigger((q) => q + 1)
  }, [files]) // Only depend on files; tokenMap accessed via Ref to avoid loop

  // 3. Background Processing (Debounced Batches)
  useEffect(() => {
    if (!worker || dirtyQueueRef.current.size === 0) return

    const timer = setTimeout(() => {
      const allDirty = Array.from(dirtyQueueRef.current)
      dirtyQueueRef.current.clear()
      if (allDirty.length === 0) return

      const fileLookup = new Map<string, string>()
      files.forEach((f) => {
        if (f.kind === 'file' && typeof f.content === 'string')
          fileLookup.set(f.path, f.content)
      })

      const batch = allDirty
        .map((path: string) => {
          const content = fileLookup.get(path)
          if (content === undefined) return null
          processingPathsRef.current.add(path)
          const hash =
            contentHashesRef.current.get(path) ||
            TokenService.hashContent(content)
          return { id: path, content, hash }
        })
        .filter(Boolean) as Array<{ id: string; content: string; hash: string }>

      if (batch.length > 0) {
        const BATCH_SIZE = 500
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          worker.postMessage({ files: batch.slice(i, i + BATCH_SIZE) })
        }
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [worker, queueTrigger, files])

  const computeTreeWeights = useCallback(
    (node: TreeItem) => TokenService.computeTreeWeights(node, tokenMap),
    [tokenMap]
  )

  return { tokenMap, computeTreeWeights }
}
