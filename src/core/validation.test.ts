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

    it('handles session ID mismatch as warning', () => {
      const content = `--- CONCATENATOR_SESSION_ID: abc123 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: wrong.txt (ID: def456) >>>>>
Content with wrong session ID
<<<<< FILE_END >>>>>
`
      const result = validateConcatenation(content)

      expect(result.isValid).toBe(true)
      expect(result.warnings[0]).toContain(
        'Detected 1 markers with mismatched Session IDs'
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

    it('handles multiple files with mixed validity in legacy format', () => {
      const concatenated = `--- CONCATENATOR_SESSION_ID: abc789 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: valid1.txt (ID: abc789) >>>>>
First valid file
<<<<< FILE_END >>>>>

<<<<< FILE_START: invalid.txt (ID: abc789) >>>>>
No end marker here

<<<<< FILE_START: valid2.txt (ID: abc789) >>>>>
Second valid file
<<<<< FILE_END >>>>>
`

      const result = validateConcatenation(concatenated)

      expect(result.isValid).toBe(false)
      expect(result.fileCount).toBe(2)
      expect(result.detectedFiles).toHaveLength(3)
      expect(result.errors).toContain(
        'Missing end marker for file: invalid.txt'
      )
    })

    it('preserves detected files list even with errors', () => {
      const invalidContent = `--- CONCATENATOR_SESSION_ID: def001 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: a.txt (ID: def001) >>>>>
Content A
<<<<< FILE_END >>>>>
<<<<< FILE_START: b.txt (ID: def001) >>>>>
Content B (no end marker here)
<<<<< FILE_START: c.txt (ID: def001) >>>>>
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

  describe('cryptographic tamper rejection', () => {
    it('throws TamperDetectedError when data is appended after Post-Matter Manifest', () => {
      const files = [
        { path: 'test.js', content: 'console.log("hello world");' }
      ]
      let bundle = concatenate(files, '2024-01-01', 'xyz123')
      bundle += '\nCORRUPT_DATA_INJECTED\n'

      expect(() => validateConcatenation(bundle)).toThrowError(
        /Cryptographic Tampering Detected/
      )
    })

    it('throws TamperDetectedError when file content is modified', () => {
      const files = [
        { path: 'test.js', content: 'original content' }
      ]
      let bundle = concatenate(files, '2024-01-01', 'xyz123')
      bundle = bundle.replace('original content', 'tampered content')

      expect(() => validateConcatenation(bundle)).toThrowError(
        /Cryptographic Hash Mismatch/
      )
    })
  })
})
