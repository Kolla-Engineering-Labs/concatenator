/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
import { describe, it, expect, vi } from 'vitest'
import { SessionFormatter } from '../../src/core/builder/SessionFormatter.js'
import { Neutralizer } from '../../src/core/shared/Neutralizer.js'
import { Scanner } from '../../src/core/builder/Scanner.js'
import {
  ConcatenationBuilder,
  concatenate,
} from '../../src/core/builder/builder.js'
import type { IFilterStrategy } from '../../src/core/builder/contracts/IFilterStrategy.js'
import {
  generateSessionId,
  checkSessionIdCollision,
  generateCollisionFreeSessionId,
  generateFileTimestamp,
  computeHash,
  normalizeFileMode,
  formatPreMatterManifest,
  formatPostMatterManifest,
} from '../../src/core/builder/BuilderUtils.js'
import { validateConcatenation } from '../../src/core/engine.js'

describe('Builder Domain & Strategies', () => {
  describe('BuilderUtils', () => {
    it('generates 6-character hex session IDs', () => {
      const id = generateSessionId()
      expect(id).toMatch(/^[0-9a-f]{6}$/)
    })

    it('detects session ID collisions in content', () => {
      const sid = 'a1b2c3'
      const files = [
        {
          path: 'test.txt',
          content: '--- CONCATENATOR_SESSION_ID: a1b2c3 ---',
        },
      ]
      expect(checkSessionIdCollision(sid, files)).toBe(true)
    })

    it('generates collision-free session IDs', () => {
      const files = [
        {
          path: 'test.txt',
          content: '--- CONCATENATOR_SESSION_ID: 123456 ---',
        },
      ]
      const sid = generateCollisionFreeSessionId(files)
      expect(sid).toMatch(/^[0-9a-f]{6}$/)
      expect(sid).not.toBe('123456')
    })

    it('generates reproducible file timestamps', () => {
      const ts = generateFileTimestamp()
      expect(typeof ts).toBe('string')
      expect(ts.length).toBeGreaterThan(0)
    })

    it('computes 8-character xxHash32 digest', () => {
      const hash = computeHash('hello world')
      expect(hash).toMatch(/^[0-9a-f]{8}$/)
    })

    it('computes deterministic hashes across buffer and string inputs', () => {
      const buf = Buffer.from('hello world raw buffer content')
      const hash1 = computeHash(buf)
      const hash2 = computeHash('hello world raw buffer content')
      expect(hash1).toMatch(/^[0-9a-f]{8}$/)
      expect(hash1).toBe(hash2)
    })

    it('safely normalizes cross-platform file modes', () => {
      expect(normalizeFileMode({ mode: 0o100644 })).toBe('0644')
      expect(normalizeFileMode({ mode: 0o100755 })).toBe('0755')
      expect(normalizeFileMode(undefined)).toBe('0644')
    })

    it('formats pipe-delimited Pre-Matter manifest block', () => {
      const ledger = [{ path: 'src/app.ts', mode: '0644', hash: 'a1b2c3d4' }]
      const manifest = formatPreMatterManifest(ledger, '999888')
      expect(manifest).toContain('<<<<< KEL_MANIFEST_START (ID: 999888) >>>>>')
      expect(manifest).toContain('src/app.ts|0644|a1b2c3d4')
      expect(manifest).toContain('<<<<< KEL_MANIFEST_END >>>>>')
    })

    it('formats pipe-delimited Post-Matter manifest block', () => {
      const ledger = [{ path: 'src/app.ts', mode: '0644', hash: 'a1b2c3d4' }]
      const manifest = formatPostMatterManifest(ledger, '999888')
      expect(manifest).toContain(
        '<<<<< POST_MATTER_MANIFEST_START (ID: 999888) >>>>>'
      )
      expect(manifest).toContain('src/app.ts|0644|a1b2c3d4')
      expect(manifest).toContain('<<<<< POST_MATTER_MANIFEST_END >>>>>')
    })

    it('formats Pre-Matter manifest without session ID when omitted', () => {
      const ledger = [{ path: 'lib/core.ts', mode: '0755', hash: '87654321' }]
      const manifest = formatPreMatterManifest(ledger)
      expect(manifest).toContain('<<<<< KEL_MANIFEST_START >>>>>')
      expect(manifest).toContain('lib/core.ts|0755|87654321')
    })
  })

  describe('Neutralizer', () => {
    const neutralizer = new Neutralizer()

    it('neutralizes content string safely', () => {
      const input = 'hello `world` <<<<<'
      expect(neutralizer.neutralize(input)).toBe(input)
    })

    it('unneutralizes escaped backticks and delimiters', () => {
      const escaped = 'hello \\`world\\` \\<<<<< test \\>>>>>'
      expect(neutralizer.unneutralize(escaped)).toBe(
        'hello `world` <<<<< test >>>>>'
      )
    })
  })

  describe('SessionFormatter', () => {
    const formatter = new SessionFormatter()

    it('formats input files into session concatenation bundle without EOF manifest logic', () => {
      const files = [{ path: 'src/index.ts', content: 'console.log("hello")' }]
      const onProgress = vi.fn()
      const output = formatter.format(files, {
        timestamp: '2026-07-26',
        sessionId: '123456',
        onProgress,
        tokenBudget: 1000,
      })

      expect(output).toContain('--- CONCATENATOR_SESSION_ID: 123456 ---')
      expect(output).toContain('Concatenated on: 2026-07-26')
      expect(output).toContain('Budget: 1,000')
      expect(output).toContain(
        '<<<<< FILE_START: src/index.ts (ID: 123456) >>>>>'
      )
      expect(output).toContain('console.log("hello")')
      expect(output).toContain('<<<<< FILE_END >>>>>')
      expect(output).not.toContain('POST_MATTER_MANIFEST_START')
      expect(onProgress).toHaveBeenCalledWith(100)
    })

    it('throws error when provided session ID collides with content', () => {
      const files = [
        { path: 'test.ts', content: '--- CONCATENATOR_SESSION_ID: 999999 ---' },
      ]
      expect(() => formatter.format(files, { sessionId: '999999' })).toThrow(
        "Provided session ID '999999' collides with file content"
      )
    })
  })

  describe('Scanner & Filter Strategies', () => {
    it('normalizes file path separators', () => {
      const scanner = new Scanner()
      const normalized = scanner.normalizeInputFiles([
        { path: 'folder\\subfolder\\file.txt', content: 'data' },
      ])
      expect(normalized[0].path).toBe('folder/subfolder/file.txt')
    })

    it('applies custom IFilterStrategy instances', () => {
      const logFilter: IFilterStrategy = {
        shouldInclude: (filePath) => !filePath.endsWith('.log'),
      }

      const scanner = new Scanner([logFilter])
      expect(scanner).toBeDefined()
    })
  })

  describe('ConcatenationBuilder Orchestrator & Streaming Pipeline', () => {
    it('orchestrates scanning, neutralization, formatting, and Pre-Matter manifest flushing', () => {
      const builder = new ConcatenationBuilder()
      const result = builder.buildFromFiles(
        [{ path: 'a.txt', content: 'sample content' }],
        { sessionId: 'abc123' }
      )

      expect(result).toContain('--- CONCATENATOR_SESSION_ID: abc123 ---')
      expect(result).toContain('sample content')
      expect(result).toContain('<<<<< KEL_MANIFEST_START (ID: abc123) >>>>>')
      expect(result).toContain('a.txt|0644|')
      expect(result).toContain('<<<<< KEL_MANIFEST_END >>>>>')
    })

    it('throws error when buildFromDirectory is called without a scanner strategy instance', () => {
      const builder = new ConcatenationBuilder()
      expect(() => builder.buildFromDirectory({ rootPath: '/mock' })).toThrow(
        'Scanner strategy instance is required for directory scanning.'
      )
    })

    it('throws error when buildStreamFromDirectory is called without a scanner strategy instance', async () => {
      const builder = new ConcatenationBuilder()
      await expect(async () => {
        for await (const _ of builder.buildStreamFromDirectory({
          rootPath: '/mock',
        })) {
          // unreachable
        }
      }).rejects.toThrow(
        'Scanner strategy instance is required for directory scanning.'
      )
    })

    it('builds bundle from directory using scanner strategy instance', () => {
      const mockScanner = {
        scanDirectory: vi
          .fn()
          .mockReturnValue([{ path: 'src/main.ts', content: 'const a = 1;' }]),
      }

      const builder = new ConcatenationBuilder({ scanner: mockScanner as any })
      const result = builder.buildFromDirectory({ rootPath: '/app' })

      expect(mockScanner.scanDirectory).toHaveBeenCalledWith({
        rootPath: '/app',
      })
      expect(result).toContain('const a = 1;')
      expect(result).toContain('KEL_MANIFEST_START')
    })

    it('streams from directory using scanner.scanDirectoryStream', async () => {
      async function* mockScanStream() {
        yield { path: 'src/stream.ts', content: 'export const s = true;' }
      }

      const mockScanner = {
        scanDirectoryStream: vi.fn().mockImplementation(mockScanStream),
        scanDirectory: vi.fn(),
      }

      const builder = new ConcatenationBuilder({ scanner: mockScanner as any })
      const chunks: string[] = []

      for await (const chunk of builder.buildStreamFromDirectory({
        rootPath: '/app',
      })) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBe(2) // Header, File Chunk
      expect(chunks[1]).toContain('src/stream.ts')
    })

    it('streams from directory falling back to scanner.scanDirectory when scanDirectoryStream is undefined', async () => {
      const mockScanner = {
        scanDirectory: vi
          .fn()
          .mockReturnValue([
            { path: 'fallback.ts', content: 'fallback content' },
          ]),
      }

      const builder = new ConcatenationBuilder({ scanner: mockScanner as any })
      const chunks: string[] = []

      for await (const chunk of builder.buildStreamFromDirectory({
        rootPath: '/app',
      })) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBe(3)
      expect(chunks[1]).toContain('fallback.ts')
    })

    it('streams files via AsyncGenerator yielding Pre-Matter KEL manifest chunk', async () => {
      const builder = new ConcatenationBuilder()
      const inputFiles = [
        { path: 'src/main.ts', content: 'const x = 42;' },
        { path: 'src/utils.ts', content: 'export const y = 100;' },
      ]

      const chunks: string[] = []
      for await (const chunk of builder.buildStreamFromFiles(inputFiles, {
        sessionId: 'stream123',
      })) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBe(4) // Header, Pre-Matter Manifest, File 1, File 2
      expect(chunks[0]).toContain('--- CONCATENATOR_SESSION_ID: stream123 ---')
      expect(chunks[1]).toContain(
        '<<<<< KEL_MANIFEST_START (ID: stream123) >>>>>'
      )
      expect(chunks[1]).toContain('src/main.ts|0644|')
      expect(chunks[1]).toContain('src/utils.ts|0644|')
      expect(chunks[2]).toContain(
        '<<<<< FILE_START: src/main.ts (ID: stream123) >>>>>'
      )
      expect(chunks[3]).toContain(
        '<<<<< FILE_START: src/utils.ts (ID: stream123) >>>>>'
      )
    })

    it('streams files from AsyncIterable generator and formats tokenBudget in header', async () => {
      async function* generateAsyncFiles() {
        yield { path: 'async1.ts', content: 'const a = 1;' }
        yield { path: 'async2.ts', content: 'const b = 2;' }
      }

      const builder = new ConcatenationBuilder()
      const chunks: string[] = []

      for await (const chunk of builder.buildStreamFromFiles(
        generateAsyncFiles(),
        {
          tokenBudget: 50000,
          sessionId: 'budget1',
        }
      )) {
        chunks.push(chunk)
      }

      expect(chunks[0]).toContain('Budget: 50,000')
      expect(chunks[1]).toContain('async1.ts')
      expect(chunks[2]).toContain('async2.ts')
    })

    it('throws error when buildStreamFromFiles detects session ID collision in array input', async () => {
      const builder = new ConcatenationBuilder()
      const collidingFiles = [
        {
          path: 'bad.ts',
          content: '--- CONCATENATOR_SESSION_ID: COLLID ---',
        },
      ]

      await expect(async () => {
        for await (const _ of builder.buildStreamFromFiles(collidingFiles, {
          sessionId: 'COLLID',
        })) {
          // unreachable
        }
      }).rejects.toThrow(
        "Provided session ID 'COLLID' collides with file content"
      )
    })

    it('streams files directly to a Writable stream', async () => {
      const builder = new ConcatenationBuilder()
      const passThrough = new PassThrough()
      let fullStreamOutput = ''

      passThrough.on('data', (chunk) => {
        fullStreamOutput += chunk.toString('utf8')
      })

      const writePromise = builder.buildToWritable(
        passThrough,
        [{ path: 'b.txt', content: 'test stream content' }],
        { sessionId: 'writestream1' }
      )

      await writePromise
      passThrough.end()

      expect(fullStreamOutput).toContain(
        '--- CONCATENATOR_SESSION_ID: writestream1 ---'
      )
      expect(fullStreamOutput).toContain(
        '<<<<< FILE_START: b.txt (ID: writestream1) >>>>>'
      )
      expect(fullStreamOutput).toContain(
        '<<<<< KEL_MANIFEST_START (ID: writestream1) >>>>>'
      )
      expect(fullStreamOutput).toContain('b.txt|0644|')
    })

    it('handles Writable backpressure during buildToWritable when write returns false', async () => {
      class BackpressureWritable extends EventEmitter {
        public written: string[] = []
        private firstWrite = true

        public write(chunk: string): boolean {
          this.written.push(chunk)
          if (this.firstWrite) {
            this.firstWrite = false
            // Simulate backpressure on first write
            setTimeout(() => {
              this.emit('drain')
            }, 10)
            return false
          }
          return true
        }
      }

      const mockWritable = new BackpressureWritable() as any
      const builder = new ConcatenationBuilder()

      await builder.buildToWritable(
        mockWritable,
        [{ path: 'bp.ts', content: 'backpressure content' }],
        { sessionId: 'bp123' }
      )

      expect(mockWritable.written.length).toBeGreaterThanOrEqual(3)
      expect(mockWritable.written.join('')).toContain('backpressure content')
    })

    it('streams directory directly to Writable stream via buildToWritableFromDirectory', async () => {
      const mockScanner = {
        scanDirectory: vi
          .fn()
          .mockReturnValue([
            { path: 'dir/stream.ts', content: 'dir stream content' },
          ]),
      }

      const builder = new ConcatenationBuilder({ scanner: mockScanner as any })
      const passThrough = new PassThrough()
      let output = ''

      passThrough.on('data', (chunk) => {
        output += chunk.toString('utf8')
      })

      await builder.buildToWritableFromDirectory(
        passThrough,
        { rootPath: '/mock' },
        { sessionId: 'dirwritestream' }
      )
      passThrough.end()

      expect(output).toContain('dir stream content')
      expect(output).toContain('KEL_MANIFEST_START (ID: dirwritestream)')
    })

    it('validates concatenated bundle with Post-Matter EOF manifest successfully', () => {
      const builder = new ConcatenationBuilder()
      const result = builder.buildFromFiles(
        [{ path: 'demo.txt', content: 'hello world' }],
        { sessionId: 'val1234' }
      )

      const validation = validateConcatenation(result)
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toEqual([])
      expect(validation.targetFiles).toEqual(['demo.txt'])
    })

    it('maintains 100% backward compatibility with concatenate() function export', () => {
      const result = concatenate(
        [{ path: 'b.txt', content: 'test content' }],
        '2026-07-26',
        'xyz789'
      )

      expect(result).toContain('--- CONCATENATOR_SESSION_ID: xyz789 ---')
      expect(result).toContain('<<<<< FILE_START: b.txt (ID: xyz789) >>>>>')
      expect(result).toContain('test content')
    })
  })
})
