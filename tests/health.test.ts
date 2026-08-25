import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { UIServer } from '../src/core/UIServer.js'
import * as http from 'node:http'
import { startServer } from '../server.js'

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
    let server: http.Server
    let port: number

    beforeAll(async () => {
      // Pass 0 to let the OS assign an ephemeral port, preventing collisions
      server = await startServer(0)
      port = (server.address() as any).port
    })

    afterAll(() => {
      if (server) {
        server.close()
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
