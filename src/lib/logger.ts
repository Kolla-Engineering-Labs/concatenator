/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LogLevel = 'debug' | 'info' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  error: 2,
};

// Default level can be overridden via environment variable
const DEFAULT_LEVEL: LogLevel = 'info';

// Internal mutable state for testing
let _testLevel: LogLevel | null = null;

function getCurrentLevel(): LogLevel {
  // Test override takes precedence
  if (_testLevel !== null) {
    return _testLevel;
  }
  // Then check environment variable
  const envLevel = process.env.LOG_LEVEL as LogLevel;
  if (envLevel && envLevel in LEVELS) {
    return envLevel;
  }
  return DEFAULT_LEVEL;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[getCurrentLevel()];
}

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message), ...args);
    }
  },
  info: (message: string, ...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message), ...args);
    }
  },
  error: (message: string, ...args: unknown[]): void => {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message), ...args);
    }
  },
  // Internal method for testing only
  _setLevel: (level: LogLevel | null): void => {
    _testLevel = level;
  },
};
