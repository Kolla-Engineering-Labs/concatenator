import { describe, it, expect } from 'vitest'
import {
  UserError,
  SecurityViolation,
  PathTraversalError,
  SymlinkRejectedError,
} from '../../src/core/errors'

describe('Custom Errors', () => {
  it('should instantiate UserError', () => {
    const err = new UserError('msg')
    expect(err.message).toBe('msg')
    expect(err.name).toBe('UserError')
  })

  it('should instantiate SecurityViolation', () => {
    const err = new SecurityViolation('msg')
    expect(err.message).toBe('msg')
    expect(err.name).toBe('SecurityViolation')
  })

  it('should instantiate PathTraversalError', () => {
    const err = new PathTraversalError('traversal detected')
    expect(err.message).toBe('traversal detected')
    expect(err.name).toBe('PathTraversalError')
    expect(err).toBeInstanceOf(SecurityViolation)
  })

  it('should instantiate SymlinkRejectedError', () => {
    const err = new SymlinkRejectedError('symlink detected')
    expect(err.message).toBe('symlink detected')
    expect(err.name).toBe('SymlinkRejectedError')
    expect(err).toBeInstanceOf(SecurityViolation)
  })
})
