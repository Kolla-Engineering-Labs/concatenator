import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QuickLook } from '../src/web/features/concatenator/components/QuickLook'
import { FileItem } from '../src/core/types'

// Mock Lucide icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
    X: () => <div data-testid="icon-x" />,
    FileCode: () => <div data-testid="icon-file-code" />,
    Copy: () => <div data-testid="icon-copy" />,
    Check: () => <div data-testid="icon-check" />,
    Image: () => <div data-testid="icon-image" />,
    FileText: () => <div data-testid="icon-file-text" />,
  }
})

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

describe('QuickLook', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders nothing when file is null', () => {
    const { container } = render(
      <QuickLook file={null} onClose={mockOnClose} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders text content correctly', () => {
    const file: FileItem = {
      name: 'test.txt',
      path: 'src/test.txt',
      kind: 'file',
      content: 'hello world',
      size: 11,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    expect(screen.getByText('test.txt')).toBeDefined()
    expect(screen.getByText('hello world')).toBeDefined()
  })

  it('handles "Binary content" fallback', () => {
    const file: FileItem = {
      name: 'test.bin',
      path: 'src/test.bin',
      kind: 'file',
      content: new ArrayBuffer(8),
      size: 8,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    expect(screen.getByText('Binary content')).toBeDefined()
  })

  it('copies content to clipboard', async () => {
    const file: FileItem = {
      name: 'test.txt',
      path: 'src/test.txt',
      kind: 'file',
      content: 'copy me',
      size: 7,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)

    const copyButton = screen.getByTitle('Copy content')
    fireEvent.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy me')
    expect(screen.getByTestId('icon-check')).toBeDefined()

    // Wait for the check icon to revert
    await waitFor(
      () => {
        expect(screen.queryByTestId('icon-check')).toBeNull()
      },
      { timeout: 3000 }
    )
  })

  it('renders PDF iframe when data URL is present', () => {
    const file: FileItem = {
      name: 'test.pdf',
      path: 'src/test.pdf',
      kind: 'file',
      content: 'data:application/pdf;base64,JVBERi0xLjQK...',
      size: 100,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    const iframe = screen.getByTitle('test.pdf')
    expect(iframe).toBeDefined()
    expect(iframe.getAttribute('src')).toBe(file.content)
  })

  it('shows unavailable state for PDFs without data URL', () => {
    const file: FileItem = {
      name: 'test.pdf',
      path: 'src/test.pdf',
      kind: 'file',
      content: 'not a data url',
      size: 100,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    expect(screen.getByText('PDF Preview Unavailable')).toBeDefined()
  })

  it('renders SVG using dangerouslySetInnerHTML for text-based SVGs', () => {
    const file: FileItem = {
      name: 'test.svg',
      path: 'src/test.svg',
      kind: 'file',
      content: '<svg><circle cx="50" cy="50" r="40" /></svg>',
      size: 40,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    const svgContainer = screen.getByText((content, element) => {
      return element?.tagName.toLowerCase() === 'svg' || false
    })
    expect(svgContainer).toBeDefined()
  })

  it('renders SVG using TextDecoder for base64-encoded SVGs', () => {
    // <svg><rect width="10" height="10"/></svg>
    const svgText = '<svg><rect width="10" height="10"/></svg>'
    const base64Svg = btoa(svgText)
    const file: FileItem = {
      name: 'test.svg',
      path: 'src/test.svg',
      kind: 'file',
      content: `data:image/svg+xml;base64,${base64Svg}`,
      size: 100,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    // Should be decoded and rendered as inner HTML
    expect(
      screen.getByText(
        (content, element) => element?.tagName.toLowerCase() === 'rect' || false
      )
    ).toBeDefined()
  })

  it('renders images using img tag', () => {
    const file: FileItem = {
      name: 'test.png',
      path: 'src/test.png',
      kind: 'file',
      content:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      size: 100,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    const img = screen.getByAltText('test.png')
    expect(img).toBeDefined()
    expect(img.getAttribute('src')).toBe(file.content)
  })

  it('calls onClose when close button is clicked', () => {
    const file: FileItem = {
      name: 'test.txt',
      path: 'src/test.txt',
      kind: 'file',
      content: 'content',
      size: 7,
    }
    render(<QuickLook file={file} onClose={mockOnClose} />)
    screen.getAllByRole('button')
    // The last button is "Close", there's also an X icon button
    fireEvent.click(screen.getByText('Close'))
    expect(mockOnClose).toHaveBeenCalled()
  })
})
