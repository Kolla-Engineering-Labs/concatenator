import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExecutionWorkbench } from './ExecutionWorkbench'
import type { VFSNode } from '../hooks/useVFS'

describe('ExecutionWorkbench', () => {
  const dummyTree: VFSNode = {
    path: '/root',
    name: 'root',
    kind: 'directory',
    isIgnored: false,
    isNegated: false,
    tokenWeight: 100,
  }

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders header and default configuration choices', () => {
    render(
      <ExecutionWorkbench
        tree={dummyTree}
        onExecute={vi.fn()}
        isExecuting={false}
      />
    )

    expect(screen.getByText('Execution Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Markdown')).toBeInTheDocument()
    expect(screen.getByText('XML / Claude')).toBeInTheDocument()
    expect(screen.getByText('Safety Neutralization')).toBeInTheDocument()
    expect(screen.getByText('Post-Matter Manifest')).toBeInTheDocument()
    expect(screen.getByText('Strip Comments')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /EXECUTE CONCATENATION/i })
    ).not.toBeDisabled()
  })

  it('disables the button when tree is null or tokenWeight is 0 or isExecuting is true', () => {
    const { rerender } = render(
      <ExecutionWorkbench tree={null} onExecute={vi.fn()} isExecuting={false} />
    )

    expect(
      screen.getByRole('button', { name: /EXECUTE CONCATENATION/i })
    ).toBeDisabled()

    rerender(
      <ExecutionWorkbench
        tree={{ ...dummyTree, tokenWeight: 0 }}
        onExecute={vi.fn()}
        isExecuting={false}
      />
    )

    expect(
      screen.getByRole('button', { name: /EXECUTE CONCATENATION/i })
    ).toBeDisabled()

    rerender(
      <ExecutionWorkbench
        tree={dummyTree}
        onExecute={vi.fn()}
        isExecuting={true}
      />
    )

    expect(
      screen.getByRole('button', { name: /SYNTHESIZING.../i })
    ).toBeDisabled()
  })

  it('calls onExecute with configuration matrix when clicked', async () => {
    const onExecuteMock = vi.fn().mockResolvedValue(undefined)
    render(
      <ExecutionWorkbench
        tree={dummyTree}
        onExecute={onExecuteMock}
        isExecuting={false}
      />
    )

    const button = screen.getByRole('button', {
      name: /EXECUTE CONCATENATION/i,
    })
    fireEvent.click(button)

    expect(onExecuteMock).toHaveBeenCalledTimes(1)
    expect(onExecuteMock).toHaveBeenCalledWith({
      outputFormat: 'markdown',
      enableNeutralization: true,
      injectManifest: true,
      stripComments: false,
    })
  })
})
