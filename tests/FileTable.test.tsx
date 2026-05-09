import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileTable } from '../src/web/features/concatenator/components/FileTable'
import { FileItem } from '../src/core/types'

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  ChevronUp: () => <div data-testid="icon-up" />,
  ChevronDown: () => <div data-testid="icon-down" />,
  X: () => <div data-testid="icon-x" />,
  ExternalLink: () => <div data-testid="icon-external" />,
  Eye: () => <div data-testid="icon-eye" />,
  EyeOff: () => <div data-testid="icon-eye-off" />,
  Folder: () => <div data-testid="icon-folder" />,
  FileCode: () => <div data-testid="icon-file-code" />,
  FileText: () => <div data-testid="icon-file-text" />,
  FileJson: () => <div data-testid="icon-file-json" />,
  Image: () => <div data-testid="icon-image" />,
}))

// Define mocks outside the factory to ensure they are the same across renders
const mockAddIgnorePattern = vi.fn()
const mockRemoveIgnorePattern = vi.fn()

vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: () => ({
    addIgnorePattern: mockAddIgnorePattern,
    removeIgnorePattern: mockRemoveIgnorePattern,
    isIgnored: (path: string) =>
      path.includes('ignored') || path === 'src/b.txt', // Match test data
  }),
}))

describe('FileTable', () => {
  const mockFiles: FileItem[] = [
    { name: 'b.txt', path: 'src/b.txt', kind: 'file', size: 200, tokens: 20 },
    { name: 'a.txt', path: 'src/a.txt', kind: 'file', size: 100, tokens: 10 },
    { name: 'c.txt', path: 'src/c.txt', kind: 'file', size: 300, tokens: 30 },
  ]
  const mockOnRemoveFile = vi.fn()
  const mockOnQuickLook = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders table headers and files', () => {
    render(
      <FileTable
        files={mockFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Path')).toBeDefined()
    expect(screen.getByRole('columnheader', { name: /size/i })).toBeDefined()
    expect(screen.getByRole('columnheader', { name: /tokens/i })).toBeDefined()
    expect(screen.getAllByText('a.txt')[0]).toBeDefined()
    expect(screen.getAllByText('b.txt')[0]).toBeDefined()
    expect(screen.getAllByText('c.txt')[0]).toBeDefined()
  })

  it('sorts by name when header is clicked', () => {
    render(
      <FileTable
        files={mockFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )

    const nameHeader = screen.getByText('Name')
    fireEvent.click(nameHeader) // asc

    let rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0].textContent).toContain('a.txt')
    expect(rows[2].textContent).toContain('c.txt')

    fireEvent.click(nameHeader) // desc
    rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('c.txt')
    expect(rows[2].textContent).toContain('a.txt')
  })

  it('sorts by size', () => {
    render(
      <FileTable
        files={mockFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    const sizeHeader = screen.getByRole('columnheader', { name: /size/i })
    fireEvent.click(sizeHeader) // asc
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('a.txt') // 100
    expect(rows[2].textContent).toContain('c.txt') // 300
  })

  it('sorts by tokens', () => {
    render(
      <FileTable
        files={mockFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    const tokensHeader = screen.getByRole('columnheader', { name: /tokens/i })
    fireEvent.click(tokensHeader) // asc
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('a.txt') // 10
    expect(rows[2].textContent).toContain('c.txt') // 30
  })

  it('calls onQuickLook when action button is clicked', () => {
    render(
      <FileTable
        files={mockFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    const quickLookButtons = screen.getAllByTitle('Quick Look')
    fireEvent.click(quickLookButtons[0])
    expect(mockOnQuickLook).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'src/a.txt' })
    ) // default sort is path
  })

  it('calls addIgnorePattern when ignore button is clicked', () => {
    render(
      <FileTable
        files={mockFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    const ignoreButtons = screen.getAllByTitle(/Ignore/)
    fireEvent.click(ignoreButtons[0])
    expect(mockAddIgnorePattern).toHaveBeenCalledWith('src/a.txt')
  })

  it('calls removeIgnorePattern when un-ignore button is clicked', () => {
    const ignoredFiles = [{ ...mockFiles[0], isIgnored: true }]
    render(
      <FileTable
        files={ignoredFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    const unignoreButton = screen.getByTitle(/Un-ignore/)
    fireEvent.click(unignoreButton)
    expect(mockRemoveIgnorePattern).toHaveBeenCalledWith('src/b.txt')
  })

  it('handles directory patterns for ignore', () => {
    const dirFile = {
      name: 'src',
      path: 'src',
      kind: 'directory' as const,
      size: 0,
    }
    render(
      <FileTable
        files={[dirFile]}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    const ignoreButton = screen.getByTitle(/Ignore/)
    fireEvent.click(ignoreButton)
    expect(mockAddIgnorePattern).toHaveBeenCalledWith('src')
  })

  it('calls onRemoveFile when remove button is clicked', () => {
    render(
      <FileTable
        files={mockFiles}
        onRemoveFile={mockOnRemoveFile}
        onQuickLook={mockOnQuickLook}
      />
    )
    const removeButtons = screen.getAllByTitle(/Remove/)
    fireEvent.click(removeButtons[0])
    expect(mockOnRemoveFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'src/a.txt' })
    )
  })
})
