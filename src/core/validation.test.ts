/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { validateConcatenation, concatenate } from './engine'

describe('validateConcatenation', () => {
  describe('valid concatenated strings', () => {
    it('validates a perfectly valid concatenated string', () => {
      const files = [
        { path: 'file1.txt', content: 'Hello World' },
        { path: 'file2.txt', content: 'Second file content' },
      ]
      const concatenated = concatenate(files, '2024-01-01', 'abc123')
      const result = validateConcatenation(concatenated)

      expect(result.isValid).toBe(true)
      expect(result.sessionId).toBe('abc123')
      expect(result.fileCount).toBe(2)
      expect(result.detectedFiles).toEqual(['file1.txt', 'file2.txt'])
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('validates legacy format without session ID', () => {
      const legacyContent = `Concatenated on: 2024-01-01

<<<<< FILE_START: legacy.txt >>>>>
legacy content
<<<<< FILE_END >>>>>
`
      const result = validateConcatenation(legacyContent)

      expect(result.isValid).toBe(true)
      expect(result.sessionId).toBeNull()
      expect(result.fileCount).toBe(1)
      expect(result.detectedFiles).toEqual(['legacy.txt'])
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toContain(
        'No session manifest found - using legacy format validation'
      )
    })

    it('detects empty files as warnings', () => {
      const files = [
        { path: 'empty.txt', content: '' },
        { path: 'normal.txt', content: 'Has content' },
      ]
      const concatenated = concatenate(files, '2024-01-01', 'def456')
      const result = validateConcatenation(concatenated)

      expect(result.isValid).toBe(true)
      expect(result.fileCount).toBe(2)
      expect(result.warnings).toContain('Empty file detected: empty.txt')
    })
  })

  describe('invalid concatenated strings', () => {
    it('detects missing FILE_END marker', () => {
      const invalidContent = `--- CONCATENATOR_SESSION_ID: abc123 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: incomplete.txt (ID: abc123) >>>>>
This content has no end marker

<<<<< FILE_START: valid.txt (ID: abc123) >>>>>
Valid content
<<<<< FILE_END >>>>>
`
      const result = validateConcatenation(invalidContent)

      expect(result.isValid).toBe(false)
      expect(result.fileCount).toBe(1)
      expect(result.errors).toContain(
        'Missing end marker for file: incomplete.txt'
      )
      expect(result.detectedFiles).toContain('incomplete.txt')
      expect(result.detectedFiles).toContain('valid.txt')
    })

    it('detects orphaned end markers', () => {
      const invalidContent = `--- CONCATENATOR_SESSION_ID: abc123 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: valid.txt (ID: abc123) >>>>>
Valid content
<<<<< FILE_END >>>>>
<<<<< FILE_END >>>>>
<<<<< FILE_END >>>>>
`
      const result = validateConcatenation(invalidContent)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain(
        '2 orphaned end marker(s) found without matching start markers'
      )
    })

    it('detects session ID mismatch', () => {
      const invalidContent = `--- CONCATENATOR_SESSION_ID: abc123 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: wrong.txt (ID: xyz789) >>>>>
Content with wrong session ID
<<<<< FILE_END >>>>>
`
      const result = validateConcatenation(invalidContent)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain(
        'Session ID mismatch in marker for wrong.txt: expected abc123, found xyz789'
      )
    })

    it('detects corrupted manifest header', () => {
      const invalidContent = `--- CORRUPTED_HEADER: abc123 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: file.txt (ID: abc123) >>>>>
Content
<<<<< FILE_END >>>>>
`
      const result = validateConcatenation(invalidContent)

      expect(result.isValid).toBe(false)
      expect(result.sessionId).toBeNull()
      expect(result.errors).toContain('Corrupted manifest header detected')
    })

    it('detects completely invalid content', () => {
      const result = validateConcatenation(
        'This is just random text with no markers'
      )

      expect(result.isValid).toBe(false)
      expect(result.fileCount).toBe(0)
      expect(result.errors).toContain('No valid session manifest header found')
    })
  })

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = validateConcatenation('')

      expect(result.isValid).toBe(false)
      expect(result.fileCount).toBe(0)
      expect(result.errors).toContain('No valid session manifest header found')
    })

    it('handles multiple files with mixed validity', () => {
      const files = [
        { path: 'valid1.txt', content: 'First valid file' },
        { path: 'valid2.txt', content: 'Second valid file' },
      ]
      let concatenated = concatenate(files, '2024-01-01', 'mix789')

      // Inject a malformed file without end marker
      concatenated = concatenated.replace(
        '<<<<< FILE_START: valid2.txt (ID: mix789) >>>>>',
        '<<<<< FILE_START: invalid.txt (ID: mix789) >>>>>\nNo end marker here\n\n<<<<< FILE_START: valid2.txt (ID: mix789) >>>>>'
      )

      const result = validateConcatenation(concatenated)

      expect(result.isValid).toBe(false)
      // 2 valid files (valid1 and valid2 still have their end markers)
      // 1 invalid file (invalid.txt has no end marker)
      expect(result.fileCount).toBe(2)
      expect(result.detectedFiles).toHaveLength(3)
      expect(result.errors).toContain(
        'Missing end marker for file: invalid.txt'
      )
    })

    it('preserves detected files list even with errors', () => {
      const invalidContent = `--- CONCATENATOR_SESSION_ID: err001 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: a.txt (ID: err001) >>>>>
Content A
<<<<< FILE_END >>>>>
<<<<< FILE_START: b.txt (ID: wrong) >>>>>
Content B
<<<<< FILE_END >>>>>
<<<<< FILE_START: c.txt (ID: err001) >>>>>
Content C
<<<<< FILE_END >>>>>
`
      const result = validateConcatenation(invalidContent)

      expect(result.isValid).toBe(false)
      expect(result.detectedFiles).toEqual(['a.txt', 'b.txt', 'c.txt'])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('b.txt')
    })
  })
})
