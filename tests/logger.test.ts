/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from '../src/lib/logger'

describe('logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Reset to default level before each test
    logger._setLevel(null)
  })

  afterEach(() => {
    logger._setLevel(null)
    vi.restoreAllMocks()
  })

  describe('debug level', () => {
    it('should log debug messages when LOG_LEVEL is debug', () => {
      logger._setLevel('debug')
      logger.debug('test debug message')
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1)
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] test debug message')
      )
    })

    it('should log info messages when LOG_LEVEL is debug', () => {
      logger._setLevel('debug')
      logger.info('test info message')
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
    })

    it('should log error messages when LOG_LEVEL is debug', () => {
      logger._setLevel('debug')
      logger.error('test error message')
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('info level (default)', () => {
    it('should NOT log debug messages when LOG_LEVEL is info', () => {
      logger._setLevel('info')
      logger.debug('test debug message')
      expect(consoleDebugSpy).not.toHaveBeenCalled()
    })

    it('should log info messages when LOG_LEVEL is info', () => {
      logger._setLevel('info')
      logger.info('test info message')
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test info message')
      )
    })

    it('should log error messages when LOG_LEVEL is info', () => {
      logger._setLevel('info')
      logger.error('test error message')
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('error level', () => {
    it('should NOT log debug messages when LOG_LEVEL is error', () => {
      logger._setLevel('error')
      logger.debug('test debug message')
      expect(consoleDebugSpy).not.toHaveBeenCalled()
    })

    it('should NOT log info messages when LOG_LEVEL is error', () => {
      logger._setLevel('error')
      logger.info('test info message')
      expect(consoleInfoSpy).not.toHaveBeenCalled()
    })

    it('should log error messages when LOG_LEVEL is error', () => {
      logger._setLevel('error')
      logger.error('test error message')
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] test error message')
      )
    })

    it('should NOT log warn messages when LOG_LEVEL is error', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})
      logger._setLevel('error')
      logger.warn('test warn message')
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })

    it('should NOT log error messages when LOG_LEVEL is higher than error', () => {
      // @ts-expect-error - simulating a hypothetical level higher than error
      logger._setLevel('none')
      logger.error('test error message')
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('additional arguments', () => {
    it('should pass additional arguments to console.debug', () => {
      logger._setLevel('debug')
      const errorObj = new Error('test error')
      logger.debug('debug with args', errorObj, { extra: 'data' })
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] debug with args'),
        errorObj,
        { extra: 'data' }
      )
    })

    it('should pass additional arguments to console.info', () => {
      logger._setLevel('info')
      logger.info('info with args', { some: 'object' })
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] info with args'),
        { some: 'object' }
      )
    })

    it('should pass additional arguments to console.error', () => {
      logger._setLevel('error')
      const err = new Error('something went wrong')
      logger.error('error with args', err)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] error with args'),
        err
      )
    })
  })

  describe('timestamp format', () => {
    it('should include ISO timestamp in log messages', () => {
      logger._setLevel('info')
      const beforeCall = new Date().toISOString()
      logger.info('timestamp test')
      const afterCall = new Date().toISOString()

      const callArgs = consoleInfoSpy.mock.calls[0]
      const loggedMessage = callArgs[0] as string
      const timestampMatch = loggedMessage.match(
        /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/
      )

      expect(timestampMatch).toBeTruthy()
      if (timestampMatch) {
        const loggedTimestamp = timestampMatch[1]
        expect(
          loggedTimestamp >= beforeCall && loggedTimestamp <= afterCall
        ).toBe(true)
      }
    })
  })

  describe('environment variables', () => {
    const originalEnv = process.env.LOG_LEVEL

    afterEach(() => {
      process.env.LOG_LEVEL = originalEnv
    })

    it('should use LOG_LEVEL from environment variable if valid', () => {
      process.env.LOG_LEVEL = 'debug'
      logger._setLevel(null) // Clear test override
      logger.debug('env debug')
      expect(consoleDebugSpy).toHaveBeenCalled()
    })

    it('should warn and fallback to default if LOG_LEVEL is invalid', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})
      process.env.LOG_LEVEL = 'invalid'
      logger._setLevel(null) // Clear test override

      logger.debug('env debug')
      expect(consoleDebugSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid LOG_LEVEL "invalid"')
      )
      consoleWarnSpy.mockRestore()
    })
  })
})
