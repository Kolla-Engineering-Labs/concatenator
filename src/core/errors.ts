/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom error class for user-facing errors that should be displayed
 * without a stack trace in the CLI.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

/**
 * Custom error class for security violations (e.g. path traversal).
 */
export class SecurityViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecurityViolation'
  }
}
