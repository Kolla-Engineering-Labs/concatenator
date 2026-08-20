import { describe, it, expect, afterEach } from 'vitest'
import * as http from 'node:http'
import { startServer } from '../server.js'

describe('Rate Limiting Integration', () => {
  let server: http.Server
  let port: number
  const API_TOKEN = 'test-token-rate-limit'

  afterEach(() => {
    if (server) {
      server.close()
    }
  })

  it('should NOT apply rate limiting in test mode', async () => {
    process.env.NODE_ENV = 'test'
    // Pass 0 to let the OS assign an ephemeral port, preventing collisions
    server = await startServer(0, API_TOKEN, '.')
    port = (server.address() as any).port
    const response = await fetch(`http://127.0.0.1:${port}/api/vfs`, {
      headers: { 'x-concatenator-token': API_TOKEN },
    })
    expect(response.status).toBe(200)
    // express-rate-limit headers should NOT be present
    expect(response.headers.get('x-ratelimit-limit')).toBeNull()
    expect(response.headers.get('ratelimit-limit')).toBeNull()
  }, 30000)

  it('should apply rate limiting in production mode', async () => {
    process.env.NODE_ENV = 'production'
    // Pass 0 to let the OS assign an ephemeral port, preventing collisions
    server = await startServer(0, API_TOKEN, '.')
    port = (server.address() as any).port
    const response = await fetch(`http://127.0.0.1:${port}/api/vfs`, {
      headers: { 'x-concatenator-token': API_TOKEN },
    })
    expect(response.status).toBe(200)
    // standardHeaders: true is used, so it should send 'ratelimit-limit'
    expect(response.headers.get('ratelimit-limit')).not.toBeNull()
    expect(response.headers.get('ratelimit-limit')).toBe('120')
  }, 30000)
})
