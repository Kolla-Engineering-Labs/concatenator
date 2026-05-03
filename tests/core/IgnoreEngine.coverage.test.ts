import { describe, it, expect } from 'vitest'
import { IgnoreEngine } from '../../src/core/ignore/IgnoreEngine'

describe('IgnoreEngine Coverage', () => {
  it('should handle regex with flags', () => {
    const engine = new IgnoreEngine(['/test/i'])
    expect(engine.isIgnored('TEST.txt')).toBe(true)
    expect(engine.isIgnored('not-here')).toBe(false)
  })

  it('should handle invalid regex flags by falling back to plain pattern', () => {
    const engine = new IgnoreEngine(['/test/xyz']) // xyz are invalid flags for some engines, but let's see
    // In our code: /^[gimsuy]+$/.test(flags)
    // xyz fails this test.
    expect(engine.isIgnored('test/xyz')).toBe(true)
    expect(engine.isIgnored('test')).toBe(false)
  })

  it('should handle regex compilation errors', () => {
    const engine = new IgnoreEngine(['/([']) // Invalid regex
    expect(engine.isIgnored('test')).toBe(false)
  })

  it('should handle empty paths and segments', () => {
    const engine = new IgnoreEngine(['*'])
    expect(engine.isIgnored('')).toBe(false)
    expect(engine.isIgnored('/')).toBe(false)
    expect(engine.isExplicitlyNegated('')).toBe(false)
    expect(engine.isExplicitlyNegated('/')).toBe(false)
  })

  it('should handle explicit negation check', () => {
    const engine = new IgnoreEngine(['*.js', '!main.js'])
    expect(engine.isExplicitlyNegated('main.js')).toBe(true)
    expect(engine.isExplicitlyNegated('other.js')).toBe(false)
  })

  it('should match regex in segments', () => {
    const engine = new IgnoreEngine(['/^node_modules$/'])
    expect(engine.isIgnored('node_modules/package.json')).toBe(true)
  })

  it('should handle glob with double asterisks', () => {
    const engine = new IgnoreEngine(['dist/**'])
    expect(engine.isIgnored('dist')).toBe(true)
    expect(engine.isIgnored('dist/bundle.js')).toBe(true)
    expect(engine.isIgnored('src/dist')).toBe(false)
  })

  it('should match glob in segments', () => {
    const engine = new IgnoreEngine(['*-dir'])
    expect(engine.isIgnored('some-dir/file.txt')).toBe(true)
  })

  it('should handle path-anchored plain patterns', () => {
    const engine = new IgnoreEngine(['src/main.ts'])
    expect(engine.isIgnored('src/main.ts')).toBe(true)
    expect(engine.isIgnored('other/src/main.ts')).toBe(true)
    expect(engine.isIgnored('main.ts')).toBe(false)
  })

  it('should parse ignore file correctly', () => {
    expect(IgnoreEngine.parseIgnoreFile('')).toEqual([])
    const content = '# Comment\n\npattern1\n!negated\n'
    expect(IgnoreEngine.parseIgnoreFile(content)).toEqual([
      'pattern1',
      '!negated',
    ])
  })

  it('should handle regex with flags compilation failure', () => {
    // Triggering the try-catch at line 49
    // Some flags might pass the regex check but fail RegExp constructor
    // This is hard to trigger in modern Node, but let's try an empty body?
    const engine = new IgnoreEngine(['///g'])
    expect(engine.isIgnored('/')).toBe(false)
  })
})
