import { describe, it, expect, vi } from 'vitest'
import { IgnoreEngine } from '../src/core/ignore/IgnoreEngine'

describe('IgnoreEngine Coverage Booster', () => {
  it('covers getIgnoreReason edge cases', () => {
    const engine = new IgnoreEngine(['*.log', '!important.log'])

    // Uncovered line 111: if (!path) return undefined
    expect(engine.getIgnoreReason('')).toBeUndefined()

    // Uncovered line 113: if (segments.length === 0) return undefined
    expect(engine.getIgnoreReason('/')).toBeUndefined()

    // Uncovered lines 115-128: normal usage of getIgnoreReason
    expect(engine.getIgnoreReason('test.log')).toBe('*.log')
    expect(engine.getIgnoreReason('important.log')).toBeUndefined() // un-ignored

    // Regex in getIgnoreReason (line 121-122)
    const regexEngine = new IgnoreEngine(['/\\.tmp$/'])
    expect(regexEngine.getIgnoreReason('file.tmp')).toBe('/\\.tmp$/')
  })

  it('covers shouldRecurse anchored negation (line 155)', () => {
    // pattern.startsWith(prefix) where prefix is normalizedPath + '/'
    const engine = new IgnoreEngine(['/dist', '!/dist/keep'])

    // dist is ignored
    expect(engine.isIgnored('dist')).toBe(true)

    // But we should recurse into dist because !/dist/keep exists
    // prefix for 'dist' is 'dist/'
    // pattern is 'dist/keep' (after removing leading /)
    // pattern.startsWith(prefix) is true
    expect(engine.shouldRecurse('dist')).toBe(true)
  })

  it('covers shouldRecurse nested heavyDirs with unanchored negation', () => {
    const engine = new IgnoreEngine(['node_modules', '!core'])
    expect(engine.isIgnored('concatenator/node_modules')).toBe(true)
    expect(engine.shouldRecurse('concatenator/node_modules')).toBe(false)
  })

  it('covers shouldRecurse nested heavyDirs with anchored negation (override)', () => {
    const engine = new IgnoreEngine(['node_modules', '!node_modules/core'])
    expect(engine.isIgnored('node_modules')).toBe(true)
    // It should recurse because "!node_modules/core" is an anchored negated pattern matching this folder
    expect(engine.shouldRecurse('node_modules')).toBe(true)
  })

  it('covers isMatch unanchored glob (line 260)', () => {
    const engine = new IgnoreEngine(['vendor']) // unanchored
    expect(
      (engine as any).isMatch(
        (engine as any).rules[0],
        'project/vendor/file.js',
        'file.js',
        ['project', 'vendor', 'file.js']
      )
    ).toBe(true)
  })

  it('covers isMatch subPath === parentPath (line 317)', () => {
    const engine = new IgnoreEngine(['temp/**'])
    // normalizedPath is 'other/temp'
    // firstSegment is 'other'
    // subPath is 'temp'
    // parentPath is 'temp' (from temp/**)
    expect(
      (engine as any).isMatch((engine as any).rules[0], 'other/temp', 'temp', [
        'other',
        'temp',
      ])
    ).toBe(true)
  })

  it('covers stringifyIgnoreFile (line 340)', () => {
    expect(IgnoreEngine.stringifyIgnoreFile(['a', 'b'])).toBe('a\nb')
  })
})

import { logger } from '../src/lib/logger'

describe('logger Coverage Booster', () => {
  it('covers raw and rawError (lines 78-87)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Set level to debug to ensure everything logs
    logger._setLevel('debug')

    logger.raw('raw message')
    expect(logSpy).toHaveBeenCalledWith('raw message')

    logger.rawError('raw error')
    expect(errorSpy).toHaveBeenCalledWith('raw error')

    logSpy.mockRestore()
    errorSpy.mockRestore()
    logger._setLevel(null) // reset
  })
})
