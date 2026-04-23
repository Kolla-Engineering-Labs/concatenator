import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from '../src/lib/logger'

describe('lib/logger', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    logger._setLevel(null)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('logs info by default', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('test info')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('filters out debug by default', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger.debug('test debug')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('logs debug when level is set', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger._setLevel('debug')
    logger.debug('test debug')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('handles invalid LOG_LEVEL environment variable', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // We need to re-import or bypass the cache if possible, but getCurrentLevel is called on every log.
    // However, it's a module level variable that might be cached.
    // In logger.ts, getCurrentLevel is called INSIDE shouldLog, which is called INSIDE debug/info/etc.
    // So it should pick up the env change.

    process.env.LOG_LEVEL = 'INVALID'
    logger.info('test')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid LOG_LEVEL "INVALID"')
    )
    warnSpy.mockRestore()
  })
})
