import { describe, it, expect } from 'vitest'
import { UserError, SecurityViolation } from '../../src/core/errors'

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
})
