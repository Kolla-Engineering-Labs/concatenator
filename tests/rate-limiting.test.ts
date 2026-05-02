import { describe, it, expect, afterEach } from 'vitest'
import { spawn, ChildProcess } from 'child_process'

describe('Rate Limiting Integration', () => {
  let child: ChildProcess
  let port: number
  const API_TOKEN = 'test-token-rate-limit'

  function startServer(nodeEnv: string): Promise<number> {
    return new Promise((resolve, reject) => {
      child = spawn('npx tsx server.ts', {
        env: {
          ...process.env,
          PORT: '0',
          NODE_ENV: nodeEnv,
          CONCATENATOR_API_TOKEN: API_TOKEN,
          VFS_PATH: '.',
        },
        shell: true,
      })

      child.stdout?.on('data', (data) => {
        const str = data.toString()
        const match = str.match(/Server running on http:\/\/localhost:(\d+)/)
        if (match) {
          resolve(parseInt(match[1]))
        }
      })

      child.on('error', reject)
      setTimeout(() => reject(new Error('Server start timeout')), 30000)
    })
  }

  afterEach(() => {
    if (child) {
      child.kill()
    }
  })

  it('should NOT apply rate limiting in test mode', async () => {
    port = await startServer('test')
    const response = await fetch(`http://127.0.0.1:${port}/api/vfs`, {
      headers: { 'x-concatenator-token': API_TOKEN },
    })
    expect(response.status).toBe(200)
    // express-rate-limit headers should NOT be present
    expect(response.headers.get('x-ratelimit-limit')).toBeNull()
    expect(response.headers.get('ratelimit-limit')).toBeNull()
  }, 30000)

  it('should apply rate limiting in production mode', async () => {
    port = await startServer('production')
    const response = await fetch(`http://127.0.0.1:${port}/api/vfs`, {
      headers: { 'x-concatenator-token': API_TOKEN },
    })
    expect(response.status).toBe(200)
    // standardHeaders: true is used, so it should send 'ratelimit-limit'
    expect(response.headers.get('ratelimit-limit')).not.toBeNull()
    expect(response.headers.get('ratelimit-limit')).toBe('120')
  }, 30000)
})
