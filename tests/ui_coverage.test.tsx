import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileTable } from '../src/web/features/concatenator/components/FileTable'
import { TreeNode } from '../src/web/features/concatenator/components/TreeNode'
import { FileItem, TreeItem } from '../src/core/types'

// Mock useWorkbench
const mockAddIgnorePattern = vi.fn()
const mockRemoveIgnorePattern = vi.fn()
vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: () => ({
    addIgnorePattern: mockAddIgnorePattern,
    removeIgnorePattern: mockRemoveIgnorePattern,
    isIgnored: (path: string) =>
      path.includes('file2.js') || path.includes('test.js'), // Mock based on test data
  }),
}))

describe('UI Components Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('FileTable', () => {
    const mockFiles: FileItem[] = [
      {
        name: 'file1.ts',
        path: 'src/file1.ts',
        kind: 'file',
        size: 100,
        tokens: 10,
        isPrecise: true,
      },
      {
        name: 'file2.js',
        path: 'src/file2.js',
        kind: 'file',
        size: 200,
        tokens: 20,
        isPrecise: false,
        isIgnored: true,
      },
      {
        name: 'file3.md',
        path: 'README.md',
        kind: 'file',
        size: 300,
        tokens: 30,
        isNegated: true,
      },
    ]

    it('renders files and handles sorting', () => {
      const onRemoveFile = vi.fn()
      const onQuickLook = vi.fn()

      render(
        <FileTable
          files={mockFiles}
          onRemoveFile={onRemoveFile}
          onQuickLook={onQuickLook}
        />
      )

      expect(screen.getByText('file1.ts')).toBeDefined()
      expect(screen.getByText('src/file2.js')).toBeDefined()
      expect(screen.getByText('Negated')).toBeDefined()

      // Sort by size
      fireEvent.click(screen.getByText(/Size/))
      // Second click for desc
      fireEvent.click(screen.getByText(/Size/))

      // Sort by tokens
      fireEvent.click(screen.getByText(/Tokens/))

      // Sort by path
      fireEvent.click(screen.getByText(/Path/))

      // Remove file
      const removeButtons = screen.getAllByTitle(/Remove/)
      fireEvent.click(removeButtons[0])
      expect(onRemoveFile).toHaveBeenCalled()

      // Quick look
      const quickButtons = screen.getAllByTitle(/Quick Look/)
      fireEvent.click(quickButtons[0])
      expect(onQuickLook).toHaveBeenCalled()

      // Toggle ignore (add)
      fireEvent.click(screen.getByTitle('Ignore file1.ts'))
      expect(mockAddIgnorePattern).toHaveBeenCalled()

      // Toggle ignore (remove)
      fireEvent.click(screen.getByTitle('Un-ignore file2.js'))
      expect(mockRemoveIgnorePattern).toHaveBeenCalled()
    })
  })

  describe('TreeNode', () => {
    const mockTree: TreeItem = {
      name: 'Root',
      path: '',
      kind: 'directory',
      children: [
        {
          name: 'src',
          path: 'src',
          kind: 'directory',
          children: [
            {
              name: 'app.ts',
              path: 'src/app.ts',
              kind: 'file',
              file: {
                name: 'app.ts',
                path: 'src/app.ts',
                kind: 'file',
                size: 100,
              },
            },
          ],
        },
      ],
    }

    it('renders tree and handles expansion', () => {
      const onQuickLook = vi.fn()
      const onRemoveFile = vi.fn()
      const expandedPaths = new Set<string>()
      const setExpandedPaths = vi.fn()

      render(
        <TreeNode
          node={mockTree}
          expandedPaths={expandedPaths}
          setExpandedPaths={setExpandedPaths}
          onQuickLook={onQuickLook}
          onRemoveFile={onRemoveFile}
        />
      )

      expect(screen.getByText('Root')).toBeDefined()

      // Click to expand
      fireEvent.click(screen.getByText('Root'))
      expect(setExpandedPaths).toHaveBeenCalled()

      // Render with expanded path
      render(
        <TreeNode
          node={mockTree}
          expandedPaths={new Set(['', 'src'])}
          setExpandedPaths={setExpandedPaths}
          onQuickLook={onQuickLook}
          onRemoveFile={onRemoveFile}
        />
      )

      expect(screen.getByText('app.ts')).toBeDefined()
    })

    it('handles ignore toggle in tree', () => {
      const node: TreeItem = {
        name: 'test.js',
        path: 'test.js',
        kind: 'file',
        isIgnored: true,
      }

      render(
        <TreeNode
          node={node}
          expandedPaths={new Set()}
          setExpandedPaths={vi.fn()}
          onQuickLook={vi.fn()}
          onRemoveFile={vi.fn()}
        />
      )

      const toggleButton = screen.getByTitle(/Un-ignore/)
      fireEvent.click(toggleButton)
      expect(mockRemoveIgnorePattern).toHaveBeenCalledWith('test.js')
    })

    it('handles quick look and remove in tree', () => {
      const node: TreeItem = {
        name: 'test.ts',
        path: 'test.ts',
        kind: 'file',
        file: { name: 'test.ts', path: 'test.ts', kind: 'file', size: 100 },
      }
      const onQuickLook = vi.fn()
      const onRemoveFile = vi.fn()

      render(
        <TreeNode
          node={node}
          expandedPaths={new Set()}
          setExpandedPaths={vi.fn()}
          onQuickLook={onQuickLook}
          onRemoveFile={onRemoveFile}
        />
      )

      fireEvent.click(screen.getByTitle(/Quick Look/))
      expect(onQuickLook).toHaveBeenCalled()

      fireEvent.click(screen.getByTitle(/Remove/))
      expect(onRemoveFile).toHaveBeenCalled()
    })
  })
})
