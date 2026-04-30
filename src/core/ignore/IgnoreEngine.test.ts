/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { IgnoreEngine } from './IgnoreEngine'

describe('IgnoreEngine', () => {
  describe('exact matching', () => {
    it('ignores a file by name', () => {
      const engine = new IgnoreEngine(['node_modules'])
      expect(engine.isIgnored('node_modules')).toBe(true)
      expect(engine.isIgnored('node_modules/index.js')).toBe(true)
      expect(engine.isIgnored('src/node_modules/file.ts')).toBe(true)
      expect(engine.isIgnored('src/main.ts')).toBe(false)
    })

    it('ignores a specific file path', () => {
      const engine = new IgnoreEngine(['config/secret.json'])
      expect(engine.isIgnored('config/secret.json')).toBe(true)
      expect(engine.isIgnored('secret.json')).toBe(false) // should NOT match filename if pattern has path
      expect(engine.isIgnored('other/config/secret.json')).toBe(true)
    })
  })

  describe('glob matching', () => {
    it('ignores using wildcards (*)', () => {
      const engine = new IgnoreEngine(['*.log'])
      expect(engine.isIgnored('error.log')).toBe(true)
      expect(engine.isIgnored('logs/debug.log')).toBe(true)
      expect(engine.isIgnored('main.ts')).toBe(false)
    })

    it('ignores using question marks (?)', () => {
      const engine = new IgnoreEngine(['test?.js'])
      expect(engine.isIgnored('test1.js')).toBe(true)
      expect(engine.isIgnored('testA.js')).toBe(true)
      expect(engine.isIgnored('test12.js')).toBe(false)
    })
  })

  describe('regex matching', () => {
    it('ignores using simple regex /pattern/', () => {
      const engine = new IgnoreEngine(['/\\.test\\.ts$/'])
      expect(engine.isIgnored('main.test.ts')).toBe(true)
      expect(engine.isIgnored('src/utils.test.ts')).toBe(true)
      expect(engine.isIgnored('main.ts')).toBe(false)
    })

    it('ignores using regex with flags /pattern/gi', () => {
      const engine = new IgnoreEngine(['/temp.*/i'])
      expect(engine.isIgnored('tempFile.txt')).toBe(true)
      expect(engine.isIgnored('TEMP_FOLDER/file.js')).toBe(true)
      expect(engine.isIgnored('item_template.html')).toBe(true) // 'temp' is in 'template'
    })
  })

  describe('normalization', () => {
    it('handles backslashes in paths', () => {
      const engine = new IgnoreEngine(['node_modules'])
      expect(engine.isIgnored('node_modules\\index.js')).toBe(true)
    })

    it('handles trailing slashes in patterns', () => {
      const engine = new IgnoreEngine(['dist/'])
      expect(engine.isIgnored('dist/bundle.js')).toBe(true)
      expect(engine.isIgnored('dist')).toBe(true)
    })
  })

  describe('parseIgnoreFile', () => {
    it('parses newline-separated patterns', () => {
      const content = 'node_modules\ndist\n*.log'
      const patterns = IgnoreEngine.parseIgnoreFile(content)
      expect(patterns).toEqual(['node_modules', 'dist', '*.log'])
    })

    it('ignores comments and empty lines but preserves negation lines', () => {
      const content =
        '# This is a comment\n\nnode_modules\n  \n# Another comment\ndist\n!dist/keep.js'
      const patterns = IgnoreEngine.parseIgnoreFile(content)
      expect(patterns).toEqual(['node_modules', 'dist', '!dist/keep.js'])
    })

    it('trims whitespace from patterns', () => {
      const content = '  node_modules  \n  dist  '
      const patterns = IgnoreEngine.parseIgnoreFile(content)
      expect(patterns).toEqual(['node_modules', 'dist'])
    })

    it('returns empty array for empty content', () => {
      expect(IgnoreEngine.parseIgnoreFile('')).toEqual([])
      expect(IgnoreEngine.parseIgnoreFile('   \n\n  ')).toEqual([])
    })
  })

  describe('negation patterns (!)', () => {
    it('un-ignores a path when a negation rule matches after an ignore rule', () => {
      // tests/ is ignored, but tests/schema.ts is explicitly un-ignored
      const engine = new IgnoreEngine(['tests', '!tests/schema.ts'])
      expect(engine.isIgnored('tests/utils.ts')).toBe(true)
      expect(engine.isIgnored('tests/schema.ts')).toBe(false)
    })

    it('respects last-match-wins order — a later ignore overrides a negation', () => {
      const engine = new IgnoreEngine(['tests', '!tests/schema.ts', 'tests'])
      // The last rule re-ignores everything in tests/
      expect(engine.isIgnored('tests/schema.ts')).toBe(true)
    })

    it('negation works after a glob rule', () => {
      const engine = new IgnoreEngine(['*.log', '!important.log'])
      expect(engine.isIgnored('debug.log')).toBe(true)
      expect(engine.isIgnored('important.log')).toBe(false)
    })

    it('negation has no effect when nothing was previously ignored', () => {
      const engine = new IgnoreEngine(['!tests/schema.ts'])
      // Nothing was ignored, so negation is a no-op
      expect(engine.isIgnored('tests/schema.ts')).toBe(false)
      expect(engine.isIgnored('src/index.ts')).toBe(false)
    })

    it('isExplicitlyNegated returns true only for un-ignored paths', () => {
      const engine = new IgnoreEngine(['tests', '!tests/schema.ts'])
      expect(engine.isExplicitlyNegated('tests/schema.ts')).toBe(true)
      expect(engine.isExplicitlyNegated('tests/utils.ts')).toBe(false)
      expect(engine.isExplicitlyNegated('src/index.ts')).toBe(false)
    })

    it('isExplicitlyNegated returns false when last match is a non-negated rule', () => {
      // Even if there was a negation before, the final non-negated match wins
      const engine = new IgnoreEngine([
        'tests',
        '!tests/schema.ts',
        'tests/schema.ts',
      ])
      expect(engine.isExplicitlyNegated('tests/schema.ts')).toBe(false)
      expect(engine.isIgnored('tests/schema.ts')).toBe(true)
    })
  })
})
