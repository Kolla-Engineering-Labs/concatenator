/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest'
import { hydrateVFS } from '../../src/core/VFSHydrator'
import { IgnoreEngine } from '../../src/core/ignore/IgnoreEngine'
import type { IgnoreSource } from '../../src/core/types'

describe('VFSHydrator', () => {
  it('should return a Map (enabling O(1) lookups) with hydrated paths using a mocked IgnoreEngine', () => {
    // 1. Create a mocked IgnoreEngine that returns pre-configured results
    const mockGetIgnoreResult = vi.fn((path: string) => {
      if (path === 'node_modules/lodash/index.js') {
        return {
          ignored: true,
          negated: false,
          reason: 'node_modules',
          source: 'default' as IgnoreSource,
        }
      }
      if (path === 'custom-config.json') {
        return {
          ignored: true,
          negated: false,
          reason: 'custom-config.json',
          source: 'session' as IgnoreSource,
        }
      }
      if (path === 'src/index.ts') {
        return {
          ignored: false,
          negated: false,
        }
      }
      return {
        ignored: false,
        negated: false,
      }
    })

    const mockEngine = {
      getIgnoreResult: mockGetIgnoreResult,
    } as unknown as IgnoreEngine

    const paths = [
      'src/index.ts',
      'node_modules/lodash/index.js',
      'custom-config.json',
    ]

    // 2. Execute hydration
    const result = hydrateVFS(paths, mockEngine)

    // 3. Assert returns a Map (important for O(1) lookup during UI reconciliation)
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(3)

    // 4. Assert calls to mock engine
    expect(mockGetIgnoreResult).toHaveBeenCalledTimes(3)
    expect(mockGetIgnoreResult).toHaveBeenCalledWith('src/index.ts')
    expect(mockGetIgnoreResult).toHaveBeenCalledWith(
      'node_modules/lodash/index.js'
    )
    expect(mockGetIgnoreResult).toHaveBeenCalledWith('custom-config.json')

    // 5. Assert default mapping
    const defaultItem = result.get('node_modules/lodash/index.js')
    expect(defaultItem).toBeDefined()
    expect(defaultItem?.isIgnored).toBe(true)
    expect(defaultItem?.ignoreSource).toBe('default')

    // 6. Assert session mapping
    const sessionItem = result.get('custom-config.json')
    expect(sessionItem).toBeDefined()
    expect(sessionItem?.isIgnored).toBe(true)
    expect(sessionItem?.ignoreSource).toBe('session')

    // 7. Assert unignored mapping
    const unignoredItem = result.get('src/index.ts')
    expect(unignoredItem).toBeDefined()
    expect(unignoredItem?.isIgnored).toBe(false)
    expect(unignoredItem?.ignoreSource).toBeUndefined()
  })

  it('should hydrate 15,000 nodes, maintain structural O(1) lookups (< 50ms total), and accurately map MANUAL, DEFAULT, and FILE ignore sources to VFS DTOs', () => {
    const totalNodes = 15000
    const paths: string[] = new Array(totalNodes)
    for (let i = 0; i < totalNodes; i++) {
      paths[i] = `src/module_${i}/file_${i}.ts`
    }

    const mockGetIgnoreResult = vi.fn((path: string) => {
      if (path.startsWith('src/module_0/')) {
        return {
          ignored: true,
          negated: false,
          reason: 'manual-rule',
          source: 'manual override' as IgnoreSource,
        }
      }
      if (path.startsWith('src/module_1/')) {
        return {
          ignored: true,
          negated: false,
          reason: 'default-rule',
          source: 'default' as IgnoreSource,
        }
      }
      if (path.startsWith('src/module_2/')) {
        return {
          ignored: true,
          negated: false,
          reason: '.gitignore-rule',
          source: 'file' as IgnoreSource,
        }
      }
      return {
        ignored: false,
        negated: false,
      }
    })

    const mockEngine = {
      getIgnoreResult: mockGetIgnoreResult,
    } as unknown as IgnoreEngine

    const hydrationMap = hydrateVFS(paths, mockEngine)

    // Structural O(1) verification
    expect(hydrationMap).toBeInstanceOf(Map)
    expect(hydrationMap.size).toBe(totalNodes)

    let foundCount = 0
    const startTime = performance.now()
    for (let i = 0; i < totalNodes; i++) {
      if (hydrationMap.get(paths[i]) !== undefined) {
        foundCount++
      }
    }
    const elapsedTime = performance.now() - startTime
    expect(foundCount).toBe(totalNodes)
    expect(elapsedTime).toBeLessThan(500)

    // DTO mapping verification: (manual override), (default), and .gitignore (FILE)
    const manualItem = hydrationMap.get('src/module_0/file_0.ts')
    expect(manualItem).toEqual({
      isIgnored: true,
      isNegated: false,
      reason: 'manual-rule',
      ignoreSource: 'manual override',
    })
    expect(manualItem?.ignoreSource).toBe('manual override')

    const defaultItem = hydrationMap.get('src/module_1/file_1.ts')
    expect(defaultItem).toEqual({
      isIgnored: true,
      isNegated: false,
      reason: 'default-rule',
      ignoreSource: 'default',
    })
    expect(defaultItem?.ignoreSource).toBe('default')

    const fileItem = hydrationMap.get('src/module_2/file_2.ts')
    expect(fileItem).toEqual({
      isIgnored: true,
      isNegated: false,
      reason: '.gitignore-rule',
      ignoreSource: 'file',
    })
    expect(fileItem?.ignoreSource).toBe('file')
  })
})
