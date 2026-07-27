/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Scanner } from '../../src/core/builder/Scanner.js'
import type { IFilterStrategy } from '../../src/core/builder/contracts/IFilterStrategy.js'
import { computeHash } from '../../src/core/builder/BuilderUtils.js'
import { IgnoreEngine } from '../../src/core/ignore/IgnoreEngine.js'

// VFS Registry state
interface VFSNode {
  kind: 'file' | 'directory' | 'symlink'
  content?: string | Buffer
  mode?: number
  size?: number
  unStattable?: boolean
  unReadable?: boolean
  children?: string[]
}

const vfsState: Record<string, VFSNode> = {}

// Helper to reset and populate VFS
function resetVfs() {
  for (const key of Object.keys(vfsState)) {
    delete vfsState[key]
  }
}

function normalizePath(p: string): string {
  let norm = p.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(norm)) {
    norm = norm.substring(2)
  }
  return norm
}

function setVfsNode(path: string, node: VFSNode) {
  const normPath = normalizePath(path)
  vfsState[normPath] = node
}

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  const pathModule =
    await vi.importActual<typeof import('node:path')>('node:path')

  const normalize = (p: string) => normalizePath(p)

  const getStat = (p: string) => {
    const norm = normalize(p)
    const node = vfsState[norm]
    if (!node || node.unStattable) {
      throw new Error(`ENOENT: no such file or directory, stat '${p}'`)
    }
    const isFile = node.kind === 'file'
    const isDir = node.kind === 'directory'
    const isSymlink = node.kind === 'symlink'

    const size =
      node.size ??
      (typeof node.content === 'string'
        ? Buffer.byteLength(node.content)
        : node.content
          ? node.content.length
          : 0)

    return {
      isFile: () => isFile,
      isDirectory: () => isDir,
      isSymbolicLink: () => isSymlink,
      size,
      mode: node.mode ?? 0o100644,
    }
  }

  const getLstat = (p: string) => {
    const norm = normalize(p)
    const node = vfsState[norm]
    if (!node || node.unStattable) {
      throw new Error(`ENOENT: no such file or directory, lstat '${p}'`)
    }
    const isSymlink = node.kind === 'symlink'
    const isFile = node.kind === 'file'
    const isDir = node.kind === 'directory'
    const size =
      node.size ??
      (typeof node.content === 'string'
        ? Buffer.byteLength(node.content)
        : node.content
          ? node.content.length
          : 0)

    return {
      isFile: () => isFile,
      isDirectory: () => isDir,
      isSymbolicLink: () => isSymlink,
      size,
      mode: node.mode ?? 0o100644,
    }
  }

  const readDir = (p: string, _opts?: any) => {
    const norm = normalize(p)
    const node = vfsState[norm]
    if (!node || node.kind !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, readdir '${p}'`)
    }

    const children = node.children ?? []
    return children.map((childName) => {
      const childPath = `${norm}/${childName}`
      const childNode = vfsState[childPath]
      const isFile = childNode?.kind === 'file'
      const isDir = childNode?.kind === 'directory'
      const isSymlink = childNode?.kind === 'symlink'

      return {
        name: childName,
        isFile: () => isFile,
        isDirectory: () => isDir,
        isSymbolicLink: () => isSymlink,
      }
    })
  }

  const readFile = (p: string) => {
    const norm = normalize(p)
    const node = vfsState[norm]
    if (!node || node.unReadable || node.content === undefined) {
      throw new Error(`EACCES: permission denied, open '${p}'`)
    }
    return typeof node.content === 'string'
      ? Buffer.from(node.content)
      : node.content
  }

  const realpath = (p: string) => {
    return pathModule.resolve(p)
  }

  return {
    ...actual,
    default: {
      ...actual,
      realpathSync: realpath,
      readdirSync: readDir,
      lstatSync: getLstat,
      statSync: getStat,
      readFileSync: readFile,
      promises: {
        ...actual.promises,
        stat: async (p: string) => getStat(p),
        readFile: async (p: string) => readFile(p),
      },
    },
    realpathSync: realpath,
    readdirSync: readDir,
    lstatSync: getLstat,
    statSync: getStat,
    readFileSync: readFile,
    promises: {
      ...actual.promises,
      stat: async (p: string) => getStat(p),
      readFile: async (p: string) => readFile(p),
    },
  }
})

describe('Scanner Core Service & Vitest VFS Suite', () => {
  const rootPath = '/mock/project'

  beforeEach(() => {
    resetVfs()
    // Setup base directory structure
    setVfsNode('/mock/project', {
      kind: 'directory',
      children: [
        'src',
        'dist',
        'malicious_symlink.txt',
        'unreadable.txt',
        'unstattable.txt',
      ],
    })
    setVfsNode('/mock/project/src', {
      kind: 'directory',
      children: ['index.ts', 'utils.ts'],
    })
    setVfsNode('/mock/project/dist', {
      kind: 'directory',
      children: ['bundle.js'],
    })
    setVfsNode('/mock/project/src/index.ts', {
      kind: 'file',
      content: 'console.log("hello world")',
      mode: 0o100644,
    })
    setVfsNode('/mock/project/src/utils.ts', {
      kind: 'file',
      content: 'export const add = (a: number, b: number) => a + b',
      mode: 0o100755,
    })
    setVfsNode('/mock/project/dist/bundle.js', {
      kind: 'file',
      content: 'var bundle = 1;',
      mode: 0o100644,
    })
    setVfsNode('/mock/project/malicious_symlink.txt', {
      kind: 'symlink',
      content: 'secret contents outside root',
    })
    setVfsNode('/mock/project/unreadable.txt', {
      kind: 'file',
      content: 'secret',
      unReadable: true,
    })
    setVfsNode('/mock/project/unstattable.txt', {
      kind: 'file',
      content: 'corrupted',
      unStattable: true,
    })
  })

  describe('Zero-Trust Symlink & Directory Traversal Guards', () => {
    it('strictly ignores symbolic link entries when followSymlinks is false', async () => {
      const scanner = new Scanner()
      const filesStream: string[] = []

      for await (const file of scanner.scanDirectoryStream({
        rootPath,
        followSymlinks: false,
      })) {
        filesStream.push(file.path)
      }

      expect(filesStream).not.toContain('malicious_symlink.txt')
      expect(filesStream).toContain('src/index.ts')
      expect(filesStream).toContain('src/utils.ts')
    })

    it('strictly ignores symbolic link entries in synchronous scanDirectory when followSymlinks is false', () => {
      const scanner = new Scanner()
      const files = scanner.scanDirectory({
        rootPath,
        followSymlinks: false,
      })

      const paths = files.map((f) => f.path)
      expect(paths).not.toContain('malicious_symlink.txt')
      expect(paths).toContain('src/index.ts')
    })
  })

  describe('scanDirectoryStream Async Generator', () => {
    it('yields ConcatenateInputFile DTOs asynchronously via scanDirectoryStream', async () => {
      const scanner = new Scanner()
      const yieldedFiles: any[] = []

      for await (const file of scanner.scanDirectoryStream({ rootPath })) {
        yieldedFiles.push(file)
      }

      expect(yieldedFiles.length).toBeGreaterThanOrEqual(2)
      const indexFile = yieldedFiles.find((f) => f.path === 'src/index.ts')
      expect(indexFile).toBeDefined()
      expect(indexFile.content).toBe('console.log("hello world")')
      expect(indexFile.hash).toMatch(/^[0-9a-f]{8}$/)
      expect(indexFile.mode).toBe('0644')

      const utilsFile = yieldedFiles.find((f) => f.path === 'src/utils.ts')
      expect(utilsFile).toBeDefined()
      expect(utilsFile.mode).toBe('0755')
    })

    it('uses provided ignoreEngine or defaults to empty IgnoreEngine', async () => {
      const scanner = new Scanner()
      const ignoreEngine = new IgnoreEngine(['dist/**'])
      const files: string[] = []

      for await (const file of scanner.scanDirectoryStream({
        rootPath,
        ignoreEngine,
      })) {
        files.push(file.path)
      }

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('dist/bundle.js')
    })
  })

  describe('IFilterStrategy Injection', () => {
    it('bypasses ignored files using constructor injected IFilterStrategy', async () => {
      const tsOnlyFilter: IFilterStrategy = {
        shouldInclude: (filePath) => filePath.endsWith('.ts'),
      }

      const scanner = new Scanner([tsOnlyFilter])
      const filesStream: string[] = []

      for await (const file of scanner.scanDirectoryStream({ rootPath })) {
        filesStream.push(file.path)
      }

      expect(filesStream).toContain('src/index.ts')
      expect(filesStream).toContain('src/utils.ts')
      expect(filesStream).not.toContain('dist/bundle.js')
    })

    it('bypasses ignored files using scanOptions injected IFilterStrategy', () => {
      const scanner = new Scanner()
      const noUtilsFilter: IFilterStrategy = {
        shouldInclude: (filePath) => !filePath.includes('utils'),
      }

      const files = scanner.scanDirectory({
        rootPath,
        filterStrategies: [noUtilsFilter],
      })

      const paths = files.map((f) => f.path)
      expect(paths).toContain('src/index.ts')
      expect(paths).not.toContain('src/utils.ts')
    })

    it('allows dynamic filter strategy addition via addFilterStrategy method', async () => {
      const scanner = new Scanner()
      const customFilter: IFilterStrategy = {
        shouldInclude: (filePath) => filePath.startsWith('src/'),
      }

      scanner.addFilterStrategy(customFilter)

      const filesStream: string[] = []
      for await (const file of scanner.scanDirectoryStream({ rootPath })) {
        filesStream.push(file.path)
      }

      expect(filesStream).toContain('src/index.ts')
      expect(filesStream).not.toContain('dist/bundle.js')
    })
  })

  describe('RAW Buffer xxHash32 Computation', () => {
    it('computes deterministic xxHash32 hex digest matching known raw buffer values', async () => {
      const rawContent = Buffer.from('Deterministic Buffer Content for Hashing')
      setVfsNode('/mock/project/src/hash_test.dat', {
        kind: 'file',
        content: rawContent,
      })
      setVfsNode('/mock/project/src', {
        kind: 'directory',
        children: ['index.ts', 'utils.ts', 'hash_test.dat'],
      })

      const scanner = new Scanner()
      let hashTestFile: any

      for await (const file of scanner.scanDirectoryStream({ rootPath })) {
        if (file.path === 'src/hash_test.dat') {
          hashTestFile = file
        }
      }

      expect(hashTestFile).toBeDefined()
      const expectedHash = computeHash(rawContent)
      expect(hashTestFile.hash).toBe(expectedHash)
      expect(hashTestFile.hash).toMatch(/^[0-9a-f]{8}$/)
    })
  })

  describe('Resilience & Un-stattable / Unreadable File Handling', () => {
    it('gracefully skips un-stattable and unreadable files without crashing stream', async () => {
      const scanner = new Scanner()
      const filesStream: string[] = []

      for await (const file of scanner.scanDirectoryStream({ rootPath })) {
        filesStream.push(file.path)
      }

      expect(filesStream).not.toContain('unstattable.txt')
      expect(filesStream).not.toContain('unreadable.txt')
      expect(filesStream).toContain('src/index.ts')
    })

    it('gracefully skips un-stattable and unreadable files without crashing synchronous scanDirectory', () => {
      const scanner = new Scanner()
      const files = scanner.scanDirectory({ rootPath })

      const paths = files.map((f) => f.path)
      expect(paths).not.toContain('unstattable.txt')
      expect(paths).not.toContain('unreadable.txt')
      expect(paths).toContain('src/index.ts')
    })
  })

  describe('normalizeInputFiles Utility Method', () => {
    it('normalizes path separators and contents of input files array', () => {
      const scanner = new Scanner()
      const normalized = scanner.normalizeInputFiles([
        {
          path: 'src\\components\\App.tsx',
          content: 'export const App = () => null;',
        },
      ])

      expect(normalized[0].path).toBe('src/components/App.tsx')
      expect(normalized[0].content).toBe('export const App = () => null;')
    })
  })
})
