/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import { FileItem, OutputFormat } from '../../../../core/types'
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
import {
  isImageFile,
  isPdfFile,
  estimateTokenCount,
} from '../../../../lib/utils'

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
  isIgnored: (path: string) => boolean
  maxFileLimit: number
  isIgnoreListLoading: boolean
  setVirtualFileSystem: (vfs: Record<string, string>) => void
}

/**
 * Custom hook to handle file processing, concatenation, and de-concatenation.
 */
export const useFileProcessing = ({
  appMode,
  isIgnored,
  maxFileLimit,
  isIgnoreListLoading,
  setVirtualFileSystem,
}: UseFileProcessingProps) => {
  const [files, setFiles] = useState<FileItem[]>([])
  // filesRef mirrors files on every render so async callbacks always read
  // the latest value without needing files in their useCallback dep arrays.
  const filesRef = useRef<FileItem[]>([])
  filesRef.current = files
  const [isProcessing, setIsProcessingState] = useState(false)
  const isProcessingRef = useRef(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importError, setImportError] = useState<string | null>(null)
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null)
  // Absorptions from root-pruning reconciliation — consumed by UI Toast
  const [pendingAbsorptions, setPendingAbsorptions] = useState<Absorption[]>([])
  const cancelImportRef = useRef(false)
  const activeReaderRef = useRef<FileReader | null>(null)
  const setIsProcessing = useCallback((processing: boolean) => {
    isProcessingRef.current = processing
    setIsProcessingState(processing)
  }, [])

  const cancelProcessing = useCallback(() => {
    cancelImportRef.current = true
    if (activeReaderRef.current) {
      activeReaderRef.current.abort()
    }
  }, [])

  const readFileContent = useCallback(
    async (file: File): Promise<string | ArrayBuffer | null> => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        activeReaderRef.current = reader

        reader.onload = () => {
          activeReaderRef.current = null
          resolve(reader.result)
        }

        reader.onerror = (err) => {
          activeReaderRef.current = null
          logger.error(`Failed to read file ${file.name}:`, err)
          resolve(null)
        }

        reader.onabort = () => {
          activeReaderRef.current = null
          resolve(null)
        }

        if (isImageFile(file.name) || isPdfFile(file.name)) {
          reader.readAsArrayBuffer(file)
        } else {
          reader.readAsText(file)
        }
      })
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
          if (fileItem.kind !== 'file' || !fileItem.content) continue

          const content = fileItem.content as string

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
        setIsProcessing(true)
        setImportError(null)
        cancelImportRef.current = false
        activeReaderRef.current = null
        setImportProgress({ current: 0, total: uploadedFiles.length })

        await new Promise((resolve) => setTimeout(resolve, 50))

        const newFiles: FileItem[] = []
        const newDirPaths = new Set<string>() // O(1) dedup for directory entries
        let lastRenderTime = Date.now()

        for (let i = 0; i < uploadedFiles.length; i++) {
          if (cancelImportRef.current) break

          const item = uploadedFiles[i]
          let fileItem: FileItem

          if ('kind' in item && item.kind === 'file') {
            // Already processed (e.g. from handleDrop)
            fileItem = item
          } else {
            // Raw File object (e.g. from handleFileUpload)
            const file = item as File
            const path =
              (file as { webkitRelativePath?: string }).webkitRelativePath ||
              file.name

            const content = await readFileContent(file)
            activeReaderRef.current = null

            if (content === null || cancelImportRef.current) {
              const now = Date.now()
              if (now - lastRenderTime > 50 || i === uploadedFiles.length - 1) {
                setImportProgress((prev) => ({ ...prev, current: i + 1 }))
                lastRenderTime = now
              }
              continue
            }

            fileItem = {
              name: file.name,
              path: path,
              kind: 'file',
              content,
              size: file.size,
              tokens: estimateTokenCount(content, file.size),
            }
          }

          newFiles.push(fileItem)

          const path = fileItem.path
          const parts = path.split('/')
          for (let j = 1; j < parts.length; j++) {
            const dirPath = parts.slice(0, j).join('/')
            if (!newDirPaths.has(dirPath)) {
              newDirPaths.add(dirPath)
              newFiles.push({
                name: parts[j - 1],
                path: dirPath,
                kind: 'directory',
              })
            }
          }

          const now = Date.now()
          if (now - lastRenderTime > 50 || i === uploadedFiles.length - 1) {
            setImportProgress((prev) => ({ ...prev, current: i + 1 }))
            lastRenderTime = now
          }

          if (i % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
        }

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
                  name: path.split('/').pop() || '',
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

            setFiles(reconciledFiles)
          }
        }

        setIsProcessing(false)
        setImportProgress({ current: 0, total: 0 })
        cancelImportRef.current = false
        activeReaderRef.current = null
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
      activeReaderRef.current = null

      const filesToProcess = vfsFiles.filter(
        (f) => f.kind === 'file' && !f.isIgnored
      )
      setImportProgress({ current: 0, total: filesToProcess.length })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const newFiles: FileItem[] = []
      let lastRenderTime = Date.now()
      let processedCount = 0

      // Import ApiClient for this method
      const { ApiClient } = await import('../../../services/ApiClient')

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
              activeReaderRef.current = reader
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = () =>
                reject(new Error(`Failed to read file: ${file.path}`))
              reader.onabort = () => resolve(null)

              if (isImageFile(file.name) || isPdfFile(file.name)) {
                reader.readAsDataURL(blob)
              } else {
                reader.readAsText(blob)
              }
            }
          )

          activeReaderRef.current = null

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
      activeReaderRef.current = null
    },
    [setIsProcessing, setImportProgress, setFiles, setImportError]
  )

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
        if (!items) return

        const entries: FileSystemEntry[] = []
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry() as FileSystemEntry | null
          if (entry) {
            entries.push(entry)
          }
        }

        if (entries.length === 0) return

        setIsProcessing(true)
        setImportError(null)
        cancelImportRef.current = false
        setImportProgress({ current: 0, total: 0 })

        await new Promise((resolve) => setTimeout(resolve, 100))

        const droppedFiles: (File | FileItem)[] = []

        const traverseEntry = async (entry: FileSystemEntry, path = '') => {
          try {
            if (cancelImportRef.current) return

            // Skip reserved Windows names (Bug fix: prevents InvalidStateError on NUL, etc.)
            if (isReservedWindowsFilename(entry.name)) {
              logger.warn(`Skipping reserved Windows entry: ${entry.name}`)
              return
            }

            const fullPath = path + entry.name

            // Skip directories (root or nested) that are explicitly blocked by ignore list
            if (entry.isDirectory && isIgnored(fullPath)) {
              return
            }

            // Skip files that are explicitly blocked by ignore list
            if (entry.isFile && isIgnored(fullPath)) {
              return
            }

            // Defensive check: if cancelled, stop immediately
            if (cancelImportRef.current) return

            if (entry.isFile && 'file' in entry) {
              // Check max file limit before adding (halt immediately when exceeded)
              if (droppedFiles.length >= maxFileLimit) {
                setImportError(
                  `Import halted: The folder contains more than ${maxFileLimit} files. Please increase the Max Files limit or select a folder with fewer files.`
                )
                cancelImportRef.current = true
                return
              }

              setImportProgress((prev) => ({ ...prev, total: prev.total + 1 }))
              const file = await new Promise<File>((resolve, reject) => {
                const fileEntry = entry as FileSystemFileEntry
                fileEntry.file(
                  (f: File) => resolve(f),
                  (err: Error) => reject(err)
                )
              })
              if (cancelImportRef.current) return

              // Read content immediately to avoid InvalidStateError (stale handle)
              const content = await readFileContent(file)
              if (content === null) return

              droppedFiles.push({
                name: file.name,
                path: fullPath,
                kind: 'file',
                content,
                size: file.size,
                tokens: estimateTokenCount(content, file.size),
              })
            } else if (entry.isDirectory && 'createReader' in entry) {
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

              // Parallelize discovery of children with concurrency limit
              const concurrencyLimit = 20
              for (let i = 0; i < entriesBatch.length; i += concurrencyLimit) {
                const batch = entriesBatch.slice(i, i + concurrencyLimit)
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

        if (droppedFiles.length > 0) {
          await processUploadedFiles(droppedFiles)
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
      isIgnored,
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
          fileList.map((f) => ({ path: f.path, content: f.content as string })),
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
          if (isIgnored(f.path)) {
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
    [setIsProcessing, appMode, isIgnored]
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
    isIgnored,
    validationResult,
    validateContent,
    clearValidation,
    loadVfsFiles,
    clearError: () => setImportError(null),
    pendingAbsorptions,
    clearAbsorptions: () => setPendingAbsorptions([]),
  }
}
