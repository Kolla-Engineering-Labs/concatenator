import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFileProcessing } from '../src/web/features/concatenator/hooks/useFileProcessing'
import { AppMode } from '../src/web/types/workbench'

// Mock ApiClient
const mockGetFileBlob = vi.fn()
vi.mock('../src/web/services/ApiClient', () => ({
  ApiClient: {
    getFileBlob: mockGetFileBlob,
  },
}))

// Mock jsPDF
const mockAddPage = vi.fn()
const mockText = vi.fn()
const mockSave = vi.fn()
const mockSplitTextToSize = vi.fn((text) => [text])
const mockGetPageWidth = vi.fn(() => 210)
const mockGetPageHeight = vi.fn(() => 297)

vi.mock('jspdf', () => ({
  default: class {
    internal = {
      pageSize: {
        getWidth: mockGetPageWidth,
        getHeight: mockGetPageHeight,
      },
    }
    addPage = mockAddPage
    text = mockText
    save = mockSave
    splitTextToSize = mockSplitTextToSize
    setFontSize = vi.fn()
    setFont = vi.fn()
  },
}))

describe('useFileProcessing Extra Coverage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  it('handles handleDownloadAsZip with ignored files', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        isIgnored: (path) => path.includes('ignored'),
        maxFileLimit: 100,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
      })
    )

    const mockFiles = [
      {
        name: 'valid.txt',
        path: 'valid.txt',
        kind: 'file' as const,
        content: 'valid',
      },
      {
        name: 'ignored.txt',
        path: 'ignored.txt',
        kind: 'file' as const,
        content: 'ignored',
      },
    ]

    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = vi.fn()

    await act(async () => {
      await result.current.handleDownloadAsZip(mockFiles)
    })

    expect(global.URL.createObjectURL).toHaveBeenCalled()
    HTMLAnchorElement.prototype.click = originalClick
  })

  it('handles loadVfsFiles with various file types', async () => {
    mockGetFileBlob.mockResolvedValue(
      new Blob(['content'], { type: 'text/plain' })
    )

    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        isIgnored: () => false,
        maxFileLimit: 100,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
      })
    )

    const vfsFiles = [
      { name: 'test.png', path: 'test.png', kind: 'file' as const },
      { name: 'test.pdf', path: 'test.pdf', kind: 'file' as const },
    ]

    await act(async () => {
      await result.current.loadVfsFiles(vfsFiles)
    })

    expect(mockGetFileBlob).toHaveBeenCalledTimes(2)
  })

  it('handles cancelProcessing during file upload', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        isIgnored: () => false,
        maxFileLimit: 100,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
      })
    )

    const file = new File(['content'], 'test.txt')
    const mockEvent = {
      target: { files: [file] },
      preventDefault: vi.fn(),
    } as any

    // Mock FileReader to be slow
    const originalFileReader = global.FileReader
    global.FileReader = class {
      readAsText() {
        setTimeout(() => (this as any).onload(), 100)
      }
      abort = vi.fn()
    } as any

    let promise: any
    act(() => {
      promise = result.current.handleFileUpload(mockEvent)
    })

    act(() => {
      result.current.cancelProcessing()
    })

    await act(async () => {
      await promise
    })

    expect(result.current.isProcessing).toBe(false)
    global.FileReader = originalFileReader
  })

  it('handles PDF generation with many files triggering page breaks', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        isIgnored: () => false,
        maxFileLimit: 100,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
      })
    )

    // Mock many files to trigger loops and page breaks
    const mockFiles = Array.from({ length: 50 }).map((_, i) => ({
      name: `file${i}.txt`,
      path: `path/to/file${i}.txt`,
      kind: 'file' as const,
      content: 'Some content that might be long'.repeat(10),
      size: 100,
    }))

    // Force yPosition to trigger page breaks by making page height small
    mockGetPageHeight.mockReturnValue(50)

    await act(async () => {
      await result.current.handleConcatenate(mockFiles, 'pdf')
    })

    expect(mockAddPage).toHaveBeenCalled()
    expect(mockSave).toHaveBeenCalled()
  })

  it('handles handleDrop cancellation in readBatch', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        isIgnored: () => false,
        maxFileLimit: 100,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
      })
    )

    const mockEntry = {
      name: 'dir',
      isDirectory: true,
      isFile: false,
      createReader: () => ({
        readEntries: (success: any) => {
          // Cancel while reading entries
          result.current.cancelProcessing()
          success([
            {
              isFile: true,
              name: 'child.txt',
              file: (cb: any) => cb(new File([], 'child.txt')),
            },
          ])
        },
      }),
    } as any

    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        items: [{ webkitGetAsEntry: () => mockEntry }],
      },
    } as any

    await act(async () => {
      await result.current.handleDrop(mockEvent)
    })

    expect(result.current.isProcessing).toBe(false)
  })

  it('handles handleDrop with readEntries error', async () => {
    const { result } = renderHook(() =>
      useFileProcessing({
        appMode: AppMode.CONCATENATE,
        isIgnored: () => false,
        maxFileLimit: 100,
        isIgnoreListLoading: false,
        setVirtualFileSystem: vi.fn(),
      })
    )

    const mockEntry = {
      name: 'dir',
      isDirectory: true,
      isFile: false,
      createReader: () => ({
        readEntries: (_success: any, error: any) => {
          error(new Error('Read error'))
        },
      }),
    } as any

    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        items: [{ webkitGetAsEntry: () => mockEntry }],
      },
    } as any

    await act(async () => {
      await result.current.handleDrop(mockEvent)
    })

    // Should still finish without crashing
    expect(result.current.isProcessing).toBe(false)
  })
})
