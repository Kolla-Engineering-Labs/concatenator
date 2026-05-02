import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VFSManager, VFSFileSystem } from '../../src/core/VFSManager'
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  realpathSync,
} from 'node:fs'
import { join } from 'path'
import { tmpdir } from 'os'
import * as fs from 'node:fs'

describe('VFSManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'vfs-test-')))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should build a basic tree', () => {
    writeFileSync(join(tmpDir, 'file.txt'), 'hello')
    mkdirSync(join(tmpDir, 'dir'))
    writeFileSync(join(tmpDir, 'dir/sub.txt'), 'sub')

    const vfs = new VFSManager(tmpDir)
    const result = vfs.getTree()

    expect(result.tree.children).toHaveLength(2)
    const dir = result.tree.children?.find((c) => c.name === 'dir')
    expect(dir?.kind).toBe('directory')
    expect(dir?.children).toHaveLength(1)
  })

  it('should respect additional ignore patterns', () => {
    writeFileSync(join(tmpDir, 'file.txt'), 'hello')
    writeFileSync(join(tmpDir, 'secret.log'), 'shh')

    const vfs = new VFSManager(tmpDir, ['*.log'])
    const result = vfs.getTree()

    const logFile = result.tree.children?.find((c) => c.name === 'secret.log')
    expect(logFile?.isIgnored).toBe(true)
  })

  it('should handle regex ignore patterns', () => {
    writeFileSync(join(tmpDir, 'test-123.txt'), 'hello')

    const vfs = new VFSManager(tmpDir, ['/test-\\d+/'])
    const result = vfs.getTree()

    const node = result.tree.children?.find((c) => c.name === 'test-123.txt')
    expect(node?.isIgnored).toBe(true)
  })

  it('should handle negation patterns', () => {
    writeFileSync(join(tmpDir, 'ignored.js'), 'code')
    writeFileSync(join(tmpDir, 'important.js'), 'code')

    const vfs = new VFSManager(tmpDir, ['*.js', '!important.js'])
    const result = vfs.getTree()

    const ignored = result.tree.children?.find((c) => c.name === 'ignored.js')
    const important = result.tree.children?.find(
      (c) => c.name === 'important.js'
    )

    expect(ignored?.isIgnored).toBe(true)
    expect(important?.isIgnored).toBe(false)
    expect(important?.isNegated).toBe(true)
  })

  it('should respect maxFiles limit', () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(tmpDir, `file${i}.txt`), 'content')
    }

    const vfs = new VFSManager(tmpDir, [], 3)
    const result = vfs.getTree()

    expect(result.partial).toBe(true)
    expect(result.tree.children).toHaveLength(3)
  })

  it('should handle symlinks as ignored ghost entries', () => {
    const vfsDir = tmpDir
    const mockFs: VFSFileSystem = {
      ...fs,
      lstatSync: ((path: string) => {
        if (path.endsWith('symlink-test')) {
          return {
            isSymbolicLink: () => true,
            isDirectory: () => false,
            isFile: () => false,
            size: 0,
          }
        }
        return fs.lstatSync(path)
      }) as any,
      readdirSync: ((path: string) => {
        const entries = fs.readdirSync(path)
        if (path === vfsDir) {
          return [...entries, 'symlink-test']
        }
        return entries
      }) as any,
    }

    const vfs = new VFSManager(vfsDir, [], 1000, mockFs)
    const result = vfs.getTree()

    const symlinkNode = result.tree.children?.find(
      (c) => c.name === 'symlink-test'
    )
    expect(symlinkNode).toBeDefined()
    expect(symlinkNode?.isIgnored).toBe(true)
    expect(symlinkNode?.kind).toBe('file')
  })

  it('should handle readdirSync errors gracefully', () => {
    mkdirSync(join(tmpDir, 'secret-dir'))
    const vfsDir = tmpDir

    const mockFs: VFSFileSystem = {
      ...fs,
      readdirSync: ((path: string) => {
        if (path.endsWith('secret-dir')) {
          throw new Error('Permission denied')
        }
        return fs.readdirSync(path)
      }) as any,
    }

    const vfs = new VFSManager(vfsDir, [], 1000, mockFs)
    const result = vfs.getTree()

    const secretDir = result.tree.children?.find((c) => c.name === 'secret-dir')
    expect(secretDir).toBeDefined()
    expect(secretDir?.children).toEqual([])
  })

  it('should skip non-file/non-directory entries', () => {
    const vfsDir = tmpDir
    const mockFs: VFSFileSystem = {
      ...fs,
      lstatSync: ((path: string) => {
        if (path.endsWith('socket')) {
          return {
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => false,
          }
        }
        return fs.lstatSync(path)
      }) as any,
      readdirSync: ((path: string) => {
        const entries = fs.readdirSync(path)
        if (path === vfsDir) {
          return [...entries, 'socket']
        }
        return entries
      }) as any,
    }

    const vfs = new VFSManager(vfsDir, [], 1000, mockFs)
    const result = vfs.getTree()

    const socketNode = result.tree.children?.find((c) => c.name === 'socket')
    expect(socketNode).toBeUndefined()
  })
})
