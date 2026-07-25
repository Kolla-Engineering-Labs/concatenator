/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import JSZip from 'jszip'
import { FileItem, OutputFormat, IgnoreSource } from '../../../../core/types'
import { HydratedFile } from '../../../../core/VFSHydrator'
import { AppMode } from '../../../types/workbench'
import {
  START_DELIMITER,
  END_DELIMITER,
  FILE_END_DELIMITER,
} from '../../../../core/constants'
import {
  deconcatenate,
  concatenate,
  generateFileTimestamp,
  validateConcatenation,
  parseBundle,
} from '../../../../core/engine'
import { reconcileFiles } from '../../../../core/reconciler'
import type { Absorption } from '../../../../core/reconciler'
import type { ValidationResult } from '../../../../core/types'
import { logger } from '../../../../lib/logger'
import { TokenService } from '../../../../core/TokenService'
import {
  isImageFile,
  isPdfFile,
  estimateTokenCount,
} from '../../../../lib/utils'
import { ApiClient } from '../../../services/ApiClient'

const RESERVED_WINDOWS_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
])

const isReservedWindowsFilename = (name: string) => {
  const base = name.split('.')[0].toUpperCase()
  return RESERVED_WINDOWS_NAMES.has(base)
}

interface UseFileProcessingProps {
  appMode: AppMode
  hydrateFiles?: (paths: string[]) => Map<string, HydratedFile>
  isIgnored?: (path: string) => boolean
  isExplicitlyNegated?: (path: string) => boolean
  maxFileLimit: number
  isIgnoreListLoading: boolean
  setVirtualFileSystem: (vfs: Record<string, string>) => void
  shouldRecurse: (path: string) => boolean
}

/**
 * Custom hook to handle file processing, concatenation, and de-concatenation.
 */
export const useFileProcessing = ({
  appMode,
  hydrateFiles,
  isIgnored,
  isExplicitlyNegated = () => false,
  maxFileLimit,
  isIgnoreListLoading,
  setVirtualFileSystem,
  shouldRecurse,
}: UseFileProcessingProps) => {
  const [rawFiles, setRawFiles] = useState<FileItem[]>([])
  // filesRef mirrors rawFiles/resolvedFiles so async callbacks always read
  // the latest value without needing files in their useCallback dep arrays.
  const filesRef = useRef<FileItem[]>([])

  // Fallback / compatibility: construct hydrateFiles from isIgnored if not provided
  const resolvedHydrateFiles = useCallback(
    (paths: string[]) => {
      if (hydrateFiles) return hydrateFiles(paths)
      const map = new Map<string, HydratedFile>()
      for (const path of paths) {
        const ignored = isIgnored ? isIgnored(path) : false
        map.set(path, {
          isIgnored: ignored,
          isNegated: false,
          reason: path,
          ignoreSource: ignored ? IgnoreSource.MANUAL : undefined,
        })
      }
      return map
    },
    [hydrateFiles, isIgnored]
  )

  const resolvedFiles = useMemo(() => {
    if (!resolvedHydrateFiles || rawFiles.length === 0) return rawFiles

    // $O(1) hydration map lookup
    const hydrationMap = resolvedHydrateFiles(rawFiles.map((f) => f.path))

    return rawFiles.map((file) => {
      const verdict = hydrationMap.get(file.path)
      return {
        ...file,
        isIgnored: verdict?.isIgnored ?? false,
        isNegated: verdict?.isNegated ?? false,
        reason: verdict?.reason,
        ignoreSource: verdict?.ignoreSource,
      }
    })
  }, [rawFiles, resolvedHydrateFiles])

  const files = resolvedFiles
  const setFiles = setRawFiles

  // Sync the imperative ref for the drag-and-drop handler
  useEffect(() => {
    filesRef.current = resolvedFiles
  }, [resolvedFiles])

  const [isProcessing, setIsProcessingState] = useState(false)
  const isProcessingRef = useRef(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importError, setImportError] = useState<string | null>(null)
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null)
  // Absorptions from root-pruning reconciliation — consumed by UI Toast
  const [pendingAbsorptions, setPendingAbsorptions] = useState<Absorption[]>([])
  const cancelImportRef = useRef(false)
  // Track all active readers to allow comprehensive cancellation
  const activeReadersRef = useRef<Set<FileReader>>(new Set())

  // Reactive refs for ignore logic to allow mid-crawl cancellation/skipping
  const hydrateFilesRef = useRef(resolvedHydrateFiles)
  const shouldRecurseRef = useRef(shouldRecurse)
  useEffect(() => {
    hydrateFilesRef.current = resolvedHydrateFiles
    shouldRecurseRef.current = shouldRecurse
  }, [resolvedHydrateFiles, shouldRecurse])
  const setIsProcessing = useCallback((processing: boolean) => {
    isProcessingRef.current = processing
    setIsProcessingState(processing)
  }, [])

  const cancelProcessing = useCallback(() => {
    cancelImportRef.current = true
    activeReadersRef.current.forEach((reader) => {
      try {
        reader.abort()
      } catch {
        // Ignore errors during abort
      }
    })
    activeReadersRef.current.clear()
  }, [])

  // Throttling semaphore for high-latency I/O environments (prevents browser hang)
  const ioSemaphore = useRef<{ active: number; queue: (() => void)[] }>({
    active: 0,
    queue: [],
  })
  const MAX_CONCURRENT_READS = 10

  const readFileContent = useCallback(
    async (file: File): Promise<string | ArrayBuffer | null> => {
      // Skip reading files larger than 30MB to prevent catastrophic main thread freezes
      // from V8 string allocation during readAsText.
      if (file.size > 30 * 1024 * 1024) {
        logger.warn(
          `File ${file.name} exceeds 30MB limit. Skipping content read to prevent memory crash.`
        )
        return null
      }

      // Acquire semaphore slot
      if (ioSemaphore.current.active >= MAX_CONCURRENT_READS) {
        await new Promise<void>((resolve) =>
          ioSemaphore.current.queue.push(resolve)
        )
      }
      ioSemaphore.current.active++

      try {
        if (cancelImportRef.current) return null

        return await new Promise((resolve) => {
          const reader = new FileReader()
          activeReadersRef.current.add(reader)

          const cleanup = () => {
            activeReadersRef.current.delete(reader)
          }

          reader.onload = () => {
            cleanup()
            resolve(reader.result)
          }

          reader.onerror = (err) => {
            cleanup()
            logger.error(`Failed to read file ${file.name}:`, err)
            resolve(null)
          }

          reader.onabort = () => {
            cleanup()
            resolve(null)
          }

          if (isImageFile(file.name) || isPdfFile(file.name)) {
            reader.readAsArrayBuffer(file)
          } else {
            reader.readAsText(file)
          }
        })
      } finally {
        // Release semaphore slot
        ioSemaphore.current.active--
        const next = ioSemaphore.current.queue.shift()
        if (next) next()
      }
    },
    []
  )

  const handleDeconcatenate = useCallback(
    async (inputFiles?: FileItem[]) => {
      const targetFiles = inputFiles || files
      if (targetFiles.length === 0) return

      setIsProcessing(true)
      let foundAnyTotal = false
      const skippedFiles: string[] = []

      // Preserve any existing importError (e.g., from file parsing warnings)
      const existingError = importError

      try {
        if (appMode === AppMode.DECONCATENATE && targetFiles.length > 0) {
          // In de-concatenate mode, we might just be downloading what's already in the virtualFileSystem
          // or we are processing dropped files.
          // If we have virtualFileSystem, we should use that to generate the ZIP.
        }

        for (const fileItem of targetFiles) {
          if (fileItem.kind !== 'file' || typeof fileItem.content !== 'string')
            continue

          const content = fileItem.content

          // Use the core engine to parse concatenated content
          const result = deconcatenate(content)

          if (result.skippedPaths.length > 0) {
            skippedFiles.push(...result.skippedPaths)
            for (const path of result.skippedPaths) {
              logger.warn(
                `Missing end marker for file "${path || '(unknown)'}" - file will be skipped`
              )
            }
          }

          // Add extracted files to ZIP
          const zip = new JSZip()
          for (const file of result.files) {
            zip.file(file.path, file.content)
          }

          if (result.foundAny) {
            foundAnyTotal = true
            const zipBlob = await zip.generateAsync({ type: 'blob' })
            const url = URL.createObjectURL(zipBlob)
            const a = document.createElement('a')
            a.href = url
            const baseName = fileItem.name.replace(/\.[^/.]+$/, '')
            a.download = `${baseName || 'extracted_files'}.zip`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            // Ensure the browser has time to initiate the download before revoking
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }
        }

        if (!foundAnyTotal) {
          setImportError(
            'No concatenated files were found in the uploaded file(s). Make sure you are uploading a file generated by this tool.'
          )
        } else if (skippedFiles.length > 0) {
          const fileList = skippedFiles.slice(0, 3).join(', ')
          const moreCount = skippedFiles.length - 3
          const warningMsg =
            moreCount > 0
              ? `Warning: ${skippedFiles.length} file(s) were skipped due to missing end markers: ${fileList} and ${moreCount} more. Check the console for details.`
              : `Warning: ${skippedFiles.length} file(s) were skipped due to missing end markers: ${fileList}. Check the console for details.`
          logger.warn(
            `Skipped ${skippedFiles.length} file(s) with missing end markers:`,
            skippedFiles
          )
          setImportError(warningMsg)
        } else if (existingError) {
          // Restore existing error (e.g., from file parsing warnings)
          setImportError(existingError)
        }
      } catch (error) {
        logger.error('De-concatenation failed:', error)
        setImportError(
          'An error occurred during de-concatenation. Please check the console for details.'
        )
      } finally {
        setIsProcessing(false)
      }
    },
    [files, setIsProcessing, appMode, importError]
  )

  const processUploadedFiles = useCallback(
    async (uploadedFiles: (File | FileItem)[]) => {
      try {
        const perfStart = performance.now()
        logger.info(
          `[FileProcessing] Starting processUploadedFiles with ${uploadedFiles.length} items`
        )

        setIsProcessing(true)
        setImportError(null)
        cancelImportRef.current = false
        activeReadersRef.current.clear()
        setImportProgress({ current: 0, total: uploadedFiles.length })

        // Sort files by size (smallest first).
        // If the user adds an ignore rule mid-import, large files (processed last)
        // will pick up the new rule and skip their expensive text-reads entirely.
        uploadedFiles.sort((a, b) => {
          const sizeA = 'size' in a ? a.size || 0 : 0
          const sizeB = 'size' in b ? b.size || 0 : 0
          return sizeA - sizeB
        })

        // Extract all paths to batch-hydrate before the processing loop
        const pathsToHydrate: string[] = []
        for (const item of uploadedFiles) {
          const path =
            'path' in item
              ? item.path
              : (item as { path?: string }).path ||
                (item as { webkitRelativePath?: string }).webkitRelativePath ||
                item.name
          pathsToHydrate.push(path)
          const parts = path.split(/[/\\]/).filter(Boolean)
          for (let j = 1; j < parts.length; j++) {
            pathsToHydrate.push(parts.slice(0, j).join('/'))
          }
        }
        const hydrationMap = hydrateFilesRef.current(pathsToHydrate)

        await new Promise((resolve) => setTimeout(resolve, 50))

        const newFiles: FileItem[] = []
        const newDirPaths = new Set<string>() // O(1) dedup for directory entries
        let lastRenderTime = Date.now()
        let fileReadTimeMs = 0

        for (let i = 0; i < uploadedFiles.length; i++) {
          if (cancelImportRef.current) break

          const item = uploadedFiles[i]
          let fileItem: FileItem

          if (
            'kind' in item &&
            (item.kind === 'file' || item.kind === 'directory')
          ) {
            // Already processed (e.g. from handleDrop)
            fileItem = item
          } else {
            // Raw File object (e.g. from handleFileUpload)
            const file = item as File
            const path =
              (file as { path?: string }).path ||
              (file as { webkitRelativePath?: string }).webkitRelativePath ||
              file.name

            const verdict = hydrationMap.get(path)
            const ignored = verdict?.isIgnored ?? false
            const isNegated = verdict?.isNegated ?? false
            const reason = verdict?.reason
            const ignoreSource = verdict?.ignoreSource

            const readStart = performance.now()
            const content = ignored ? '' : await readFileContent(file)
            fileReadTimeMs += performance.now() - readStart

            if (content === null && !ignored && !cancelImportRef.current) {
              const now = Date.now()
              if (now - lastRenderTime > 30 || i === uploadedFiles.length - 1) {
                setImportProgress((prev) => ({ ...prev, current: i + 1 }))
                lastRenderTime = now
                // Yield aggressively to keep typing smooth
                await new Promise((resolve) => setTimeout(resolve, 0))
              }
              continue
            }

            fileItem = {
              name: file.name,
              path: path,
              kind: 'file',
              content: ignored ? undefined : content || '',
              size: file.size,
              isIgnored: ignored,
              isNegated,
              reason,
              ignoreSource,
              tokens: ignored
                ? 0
                : estimateTokenCount(content || '', file.size),
              handle: file,
            }
          }

          newFiles.push(fileItem)

          const path = fileItem.path
          const parts = path.split(/[/\\]/).filter(Boolean)
          for (let j = 1; j < parts.length; j++) {
            const dirPath = parts.slice(0, j).join('/')
            if (!newDirPaths.has(dirPath)) {
              newDirPaths.add(dirPath)

              // ONLY add to newFiles if it doesn't exist in the current state.
              const existingDir = filesRef.current.find(
                (f) => f.path === dirPath && f.kind === 'directory'
              )

              if (!existingDir) {
                const dirVerdict = hydrationMap.get(dirPath)
                newFiles.push({
                  name: parts[j - 1],
                  path: dirPath,
                  kind: 'directory',
                  isIgnored: dirVerdict?.isIgnored ?? false,
                  isNegated: dirVerdict?.isNegated ?? false,
                  reason: dirVerdict?.reason,
                  ignoreSource: dirVerdict?.ignoreSource,
                })
              }
            }
          }

          const now = Date.now()
          // Yield aggressively every 30ms so typing in the ignore field isn't blocked
          if (now - lastRenderTime > 30 || i === uploadedFiles.length - 1) {
            setImportProgress((prev) => ({ ...prev, current: i + 1 }))
            lastRenderTime = now
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
        }

        const loopEnd = performance.now()
        logger.info(
          `[FileProcessing] Loop completed in ${(loopEnd - perfStart).toFixed(2)}ms (File I/O wait: ${fileReadTimeMs.toFixed(2)}ms)`
        )

        if (!cancelImportRef.current) {
          if (appMode === AppMode.DECONCATENATE) {
            // De-concatenate mode: we only allow ONE bundle file at a time
            if (newFiles.length > 1) {
              setImportError(
                'Please upload only one concatenated file at a time.'
              )
              setIsProcessing(false)
              return
            }

            const bundle = newFiles[0]
            if (!bundle || typeof bundle.content !== 'string') {
              setImportError('Failed to read concatenated file.')
              setIsProcessing(false)
              return
            }

            const validation = validateConcatenation(bundle.content)
            setValidationResult(validation)
            if (validation.targetFileCount === 0) {
              setImportError(
                'No concatenated files were found in the uploaded file(s). Make sure you are uploading a file generated by this tool.'
              )
              setIsProcessing(false)
              return
            }

            // Parse and populate virtualFileSystem
            try {
              const { fileMap, skippedPaths } = parseBundle(bundle.content)

              if (Object.keys(fileMap).length === 0) {
                setImportError(
                  'No concatenated files were found in the uploaded file(s). Make sure you are uploading a file generated by this tool.'
                )
                setIsProcessing(false)
                return
              }

              // Convert fileMap to FileItem[] for consistent state
              const vfsFiles: FileItem[] = Object.entries(fileMap).map(
                ([path, content]) => ({
                  name: path.split(/[/\\]/).pop() || '',
                  path,
                  kind: 'file',
                  content,
                  size: content.length,
                  tokens: estimateTokenCount(content, content.length),
                })
              )

              setVirtualFileSystem(fileMap)
              // Store the extracted files in the state for the UI to display
              setFiles(vfsFiles)

              // Add a small delay to ensure React state updates propagate before setting processing to false
              await new Promise((resolve) => setTimeout(resolve, 50))

              // Show warnings for skipped files if any
              if (skippedPaths.length > 0) {
                const fileList = skippedPaths.slice(0, 3).join(', ')
                const moreCount = skippedPaths.length - 3
                const warningMsg =
                  moreCount > 0
                    ? `Warning: ${skippedPaths.length} file(s) were skipped due to missing end markers: ${fileList} and ${moreCount} more. Check the console for details.`
                    : `Warning: ${skippedPaths.length} file(s) were skipped due to missing end markers: ${fileList}. Check the console for details.`
                logger.warn(
                  `Skipped ${skippedPaths.length} file(s) with missing end markers:`,
                  skippedPaths
                )
                setImportError(warningMsg)
              }
              setIsProcessing(false)
              // Additional delay to ensure React state updates propagate
              await new Promise((resolve) => setTimeout(resolve, 100))
              return // Exit early to avoid the final setIsProcessing(false) call
            } catch (err) {
              logger.error(`[useFileProcessing] Error in parseBundle: ${err}`)
              setImportError('Failed to parse concatenated file.')
              setIsProcessing(false)
              return // Exit early to avoid the final setIsProcessing(false) call
            }
          } else {
            // Compute reconciliation using filesRef (always current, no stale
            // closure) before any setState so absorptions are available
            // synchronously — avoids React 18 batching timing issues.
            const { files: reconciledFiles, absorptions } = reconcileFiles(
              filesRef.current,
              newFiles
            )

            if (absorptions.length > 0) {
              setPendingAbsorptions(absorptions)
            }

            // Final safety sweep: apply the absolutely latest ignore rules to all files
            // just in case the user added a pattern mid-import.
            const finalPaths = reconciledFiles.map((f) => f.path)
            const finalHydration = hydrateFilesRef.current(finalPaths)
            for (let k = 0; k < reconciledFiles.length; k++) {
              const verdict = finalHydration.get(reconciledFiles[k].path)
              reconciledFiles[k].isIgnored = verdict?.isIgnored ?? false
              reconciledFiles[k].isNegated = verdict?.isNegated ?? false
              reconciledFiles[k].reason = verdict?.reason
              reconciledFiles[k].ignoreSource = verdict?.ignoreSource
            }

            setFiles(reconciledFiles)

            if (
              reconciledFiles.filter((f) => f.kind === 'file').length === 0 &&
              appMode === AppMode.CONCATENATE
            ) {
              setImportError(
                'No files were imported. This might be because all files matched your ignore list (check if any Regex is overly broad) or the folder was empty.'
              )
            }
          }
        }

        setIsProcessing(false)
        setImportProgress({ current: 0, total: 0 })
        cancelImportRef.current = false
        activeReadersRef.current.clear()
      } catch (error) {
        logger.error(
          `[useFileProcessing] Error in processUploadedFiles: ${error}`
        )
        setImportError('An unexpected error occurred during file processing.')
        setIsProcessing(false)
      }
    },
    [
      appMode,
      setIsProcessing,
      setVirtualFileSystem,
      setFiles,
      setImportError,
      setImportProgress,
      readFileContent,
      filesRef,
      setPendingAbsorptions,
      setValidationResult,
    ]
  )

  const loadVfsFiles = useCallback(
    async (vfsFiles: FileItem[]) => {
      setIsProcessing(true)
      setImportError(null)
      cancelImportRef.current = false
      activeReadersRef.current.clear()

      const filesToProcess = vfsFiles.filter(
        (f) => f.kind === 'file' && !f.isIgnored
      )
      setImportProgress({ current: 0, total: filesToProcess.length })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const newFiles: FileItem[] = []
      let lastRenderTime = Date.now()
      let processedCount = 0

      // Process VFS files

      for (const file of vfsFiles) {
        if (cancelImportRef.current) break

        if (file.kind === 'directory' || file.isIgnored) {
          newFiles.push(file)
          continue
        }

        try {
          const blob = await ApiClient.getFileBlob(file.path)

          const content = await new Promise<string | ArrayBuffer | null>(
            (resolve, reject) => {
              const reader = new FileReader()
              activeReadersRef.current.add(reader)
              const cleanup = () => {
                activeReadersRef.current.delete(reader)
              }
              reader.onload = () => {
                cleanup()
                resolve(reader.result as string)
              }
              reader.onerror = () => {
                cleanup()
                reject(new Error(`Failed to read file: ${file.path}`))
              }
              reader.onabort = () => {
                cleanup()
                resolve(null)
              }

              if (isImageFile(file.name) || isPdfFile(file.name)) {
                reader.readAsDataURL(blob)
              } else {
                reader.readAsText(blob)
              }
            }
          )
          if (content !== null && !cancelImportRef.current) {
            newFiles.push({
              ...file,
              content,
              size: blob.size,
              tokens: estimateTokenCount(content, blob.size),
            })
          }
        } catch (err) {
          logger.error(`Failed to load VFS file ${file.path}:`, err)
          newFiles.push(file) // keep it but empty
        }

        processedCount++
        const now = Date.now()
        if (
          now - lastRenderTime > 50 ||
          processedCount === filesToProcess.length
        ) {
          setImportProgress({
            current: processedCount,
            total: filesToProcess.length,
          })
          lastRenderTime = now
        }

        if (processedCount % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }

      if (!cancelImportRef.current) {
        setFiles(newFiles) // Replace entire file list for VFS load
      }

      setIsProcessing(false)
      setImportProgress({ current: 0, total: 0 })
      cancelImportRef.current = false
      activeReadersRef.current.clear()
    },
    [setIsProcessing, setImportProgress, setFiles, setImportError]
  )

  // Auto-reload files or crawl directories that were un-ignored
  React.useEffect(() => {
    let mounted = true
    const reloadUnignored = async () => {
      if (appMode !== AppMode.CONCATENATE) return

      const targets = files.filter((f) => {
        const normalizedParentPath = f.path.replace(/\\/g, '/')
        const parentPrefix = normalizedParentPath.endsWith('/')
          ? normalizedParentPath
          : normalizedParentPath + '/'

        const hasChildren = files.some((child) => {
          const normalizedChildPath = child.path.replace(/\\/g, '/')
          return normalizedChildPath.startsWith(parentPrefix)
        })

        return (
          !f.isIgnored &&
          ((f.kind === 'file' && f.content === undefined) ||
            (f.kind === 'directory' && !hasChildren))
        )
      })

      if (targets.length > 0) {
        logger.info(
          `[useFileProcessing] Found ${targets.length} un-ignored targets to refresh:`,
          targets.map((t) => t.path)
        )
      }

      if (targets.length === 0) return

      // Use a small delay to debounce multiple rapid ignore changes
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!mounted) return

      logger.info(
        `[useFileProcessing] Auto-reloading/crawling ${targets.length} un-ignored items`
      )

      setIsProcessing(true)
      const allDiscovered: (File | FileItem)[] = []

      try {
        for (let i = 0; i < targets.length; i++) {
          if (!mounted) break
          const item = targets[i]

          if (item.kind === 'file') {
            try {
              let content: string | ArrayBuffer | null = null
              let size = item.size || 0

              if (item.handle) {
                content = await readFileContent(item.handle as File)
                size = item.handle instanceof File ? item.handle.size : size
              } else {
                try {
                  const blob = await ApiClient.getFileBlob(item.path)
                  content = await new Promise((resolve) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result as string)
                    reader.onerror = () => resolve(null)
                    reader.readAsText(blob)
                  })
                  size = blob.size
                } catch {
                  // Not available
                }
              }

              if (content !== null) {
                setFiles((prev) =>
                  prev.map((f) =>
                    f.path === item.path
                      ? {
                          ...f,
                          content,
                          size,
                          tokens: estimateTokenCount(content as string, size),
                          isIgnored: false,
                          isNegated: isExplicitlyNegated(item.path),
                        }
                      : f
                  )
                )
              }
            } catch (err) {
              logger.error(
                `Failed to reload un-ignored file ${item.path}:`,
                err
              )
            }
          } else if (item.kind === 'directory') {
            // Lazy crawl directory if we have a handle
            if (
              item.handle &&
              typeof item.handle === 'object' &&
              'createReader' in (item.handle as FileSystemDirectoryEntry)
            ) {
              try {
                const dirEntry = item.handle as FileSystemDirectoryEntry

                const traverse = async (
                  entry: FileSystemEntry,
                  _currentPath: string
                ) => {
                  if (entry.isFile) {
                    if (!mounted) return
                    const file = await new Promise<File>((resolve, reject) =>
                      (entry as FileSystemFileEntry).file(resolve, reject)
                    )
                    ;(file as File & { path: string }).path = _currentPath
                    allDiscovered.push(file)
                  } else if (entry.isDirectory) {
                    if (!mounted) return
                    const reader = (
                      entry as FileSystemDirectoryEntry
                    ).createReader()

                    const entries = await new Promise<FileSystemEntry[]>(
                      (resolve) => {
                        const batch: FileSystemEntry[] = []
                        const read = () => {
                          reader.readEntries(
                            (results) => {
                              if (results.length === 0) resolve(batch)
                              else {
                                batch.push(...results)
                                read()
                              }
                            },
                            () => resolve(batch)
                          )
                        }
                        read()
                      }
                    )

                    for (const child of entries) {
                      const nextPath = _currentPath.endsWith('/')
                        ? _currentPath + child.name
                        : _currentPath + '/' + child.name
                      await traverse(child, nextPath)
                    }
                  }
                }

                const reader = dirEntry.createReader()
                const entries = await new Promise<FileSystemEntry[]>(
                  (resolve) => {
                    const batch: FileSystemEntry[] = []
                    const read = () => {
                      reader.readEntries(
                        (results) => {
                          logger.debug(
                            `[useFileProcessing] readEntries found ${results.length} results for ${item.path}`
                          )
                          if (results.length === 0) resolve(batch)
                          else {
                            batch.push(...results)
                            read()
                          }
                        },
                        (err) => {
                          logger.error(
                            `[useFileProcessing] Error reading entries for ${item.path}:`,
                            err
                          )
                          resolve(batch)
                        }
                      )
                    }
                    read()
                  }
                )

                logger.info(
                  `[useFileProcessing] Lazy crawling ${entries.length} top-level entries in ${item.path}`
                )
                for (const entry of entries) {
                  const nextPath = item.path.endsWith('/')
                    ? item.path + entry.name
                    : item.path + '/' + entry.name
                  await traverse(entry, nextPath)
                }
              } catch (err) {
                logger.error(`Failed to crawl directory ${item.path}:`, err)
              }
            }
          }
        }

        if (allDiscovered.length > 0 && mounted) {
          logger.info(
            `[useFileProcessing] Processing ${allDiscovered.length} discovered files...`
          )
          await processUploadedFiles(allDiscovered)
        } else if (mounted) {
          logger.info(
            '[useFileProcessing] Lazy crawl completed but no new files were found.'
          )
        }
      } catch (err) {
        logger.error('[useFileProcessing] Error in reloadUnignored:', err)
      } finally {
        if (mounted) setIsProcessing(false)
      }
    }

    reloadUnignored()
    return () => {
      mounted = false
      setIsProcessing(false) // Reset processing state if effect is interrupted
    }
  }, [
    files,
    isIgnored,
    appMode,
    processUploadedFiles,
    isExplicitlyNegated,
    setIsProcessing,
    readFileContent,
    setFiles,
  ])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isProcessingRef.current) {
        e.preventDefault()
        return
      }

      const uploadedFiles = e.target.files
      if (!uploadedFiles) return

      cancelImportRef.current = false

      const filesToProcess = Array.from(uploadedFiles as FileList) as File[]

      if (filesToProcess.length > 0) {
        await processUploadedFiles(filesToProcess)
      } else {
        setImportError('No files were imported')
      }

      e.target.value = ''
    },
    [processUploadedFiles]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (isProcessingRef.current) return
      if (isIgnoreListLoading) {
        setImportError(
          'Please wait for ignore patterns to load before importing files.'
        )
        return
      }

      try {
        const items = e.dataTransfer.items
        if (!items) {
          const files = Array.from(e.dataTransfer.files)
          if (files.length > 0) {
            await processUploadedFiles(files)
          } else {
            setIsProcessing(false)
          }
          return
        }

        if (items.length === 0) {
          setIsProcessing(false)
          return
        }

        const entries: FileSystemEntry[] = []
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry() as FileSystemEntry | null
          if (entry) {
            entries.push(entry)
          }
        }

        if (entries.length === 0) {
          setIsProcessing(false)
          return
        }

        setIsProcessing(true)
        setImportError(null)
        cancelImportRef.current = false
        setImportProgress({ current: 0, total: 0 })

        await new Promise((resolve) => setTimeout(resolve, 100))

        const rawDroppedFiles: Array<{
          name: string
          path: string
          kind: 'file' | 'directory'
          handle: FileSystemEntry
        }> = []

        let lastYieldTime = Date.now()
        let lastProgressUpdate = Date.now()
        const traverseEntry = async (entry: FileSystemEntry, path = '') => {
          try {
            if (cancelImportRef.current) return

            // Yield aggressively based on time (30 FPS minimum responsiveness)
            const now = Date.now()
            if (now - lastYieldTime > 30) {
              lastYieldTime = now
              await new Promise((resolve) => setTimeout(resolve, 0))
            }

            // Skip reserved Windows names (Bug fix: prevents InvalidStateError on NUL, etc.)
            if (isReservedWindowsFilename(entry.name)) {
              logger.warn(`Skipping reserved Windows entry: ${entry.name}`)
              return
            }

            const fullPath = path + entry.name

            // Optimization: If a directory is ignored and contains no negations, skip traversal.
            // We use the ref here so that if the user adds an ignore pattern MID-CRAWL,
            // we stop immediately instead of finishing the massive folder.
            if (entry.isDirectory && !shouldRecurseRef.current(fullPath)) {
              // Still push the directory itself so it can be seen in the tree if "Show Ignored" is on
              rawDroppedFiles.push({
                name: entry.name,
                path: fullPath,
                kind: 'directory',
                handle: entry,
              })
              return
            }

            // Defensive check: if cancelled, stop immediately
            if (cancelImportRef.current) return

            if (entry.isFile && 'file' in entry) {
              // Check max file limit before adding (halt immediately when exceeded)
              if (rawDroppedFiles.length >= maxFileLimit) {
                setImportError(
                  `Import halted: The folder contains more than ${maxFileLimit} files. Please increase the Max Files limit or select a folder with fewer files.`
                )
                cancelImportRef.current = true
                return
              }

              // Throttle progress updates to prevent UI lockup
              const now = Date.now()
              if (now - lastProgressUpdate > 100) {
                setImportProgress({
                  current: 0,
                  total: rawDroppedFiles.length + 1,
                })
                lastProgressUpdate = now
              }

              rawDroppedFiles.push({
                name: entry.name,
                path: fullPath,
                kind: 'file',
                handle: entry,
              })

              // Fail early if we exceed the limit DURING the crawl to prevent browser crash
              if (rawDroppedFiles.length > maxFileLimit) {
                setImportError(
                  `Project too large: found over ${maxFileLimit} files. Please ignore massive directories before dropping.`
                )
                cancelImportRef.current = true
                return
              }
            } else if (entry.isDirectory && 'createReader' in entry) {
              rawDroppedFiles.push({
                name: entry.name,
                path: fullPath,
                kind: 'directory',
                handle: entry,
              })

              let reader
              try {
                reader = (entry as FileSystemDirectoryEntry).createReader()
              } catch (err) {
                logger.error('Failed to create directory reader:', err)
                return
              }
              const entriesBatch = await new Promise<FileSystemEntry[]>(
                (resolve) => {
                  const allEntries: FileSystemEntry[] = []
                  const readBatch = () => {
                    if (cancelImportRef.current) {
                      resolve([])
                      return
                    }
                    try {
                      reader.readEntries(
                        (batch: FileSystemEntry[]) => {
                          if (batch.length === 0) {
                            resolve(allEntries)
                          } else {
                            allEntries.push(...batch)
                            readBatch()
                          }
                        },
                        (err: Error) => {
                          logger.error(
                            `Error reading entries for ${fullPath}:`,
                            err
                          )
                          resolve(allEntries)
                        }
                      )
                    } catch (err) {
                      logger.error(
                        `Sync error in readEntries for ${fullPath}:`,
                        err
                      )
                      resolve(allEntries)
                    }
                  }
                  readBatch()
                }
              )

              // Parallelize discovery of children with concurrency limit (scoped to this level)
              const levelConcurrencyLimit = 5
              for (
                let i = 0;
                i < entriesBatch.length;
                i += levelConcurrencyLimit
              ) {
                const batch = entriesBatch.slice(i, i + levelConcurrencyLimit)
                await Promise.all(
                  batch.map((childEntry) =>
                    traverseEntry(childEntry, fullPath + '/')
                  )
                )
                if (cancelImportRef.current) break
              }
            }
          } catch (err) {
            logger.warn(`Skipping entry ${entry.name} due to error: ${err}`)
          }
        }

        // Process root entries in small batches
        const rootConcurrencyLimit = 5
        for (let i = 0; i < entries.length; i += rootConcurrencyLimit) {
          const batch = entries.slice(i, i + rootConcurrencyLimit)
          await Promise.all(batch.map((entry) => traverseEntry(entry, '')))
          if (cancelImportRef.current) break
        }

        // Check if user cancelled during traversal (Bug 2 fix)
        if (cancelImportRef.current) {
          setIsProcessing(false)
          setImportProgress({ current: 0, total: 0 })
          cancelImportRef.current = false
          return
        }

        if (rawDroppedFiles.length > 0) {
          // batch path hydration
          const paths = rawDroppedFiles.map((f) => f.path)
          const hydrationMap = hydrateFilesRef.current(paths)

          const droppedFiles: FileItem[] = []
          for (let i = 0; i < rawDroppedFiles.length; i++) {
            if (cancelImportRef.current) break

            const item = rawDroppedFiles[i]
            const verdict = hydrationMap.get(item.path)
            const isIgnored = verdict?.isIgnored ?? false
            const isNegated = verdict?.isNegated ?? false
            const reason = verdict?.reason
            const ignoreSource = verdict?.ignoreSource

            if (item.kind === 'directory') {
              droppedFiles.push({
                name: item.name,
                path: item.path,
                kind: 'directory',
                isIgnored,
                isNegated,
                reason,
                ignoreSource,
                handle: item.handle,
              } as FileItem)
            } else {
              const fileEntry = item.handle as FileSystemFileEntry
              const file = await new Promise<File>((resolve, reject) => {
                fileEntry.file(
                  (f) => resolve(f),
                  (err) => reject(err)
                )
              })

              if (isIgnored) {
                droppedFiles.push({
                  name: item.name,
                  path: item.path,
                  kind: 'file',
                  content: undefined,
                  size: file.size,
                  tokens: 0,
                  isIgnored,
                  isNegated,
                  reason,
                  ignoreSource,
                  handle: file,
                })
              } else {
                const content = await readFileContent(file)
                if (content !== null && !cancelImportRef.current) {
                  droppedFiles.push({
                    name: item.name,
                    path: item.path,
                    kind: 'file',
                    content,
                    size: file.size,
                    tokens: estimateTokenCount(content, file.size),
                    isIgnored,
                    isNegated,
                    reason,
                    ignoreSource,
                    handle: file,
                  })
                }
              }
            }

            // Progress reporting
            const now = Date.now()
            if (
              now - lastProgressUpdate > 100 ||
              i === rawDroppedFiles.length - 1
            ) {
              setImportProgress({
                current: i + 1,
                total: rawDroppedFiles.length,
              })
              lastProgressUpdate = now
              await new Promise((resolve) => setTimeout(resolve, 0))
            }
          }

          if (!cancelImportRef.current && droppedFiles.length > 0) {
            await processUploadedFiles(droppedFiles)
          } else {
            setIsProcessing(false)
          }
        } else {
          setIsProcessing(false)
          if (!cancelImportRef.current) {
            setImportError(
              'No files were imported. This might be because all files matched your ignore list (check if any Regex is overly broad) or the folder was empty.'
            )
          }
        }
      } catch (err) {
        logger.error(`[useFileProcessing] Error in handleDrop: ${err}`)
        setImportError(
          `Failed to process dropped items: ${err instanceof Error ? err.message : String(err)}`
        )
        setIsProcessing(false)
      }
    },
    [
      processUploadedFiles,
      setIsProcessing,
      maxFileLimit,
      isIgnoreListLoading,
      readFileContent,
    ]
  )

  const handleConcatenate = useCallback(
    async (filteredFiles: FileItem[], outputFormat: OutputFormat = 'text') => {
      if (filteredFiles.length === 0) return
      setImportError(null)

      if (filteredFiles.length > maxFileLimit) {
        setImportError(
          `Warning: You are attempting to concatenate over ${maxFileLimit} files. This exceeds safe UI thread memory parameters. Please split your architecture into smaller batch folders.`
        )
        return
      }

      setIsProcessing(true)
      const now = new Date()
      const timestamp = now.toLocaleString()
      const fileTimestamp = generateFileTimestamp(now)

      const fileList = filteredFiles.filter((f) => f.kind === 'file')

      if (outputFormat === 'pdf') {
        // Dynamically import jsPDF only when PDF is requested
        const { default: jsPDF } = await import('jspdf')
        const doc = new jsPDF()
        const pageWidth = doc.internal.pageSize.getWidth()
        const margin = 10
        const contentWidth = pageWidth - 2 * margin
        const lineHeight = 5

        let yPosition = margin

        // Add timestamp header
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(`Concatenated on: ${timestamp}`, margin, yPosition)
        yPosition += lineHeight * 2

        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')

        fileList.forEach((file, index) => {
          // Check if we need a new page
          if (
            yPosition >
            doc.internal.pageSize.getHeight() - margin - lineHeight * 5
          ) {
            doc.addPage()
            yPosition = margin
          }

          // Add file header with delimiters
          doc.setFont('helvetica', 'bold')
          const headerText = `${START_DELIMITER}${file.path}${END_DELIMITER}`
          // Robust text splitting
          const safeHeaderText = String(headerText || '')
          const headerLines = doc.splitTextToSize(safeHeaderText, contentWidth)
          doc.text(headerLines, margin, yPosition)
          yPosition += headerLines.length * lineHeight

          // Add file content
          doc.setFont('helvetica', 'normal')
          const rawContent = file.content
          const content = typeof rawContent === 'string' ? rawContent : ''

          if (!content) {
            doc.text('[Empty or Binary Content]', margin, yPosition)
            yPosition += lineHeight
          } else {
            const contentLines = doc.splitTextToSize(content, contentWidth)

            // Handle page breaks for long content
            for (let i = 0; i < contentLines.length; i++) {
              if (yPosition > doc.internal.pageSize.getHeight() - margin) {
                doc.addPage()
                yPosition = margin
              }
              doc.text(contentLines[i], margin, yPosition)
              yPosition += lineHeight
            }
          }

          // Add file end delimiter
          if (
            yPosition >
            doc.internal.pageSize.getHeight() - margin - lineHeight
          ) {
            doc.addPage()
            yPosition = margin
          }

          doc.setFont('helvetica', 'bold')
          const endText = FILE_END_DELIMITER
          doc.text(endText, margin, yPosition)
          yPosition += lineHeight * 2 // Extra spacing between files

          // Add separator line between files (except for last file)
          if (index < fileList.length - 1) {
            if (
              yPosition >
              doc.internal.pageSize.getHeight() - margin - lineHeight * 2
            ) {
              doc.addPage()
              yPosition = margin
            }
            yPosition += lineHeight
          }
        })

        // Save PDF
        doc.save(`concatenator-${fileTimestamp}.pdf`)
      } else {
        // Generate text file (default) using the core engine
        const result = concatenate(
          fileList.map((f) => ({
            path: f.path,
            content: typeof f.content === 'string' ? f.content : '',
          })),
          timestamp
        )

        const blob = new Blob([result], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `concatenator-${fileTimestamp}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        // Efficiency Analytics
        const totalRawTokens = fileList.reduce(
          (acc, f) =>
            acc +
            (typeof f.content === 'string'
              ? TokenService.getTokenCount(f.content).count
              : 0),
          0
        )
        const finalOutputTokens = TokenService.getTokenCount(result).count
        const tokensSaved = Math.max(0, totalRawTokens - finalOutputTokens)
        const savedPercent =
          totalRawTokens > 0
            ? ((tokensSaved / totalRawTokens) * 100).toFixed(2)
            : '0.00'

        logger.info(
          `Concatenation Complete: ${finalOutputTokens.toLocaleString()} precise tokens.`
        )
        if (tokensSaved > 0) {
          logger.info(
            `Efficiency Gain: ${tokensSaved.toLocaleString()} tokens saved (${savedPercent}% optimization).`
          )
        }

        // Ensure the browser has time to initiate the download before revoking
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }

      setIsProcessing(false)
    },
    [setIsProcessing, maxFileLimit]
  )

  const handleDownloadAsZip = useCallback(
    async (filteredFiles: FileItem[]) => {
      const fileList = filteredFiles.filter((f) => f.kind === 'file')

      if (fileList.length === 0) return

      setIsProcessing(true)

      try {
        const zip = new JSZip()

        // Add files to ZIP
        for (const f of fileList) {
          if (f.isIgnored) {
            logger.info(
              `Skipping ignored file during ZIP generation: ${f.path}`
            )
            continue
          }
          zip.file(f.path, typeof f.content === 'string' ? f.content : '')
        }

        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const fileTimestamp = generateFileTimestamp()
        const downloadName =
          appMode === AppMode.DECONCATENATE
            ? `extracted-${fileTimestamp}.zip`
            : `concatenator-${fileTimestamp}.zip`
        a.download = downloadName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        // Ensure the browser has time to initiate the download before revoking
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (error) {
        logger.error('Failed to create ZIP:', error)
        setImportError('Failed to create ZIP archive')
      } finally {
        setIsProcessing(false)
      }
    },
    [setIsProcessing, appMode]
  )

  /**
   * Validate concatenated content before extraction
   * Performs pre-flight check and updates validation state
   */
  const validateContent = useCallback((content: string): ValidationResult => {
    const result = validateConcatenation(content)
    setValidationResult(result)
    return result
  }, [])

  /**
   * Clear validation result
   */
  const clearValidation = useCallback(() => {
    setValidationResult(null)
  }, [])

  return {
    files,
    setFiles,
    isProcessing,
    importProgress,
    importError,
    setImportError,
    cancelProcessing,
    handleFileUpload,
    handleDrop,
    handleConcatenate,
    handleDeconcatenate,
    handleDownloadAsZip,
    isIgnored: useCallback(
      (path: string) => {
        if (isIgnored) return isIgnored(path)
        return resolvedHydrateFiles([path]).get(path)?.isIgnored ?? false
      },
      [isIgnored, resolvedHydrateFiles]
    ),
    validationResult,
    validateContent,
    clearValidation,
    loadVfsFiles,
    clearError: () => setImportError(null),
    pendingAbsorptions,
    clearAbsorptions: () => setPendingAbsorptions([]),
  }
}
