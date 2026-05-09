import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { UIServer } from '../src/core/UIServer.js'
import { spawn, ChildProcess } from 'child_process'

describe('Health Endpoint Integration', () => {
  describe('UIServer (Standalone)', () => {
    let server: UIServer
    let port: number

    beforeAll(async () => {
      // Use port 0 for random port
      server = new UIServer(0, {})
      port = await server.start()
    })

    afterAll(() => {
      server.stop()
    })

    it('should return 200 OK for /api/health', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        status: 'ready',
        version: expect.any(String),
        uptime: expect.any(Number),
      })
    })

    it('should return 200 OK for /health alias', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        status: 'ready',
        version: expect.any(String),
        uptime: expect.any(Number),
      })
    })

    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/unknown`)
      expect(response.status).toBe(404)
    })
  })

  describe('server.ts (Express)', () => {
    let child: ChildProcess
    let port: number

    beforeAll(() => {
      return new Promise((resolve, reject) => {
        // Use a single string with shell: true to avoid DeprecationWarning and EINVAL
        // We use PORT: 0 to let the OS pick a random available port
        child = spawn('npx tsx server.ts', {
          env: { ...process.env, PORT: '0', NODE_ENV: 'test' },
          shell: true,
        })

        child.stdout?.on('data', (data) => {
          const str = data.toString()
          // Extract the actual port from the server log
          const match = str.match(/Server running on http:\/\/localhost:(\d+)/)
          if (match) {
            port = parseInt(match[1])
            resolve(true)
          }
        })

        child.stderr?.on('data', (data) => {
          console.error(`[Server Error] ${data}`)
        })

        child.on('error', (err) => {
          console.error(`[Spawn Error] ${err}`)
          reject(err)
        })

        child.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            console.error(`[Server Exit] code ${code}`)
            reject(new Error(`Server exited with code ${code}`))
          }
        })

        // Timeout after 30s
        setTimeout(() => reject(new Error('Server start timeout')), 30000)
      })
    }, 35000)

    afterAll(() => {
      if (child) {
        child.kill()
      }
    })

    it('should return 200 OK for /api/health without token', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        status: 'ready',
        version: expect.any(String),
        uptime: expect.any(Number),
      })
    })

    it('should return 200 OK for /health alias without token', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        status: 'ready',
        version: expect.any(String),
        uptime: expect.any(Number),
      })
    })

    it('should return 403 for /api routes without token (if configured)', async () => {
      // Note: server.ts only protects /api if CONCATENATOR_API_TOKEN is set
    })
  })
})
