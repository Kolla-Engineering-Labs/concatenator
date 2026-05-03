import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UIServer } from '../../src/core/UIServer'
import {
  writeFileSync,
  rmSync,
  mkdtempSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { request } from 'http'

describe('UIServer Coverage Extensions', () => {
  let tmpDir: string
  let server: UIServer
  let port: number
  const assets = {
    '/index.html': {
      contentType: 'text/html',
      content: Buffer.from('<h1>Index</h1>').toString('base64'),
    },
    '/script.js': {
      contentType: 'application/javascript',
      content: Buffer.from('console.log("test")').toString('base64'),
    },
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ui-cov-test-'))
    server = new UIServer(0, assets, {
      path: tmpDir,
      ignoreFile: join(tmpDir, '.concatenate-ignore'),
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
    headers: Record<string, string> = {}
  ): Promise<{ status: number; data: string; headers: any }> => {
    return new Promise((resolve, reject) => {
      const allHeaders = {
        'X-Concatenator-Token': server.getShutdownToken(),
        ...headers,
      }
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: allHeaders,
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () =>
            resolve({ status: res.statusCode || 0, data, headers: res.headers })
          )
        }
      )
      req.on('error', reject)
      req.end()
    })
  }

  describe('CORS Middleware', () => {
    it('should block non-local origins', async () => {
      const res = await makeRequest('/api/config', 'GET', {
        Origin: 'http://evil.com',
      })
      expect(res.status).toBe(403)
      expect(JSON.parse(res.data).error).toContain(
        'Cross-Origin Request Blocked'
      )
    })

    it('should allow local origins (localhost)', async () => {
      const res = await makeRequest('/api/config', 'GET', {
        Origin: 'http://localhost:3000',
      })
      expect(res.status).toBe(200)
    })

    it('should allow local origins (127.0.0.1)', async () => {
      const res = await makeRequest('/api/config', 'GET', {
        Origin: 'http://127.0.0.1:5173',
      })
      expect(res.status).toBe(200)
    })
  })

  describe('SPA Routing & Static Assets', () => {
    it('should serve deep paths using index.html fallback', async () => {
      const res = await makeRequest('/deep/path/feature')
      expect(res.status).toBe(200)
      expect(res.data).toBe('<h1>Index</h1>')
    })

    it('should serve non-html static assets correctly', async () => {
      const res = await makeRequest('/script.js')
      expect(res.status).toBe(200)
      expect(res.data).toBe('console.log("test")')
      expect(res.headers['content-type']).toBe('application/javascript')
    })
  })

  describe('Ignore List Fallbacks', () => {
    it('should fallback to .gitignore if primary ignore file is missing', async () => {
      writeFileSync(join(tmpDir, '.gitignore'), 'dist/\n*.bak')
      const res = await makeRequest('/api/ignore-list')
      expect(res.status).toBe(200)
      const list = JSON.parse(res.data)
      expect(list).toContain('dist/')
      expect(list).toContain('*.bak')
    })

    it('should fallback to default ignore list if no files exist', async () => {
      const res = await makeRequest('/api/ignore-list')
      expect(res.status).toBe(200)
      const list = JSON.parse(res.data)
      expect(list).toContain('node_modules')
      expect(list).toContain('.git')
    })
  })

  describe('Pulse & Heartbeat', () => {
    it('should handle pulse requests', async () => {
      const pulseDir = join(process.cwd(), '.concatenator')
      if (!existsSync(pulseDir)) mkdirSync(pulseDir)
      const pulsePath = join(pulseDir, 'pulse.json')
      writeFileSync(pulsePath, JSON.stringify({ status: 'ok' }))

      try {
        const res = await makeRequest('/api/pulse')
        expect(res.status).toBe(200)
        expect(JSON.parse(res.data).status).toBe('ok')
      } finally {
        rmSync(pulsePath, { force: true })
      }
    })

    it('should return 404 for missing pulse file', async () => {
      const res = await makeRequest('/api/pulse')
      expect(res.status).toBe(404)
    })

    it('should handle heartbeat requests', async () => {
      const res = await makeRequest('/api/heartbeat', 'POST')
      expect(res.status).toBe(200)
      expect(JSON.parse(res.data).status).toBe('alive')
    })

    it('should reject heartbeat with invalid token', async () => {
      const res = await makeRequest('/api/heartbeat', 'POST', {
        'X-Concatenator-Token': 'wrong',
      })
      expect(res.status).toBe(403)
    })

    it('should handle shutdown request', async () => {
      const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
        return undefined as never
      })

      // Use a shorter timeout for testing
      vi.useFakeTimers()

      const res = await makeRequest('/api/shutdown', 'POST')
      expect(res.status).toBe(200)
      expect(JSON.parse(res.data).success).toBe(true)

      vi.runAllTimers()
      expect(exitMock).toHaveBeenCalledWith(0)

      vi.useRealTimers()
      exitMock.mockRestore()
    })

    it('should return security info including version and build hash', async () => {
      const res = await makeRequest('/api/security/info', 'GET')
      expect(res.status).toBe(200)
      const data = JSON.parse(res.data)
      expect(data.version).toBeDefined()
      expect(data.buildHash).toBeDefined()
      expect(data.fingerprint).toContain('4A21')
    })
  })

  describe('Auth Middleware', () => {
    it('should reject requests with missing token', async () => {
      // makeRequest includes token by default, so we override it
      const res = await new Promise<{ status: number }>((resolve) => {
        request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/api/config',
            method: 'GET',
            headers: {}, // No token
          },
          (r) => resolve({ status: r.statusCode || 0 })
        ).end()
      })
      expect(res.status).toBe(403)
    })
  })
})
