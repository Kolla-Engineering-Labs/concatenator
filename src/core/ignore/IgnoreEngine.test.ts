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

    it('ignores comments and empty lines', () => {
      const content =
        '# This is a comment\n\nnode_modules\n  \n# Another comment\ndist'
      const patterns = IgnoreEngine.parseIgnoreFile(content)
      expect(patterns).toEqual(['node_modules', 'dist'])
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
})
