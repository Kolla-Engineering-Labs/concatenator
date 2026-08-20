/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { startServer } from '@/server'

describe('Node 22 Execution Boundary API Server', () => {
  let tmpDir: string
  let server: http.Server
  let port: number
  const testToken = 'test-ephemeral-token-12345'
  const uiOrigin = 'http://127.0.0.1:4000'

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kel-boundary-test-'))
    fs.writeFileSync(
      path.join(tmpDir, 'test1.ts'),
      'console.log("hello"); // test comment\n'
    )
    fs.writeFileSync(path.join(tmpDir, 'test2.json'), '{"key": "value"}\n')

    // Find dynamic open port
    port = 45000 + Math.floor(Math.random() * 5000)
    server = await startServer(port, testToken, tmpDir, uiOrigin)
  })

  afterEach(async () => {
    server.close()
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch (err) {
        console.warn(
          `[Teardown] Failed to remove temp directory (orphaned handle): ${err}`
        )
      }
    }
  })

  it('enforces symlink boundary check when execution target path is symbolic link', async () => {
    const symlinkPath = path.join(os.tmpdir(), `kel-symlink-test-${Date.now()}`)
    try {
      fs.symlinkSync(tmpDir, symlinkPath, 'dir')
    } catch {
      // Symlink creation might require admin on Windows; skip if unable
      return
    }

    const symPort = port + 1
    const symServer = await startServer(
      symPort,
      testToken,
      symlinkPath,
      uiOrigin
    )

    try {
      const res = await fetch(`http://127.0.0.1:${symPort}/api/concatenate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-concatenator-token': testToken,
        },
        body: JSON.stringify({ outputFormat: 'markdown' }),
      })

      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toContain('Security Violation')
    } finally {
      symServer.close()
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath)
      }
    }
  })

  it('handles CORS OPTIONS preflight request with dynamic uiOrigin', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/concatenate`, {
      method: 'OPTIONS',
      headers: {
        Origin: uiOrigin,
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(uiOrigin)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain(
      'X-Concatenator-Token'
    )
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain(
      'X-Kolla-Stream'
    )
  })

  it('rejects unauthenticated execution attempts with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/concatenate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ outputFormat: 'markdown' }),
    })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain('Zero-Trust Perimeter Violation')
  })

  it('rejects invalid authentication tokens with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/concatenate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-concatenator-token': 'wrong-token',
      },
      body: JSON.stringify({ outputFormat: 'markdown' }),
    })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain('Zero-Trust Perimeter Violation')
  })

  it('successfully streams concatenated payload on valid authentication token and matrix', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/concatenate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-concatenator-token': testToken,
      },
      body: JSON.stringify({
        outputFormat: 'markdown',
        enableNeutralization: true,
        injectPostMatterManifest: true,
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/markdown')
    expect(res.headers.get('X-Kolla-Stream')).toBe('active')
    const bodyText = await res.text()
    expect(bodyText).toContain('FILE_START: test1.ts')
    expect(bodyText).toContain('console.log("hello");')
    expect(bodyText).toContain('--- KEL MANIFEST ---')
  })

  it('returns 404 for unrecognized routes', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/unknown`, {
      method: 'GET',
      headers: {
        'x-concatenator-token': testToken,
      },
    })

    expect(res.status).toBe(404)
  })
})
