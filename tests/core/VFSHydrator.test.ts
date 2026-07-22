/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest'
import { hydrateVFS } from '../../src/core/VFSHydrator'
import { IgnoreEngine } from '../../src/core/ignore/IgnoreEngine'
import { IgnoreSource } from '../../src/core/types'

describe('VFSHydrator', () => {
  it('should return a Map (enabling O(1) lookups) with hydrated paths using a mocked IgnoreEngine', () => {
    // 1. Create a mocked IgnoreEngine that returns pre-configured results
    const mockGetIgnoreResult = vi.fn((path: string) => {
      if (path === 'node_modules/lodash/index.js') {
        return {
          ignored: true,
          negated: false,
          reason: 'node_modules',
          source: IgnoreSource.DEFAULT,
        }
      }
      if (path === 'custom-config.json') {
        return {
          ignored: true,
          negated: false,
          reason: 'custom-config.json',
          source: IgnoreSource.SESSION,
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

    // 5. Assert IgnoreSource.DEFAULT mapping
    const defaultItem = result.get('node_modules/lodash/index.js')
    expect(defaultItem).toBeDefined()
    expect(defaultItem?.isIgnored).toBe(true)
    expect(defaultItem?.ignoreSource).toBe(IgnoreSource.DEFAULT)

    // 6. Assert IgnoreSource.SESSION mapping
    const sessionItem = result.get('custom-config.json')
    expect(sessionItem).toBeDefined()
    expect(sessionItem?.isIgnored).toBe(true)
    expect(sessionItem?.ignoreSource).toBe(IgnoreSource.SESSION)

    // 7. Assert unignored mapping
    const unignoredItem = result.get('src/index.ts')
    expect(unignoredItem).toBeDefined()
    expect(unignoredItem?.isIgnored).toBe(false)
    expect(unignoredItem?.ignoreSource).toBeUndefined()
  })
})
