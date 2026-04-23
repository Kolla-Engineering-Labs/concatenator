import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { FileTable } from '../src/web/features/concatenator/components/FileTable'
import { QuickLook } from '../src/web/features/concatenator/components/QuickLook'
import { FileItem } from '../src/core/types'
import { useWorkbench } from '../src/web/hooks/useWorkbench'

// Mock useWorkbench
vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: vi.fn(),
}))

describe('FileTable Component', () => {
  const mockOnRemoveFile = vi.fn()
  const mockOnQuickLook = vi.fn()

  const files: FileItem[] = [
    {
      name: 'file1.ts',
      path: 'src/file1.ts',
      kind: 'file',
      size: 100,
      tokens: 25,
      content: 'content1',
    },
    {
      name: 'file2.js',
      path: 'src/file2.js',
      kind: 'file',
      size: 200,
      tokens: 50,
      content: 'content2',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useWorkbench).mockReturnValue({
      addIgnorePattern: vi.fn(),
      removeIgnorePattern: vi.fn(),
    } as any)
  })

  it('renders table headers correctly', () => {
    render(
      <FileTable
        files={files}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Path')).toBeInTheDocument()
    expect(screen.getByText('Size')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('renders file rows with correct data', () => {
    render(
      <FileTable
        files={files}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )

    expect(screen.getByText('file1.ts')).toBeInTheDocument()
    expect(screen.getByText('src/file1.ts')).toBeInTheDocument()
    expect(screen.getByText(/25/)).toBeInTheDocument() // Tokens

    expect(screen.getByText('file2.js')).toBeInTheDocument()
    expect(screen.getByText(/50/)).toBeInTheDocument() // Tokens
  })

  it('calls onQuickLook when preview icon clicked', () => {
    render(
      <FileTable
        files={files}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )

    const quickLookButtons = screen.getAllByTitle('Quick Look')
    fireEvent.click(quickLookButtons[0])

    expect(mockOnQuickLook).toHaveBeenCalledWith(files[0])
  })

  it('calls onRemoveFile when remove icon clicked', () => {
    render(
      <FileTable
        files={files}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )

    const removeButtons = screen.getAllByTitle(/Remove file1.ts/)
    fireEvent.click(removeButtons[0])

    expect(mockOnRemoveFile).toHaveBeenCalledWith(files[0])
  })
})

describe('QuickLook Component', () => {
  const mockOnClose = vi.fn()
  const file: FileItem = {
    name: 'test.ts',
    path: 'src/test.ts',
    kind: 'file',
    content: 'const x = 1;',
    size: 12,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders file content and name', () => {
    render(<QuickLook file={file} onClose={mockOnClose} />)

    expect(screen.getByText('test.ts')).toBeInTheDocument()
    expect(screen.getByText('src/test.ts')).toBeInTheDocument()
    expect(screen.getByText('const x = 1;')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    render(<QuickLook file={file} onClose={mockOnClose} />)

    const closeButton = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('handles copy to clipboard', async () => {
    // Mock navigator.clipboard
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    }
    Object.assign(navigator, { clipboard: mockClipboard })

    render(<QuickLook file={file} onClose={mockOnClose} />)

    const copyButton = screen.getByTitle('Copy content')
    fireEvent.click(copyButton)

    expect(mockClipboard.writeText).toHaveBeenCalledWith('const x = 1;')
  })
})
