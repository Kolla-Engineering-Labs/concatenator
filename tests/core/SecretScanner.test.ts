/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { SecretScanner } from '../../src/core/SecretScanner'

describe('SecretScanner', () => {
  describe('maskSecrets', () => {
    it('should return original content if empty', () => {
      expect(SecretScanner.maskSecrets('')).toBe('')
      // Testing null input for runtime robustness (casting to any to avoid TS error in non-strict mode)
      expect(SecretScanner.maskSecrets(null as any)).toBe(null)
    })

    it('should mask AWS Access Key IDs', () => {
      const content = 'My key is AKIA1234567890ABCDEF and it is secret'
      const masked = SecretScanner.maskSecrets(content)

      expect(masked).toContain('AKIA')
      expect(masked).toContain('CDEF')
      expect(masked).toContain('********')
      expect(masked.length).toBe(content.length)
      expect(masked).not.toContain('1234567890AB')
    })

    it('should mask AWS Secret Access Keys', () => {
      const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      const content = `export AWS_SECRET_ACCESS_KEY="${secret}"`
      const masked = SecretScanner.maskSecrets(content)

      expect(masked).toContain('wJal')
      expect(masked).toContain('EKEY')
      expect(masked.length).toBe(content.length)
      expect(masked).not.toContain('XUtnFEMI')
    })

    it('should mask generic token assignments', () => {
      const content = 'const api_key = "sk-1234567890abcdef1234567890abcdef"'
      const masked = SecretScanner.maskSecrets(content)

      expect(masked).toContain('sk')
      expect(masked).toContain('ef')
      expect(masked.length).toBe(content.length)
      expect(masked).not.toContain('1234567890abcd')
    })

    it('should mask multiple secrets in same content', () => {
      const content = 'Keys: AKIA1234567890ABCDEF and AKIA0000000000111111'
      const masked = SecretScanner.maskSecrets(content)

      expect(masked).toContain('AKIA')
      expect(masked.match(/\*{12}/g)?.length).toBe(2)
      expect(masked.length).toBe(content.length)
    })

    it('should not mask non-secret strings that look similar but lack entropy or prefix', () => {
      const content =
        'This is just a long string with no specific prefix like AKIA'
      expect(SecretScanner.maskSecrets(content)).toBe(content)
    })
  })
})
