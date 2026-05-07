/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { UnifiedCrawler } from '../../src/core/Crawler'
import { IgnoreEngine } from '../../src/core/ignore/IgnoreEngine'
import { SecurityViolation } from '../../src/core/errors'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readdirSync: vi.fn(actual.readdirSync),
    lstatSync: vi.fn(actual.lstatSync),
    statSync: vi.fn(actual.statSync),
    realpathSync: vi.fn(actual.realpathSync),
    writeFileSync: vi.fn(actual.writeFileSync),
  }
})

describe('UnifiedCrawler', () => {
  let tempDir: string
  let ignoreEngine: IgnoreEngine

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-test-'))
    ignoreEngine = new IgnoreEngine([])
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should initialize correctly with valid root path', () => {
    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })
    expect(crawler).toBeDefined()
  })

  it('should collect files in root directory', () => {
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1')
    fs.mkdirSync(path.join(tempDir, 'subdir'))
    fs.writeFileSync(path.join(tempDir, 'subdir', 'file2.txt'), 'content2')

    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })
    const results = crawler.collect()

    expect(results).toHaveLength(3) // file1.txt, subdir, subdir/file2.txt
    expect(results.some((e) => e.name === 'file1.txt')).toBe(true)
    expect(results.some((e) => e.name === 'subdir')).toBe(true)
    expect(results.find((e) => e.name === 'file2.txt')?.path).toBe(
      'subdir/file2.txt'
    )
  })

  it('should respect ignore engine', () => {
    const ignoreEngineWithPatterns = new IgnoreEngine(['*.tmp'])
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1')
    fs.writeFileSync(path.join(tempDir, 'file2.tmp'), 'content2')

    const crawler = new UnifiedCrawler({
      rootPath: tempDir,
      ignoreEngine: ignoreEngineWithPatterns,
    })
    const results = crawler.collect()

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('file1.txt')
  })

  it('should prevent directory traversal attacks', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })

    expect(() => {
      crawler.collect(outsideDir)
    }).toThrow(SecurityViolation)

    fs.rmSync(outsideDir, { recursive: true, force: true })
  })

  it('should follow symlinks if enabled', () => {
    if (os.platform() === 'win32') return // Symlinks need admin on Windows often, skip or handle

    const targetDir = path.join(tempDir, 'target')
    fs.mkdirSync(targetDir)
    fs.writeFileSync(path.join(targetDir, 'target-file.txt'), 'content')

    const linkPath = path.join(tempDir, 'link')
    fs.symlinkSync(targetDir, linkPath, 'dir')

    // Follow = false
    const crawler1 = new UnifiedCrawler({
      rootPath: tempDir,
      ignoreEngine,
      followSymlinks: false,
    })
    const results1 = crawler1.collect()
    expect(results1.some((e) => e.name === 'link')).toBe(false)

    // Follow = true
    const crawler2 = new UnifiedCrawler({
      rootPath: tempDir,
      ignoreEngine,
      followSymlinks: true,
    })
    const results2 = crawler2.collect()
    expect(results2.some((e) => e.name === 'link')).toBe(true)
    expect(results2.some((e) => e.name === 'target-file.txt')).toBe(true)
  })

  it('should trigger onEntry callback', () => {
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content')
    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })
    const onEntry = vi.fn()

    crawler.collect(tempDir, onEntry)

    expect(onEntry).toHaveBeenCalled()
    expect(onEntry.mock.calls[0][0].name).toBe('file1.txt')
  })

  it('should skip entries that cause generic errors', () => {
    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })
    const lstatSpy = vi.mocked(fs.lstatSync).mockImplementationOnce(() => {
      throw new Error('Generic read error')
    })

    const results = crawler.collect()
    expect(results).toHaveLength(0)
    lstatSpy.mockRestore()
  })

  it('should skip non-file/non-directory types at lstat level', () => {
    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })

    // 1. entry.isFile() must be true to enter the block
    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      {
        name: 'socket',
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      },
    ] as any)

    // 2. lstats.isSymbolicLink() must be false
    // 3. stats.isDirectory() must be false
    // 4. stats.isFile() must be false
    vi.mocked(fs.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
      size: 0,
    } as any)

    const results = crawler.collect()
    expect(results).toHaveLength(0)
    vi.mocked(fs.readdirSync).mockRestore()
  })

  it('should skip non-standard types (sockets, pipes, etc.)', () => {
    const onEntry = vi.fn()
    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })

    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      {
        name: 'pipe',
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      },
    ] as any)

    vi.mocked(fs.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
      size: 0,
    } as any)

    crawler.collect(tempDir, onEntry)
    expect(onEntry).not.toHaveBeenCalled()
    vi.mocked(fs.readdirSync).mockRestore()
    vi.mocked(fs.lstatSync).mockRestore()
  })

  it('should handle symlinks that are not followed', () => {
    const crawler = new UnifiedCrawler({
      rootPath: tempDir,
      ignoreEngine,
      followSymlinks: false,
    })
    const linkPath = path.resolve(tempDir, 'link')
    const rootPath = path.resolve(tempDir)

    vi.mocked(fs.readdirSync).mockImplementation((p: any) => {
      if (path.resolve(p.toString()) === rootPath) {
        return [
          {
            name: 'link',
            isDirectory: () => false,
            isFile: () => false,
            isSymbolicLink: () => true,
          },
        ] as any
      }
      return []
    })

    vi.mocked(fs.lstatSync).mockImplementation((p: any) => {
      if (path.resolve(p.toString()) === linkPath) {
        return {
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
          size: 0,
        } as any
      }
      return {
        isSymbolicLink: () => false,
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
      } as any
    })

    const results = crawler.collect()
    expect(results).toHaveLength(0)
    vi.mocked(fs.readdirSync).mockRestore()
    vi.mocked(fs.lstatSync).mockRestore()
  })

  it('should propagate SecurityViolation during walk', () => {
    const crawler = new UnifiedCrawler({
      rootPath: tempDir,
      ignoreEngine,
      followSymlinks: true, // Must be true to trigger assertPathWithinRoot for entries
    })

    // We'll use a mocked readdirSync to avoid OS-level symlink issues
    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      {
        name: 'evil.txt',
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => true,
      },
    ] as any)

    // Mock realpathSync to simulate a symlink that points outside the root
    const realpathSpy = vi
      .spyOn(fs, 'realpathSync')
      .mockImplementation((p: any) => {
        if (p.toString().includes('evil.txt')) {
          return path.join(os.tmpdir(), 'outside-evil.txt')
        }
        return path.resolve(p.toString())
      })

    // Mock lstatSync to return a symlink for evil.txt
    const lstatSpy = vi.spyOn(fs, 'lstatSync').mockImplementation((p: any) => {
      if (p.toString().includes('evil.txt')) {
        return {
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
          size: 0,
        } as any
      }
      return {
        isSymbolicLink: () => false,
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
      } as any
    })

    // This should trigger the check inside walk -> assertPathWithinRoot
    expect(() => crawler.collect()).toThrow(SecurityViolation)
    realpathSpy.mockRestore()
    lstatSpy.mockRestore()
    vi.mocked(fs.readdirSync).mockRestore()
  })

  it('should handle non-Error read errors quietly', () => {
    const crawler = new UnifiedCrawler({ rootPath: tempDir, ignoreEngine })
    vi.mocked(fs.lstatSync).mockImplementationOnce(() => {
      throw 'string error'
    })
    const results = crawler.collect()
    expect(results).toBeDefined()
    vi.mocked(fs.lstatSync).mockRestore()
  })

  it('should handle symlinks that are followed', () => {
    const crawler = new UnifiedCrawler({
      rootPath: tempDir,
      ignoreEngine,
      followSymlinks: true,
    })

    const targetPath = path.join(tempDir, 'target.txt')
    fs.writeFileSync(targetPath, 'content')

    // Always use mocks for symlink tests to ensure cross-platform stability
    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      {
        name: 'link-to-target.txt',
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => true,
      },
    ] as any)

    vi.mocked(fs.lstatSync).mockImplementation((p: any) => {
      if (p.toString().includes('link-to-target.txt')) {
        return {
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
          size: 0,
        } as any
      }
      return {
        isSymbolicLink: () => false,
        isDirectory: () => false,
        isFile: () => true,
        size: 7,
      } as any
    })

    vi.mocked(fs.statSync).mockImplementation(() => {
      // statSync should return the stats of the TARGET file
      return {
        isSymbolicLink: () => false,
        isDirectory: () => false,
        isFile: () => true,
        size: 7,
      } as any
    })

    vi.mocked(fs.realpathSync).mockImplementation((p: any) => p.toString())

    const results = crawler.collect()
    expect(results.some((e) => e.name.includes('link-to-target'))).toBe(true)

    vi.mocked(fs.readdirSync).mockRestore()
    vi.mocked(fs.lstatSync).mockRestore()
    vi.mocked(fs.statSync).mockRestore()
    vi.mocked(fs.realpathSync).mockRestore()
  })
})
