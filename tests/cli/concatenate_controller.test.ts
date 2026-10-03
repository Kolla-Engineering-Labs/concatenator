/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { Readable } from 'node:stream'
import {
  handleConcatenate,
  parseJSONBody,
} from '../../src/cli/api/controllers/concatenate.js'

describe('Concatenate Controller & Parser Unit/Integration', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kel-concat-ctrl-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  })

  describe('parseJSONBody', () => {
    it('successfully parses valid JSON chunks', async () => {
      const readable = Readable.from([
        Buffer.from('{"key":'),
        Buffer.from('"value",'),
        Buffer.from('"num":123}'),
      ]) as unknown as http.IncomingMessage

      const result = await parseJSONBody<{ key: string; num: number }>(readable)
      expect(result).toEqual({ key: 'value', num: 123 })
    })

    it('returns empty object when payload is empty or whitespace', async () => {
      const readable = Readable.from([
        Buffer.from('   '),
      ]) as unknown as http.IncomingMessage

      const result = await parseJSONBody<Record<string, unknown>>(readable)
      expect(result).toEqual({})
    })

    it('throws Invalid JSON Payload on malformed JSON', async () => {
      const readable = Readable.from([
        Buffer.from('{ malformed json '),
      ]) as unknown as http.IncomingMessage

      await expect(parseJSONBody(readable)).rejects.toThrow(
        'Invalid JSON Payload'
      )
    })

    it('throws Payload Too Large when exceeding maxBytes ceiling', async () => {
      const readable = Readable.from([
        Buffer.from('{"data": "'),
        Buffer.from('x'.repeat(100)),
        Buffer.from('"}'),
      ]) as unknown as http.IncomingMessage

      await expect(parseJSONBody(readable, 50)).rejects.toThrow(
        'Payload Too Large'
      )
    })
  })

  describe('handleConcatenate HTTP handler', () => {
    it('blocks execution when client token does not match expectedToken', async () => {
      const req = {
        headers: {
          'x-concatenator-token': 'invalid-token',
        },
      } as unknown as http.IncomingMessage

      let responseStatus = 0
      let responseBody = ''
      const res = {
        writeHead: vi.fn((status: number) => {
          responseStatus = status
        }),
        end: vi.fn((data: string) => {
          responseBody = data
        }),
      } as unknown as http.ServerResponse

      await handleConcatenate(req, res, 'expected-token-xyz', tmpDir)

      expect(responseStatus).toBe(403)
      expect(JSON.parse(responseBody).error).toBe(
        'Zero-Trust Perimeter Violation'
      )
    })

    it('processes drag-and-drop virtual files with in-memory content', async () => {
      const payload = {
        targets: [
          {
            path: 'virtual/file1.ts',
            content: 'export const v = 42;\n',
          },
        ],
        matrix: {
          outputFormat: 'xml',
          enableNeutralization: false,
        },
      }

      const req = Readable.from([
        Buffer.from(JSON.stringify(payload)),
      ]) as unknown as http.IncomingMessage
      ;(req as any).headers = {}

      const headers: Record<string, string> = {}
      const chunks: Buffer[] = []

      const res = {
        statusCode: 200,
        headersSent: false,
        writableEnded: false,
        setHeader: vi.fn((key: string, value: string) => {
          headers[key] = value
        }),
        writeHead: vi.fn(),
        write: vi.fn((chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          return true
        }),
        end: vi.fn((chunk?: Buffer | string) => {
          if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          ;(res as any).writableEnded = true
        }),
        on: vi.fn(),
      } as unknown as http.ServerResponse

      await handleConcatenate(req, res, undefined, tmpDir)

      // Allow stream to flush
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(res.statusCode).toBe(200)
      expect(headers['Content-Type']).toBe('application/xml')
      expect(headers['X-Kolla-Stream']).toBe('active')
      expect(headers['Content-Disposition']).toMatch(
        /concatenator-export-\d+\.xml/
      )

      const output = Buffer.concat(chunks).toString('utf-8')
      expect(output).toContain('export const v = 42;')
    })

    it('processes different output formats (text, pdf)', async () => {
      for (const format of ['text', 'pdf'] as const) {
        const payload = {
          targets: [
            {
              path: 'virtual/test.txt',
              content: 'hello world',
            },
          ],
          matrix: {
            outputFormat: format,
          },
        }

        const req = Readable.from([
          Buffer.from(JSON.stringify(payload)),
        ]) as unknown as http.IncomingMessage
        ;(req as any).headers = {}

        const headers: Record<string, string> = {}
        const res = {
          statusCode: 200,
          headersSent: false,
          writableEnded: false,
          setHeader: vi.fn((key: string, value: string) => {
            headers[key] = value
          }),
          writeHead: vi.fn(),
          write: vi.fn(),
          end: vi.fn(),
          on: vi.fn(),
        } as unknown as http.ServerResponse

        await handleConcatenate(req, res, undefined, tmpDir)
        await new Promise((resolve) => setTimeout(resolve, 50))

        const expectedExt = format === 'text' ? 'txt' : 'pdf'
        expect(headers['Content-Disposition']).toMatch(
          new RegExp(`concatenator-export-\\d+\\.${expectedExt}`)
        )
      }
    })

    it('falls back to crawler when no targets provided', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'crawled.ts'),
        'export const crawled = true;\n'
      )

      const payload = {
        customIgnores: ['*.ignored'],
        matrix: {
          outputFormat: 'markdown',
        },
      }

      const req = Readable.from([
        Buffer.from(JSON.stringify(payload)),
      ]) as unknown as http.IncomingMessage
      ;(req as any).headers = {}

      const chunks: Buffer[] = []
      const res = {
        statusCode: 200,
        headersSent: false,
        writableEnded: false,
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        write: vi.fn((chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          return true
        }),
        end: vi.fn((chunk?: Buffer | string) => {
          if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          ;(res as any).writableEnded = true
        }),
        on: vi.fn(),
      } as unknown as http.ServerResponse

      await handleConcatenate(req, res, undefined, tmpDir)
      await new Promise((resolve) => setTimeout(resolve, 100))

      const output = Buffer.concat(chunks).toString('utf-8')
      expect(output).toContain('crawled.ts')
      expect(output).toContain('export const crawled = true;')
    })

    it('returns 400 when JSON body is malformed', async () => {
      const req = Readable.from([
        Buffer.from('not valid json'),
      ]) as unknown as http.IncomingMessage
      ;(req as any).headers = {}

      let status = 0
      let body = ''
      const res = {
        headersSent: false,
        writeHead: vi.fn((code: number) => {
          status = code
        }),
        end: vi.fn((data: string) => {
          body = data
        }),
      } as unknown as http.ServerResponse

      await handleConcatenate(req, res, undefined, tmpDir)

      expect(status).toBe(400)
      expect(JSON.parse(body).error).toBe('Invalid JSON Payload')
    })
  })
})
