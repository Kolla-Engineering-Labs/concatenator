import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UIServer } from '../../src/core/UIServer'
import { request } from 'http'
import { writeFileSync, rmSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Create a helper to make HTTP requests
const fetchPath = (
  port: number,
  path: string,
  method: string = 'GET',
  body?: string
): Promise<{ status: number; data: string; headers: any }> => {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode || 500, data, headers: res.headers })
        )
      }
    )
    req.on('error', reject)
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

describe('UIServer', () => {
  let server: UIServer
  let port: number
  let tmpDir: string
  let originalCwd: () => string

  beforeEach(async () => {
    originalCwd = process.cwd
    tmpDir = mkdtempSync(join(tmpdir(), 'ui-server-test-'))
    process.cwd = () => tmpDir

    const assets = {
      '/index.html': {
        contentType: 'text/html',
        content: Buffer.from('<h1>Hello</h1>').toString('base64'),
      },
      '/app.js': {
        contentType: 'application/javascript',
        content: Buffer.from('console.log(1)').toString('base64'),
      },
    }

    server = new UIServer(0, assets as any, { path: '.' })
    port = await server.start()
  })

  afterEach(() => {
    server.stop()
    process.cwd = originalCwd
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should serve static assets', async () => {
    const res = await fetchPath(port, '/index.html')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/html')
    expect(res.data).toBe('<h1>Hello</h1>')
  })

  it('should fallback to index.html for unknown routes', async () => {
    const res = await fetchPath(port, '/some/frontend/route')
    expect(res.status).toBe(200)
    expect(res.data).toBe('<h1>Hello</h1>')
  })

  it('should handle /api/ignore-list GET', async () => {
    // Should return default ignore list initially
    const res = await fetchPath(port, '/api/ignore-list')
    expect(res.status).toBe(200)
    const list = JSON.parse(res.data)
    expect(Array.isArray(list)).toBe(true)
    expect(list).toContain('node_modules')

    // If .concatenate-ignore exists, it should serve that
    writeFileSync(
      join(tmpDir, '.concatenate-ignore'),
      'custom-ignore\nanother-one'
    )
    const res2 = await fetchPath(port, '/api/ignore-list')
    const list2 = JSON.parse(res2.data)
    expect(list2).toEqual(['custom-ignore', 'another-one'])
  })

  it('should handle /api/ignore-list POST', async () => {
    const newList = ['test1', 'test2']
    const res = await fetchPath(
      port,
      '/api/ignore-list',
      'POST',
      JSON.stringify(newList)
    )
    expect(res.status).toBe(200)

    // Verify GET now returns the new list
    const res2 = await fetchPath(port, '/api/ignore-list')
    expect(JSON.parse(res2.data)).toEqual(newList)
  })

  it('should handle invalid JSON in /api/ignore-list POST', async () => {
    const res = await fetchPath(
      port,
      '/api/ignore-list',
      'POST',
      'invalid-json'
    )
    expect(res.status).toBe(500)
    expect(JSON.parse(res.data).error).toBe('Failed to update ignore list')
  })

  it('should return 400 for non-array in /api/ignore-list POST', async () => {
    const res = await fetchPath(
      port,
      '/api/ignore-list',
      'POST',
      JSON.stringify({ not: 'an-array' })
    )
    expect(res.status).toBe(400)
    expect(JSON.parse(res.data).error).toBe('Invalid ignore list format')
  })

  it('should refuse to DELETE ignore list', async () => {
    const res = await fetchPath(port, '/api/ignore-list', 'DELETE')
    expect(res.status).toBe(400)
    expect(JSON.parse(res.data).error).toContain('Cannot delete')
  })

  it('should handle /api/vfs GET', async () => {
    const res = await fetchPath(port, '/api/vfs')
    expect(res.status).toBe(200)
    const data = JSON.parse(res.data)
    expect(data.tree).toBeDefined()
    expect(data.tree.kind).toBe('directory')
    expect(data.partial).toBeDefined()
  })

  it('should return null tree if path is not configured', async () => {
    const assets = {}
    const nullServer = new UIServer(0, assets as any, {})
    const nullPort = await nullServer.start()
    try {
      const res = await fetchPath(nullPort, '/api/vfs')
      expect(res.status).toBe(200)
      expect(JSON.parse(res.data).tree).toBeNull()
    } finally {
      nullServer.stop()
    }
  })

  describe('/api/vfs/file', () => {
    it('should serve file content successfully', async () => {
      writeFileSync(join(tmpDir, 'test.txt'), 'Hello VFS')
      const res = await fetchPath(port, '/api/vfs/file?path=test.txt')
      expect(res.status).toBe(200)
      expect(res.data).toBe('Hello VFS')
    })

    it('should return 400 if path is missing', async () => {
      const res = await fetchPath(port, '/api/vfs/file')
      expect(res.status).toBe(400)
      expect(JSON.parse(res.data).error).toBe('Missing path parameter')
    })

    it('should return 403 for path traversal attempts', async () => {
      // Try to access something outside the VFS root
      const res = await fetchPath(port, '/api/vfs/file?path=../something-else')
      expect(res.status).toBe(403)
      expect(JSON.parse(res.data).error).toBe('Access denied')
    })

    it('should return 404 for non-existent files', async () => {
      const res = await fetchPath(port, '/api/vfs/file?path=ghost.txt')
      expect(res.status).toBe(404)
      expect(JSON.parse(res.data).error).toBe('File not found')
    })

    it('should return 500 on read error', async () => {
      const res = await fetchPath(port, '/api/vfs/file?path=.') // Directory read will fail readFileSync
      expect(res.status).toBe(500)
      expect(JSON.parse(res.data).error).toBe('Failed to read file')
    })
  })

  describe('Static Assets', () => {
    it('should return 404 for truly missing assets', async () => {
      // UIServer.ts falls back to /index.html if !this.assets[urlPath]
      // So it only 404s if /index.html itself is missing.
      const brokenServer = new UIServer(0, {}, {})
      const brokenPort = await brokenServer.start()
      try {
        const res = await fetchPath(brokenPort, '/random.txt')
        expect(res.status).toBe(404)
        expect(res.data).toBe('Not Found')
      } finally {
        brokenServer.stop()
      }
    })
  })
})
