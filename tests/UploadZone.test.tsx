/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { UploadZone } from '../src/web/features/concatenator/components/UploadZone'
import { useTouchDevice } from '../src/web/hooks/useTouchDevice'

vi.mock('../src/web/hooks/useTouchDevice', () => ({
  useTouchDevice: vi.fn(),
}))

describe('UploadZone Component', () => {
  const defaultProps = {
    isProcessing: false,
    isDropzoneMinimized: false,
    setIsDropzoneMinimized: vi.fn(),
    importProgress: { current: 0, total: 0 },
    cancelProcessing: vi.fn(),
    importError: null,
    setImportError: vi.fn(),
    appMode: 'concatenate' as const,
    handleDrop: vi.fn(),
    handleFileUpload: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders desktop labels when isTouchDevice is false', () => {
    vi.mocked(useTouchDevice).mockReturnValue(false)
    render(<UploadZone {...defaultProps} />)
    expect(screen.getByText('Drop folder or files here')).toBeInTheDocument()
    expect(screen.getByText('or click to browse')).toBeInTheDocument()
  })

  it('renders touch labels when isTouchDevice is true', () => {
    vi.mocked(useTouchDevice).mockReturnValue(true)
    render(<UploadZone {...defaultProps} />)
    expect(screen.getByText('Tap to select files')).toBeInTheDocument()
    expect(
      screen.getByText('Browse local or cloud storage')
    ).toBeInTheDocument()
  })

  it('triggers input click when container is clicked on touch device', () => {
    vi.mocked(useTouchDevice).mockReturnValue(true)
    const { container } = render(<UploadZone {...defaultProps} />)

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    // The outermost div of the component (excluding the wrapper in test)
    const dropZone = container.firstChild as HTMLElement
    fireEvent.click(dropZone)

    expect(clickSpy).toHaveBeenCalled()
  })

  it('does NOT trigger input click when container is clicked on desktop (input handles it via absolute overlay)', () => {
    vi.mocked(useTouchDevice).mockReturnValue(false)
    const { container } = render(<UploadZone {...defaultProps} />)

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    const dropZone = container.firstChild as HTMLElement
    fireEvent.click(dropZone)

    // On desktop, the input is absolute inset-0, so clicking the zone usually clicks the input directly.
    // However, our onClick handler is only on the container and it only calls .click() if isTouchDevice is true.
    // So the explicit spy on .click() should NOT be called by our container handler.
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('renders correctly when minimized', () => {
    vi.mocked(useTouchDevice).mockReturnValue(false)
    render(<UploadZone {...defaultProps} isDropzoneMinimized={true} />)
    expect(screen.getByText('Drop here')).toBeInTheDocument()
  })

  it('renders correctly when minimized on touch device', () => {
    vi.mocked(useTouchDevice).mockReturnValue(true)
    render(<UploadZone {...defaultProps} isDropzoneMinimized={true} />)
    expect(screen.getByText('Tap to select')).toBeInTheDocument()
  })

  it('shows processing state with progress bar', () => {
    render(
      <UploadZone
        {...defaultProps}
        isProcessing={true}
        importProgress={{ current: 5, total: 10 }}
      />
    )
    expect(screen.getByText('Reading Files...')).toBeInTheDocument()
    expect(screen.getByText('5 / 10')).toBeInTheDocument()
    expect(screen.getByText('Cancel Import')).toBeInTheDocument()
  })

  it('shows scanning folder status in processing state', () => {
    render(
      <UploadZone
        {...defaultProps}
        isProcessing={true}
        importProgress={{ current: 0, total: 0 }}
      />
    )
    expect(screen.getByText('Scanning Folder...')).toBeInTheDocument()
  })

  it('shows parsing status in deconcatenate mode', () => {
    render(
      <UploadZone
        {...defaultProps}
        isProcessing={true}
        appMode="deconcatenate"
      />
    )
    expect(screen.getByText('Parsing...')).toBeInTheDocument()
  })

  it('calls cancelProcessing when cancel button is clicked', () => {
    render(<UploadZone {...defaultProps} isProcessing={true} />)
    fireEvent.click(screen.getByText('Cancel Import'))
    expect(defaultProps.cancelProcessing).toHaveBeenCalled()
  })

  it('shows error state and allows dismissal', () => {
    render(<UploadZone {...defaultProps} importError="Test Error" />)
    expect(screen.getByText('Test Error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Dismiss'))
    expect(defaultProps.setImportError).toHaveBeenCalledWith(null)
  })

  it('toggles minimized state when minimize button is clicked', () => {
    render(<UploadZone {...defaultProps} />)
    const minimizeBtn = screen.getByTitle('Minimize dropzone')
    fireEvent.click(minimizeBtn)
    expect(defaultProps.setIsDropzoneMinimized).toHaveBeenCalledWith(true)
  })

  it('handles dragOver event', () => {
    vi.mocked(useTouchDevice).mockReturnValue(false)
    render(<UploadZone {...defaultProps} />)

    const dropZone = screen.getByTestId('upload-zone-container')

    // Use a real DragEvent to be more authentic
    const dragOverEvent = new CustomEvent('dragover', { bubbles: true }) as any
    dragOverEvent.preventDefault = vi.fn()
    dragOverEvent.stopPropagation = vi.fn()

    fireEvent(dropZone, dragOverEvent)

    expect(dragOverEvent.preventDefault).toHaveBeenCalled()
    expect(dragOverEvent.stopPropagation).toHaveBeenCalled()
  })

  it('handles dragOver event even when isTouchDevice is true (Regression Test)', () => {
    vi.mocked(useTouchDevice).mockReturnValue(true)
    render(<UploadZone {...defaultProps} />)

    const dropZone = screen.getByTestId('upload-zone-container')

    const dragOverEvent = new CustomEvent('dragover', { bubbles: true }) as any
    dragOverEvent.preventDefault = vi.fn()
    dragOverEvent.stopPropagation = vi.fn()

    fireEvent(dropZone, dragOverEvent)

    expect(dragOverEvent.preventDefault).toHaveBeenCalled()
    expect(dragOverEvent.stopPropagation).toHaveBeenCalled()
  })

  it('handles drop event even when isTouchDevice is true (Regression Test)', () => {
    vi.mocked(useTouchDevice).mockReturnValue(true)
    render(<UploadZone {...defaultProps} />)

    const dropZone = screen.getByTestId('upload-zone-container')

    const dropEvent = new CustomEvent('drop', { bubbles: true }) as any
    dropEvent.preventDefault = vi.fn()
    dropEvent.stopPropagation = vi.fn()

    fireEvent(dropZone, dropEvent)

    // handleDrop from props should be called
    expect(defaultProps.handleDrop).toHaveBeenCalled()
  })
})
