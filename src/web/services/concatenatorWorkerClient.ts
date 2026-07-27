/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ConcatenatorWorker from '../../workers/concatenator.worker.ts?worker'
import type {
  ConcatenateInputFile,
  FormatterOptions,
  ValidationResult,
} from '../../core/engine'

export interface TelemetryProgress {
  bytesProcessed: number
  progressPercentage: number
  totalTokens: number
  isPrecise: boolean
  fileTokenMap: Record<string, { tokens: number; isPrecise: boolean }>
}

export interface ParseResultPayload {
  fileCount: number
  degradedMode: boolean
  validation?: ValidationResult
}

export interface ConcatenatorWorkerCallbacks {
  onProgressTick?: (telemetry: TelemetryProgress) => void
  onTokenExactSync?: (telemetry: TelemetryProgress) => void
  onBuildComplete?: (result: {
    totalBytes: number
    fileCount: number
    degradedMode: boolean
  }) => void
  onParseProgress?: (extractedCount: number, totalFiles: number) => void
  onParseComplete?: (result: ParseResultPayload) => void
  onError?: (error: string) => void
}

interface WindowWithFileSystemAccess {
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}

interface FileHandleWithWritable extends FileSystemFileHandle {
  createWritable: () => Promise<FileSystemWritableFileStream>
}

export class ConcatenatorWorkerClient {
  private worker: Worker | null = null

  constructor() {
    this.initWorker()
  }

  private initWorker() {
    try {
      this.worker = new ConcatenatorWorker()
    } catch (err) {
      console.error(
        '[ConcatenatorWorkerClient] Worker initialization failed:',
        err
      )
    }
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  /**
   * User-Gesture-First Export Flow
   * Prompts showSaveFilePicker before starting worker, then pipes transferred ReadableStream to disk
   */
  public async exportConcatenation(
    files: ConcatenateInputFile[],
    formatterOptions?: FormatterOptions,
    callbacks?: ConcatenatorWorkerCallbacks
  ): Promise<void> {
    if (!this.worker) {
      this.initWorker()
    }
    if (!this.worker) {
      throw new Error('Worker unavailable')
    }

    // 1. Await User Gesture First: Prompt for save file picker
    let fileHandle: FileSystemFileHandle | null = null
    let writableStream:
      | FileSystemWritableFileStream
      | WritableStream<Uint8Array>
      | null = null
    const blobChunks: Uint8Array[] = []
    const win = window as unknown as WindowWithFileSystemAccess

    if (typeof win.showSaveFilePicker === 'function') {
      try {
        fileHandle = await win.showSaveFilePicker({
          suggestedName: `concatenated-bundle-${Date.now()}.txt`,
          types: [
            {
              description: 'Text Files',
              accept: { 'text/plain': ['.txt', '.md'] },
            },
          ],
        })
        if (fileHandle) {
          writableStream = await (
            fileHandle as FileHandleWithWritable
          ).createWritable()
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return // User cancelled picker
        }
        console.warn(
          '[ConcatenatorWorkerClient] File System Access API picker warning:',
          err
        )
      }
    }

    // Fallback: Blob accumulator if picker unavailable or rejected
    if (!writableStream) {
      writableStream = new WritableStream<Uint8Array>({
        write(chunk) {
          try {
            blobChunks.push(chunk)
          } catch {
            throw new Error(
              'ERR_OOM_BLOB_ACCUMULATION: Memory limit exceeded accumulating fallback stream'
            )
          }
        },
      })
    }

    const activeWorker = this.worker

    return new Promise<void>((resolve, reject) => {
      const messageHandler = async (e: MessageEvent) => {
        const data = e.data
        if (!data || !data.type) return

        switch (data.type) {
          case 'PROGRESS_TICK':
            callbacks?.onProgressTick?.(data)
            break

          case 'TOKEN_EXACT_SYNC':
            callbacks?.onTokenExactSync?.(data)
            break

          case 'BUILD_STREAM': {
            const stream = data.stream as ReadableStream<Uint8Array>
            try {
              if (writableStream) {
                await stream.pipeTo(writableStream)
              }
            } catch (pipeErr) {
              reject(pipeErr)
            }
            break
          }

          case 'BUILD_COMPLETE':
            activeWorker.removeEventListener('message', messageHandler)
            callbacks?.onBuildComplete?.(data)

            // Trigger fallback blob download if File System Access API was not used
            if (!fileHandle && blobChunks.length > 0) {
              const blob = new Blob(blobChunks as BlobPart[], {
                type: 'text/plain;charset=utf-8',
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `concatenated-bundle-${Date.now()}.txt`
              a.click()
              URL.revokeObjectURL(url)
            }

            resolve()
            break

          case 'ERROR':
            activeWorker.removeEventListener('message', messageHandler)
            callbacks?.onError?.(data.error)
            reject(new Error(data.error))
            break

          default:
            break
        }
      }

      activeWorker.addEventListener('message', messageHandler)
      activeWorker.postMessage({ type: 'BUILD_START', files, formatterOptions })
    })
  }

  /**
   * User-Gesture-First Deconcatenation Extraction Flow
   * Prompts showDirectoryPicker before dispatching PARSE_START with raw File object
   */
  public async extractBundle(
    file: File,
    callbacks?: ConcatenatorWorkerCallbacks
  ): Promise<void> {
    if (!this.worker) {
      this.initWorker()
    }
    if (!this.worker) {
      throw new Error('Worker unavailable')
    }

    // 1. User-Gesture-First: Prompt for directory handle
    let targetDirHandle: FileSystemDirectoryHandle | null = null
    const win = window as unknown as WindowWithFileSystemAccess

    if (typeof win.showDirectoryPicker === 'function') {
      try {
        targetDirHandle = await win.showDirectoryPicker()
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return // User cancelled picker
        }
        console.warn(
          '[ConcatenatorWorkerClient] Directory picker fallback:',
          err
        )
      }
    }

    const activeWorker = this.worker

    return new Promise<void>((resolve, reject) => {
      const messageHandler = (e: MessageEvent) => {
        const data = e.data
        if (!data || !data.type) return

        switch (data.type) {
          case 'PARSE_PROGRESS':
            callbacks?.onParseProgress?.(data.extractedCount, data.totalFiles)
            break

          case 'PARSE_COMPLETE':
            activeWorker.removeEventListener('message', messageHandler)
            callbacks?.onParseComplete?.(data)

            // Trigger ZIP fallback download if directory handle was not used
            if (!targetDirHandle && data.zipBuffer) {
              const blob = new Blob([data.zipBuffer], {
                type: 'application/zip',
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `extracted-bundle-${Date.now()}.zip`
              a.click()
              URL.revokeObjectURL(url)
            }

            resolve()
            break

          case 'ERROR':
            activeWorker.removeEventListener('message', messageHandler)
            callbacks?.onError?.(data.error)
            reject(new Error(data.error))
            break

          default:
            break
        }
      }

      activeWorker.addEventListener('message', messageHandler)
      activeWorker.postMessage({
        type: 'PARSE_START',
        file,
        targetDirHandle,
      })
    })
  }
}
