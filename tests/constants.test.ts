import { describe, it, expect } from 'vitest'
import {
  START_DELIMITER,
  END_DELIMITER,
  FILE_END_DELIMITER,
  DEFAULT_IGNORE_LIST,
} from '../src/core/constants'

describe('Constants', () => {
  describe('Delimiters', () => {
    it('START_DELIMITER is defined and non-empty', () => {
      expect(START_DELIMITER).toBeDefined()
      expect(START_DELIMITER.length).toBeGreaterThan(0)
    })

    it('END_DELIMITER is defined and non-empty', () => {
      expect(END_DELIMITER).toBeDefined()
      expect(END_DELIMITER.length).toBeGreaterThan(0)
    })

    it('FILE_END_DELIMITER is defined and non-empty', () => {
      expect(FILE_END_DELIMITER).toBeDefined()
      expect(FILE_END_DELIMITER.length).toBeGreaterThan(0)
    })

    it('START_DELIMITER contains identifying marker', () => {
      expect(START_DELIMITER).toContain('FILE_START')
    })

    it('FILE_END_DELIMITER contains identifying marker', () => {
      expect(FILE_END_DELIMITER).toContain('FILE_END')
    })

    it('END_DELIMITER is different from FILE_END_DELIMITER', () => {
      expect(END_DELIMITER).not.toBe(FILE_END_DELIMITER)
    })

    it('delimiters do not contain newlines', () => {
      expect(START_DELIMITER).not.toContain('\n')
      expect(END_DELIMITER).not.toContain('\n')
      expect(FILE_END_DELIMITER).not.toContain('\n')
    })

    it('delimiters are unique from each other', () => {
      expect(START_DELIMITER).not.toBe(END_DELIMITER)
      expect(START_DELIMITER).not.toBe(FILE_END_DELIMITER)
      expect(END_DELIMITER).not.toBe(FILE_END_DELIMITER)
    })

    it('delimiters have reasonable lengths', () => {
      // Should be long enough to avoid accidental collisions
      // Note: FILE_START is shorter than CONCATENATOR_FILE_START by design (obfuscation)
      expect(START_DELIMITER.length).toBeGreaterThanOrEqual(15)
      expect(FILE_END_DELIMITER.length).toBeGreaterThanOrEqual(15)
    })

    it('START_DELIMITER ends with space for path separation', () => {
      expect(START_DELIMITER.endsWith(' ')).toBe(true)
    })

    it('delimiters use consistent bracket style', () => {
      expect(START_DELIMITER.startsWith('<<<<<')).toBe(true)
      expect(FILE_END_DELIMITER.startsWith('<<<<<')).toBe(true)
      expect(END_DELIMITER.endsWith('>>>>>')).toBe(true)
      expect(FILE_END_DELIMITER.endsWith('>>>>>')).toBe(true)
    })
  })

  describe('DEFAULT_IGNORE_LIST', () => {
    it('is defined as an array', () => {
      expect(DEFAULT_IGNORE_LIST).toBeDefined()
      expect(Array.isArray(DEFAULT_IGNORE_LIST)).toBe(true)
    })

    it('is not empty', () => {
      expect(DEFAULT_IGNORE_LIST.length).toBeGreaterThan(0)
    })

    it('contains common version control directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.git')
    })

    it('contains node_modules', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('node_modules')
    })

    it('contains environment files', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.env')
    })

    it('contains IDE directories', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.vscode')
    })

    it('contains build directories', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('dist')
      expect(DEFAULT_IGNORE_LIST).toContain('build')
    })

    it('contains dependency directories', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('vendor')
      expect(DEFAULT_IGNORE_LIST).toContain('venv')
    })

    it('contains common binary extensions as glob patterns', () => {
      // Glob patterns for common binaries
      const binaryPatterns = DEFAULT_IGNORE_LIST.filter((item) =>
        item.startsWith('*.')
      )
      expect(binaryPatterns.length).toBeGreaterThan(0)
    })

    it('contains lock files', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('package-lock.json')
    })

    it('contains system files', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.DS_Store')
      expect(DEFAULT_IGNORE_LIST).toContain('Thumbs.db')
      expect(DEFAULT_IGNORE_LIST).toContain('desktop.ini')
    })

    it('does not contain license file', () => {
      expect(DEFAULT_IGNORE_LIST).not.toContain('LICENSE')
    })

    it('has no duplicate entries', () => {
      const uniqueEntries = new Set(DEFAULT_IGNORE_LIST)
      expect(uniqueEntries.size).toBe(DEFAULT_IGNORE_LIST.length)
    })

    it('all entries are non-empty strings', () => {
      DEFAULT_IGNORE_LIST.forEach((entry) => {
        expect(typeof entry).toBe('string')
        expect(entry.length).toBeGreaterThan(0)
        expect(entry.trim()).toBe(entry) // No leading/trailing whitespace
      })
    })

    it('contains cache-related regex patterns', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('/^__.*cache__$/')
      expect(DEFAULT_IGNORE_LIST).toContain('/^\\..*_cache$/')
    })

    it('contains common image extensions', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('*.gif')
      expect(DEFAULT_IGNORE_LIST).toContain('*.jpeg')
      expect(DEFAULT_IGNORE_LIST).toContain('*.jpg')
      expect(DEFAULT_IGNORE_LIST).toContain('*.png')
      expect(DEFAULT_IGNORE_LIST).toContain('*.svg')
      expect(DEFAULT_IGNORE_LIST).toContain('*.tif')
      expect(DEFAULT_IGNORE_LIST).toContain('*.tiff')
    })

    it('contains compiled object patterns', () => {
      const objectPatterns = DEFAULT_IGNORE_LIST.filter(
        (item) =>
          item.includes('.o') ||
          item.includes('.obj') ||
          item.includes('.class')
      )
      expect(objectPatterns.length).toBeGreaterThan(0)
    })

    it('contains log pattern', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('*.log')
    })

    it('contains playwright-related directories', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('playwright-report')
      expect(DEFAULT_IGNORE_LIST).toContain('test-results')
    })

    it('contains patterns for common temporary files', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('*.swp')
      expect(DEFAULT_IGNORE_LIST).toContain('*.obj')
    })

    it('contains next.js build directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.next')
    })

    it('contains terraform directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.terraform')
    })

    it('contains gradle directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.gradle')
    })

    it('contains target directory (Maven/Gradle)', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('target')
    })

    it('contains object directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('obj')
    })

    it('contains bin directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('bin')
    })

    it('contains secrets directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.secrets')
    })

    it('contains expo directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.expo')
    })

    it('contains vagrant directory', () => {
      expect(DEFAULT_IGNORE_LIST).toContain('.vagrant')
    })
  })
})
