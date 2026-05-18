import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useFileTree } from '../src/web/features/concatenator/hooks/useFileTree'
import { FileItem } from '../src/core/types'

describe('useFileTree - Ignored Directory', () => {
  it('includes ignored directory in the tree', () => {
    const files: FileItem[] = [
      { name: 'App.tsx', path: 'concatenator/src/App.tsx', kind: 'file' },
      {
        name: '.vscode',
        path: 'concatenator/.vscode',
        kind: 'directory',
        isIgnored: true,
      },
    ]

    const isIgnored = (path: string) => path.includes('.vscode')
    const getIgnoreResult = (path: string) => ({
      ignored: path.includes('.vscode'),
      reason: 'match',
    })
    const isExplicitlyNegated = () => false

    const { result } = renderHook(() =>
      useFileTree(files, isIgnored, getIgnoreResult, isExplicitlyNegated)
    )

    console.log('TREE RESULT:', JSON.stringify(result.current, null, 2))

    // We expect the tree root to be 'concatenator' after promotion
    expect(result.current.name).toBe('concatenator')

    const vscodeNode = result.current.children?.find(
      (c) => c.name === '.vscode'
    )
    expect(vscodeNode).toBeDefined()
    expect(vscodeNode?.isIgnored).toBe(true)
  })
})
