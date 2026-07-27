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
 * Custom error class for security violations (e.g. path traversal, symlink rejection).
 */
export class SecurityViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecurityViolation'
  }
}

/**
 * Custom error class for path traversal security violations.
 */
export class PathTraversalError extends SecurityViolation {
  constructor(message: string) {
    super(message)
    this.name = 'PathTraversalError'
  }
}

/**
 * Custom error class for symbolic link security violations.
 */
export class SymlinkRejectedError extends SecurityViolation {
  constructor(message: string) {
    super(message)
    this.name = 'SymlinkRejectedError'
  }
}

/**
 * Custom error class for bundle cryptographic tampering / hash mismatch violations.
 */
export class TamperDetectedError extends SecurityViolation {
  constructor(message: string) {
    super(message)
    this.name = 'TamperDetectedError'
  }
}

export { TamperDetectedError as SecurityError }

