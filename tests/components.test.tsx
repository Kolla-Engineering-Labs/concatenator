import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { Header } from '../src/web/features/concatenator/components/Header'
import { Footer } from '../src/web/features/concatenator/components/Footer'
import { ModeSwitch } from '../src/web/components/ModeSwitch'
import { OutputFormatToggle } from '../src/web/features/concatenator/components/OutputFormatToggle'
import { TreeNode } from '../src/web/features/concatenator/components/TreeNode'
import { TreeItem } from '../src/core/types'
import { AppMode, ViewPreference } from '../src/web/types/workbench'

import { useWorkbench } from '../src/web/hooks/useWorkbench'

// Mock posthog
vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}))

// Mock useWorkbench
vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: vi.fn(),
}))

const mockSetMode = vi.fn()

describe('Header Component', () => {
  const mockSetIsDarkMode = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with app title', () => {
    render(<Header isDarkMode={false} setIsDarkMode={mockSetIsDarkMode} />)

    expect(screen.getByText('Concatenator')).toBeInTheDocument()
  })

  it('shows moon icon in light mode', () => {
    render(<Header isDarkMode={false} setIsDarkMode={mockSetIsDarkMode} />)

    // Moon icon should be present for toggling to dark
    expect(document.querySelector('svg')).toBeInTheDocument()
  })

  it('shows sun icon in dark mode', () => {
    render(<Header isDarkMode={true} setIsDarkMode={mockSetIsDarkMode} />)

    expect(document.querySelector('svg')).toBeInTheDocument()
  })

  it('toggles dark mode when theme button clicked', () => {
    render(<Header isDarkMode={false} setIsDarkMode={mockSetIsDarkMode} />)

    const themeButton = screen.getByRole('button', {
      name: 'Switch to dark mode',
    })
    fireEvent.click(themeButton)

    expect(mockSetIsDarkMode).toHaveBeenCalledWith(true)
  })

  it('has sticky positioning class', () => {
    const { container } = render(
      <Header isDarkMode={false} setIsDarkMode={mockSetIsDarkMode} />
    )

    const header = container.querySelector('header')
    expect(header?.classList.contains('sticky')).toBe(true)
  })
})

describe('Footer Component', () => {
  it('renders footer attribution', () => {
    render(<Footer />)

    expect(screen.getByText(/Built with React & Tailwind/i)).toBeInTheDocument()
  })

  it('renders metadata tiles', () => {
    render(<Footer />)

    expect(screen.getByText(/Storage/i)).toBeInTheDocument()
    expect(screen.getByText(/License/i)).toBeInTheDocument()
    expect(screen.getByText(/Analytics/i)).toBeInTheDocument()
    expect(screen.getByText(/Source/i)).toBeInTheDocument()
  })

  it('renders within footer element', () => {
    const { container } = render(<Footer />)

    const footer = container.querySelector('footer')
    expect(footer).toBeInTheDocument()
  })

  it('has centered text alignment', () => {
    const { container } = render(<Footer />)

    // We check the footer itself for centering since it's the flex container
    const footer = container.querySelector('footer')
    expect(footer?.classList.contains('text-center')).toBe(true)
  })
})

describe('ModeSwitch Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementation
    vi.mocked(useWorkbench).mockReturnValue({
      mode: AppMode.CONCATENATE,
      setMode: mockSetMode,
      view: ViewPreference.LIST,
      ignoreList: [],
      isSidebarOpen: true,
      compiledIgnores: [],
      forceMode: false,
      virtualFileSystem: {},
      tokenBudget: 128000,
      isIgnored: () => false,
      resetWorkbench: vi.fn(),
      setSidebarOpen: vi.fn(),
      setView: vi.fn(),
      setIgnoreList: vi.fn(),
      setForceMode: vi.fn(),
      setVirtualFileSystem: vi.fn(),
      setTokenBudget: vi.fn(),
      addIgnorePattern: vi.fn(),
      removeIgnorePattern: vi.fn(),
      autoSaveIgnore: false,
      setAutoSaveIgnore: vi.fn(),
      isInitialized: true,
    })
  })

  it('renders both mode buttons', () => {
    render(<ModeSwitch />)

    expect(screen.getByText('Concatenate')).toBeInTheDocument()
    expect(screen.getByText('De-concatenate')).toBeInTheDocument()
  })

  it('concatenate button is active in concatenate mode', () => {
    render(<ModeSwitch />)

    const concatButton = screen.getByText('Concatenate').closest('button')
    const deconcatButton = screen.getByText('De-concatenate').closest('button')

    expect(concatButton?.className).toContain('bg-brand-600')
    expect(deconcatButton?.className).not.toContain('bg-brand-600')
  })

  it('deconcatenate button is active in deconcatenate mode', () => {
    vi.mocked(useWorkbench).mockReturnValue({
      mode: AppMode.DECONCATENATE,
      setMode: mockSetMode,
      view: ViewPreference.LIST,
      ignoreList: [],
      isSidebarOpen: true,
      compiledIgnores: [],
      forceMode: false,
      virtualFileSystem: {},
      tokenBudget: 128000,
      isIgnored: () => false,
      resetWorkbench: vi.fn(),
      setSidebarOpen: vi.fn(),
      setView: vi.fn(),
      setIgnoreList: vi.fn(),
      setForceMode: vi.fn(),
      setVirtualFileSystem: vi.fn(),
      setTokenBudget: vi.fn(),
      addIgnorePattern: vi.fn(),
      removeIgnorePattern: vi.fn(),
      autoSaveIgnore: false,
      setAutoSaveIgnore: vi.fn(),
      isInitialized: true,
    })

    render(<ModeSwitch />)

    const concatButton = screen.getByText('Concatenate').closest('button')
    const deconcatButton = screen.getByText('De-concatenate').closest('button')

    expect(deconcatButton?.className).toContain('bg-brand-600')
    expect(concatButton?.className).not.toContain('bg-brand-600')
  })

  it('calls setMode when concatenate clicked', () => {
    vi.mocked(useWorkbench).mockReturnValue({
      mode: AppMode.DECONCATENATE,
      setMode: mockSetMode,
      view: ViewPreference.LIST,
      ignoreList: [],
      isSidebarOpen: true,
      compiledIgnores: [],
      forceMode: false,
      virtualFileSystem: {},
      tokenBudget: 128000,
      isIgnored: () => false,
      resetWorkbench: vi.fn(),
      setSidebarOpen: vi.fn(),
      setView: vi.fn(),
      setIgnoreList: vi.fn(),
      setForceMode: vi.fn(),
      setVirtualFileSystem: vi.fn(),
      setTokenBudget: vi.fn(),
      addIgnorePattern: vi.fn(),
      removeIgnorePattern: vi.fn(),
      autoSaveIgnore: false,
      setAutoSaveIgnore: vi.fn(),
      isInitialized: true,
    })

    render(<ModeSwitch />)

    fireEvent.click(screen.getByText('Concatenate'))

    expect(mockSetMode).toHaveBeenCalledWith(AppMode.CONCATENATE)
  })

  it('calls setMode when deconcatenate clicked', () => {
    vi.mocked(useWorkbench).mockReturnValue({
      mode: AppMode.CONCATENATE,
      setMode: mockSetMode,
      view: ViewPreference.LIST,
      ignoreList: [],
      compiledIgnores: [],
      isSidebarOpen: true,
      forceMode: false,
      virtualFileSystem: {},
      tokenBudget: 128000,
      isIgnored: () => false,
      resetWorkbench: vi.fn(),
      setSidebarOpen: vi.fn(),
      setView: vi.fn(),
      setIgnoreList: vi.fn(),
      setForceMode: vi.fn(),
      setVirtualFileSystem: vi.fn(),
      setTokenBudget: vi.fn(),
      addIgnorePattern: vi.fn(),
      removeIgnorePattern: vi.fn(),
      autoSaveIgnore: false,
      setAutoSaveIgnore: vi.fn(),
      isInitialized: true,
    })

    render(<ModeSwitch />)

    fireEvent.click(screen.getByText('De-concatenate'))

    expect(mockSetMode).toHaveBeenCalledWith(AppMode.DECONCATENATE)
  })

  it('has proper container styling classes', () => {
    const { container } = render(<ModeSwitch />)

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper?.classList.contains('flex')).toBe(true)
    expect(
      wrapper?.classList.contains('bg-slate-100') ||
        wrapper?.classList.contains('dark:bg-slate-900')
    ).toBe(true)
  })
})

describe('TreeNode Component', () => {
  const mockSetExpandedPaths = vi.fn()

  const createMockNode = (overrides: Partial<TreeItem> = {}): TreeItem => ({
    name: 'test',
    path: '/test',
    kind: 'file',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders file node', () => {
    const node = createMockNode({ name: 'file.txt', kind: 'file' })

    render(
      <TreeNode
        node={node}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    expect(screen.getByText('file.txt')).toBeInTheDocument()
  })

  it('renders directory node with folder icon', () => {
    const node = createMockNode({
      name: 'folder',
      kind: 'directory',
      children: [],
    })

    render(
      <TreeNode
        node={node}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    expect(screen.getByText('folder/')).toBeInTheDocument()
  })

  it('shows chevron right when directory is collapsed', () => {
    const node = createMockNode({
      name: 'folder',
      kind: 'directory',
      children: [createMockNode({ name: 'child.txt' })],
    })

    const { container } = render(
      <TreeNode
        node={node}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    // ChevronRight should be present
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('shows chevron down when directory is expanded', () => {
    const node = createMockNode({
      name: 'folder',
      kind: 'directory',
      children: [createMockNode({ name: 'child.txt' })],
    })

    const { container } = render(
      <TreeNode
        node={node}
        expandedPaths={new Set(['/test'])}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('toggles expansion when directory clicked', () => {
    const node = createMockNode({
      name: 'folder',
      path: '/folder',
      kind: 'directory',
      children: [createMockNode({ name: 'child.txt' })],
    })

    render(
      <TreeNode
        node={node}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('folder/'))

    expect(mockSetExpandedPaths).toHaveBeenCalled()
  })

  it('does not toggle when file clicked', () => {
    const node = createMockNode({ name: 'file.txt', kind: 'file' })

    render(
      <TreeNode
        node={node}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('file.txt'))

    expect(mockSetExpandedPaths).not.toHaveBeenCalled()
  })

  it('renders nested children when expanded', () => {
    const node = createMockNode({
      name: 'parent',
      path: '/parent',
      kind: 'directory',
      children: [
        createMockNode({
          name: 'child1.txt',
          path: '/parent/child1.txt',
          kind: 'file',
        }),
        createMockNode({
          name: 'child2.txt',
          path: '/parent/child2.txt',
          kind: 'file',
        }),
      ],
    })

    render(
      <TreeNode
        node={node}
        expandedPaths={new Set(['/parent'])}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    expect(screen.getByText('child1.txt')).toBeInTheDocument()
    expect(screen.getByText('child2.txt')).toBeInTheDocument()
  })

  it('applies depth-based indentation', () => {
    const node = createMockNode({ name: 'file.txt', kind: 'file' })

    const { container } = render(
      <TreeNode
        node={node}
        depth={2}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    const row = container.querySelector('[style*="padding-left"]')
    expect(row).toBeInTheDocument()
  })

  it('renders Root directory with special styling', () => {
    const node = createMockNode({
      name: 'Root',
      path: '/',
      kind: 'directory',
      children: [],
    })

    render(
      <TreeNode
        node={node}
        depth={0}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    // Root directory does NOT show / suffix (special case in TreeNode)
    expect(screen.getByText('Root')).toBeInTheDocument()
  })

  it('does not show slash for directory named Root', () => {
    // When name is 'Root', the slash is not appended (special case)
    const node = createMockNode({
      name: 'Root',
      path: '/',
      kind: 'directory',
      children: [],
    })

    render(
      <TreeNode
        node={node}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={vi.fn()}
        onRemoveFile={vi.fn()}
      />
    )

    // Root directory does NOT show / suffix (node.name !== 'Root' check)
    expect(screen.getByText('Root')).toBeInTheDocument()
    expect(screen.queryByText('Root/')).not.toBeInTheDocument()
  })
})

describe('OutputFormatToggle Component', () => {
  const mockSetOutputFormat = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders both format buttons', () => {
    render(
      <OutputFormatToggle
        outputFormat="text"
        setOutputFormat={mockSetOutputFormat}
      />
    )

    expect(screen.getByText('Text')).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('Text button is active in text mode', () => {
    render(
      <OutputFormatToggle
        outputFormat="text"
        setOutputFormat={mockSetOutputFormat}
      />
    )

    const textButton = screen.getByText('Text').closest('button')
    const pdfButton = screen.getByText('PDF').closest('button')

    expect(textButton?.className).toContain('bg-white')
    expect(pdfButton?.className).not.toContain('bg-white')
  })

  it('PDF button is active in pdf mode', () => {
    render(
      <OutputFormatToggle
        outputFormat="pdf"
        setOutputFormat={mockSetOutputFormat}
      />
    )

    const textButton = screen.getByText('Text').closest('button')
    const pdfButton = screen.getByText('PDF').closest('button')

    expect(pdfButton?.className).toContain('bg-white')
    expect(textButton?.className).not.toContain('bg-white')
  })

  it('calls setOutputFormat when Text clicked', () => {
    render(
      <OutputFormatToggle
        outputFormat="pdf"
        setOutputFormat={mockSetOutputFormat}
      />
    )

    fireEvent.click(screen.getByText('Text'))

    expect(mockSetOutputFormat).toHaveBeenCalledWith('text')
  })

  it('calls setOutputFormat when PDF clicked', () => {
    render(
      <OutputFormatToggle
        outputFormat="text"
        setOutputFormat={mockSetOutputFormat}
      />
    )

    fireEvent.click(screen.getByText('PDF'))

    expect(mockSetOutputFormat).toHaveBeenCalledWith('pdf')
  })

  it('has proper container styling classes', () => {
    const { container } = render(
      <OutputFormatToggle
        outputFormat="text"
        setOutputFormat={mockSetOutputFormat}
      />
    )

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper?.classList.contains('flex')).toBe(true)
    expect(wrapper?.classList.contains('rounded-lg')).toBe(true)
  })
})
