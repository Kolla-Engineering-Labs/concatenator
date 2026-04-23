import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TreeNode } from '../src/web/features/concatenator/components/TreeNode'
import { TreeItem } from '../src/core/types'

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  ChevronRight: () => <div data-testid="icon-right" />,
  ChevronDown: () => <div data-testid="icon-down" />,
  Folder: () => <div data-testid="icon-folder" />,
  Eye: () => <div data-testid="icon-eye" />,
  EyeOff: () => <div data-testid="icon-eye-off" />,
  FileCode: () => <div data-testid="icon-file-code" />,
  FileText: () => <div data-testid="icon-file-text" />,
  FileJson: () => <div data-testid="icon-file-json" />,
  Image: () => <div data-testid="icon-image" />,
  ExternalLink: () => <div data-testid="icon-external" />,
  X: () => <div data-testid="icon-x" />,
}))

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Define mocks outside the factory
const mockAddIgnorePattern = vi.fn()
const mockRemoveIgnorePattern = vi.fn()

vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: () => ({
    addIgnorePattern: mockAddIgnorePattern,
    removeIgnorePattern: mockRemoveIgnorePattern,
  }),
}))

describe('TreeNode', () => {
  const mockNode: TreeItem = {
    name: 'src',
    path: 'src',
    kind: 'directory',
    children: [
      {
        name: 'test.ts',
        path: 'src/test.ts',
        kind: 'file',
        file: {
          name: 'test.ts',
          path: 'src/test.ts',
          kind: 'file',
          size: 100,
          content: 'test',
        },
      },
    ],
  }

  const mockOnQuickLook = vi.fn()
  const mockOnRemoveFile = vi.fn()
  const mockSetExpandedPaths = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders node name and icon', () => {
    render(
      <TreeNode
        node={mockNode}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
      />
    )
    expect(screen.getByText('src/')).toBeDefined()
    expect(screen.getByTestId('icon-folder')).toBeDefined()
  })

  it('toggles expansion when clicked', () => {
    render(
      <TreeNode
        node={mockNode}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
      />
    )
    const nodeElement = screen.getByTestId('tree-node-src')
    fireEvent.click(nodeElement)
    expect(mockSetExpandedPaths).toHaveBeenCalledWith(new Set(['src']))
  })

  it('renders children when expanded', () => {
    render(
      <TreeNode
        node={mockNode}
        expandedPaths={new Set(['src'])}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
      />
    )
    expect(screen.getByText('test.ts')).toBeDefined()
  })

  it('calls addIgnorePattern for directory when ignore button clicked', () => {
    render(
      <TreeNode
        node={mockNode}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
      />
    )
    const ignoreButton = screen.getByTitle(/Ignore src/)
    fireEvent.click(ignoreButton)
    expect(mockAddIgnorePattern).toHaveBeenCalledWith('src/**')
  })

  it('calls removeIgnorePattern when un-ignore button clicked', () => {
    const ignoredNode = { ...mockNode, isIgnored: true }
    render(
      <TreeNode
        node={ignoredNode}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
      />
    )
    const unignoreButton = screen.getByTitle(/Un-ignore src/)
    fireEvent.click(unignoreButton)
    expect(mockRemoveIgnorePattern).toHaveBeenCalledWith('src/**')
  })

  it('calls onQuickLook when Quick Look button clicked', () => {
    render(
      <TreeNode
        node={mockNode.children![0]}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
      />
    )
    const quickLookButton = screen.getByTitle('Quick Look')
    fireEvent.click(quickLookButton)
    expect(mockOnQuickLook).toHaveBeenCalledWith(mockNode.children![0].file)
  })

  it('calls onRemoveFile when remove button clicked', () => {
    render(
      <TreeNode
        node={mockNode.children![0]}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
      />
    )
    const removeButton = screen.getByTitle(/Remove test.ts/)
    fireEvent.click(removeButton)
    expect(mockOnRemoveFile).toHaveBeenCalledWith(mockNode.children![0].file)
  })

  it('renders inherited ignored state', () => {
    render(
      <TreeNode
        node={mockNode.children![0]}
        expandedPaths={new Set()}
        setExpandedPaths={mockSetExpandedPaths}
        onQuickLook={mockOnQuickLook}
        onRemoveFile={mockOnRemoveFile}
        inheritedIgnored={true}
      />
    )
    expect(screen.getByText('Inherited')).toBeDefined()
  })
})
