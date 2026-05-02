import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UIServer, UIServerFileSystem } from '../../src/core/UIServer'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { request } from 'http'
import * as fs from 'node:fs'

describe('UIServer', () => {
  let tmpDir: string
  let server: UIServer
  let port: number
  const assets = {
    '/index.html': {
      contentType: 'text/html',
      content: Buffer.from('<h1>Test</h1>').toString('base64'),
    },
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ui-test-'))
    server = new UIServer(0, assets, {
      path: tmpDir,
      ignoreFile: join(tmpDir, '.ignore'),
    })
    port = await server.start()
  })

  afterEach(() => {
    server.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const makeRequest = (
    path: string,
    method = 'GET',
    body?: string
  ): Promise<{ status: number; data: string }> => {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: body ? { 'Content-Length': Buffer.byteLength(body) } : {},
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => resolve({ status: res.statusCode || 0, data }))
        }
      )
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })
  }

  it('should serve health check', async () => {
    const res = await makeRequest('/health')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.data).status).toBe('ok')
  })

  it('should serve config', async () => {
    const res = await makeRequest('/api/config')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.data).path).toBe(tmpDir)
  })

  it('should get ignore list', async () => {
    writeFileSync(join(tmpDir, '.ignore'), 'node_modules\n*.log')
    const res = await makeRequest('/api/ignore-list')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.data)).toContain('node_modules')
  })

  it('should update ignore list', async () => {
    const res = await makeRequest(
      '/api/ignore-list',
      'POST',
      JSON.stringify(['new-rule'])
    )
    expect(res.status).toBe(200)
    expect(fs.readFileSync(join(tmpDir, '.ignore'), 'utf-8')).toContain(
      'new-rule'
    )
  })

  it('should get vfs file', async () => {
    writeFileSync(join(tmpDir, 'test.txt'), 'hello world')
    const res = await makeRequest('/api/vfs/file?path=test.txt')
    expect(res.status).toBe(200)
    expect(res.data).toBe('hello world')
  })

  it('should serve static assets', async () => {
    const res = await makeRequest('/index.html')
    expect(res.status).toBe(200)
    expect(res.data).toBe('<h1>Test</h1>')
  })

  it('should fallback to index.html for unknown assets (SPA routing)', async () => {
    const res = await makeRequest('/unknown-page')
    expect(res.status).toBe(200)
    expect(res.data).toBe('<h1>Test</h1>')
  })

  it('should return 400 for DELETE /api/ignore-list', async () => {
    const res = await makeRequest('/api/ignore-list', 'DELETE')
    expect(res.status).toBe(400)
  })

  it('should get vfs tree', async () => {
    writeFileSync(join(tmpDir, 'test.txt'), 'hello')
    const res = await makeRequest('/api/vfs')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.data).tree.children).toBeDefined()
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON in POST /api/ignore-list', async () => {
      const res = await makeRequest('/api/ignore-list', 'POST', 'invalid json')
      expect(res.status).toBe(500)
    })

    it('should handle non-array in POST /api/ignore-list', async () => {
      const res = await makeRequest(
        '/api/ignore-list',
        'POST',
        JSON.stringify({ not: 'an array' })
      )
      expect(res.status).toBe(400)
    })

    it('should handle path traversal in /api/vfs/file', async () => {
      const res = await makeRequest('/api/vfs/file?path=../outside.txt')
      expect(res.status).toBe(403)
      expect(JSON.parse(res.data).error).toBe('Access denied')
    })

    it('should handle missing path in /api/vfs/file', async () => {
      const res = await makeRequest('/api/vfs/file')
      expect(res.status).toBe(400)
    })

    it('should handle file not found in /api/vfs/file', async () => {
      const res = await makeRequest('/api/vfs/file?path=nonexistent.txt')
      expect(res.status).toBe(404)
    })

    it('should handle read errors in /api/vfs/file', async () => {
      const mockFs: UIServerFileSystem = {
        ...fs,
        readFileSync: ((path: any) => {
          if (path.toString().endsWith('broken.txt'))
            throw new Error('Read error')
          return fs.readFileSync(path)
        }) as any,
        existsSync: (path) => {
          if (path.toString().endsWith('broken.txt')) return true
          return fs.existsSync(path)
        },
      }
      const errServer = new UIServer(0, assets, { path: tmpDir }, mockFs)
      const errPort = await errServer.start()
      try {
        const res = await new Promise<{ status: number; data: string }>(
          (resolve) => {
            request(
              {
                hostname: '127.0.0.1',
                port: errPort,
                path: '/api/vfs/file?path=broken.txt',
              },
              (r) => {
                let d = ''
                r.on('data', (c) => (d += c))
                r.on('end', () =>
                  resolve({ status: r.statusCode || 0, data: d })
                )
              }
            ).end()
          }
        )
        expect(res.status).toBe(500)
      } finally {
        errServer.stop()
      }
    })

    it('should handle ignore list update errors when write fails', async () => {
      const mockFs: UIServerFileSystem = {
        ...fs,
        writeFileSync: () => {
          throw new Error('Write Failed')
        },
      }
      const errServer = new UIServer(
        0,
        assets,
        { ignoreFile: join(tmpDir, 'err.ignore') },
        mockFs
      )
      const errPort = await errServer.start()

      try {
        const res = await new Promise<{ status: number; data: string }>(
          (resolve, reject) => {
            const req = request(
              {
                hostname: '127.0.0.1',
                port: errPort,
                path: '/api/ignore-list',
                method: 'POST',
              },
              (res) => {
                let data = ''
                res.on('data', (chunk) => (data += chunk))
                res.on('end', () =>
                  resolve({ status: res.statusCode || 0, data })
                )
              }
            )
            req.on('error', reject)
            req.write(JSON.stringify(['test']))
            req.end()
          }
        )
        expect(res.status).toBe(500)
        expect(JSON.parse(res.data).error).toBe('Failed to update ignore list')
      } finally {
        errServer.stop()
      }
    })
  })
})
