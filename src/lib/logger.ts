/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Default level can be overridden via environment variable
const DEFAULT_LEVEL: LogLevel = 'info'

// Internal mutable state for testing
let _testLevel: LogLevel | null = null

function isLogLevel(value: string): value is LogLevel {
  return value in LEVELS
}

function getCurrentLevel(): LogLevel {
  // Test override takes precedence
  if (_testLevel !== null) {
    return _testLevel
  }
  // Then check environment variable (safely)
  const envLevel =
    typeof process !== 'undefined' ? process.env.LOG_LEVEL : undefined
  if (envLevel) {
    if (isLogLevel(envLevel)) {
      return envLevel
    }
    console.warn(
      `[logger] Invalid LOG_LEVEL "${envLevel}". Falling back to default level "${DEFAULT_LEVEL}".`
    )
  }
  return DEFAULT_LEVEL
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[getCurrentLevel()]
}

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`
}

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message), ...args)
    }
  },
  info: (message: string, ...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message), ...args)
    }
  },
  warn: (message: string, ...args: unknown[]): void => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message), ...args)
    }
  },
  error: (message: string, ...args: unknown[]): void => {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message), ...args)
    }
  },
  /**
   * Raw unformatted output. Respects log level (only logs if level <= info).
   */
  raw: (message: string, ...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.log(message, ...args)
    }
  },
  /**
   * Raw error output.
   */
  rawError: (message: string, ...args: unknown[]): void => {
    if (shouldLog('error')) {
      console.error(message, ...args)
    }
  },
  // Internal method for testing only
  _setLevel: (level: LogLevel | null): void => {
    _testLevel = level
  },
}
