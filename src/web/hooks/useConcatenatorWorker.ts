/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ConcatenatorWorkerClient,
  type TelemetryProgress,
  type ParseResultPayload,
} from '../services/concatenatorWorkerClient'
import type { ConcatenateInputFile, FormatterOptions } from '../../core/engine'

export function useConcatenatorWorker() {
  const clientRef = useRef<ConcatenatorWorkerClient | null>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [totalTokens, setTotalTokens] = useState<number>(0)
  const [isPrecise, setIsPrecise] = useState<boolean>(false)
  const [fileTokenMap, setFileTokenMap] = useState<
    Record<string, { tokens: number; isPrecise: boolean }>
  >({})
  const [progressPercentage, setProgressPercentage] = useState<number>(0)
  const [degradedMode, setDegradedMode] = useState<boolean>(false)
  const [parseResult, setParseResult] = useState<ParseResultPayload | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    clientRef.current = new ConcatenatorWorkerClient()
    return () => {
      clientRef.current?.terminate()
      clientRef.current = null
    }
  }, [])

  const exportConcatenation = useCallback(
    async (
      files: ConcatenateInputFile[],
      formatterOptions?: FormatterOptions
    ) => {
      if (!clientRef.current) return
      setIsProcessing(true)
      setError(null)
      setIsPrecise(false)

      try {
        await clientRef.current.exportConcatenation(files, formatterOptions, {
          onProgressTick: (t: TelemetryProgress) => {
            setTotalTokens(t.totalTokens)
            setIsPrecise(t.isPrecise)
            setProgressPercentage(t.progressPercentage)
            setFileTokenMap((prev) => ({ ...prev, ...t.fileTokenMap }))
          },
          onTokenExactSync: (t: TelemetryProgress) => {
            setTotalTokens(t.totalTokens)
            setIsPrecise(true)
            setFileTokenMap((prev) => ({ ...prev, ...t.fileTokenMap }))
          },
          onBuildComplete: (result) => {
            setDegradedMode(result.degradedMode)
            setIsProcessing(false)
          },
          onError: (errStr) => {
            setError(errStr)
            setIsProcessing(false)
          },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setIsProcessing(false)
      }
    },
    []
  )

  const extractBundle = useCallback(async (file: File) => {
    if (!clientRef.current) return
    setIsProcessing(true)
    setError(null)

    try {
      await clientRef.current.extractBundle(file, {
        onParseProgress: (extracted, total) => {
          setProgressPercentage(Math.round((extracted / total) * 100))
        },
        onParseComplete: (res) => {
          setParseResult(res)
          setDegradedMode(res.degradedMode)
          setIsProcessing(false)
        },
        onError: (errStr) => {
          setError(errStr)
          setIsProcessing(false)
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsProcessing(false)
    }
  }, [])

  return {
    exportConcatenation,
    extractBundle,
    isProcessing,
    totalTokens,
    isPrecise,
    fileTokenMap,
    progressPercentage,
    degradedMode,
    parseResult,
    error,
  }
}
