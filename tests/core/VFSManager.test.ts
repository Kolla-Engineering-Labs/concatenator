import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VFSManager } from '../../src/core/VFSManager'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('VFSManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vfs-'))
    // Create some structure
    mkdirSync(join(tmpDir, 'src'))
    mkdirSync(join(tmpDir, 'src/components'))
    writeFileSync(join(tmpDir, 'src/index.js'), 'console.log("hello")')
    writeFileSync(
      join(tmpDir, 'src/components/Button.jsx'),
      'export default () => <button/>'
    )

    // Ignored items
    mkdirSync(join(tmpDir, 'node_modules'))
    writeFileSync(join(tmpDir, 'node_modules/package.json'), '{}')
    writeFileSync(join(tmpDir, 'package.json'), '{}')

    // Hard-ignored extensions
    writeFileSync(join(tmpDir, 'logo.png'), 'fake-png-data')
    writeFileSync(join(tmpDir, 'document.pdf'), 'fake-pdf-data')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should build a virtual file tree', () => {
    const vfs = new VFSManager(tmpDir, [])
    const result = vfs.getTree()

    expect(result.partial).toBe(false)
    expect(result.tree.name).toBe(tmpDir.split(/[/\\]/).pop())
    expect(result.tree.kind).toBe('directory')

    // Check children
    const childrenNames = result.tree.children?.map((c) => c.name) || []
    expect(childrenNames).toContain('src')
    expect(childrenNames).toContain('node_modules')
    expect(childrenNames).toContain('package.json')
    expect(childrenNames).toContain('logo.png')
  })

  it('should correctly flag ignored directories and files based on default ignores', () => {
    const vfs = new VFSManager(tmpDir, [])
    const result = vfs.getTree()

    const nodeModules = result.tree.children?.find(
      (c) => c.name === 'node_modules'
    )
    expect(nodeModules?.isIgnored).toBe(true)
    // Ignored directories shouldn't have their children traversed, but they return an empty array
    expect(nodeModules?.children).toEqual([])

    // Test hard ignored extensions
    const pngFile = result.tree.children?.find((c) => c.name === 'logo.png')
    expect(pngFile?.isIgnored).toBe(true)
  })

  it('should accept additional ignore patterns', () => {
    const vfs = new VFSManager(tmpDir, ['src/index.js'])
    const result = vfs.getTree()

    const src = result.tree.children?.find((c) => c.name === 'src')
    const indexJs = src?.children?.find((c) => c.name === 'index.js')

    expect(indexJs?.isIgnored).toBe(true)
  })

  it('should handle negation patterns', () => {
    // Negate node_modules
    const vfs = new VFSManager(tmpDir, ['!node_modules'])
    const result = vfs.getTree()

    const nodeModules = result.tree.children?.find(
      (c) => c.name === 'node_modules'
    )
    expect(nodeModules?.isIgnored).toBeUndefined() // or false
    expect(nodeModules?.isNegated).toBe(true)
    // Should have traversed children
    expect(nodeModules?.children?.length).toBe(1)
    expect(nodeModules?.children?.[0].name).toBe('package.json')
  })

  it('should enforce max files limit and return partial tree', () => {
    // Limit to 1 file processed. (Only 1 file total allowed)
    const vfs = new VFSManager(tmpDir, [], 1)
    const result = vfs.getTree()

    expect(result.partial).toBe(true)
  })
})
