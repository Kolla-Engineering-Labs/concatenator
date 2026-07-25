import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileTable } from '../src/web/features/concatenator/components/FileTable'
import { FileItem } from '../src/core/types'

// Mock Lucide icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
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
    FileImage: () => <div data-testid="icon-file-image" />,
    FileArchive: () => <div data-testid="icon-file-archive" />,
    FileAudio: () => <div data-testid="icon-file-audio" />,
    FileVideo: () => <div data-testid="icon-file-video" />,
    FileSpreadsheet: () => <div data-testid="icon-file-spreadsheet" />,
    File: () => <div data-testid="icon-file" />,
    Image: () => <div data-testid="icon-image" />,
    Ban: () => <div data-testid="icon-ban" />,
  }
})

// Define mocks outside the factory to ensure they are the same across renders
const mockAddIgnorePattern = vi.fn()
const mockRemoveIgnorePattern = vi.fn()
const mockSuspendRule = vi.fn()
const mockUnsuspendRule = vi.fn()

vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: () => ({
    addIgnorePattern: mockAddIgnorePattern,
    removeIgnorePattern: mockRemoveIgnorePattern,
    suspendRule: mockSuspendRule,
    unsuspendRule: mockUnsuspendRule,
    suspendedRules: [],
    isIgnored: (path: string) =>
      path.includes('ignored') ||
      path === 'src/b.txt' ||
      path === 'src/icon.svg',
    ignoreList: ['src/b.txt'],
    isExplicitlyNegated: () => false,
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

  describe('Mobile View', () => {
    it('renders mobile cards and handles actions', () => {
      render(
        <FileTable
          files={mockFiles}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      // Mobile view uses text instead of just icons for some buttons
      // and has different layout structure.
      // We look for 'Ignore' text which is only in mobile buttons (desktop uses title)
      const ignoreButtons = screen.getAllByText('Ignore')
      expect(ignoreButtons.length).toBeGreaterThan(0)

      fireEvent.click(ignoreButtons[0])
      // Default sort is path: a.txt, b.txt, c.txt. So index 0 is a.txt
      expect(mockAddIgnorePattern).toHaveBeenCalledWith('src/a.txt')

      const quickLookButtons = screen.getAllByTestId('quick-look-button')
      // There are 3 desktop + 3 mobile = 6 buttons
      fireEvent.click(quickLookButtons[3]) // first mobile one
      expect(mockOnQuickLook).toHaveBeenCalled()

      const removeButtons = screen.getAllByTestId('remove-file-button')
      fireEvent.click(removeButtons[3]) // first mobile one
      expect(mockOnRemoveFile).toHaveBeenCalled()
    })

    it('handles un-ignore in mobile view', () => {
      const ignoredFiles = [{ ...mockFiles[0], isIgnored: true }]
      render(
        <FileTable
          files={ignoredFiles}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      const unignoreButton = screen.getByText('Un-ignore')
      fireEvent.click(unignoreButton)
      expect(mockRemoveIgnorePattern).toHaveBeenCalledWith('src/b.txt')
    })

    it('binds reason and ignoreSource to title attribute when ignored', () => {
      const ignoredFiles = [
        {
          ...mockFiles[0],
          isIgnored: true,
          reason: 'PatternMatch',
          ignoreSource: '.gitignore',
        },
      ]
      render(
        <FileTable
          files={ignoredFiles}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )
      const badges = screen.getAllByTitle('PatternMatch (.gitignore)')
      expect(badges.length).toBeGreaterThan(0)
      expect(badges[0]).toHaveAttribute('title', 'PatternMatch (.gitignore)')
    })

    it('displays (manual override) in title attribute when manually toggled/ignored', () => {
      const manualIgnoredFiles = [
        {
          ...mockFiles[0],
          isIgnored: true,
          reason: 'src/a.txt',
          ignoreSource: 'manual override' as any,
        },
      ]
      render(
        <FileTable
          files={manualIgnoredFiles}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )
      const badges = screen.getAllByTitle('src/a.txt (manual override)')
      expect(badges.length).toBeGreaterThan(0)
      expect(badges[0]).toHaveAttribute('title', 'src/a.txt (manual override)')
    })
  })

  describe('Context Menu (Right-Click)', () => {
    const ignoredFile: FileItem = {
      name: 'icon.svg',
      path: 'src/icon.svg',
      kind: 'file',
      size: 150,
      tokens: 15,
      isIgnored: true,
      reason: '*.svg',
    }

    const nonIgnoredFile: FileItem = {
      name: 'app.tsx',
      path: 'src/app.tsx',
      kind: 'file',
      size: 500,
      tokens: 50,
      isIgnored: false,
    }

    it('opens context menu when right-clicking an IGNORED file row', () => {
      render(
        <FileTable
          files={[ignoredFile]}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      const row = screen.getAllByTestId('file-row')[0]
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })

      expect(screen.getByTestId('context-menu')).toBeInTheDocument()
      expect(screen.getByTestId('context-menu-include')).toBeInTheDocument()
      expect(screen.getByTestId('context-menu-disable-rule')).toHaveTextContent(
        'Disable rule: *.svg'
      )
    })

    it('does not open context menu when right-clicking a NON-IGNORED file row', () => {
      render(
        <FileTable
          files={[nonIgnoredFile]}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      const row = screen.getAllByTestId('file-row')[0]
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })

      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument()
    })

    it('triggers path-level override when "Include this specific file" is clicked and closes menu', () => {
      render(
        <FileTable
          files={[ignoredFile]}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      const row = screen.getAllByTestId('file-row')[0]
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })

      const includeBtn = screen.getByTestId('context-menu-include')
      fireEvent.click(includeBtn)

      // isIgnored('src/icon.svg') is true from useWorkbench mock, variant 'src/icon.svg' is not in ignoreList ['src/b.txt'], so it calls addIgnorePattern('!src/icon.svg')
      expect(mockAddIgnorePattern).toHaveBeenCalledWith('!src/icon.svg')
      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument()
    })

    it('triggers rule suspension when "Disable rule: [matchedRule]" is clicked and closes menu', () => {
      render(
        <FileTable
          files={[ignoredFile]}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      const row = screen.getAllByTestId('file-row')[0]
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })

      const disableRuleBtn = screen.getByTestId('context-menu-disable-rule')
      fireEvent.click(disableRuleBtn)

      expect(mockSuspendRule).toHaveBeenCalledWith('*.svg')
      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument()
    })

    it('closes context menu when clicking outside or pressing Escape', () => {
      render(
        <FileTable
          files={[ignoredFile]}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      const row = screen.getAllByTestId('file-row')[0]
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })
      expect(screen.getByTestId('context-menu')).toBeInTheDocument()

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument()

      // Re-open menu
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })
      expect(screen.getByTestId('context-menu')).toBeInTheDocument()

      // Click outside
      fireEvent.mouseDown(document.body)
      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument()
    })

    it('verifies ephemeral rule suspension: recalculates VFS ignore state, applies CSS strikethrough, and does not persist to server/file', () => {
      const logFile: FileItem = {
        name: 'app.log',
        path: 'logs/app.log',
        kind: 'file',
        size: 200,
        tokens: 20,
        isIgnored: true,
        reason: '*.log',
      }

      render(
        <FileTable
          files={[logFile]}
          onRemoveFile={mockOnRemoveFile}
          onQuickLook={mockOnQuickLook}
        />
      )

      // Right click row to open context menu
      const row = screen.getAllByTestId('file-row')[0]
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })

      const disableRuleBtn = screen.getByTestId('context-menu-disable-rule')
      expect(disableRuleBtn).toHaveTextContent('Disable rule: *.log')

      // Fire disable rule action
      fireEvent.click(disableRuleBtn)

      // Assert suspendRule was triggered
      expect(mockSuspendRule).toHaveBeenCalledWith('*.log')
      expect(mockAddIgnorePattern).not.toHaveBeenCalled()
      expect(mockRemoveIgnorePattern).not.toHaveBeenCalled()
    })
  })
})
