/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useFileProcessing } from '../src/web/features/concatenator/hooks/useFileProcessing'
import { AppMode } from '../src/web/types/workbench'

vi.mock('../src/web/services/ApiClient', () => ({
  ApiClient: {
    getFileBlob: vi.fn(),
    triggerConcatenate: vi.fn(),
  },
}))

// In-memory DOM FileReader mock to resolve async reads immediately under fake timers
class MockFileReader {
  public result: string | ArrayBuffer | null = null
  public onload: (() => void) | null = null
  public onerror: ((err: unknown) => void) | null = null
  public onabort: (() => void) | null = null

  readAsText(file: Blob) {
    if (file && typeof (file as any).text === 'function') {
      ;(file as any)
        .text()
        .then((txt: string) => {
          this.result = txt
          this.onload?.()
        })
        .catch((err: unknown) => this.onerror?.(err))
    } else {
      this.result = ''
      this.onload?.()
    }
  }

  readAsArrayBuffer(file: Blob) {
    if (file && typeof (file as any).arrayBuffer === 'function') {
      ;(file as any)
        .arrayBuffer()
        .then((buf: ArrayBuffer) => {
          this.result = buf
          this.onload?.()
        })
        .catch((err: unknown) => this.onerror?.(err))
    } else {
      this.result = new ArrayBuffer(0)
      this.onload?.()
    }
  }

  abort() {
    this.onabort?.()
  }
}

const originalFileReader = window.FileReader

const mockHydrateNone = (paths: string[]) => {
  const map = new Map()
  paths.forEach((p) => map.set(p, { isIgnored: false, isNegated: false }))
  return map
}

describe('useFileProcessing Topology & Memory Payload Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    window.FileReader = MockFileReader as any
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    window.FileReader = originalFileReader
  })

  it('ingests in-memory File objects via handleFileUpload and calculates token counts', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 1000,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    const fileContent =
      'const greeting = "hello world";\nexport default greeting;'
    const file = new File([fileContent], 'hello.ts', {
      type: 'text/typescript',
    })
    Object.defineProperty(file, 'path', { value: 'src/hello.ts' })

    const mockEvent = {
      target: {
        files: [file],
        value: 'dummy',
      },
      preventDefault: vi.fn(),
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      const uploadPromise = result.current.handleFileUpload(mockEvent)
      await vi.advanceTimersByTimeAsync(100)
      await uploadPromise
    })

    expect(result.current.files.length).toBeGreaterThanOrEqual(1)
    const processedFile = result.current.files.find(
      (f) => f.name === 'hello.ts'
    )
    expect(processedFile).toBeDefined()
    expect(processedFile?.content).toBe(fileContent)
    expect(processedFile?.tokens).toBeGreaterThan(0)
  })

  it('reconstructs directory topology and synthesizes missing parent folders from SSD paths', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 1000,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    const deepFile = new File(
      ['export const add = (a, b) => a + b;'],
      'math.ts',
      {
        type: 'text/typescript',
      }
    )
    Object.defineProperty(deepFile, 'path', {
      value: 'packages/core/src/utils/math.ts',
    })

    const mockEvent = {
      target: {
        files: [deepFile],
        value: 'dummy',
      },
      preventDefault: vi.fn(),
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      const uploadPromise = result.current.handleFileUpload(mockEvent)
      await vi.advanceTimersByTimeAsync(100)
      await uploadPromise
    })

    const paths = result.current.files.map((f) => f.path)
    expect(paths).toContain('packages/core/src/utils/math.ts')
    // Verify parent directories are synthesized
    expect(paths).toContain('packages')
    expect(paths).toContain('packages/core')
    expect(paths).toContain('packages/core/src')
    expect(paths).toContain('packages/core/src/utils')
  })

  it('recursively traverses FileSystemDirectoryEntry hierarchies on drag-and-drop', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 1000,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    const nestedFileObj = new File(['export const util = true;'], 'util.ts', {
      type: 'text/typescript',
    })

    const mockFileEntry = {
      isFile: true,
      isDirectory: false,
      name: 'util.ts',
      file: vi.fn((cb) => cb(nestedFileObj)),
    }

    let readCalled = false
    const mockDirReader = {
      readEntries: vi.fn((cb) => {
        if (!readCalled) {
          readCalled = true
          cb([mockFileEntry])
        } else {
          cb([])
        }
      }),
    }

    const mockDirEntry = {
      isFile: false,
      isDirectory: true,
      name: 'utils',
      createReader: () => mockDirReader,
    }

    const mockDropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        items: [
          {
            webkitGetAsEntry: () => mockDirEntry,
          },
        ],
      },
    } as unknown as React.DragEvent

    await act(async () => {
      const dropPromise = result.current.handleDrop(mockDropEvent)
      await vi.advanceTimersByTimeAsync(200)
      await dropPromise
    })

    expect(result.current.files.some((f) => f.name === 'utils')).toBe(true)
  })

  it('skips reserved Windows device filenames during directory crawling', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 1000,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    const mockNulEntry = {
      isFile: true,
      isDirectory: false,
      name: 'NUL.txt',
    }

    let readCalled = false
    const mockDirReader = {
      readEntries: vi.fn((cb) => {
        if (!readCalled) {
          readCalled = true
          cb([mockNulEntry])
        } else {
          cb([])
        }
      }),
    }

    const mockDirEntry = {
      isFile: false,
      isDirectory: true,
      name: 'devices',
      createReader: () => mockDirReader,
    }

    const mockDropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        items: [
          {
            webkitGetAsEntry: () => mockDirEntry,
          },
        ],
      },
    } as unknown as React.DragEvent

    await act(async () => {
      const dropPromise = result.current.handleDrop(mockDropEvent)
      await vi.advanceTimersByTimeAsync(200)
      await dropPromise
    })

    expect(result.current.files.some((f) => f.name === 'NUL.txt')).toBe(false)
  })

  it('handles over-limit file ingestion gracefully with descriptive warning', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 2,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    const files = [
      new File(['1'], 'file1.ts'),
      new File(['2'], 'file2.ts'),
      new File(['3'], 'file3.ts'),
    ]

    const mockEvent = {
      target: {
        files,
        value: 'dummy',
      },
      preventDefault: vi.fn(),
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      const uploadPromise = result.current.handleFileUpload(mockEvent)
      await vi.advanceTimersByTimeAsync(100)
      await uploadPromise
    })

    expect(result.current.importError).toContain('over 2 files')
  })

  it('supports handleDownloadAsZip in Concatenate mode', async () => {
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-zip-url')
    window.URL.revokeObjectURL = vi.fn()

    let clickedDownloadName = ''
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        el.click = vi.fn().mockImplementation(() => {
          clickedDownloadName = (el as HTMLAnchorElement).download
        })
      }
      return el
    })

    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 1000,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    const mockFiles = [
      {
        name: 'app.ts',
        path: 'src/app.ts',
        kind: 'file' as const,
        content: 'console.log("ready");',
        size: 20,
      },
    ]

    await act(async () => {
      const zipPromise = result.current.handleDownloadAsZip(mockFiles)
      await vi.advanceTimersByTimeAsync(1100)
      await zipPromise
    })

    expect(clickedDownloadName).toMatch(/^concatenator-.*\.zip$/)
  })

  it('validates concatenated content and clears validation state', () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.DECONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 1000,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    act(() => {
      const valRes = result.current.validateContent(
        '<<<<< FILE_START: test.ts >>>>>\ncode\n<<<<< FILE_END >>>>>'
      )
      expect(valRes.isValid).toBe(true)
      expect(valRes.fileCount).toBe(1)
    })

    expect(result.current.validationResult?.isValid).toBe(true)

    act(() => {
      result.current.clearValidation()
    })

    expect(result.current.validationResult).toBeNull()
  })

  it('cancels processing and aborts active file readers on cancelProcessing()', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        hydrateFiles: mockHydrateNone,
        isExplicitlyNegated: () => false,
        maxFileLimit: 1000,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
        shouldRecurse: () => true,
      })
    )

    act(() => {
      result.current.cancelProcessing()
    })

    expect(result.current.isProcessing).toBe(false)
  })
})
