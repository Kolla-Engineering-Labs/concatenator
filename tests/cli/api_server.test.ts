/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { AddressInfo } from 'node:net'
import { startServer } from '@/server'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

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

    // Bind to port 0 for dynamic ephemeral port allocation
    server = await startServer(0, testToken, tmpDir, uiOrigin)
    port = (server.address() as AddressInfo).port
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

    const symServer = await startServer(0, testToken, symlinkPath, uiOrigin)
    const symPort = (symServer.address() as AddressInfo).port

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
        matrix: {
          outputFormat: 'markdown',
          enableNeutralization: false,
          injectManifest: true,
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/markdown')
    expect(res.headers.get('X-Kolla-Stream')).toBe('active')
    const bodyText = await res.text()
    expect(bodyText).toContain('FILE_START: test1.ts')
    expect(bodyText).toContain('console.log("hello");')
    expect(bodyText).toContain('KEL_MANIFEST_START')
  })

  it('enforces Pre-Matter Header injection even if client supplies injectManifest: false', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/concatenate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-concatenator-token': testToken,
      },
      body: JSON.stringify({
        matrix: {
          outputFormat: 'markdown',
          enableNeutralization: false,
          injectManifest: false,
        },
      }),
    })

    expect(res.status).toBe(200)
    const bodyText = await res.text()
    expect(bodyText).toContain('KEL_MANIFEST_START')
  })

  it('returns health payload on /api/health and /health without token', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/health`)
    expect(res1.status).toBe(200)
    const data1 = await res1.json()
    expect(data1.status).toBe('ready')
    expect(typeof data1.version).toBe('string')
    expect(typeof data1.uptime).toBe('number')

    const res2 = await fetch(`http://127.0.0.1:${port}/health`)
    expect(res2.status).toBe(200)
    const data2 = await res2.json()
    expect(data2.status).toBe('ready')
  })

  it('returns configuration from /api/config', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
      headers: { 'x-concatenator-token': testToken },
    })
    expect(res.status).toBe(200)
    const config = await res.json()
    expect(config).toHaveProperty('autoSaveIgnore', false)
  })

  it('handles /api/ignore-list GET, POST, and DELETE flows', async () => {
    // 1. GET initial ignore list
    const getRes = await fetch(`http://127.0.0.1:${port}/api/ignore-list`, {
      headers: {
        'x-concatenator-token': testToken,
        'x-worker-id': '999',
      },
    })
    expect(getRes.status).toBe(200)
    const initialList = await getRes.json()
    expect(Array.isArray(initialList)).toBe(true)

    // 2. POST update ignore list
    const postRes = await fetch(`http://127.0.0.1:${port}/api/ignore-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-concatenator-token': testToken,
        'x-worker-id': '999',
      },
      body: JSON.stringify({ patterns: ['*.custom-ignore', 'build/'] }),
    })
    expect(postRes.status).toBe(200)
    const postJson = await postRes.json()
    expect(postJson.success).toBe(true)

    // 3. GET verify update
    const getUpdatedRes = await fetch(
      `http://127.0.0.1:${port}/api/ignore-list`,
      {
        headers: {
          'x-concatenator-token': testToken,
          'x-worker-id': '999',
        },
      }
    )
    expect(getUpdatedRes.status).toBe(200)
    const updatedList = await getUpdatedRes.json()
    expect(updatedList).toContain('*.custom-ignore')

    // 4. POST with invalid body (missing patterns array)
    const invalidPost = await fetch(
      `http://127.0.0.1:${port}/api/ignore-list`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-concatenator-token': testToken,
          'x-worker-id': '999',
        },
        body: JSON.stringify({ not: 'an array' }),
      }
    )
    expect(invalidPost.status).toBe(400)

    // 5. POST with raw array (strictly rejected under single-schema rule)
    const rawArrayPost = await fetch(
      `http://127.0.0.1:${port}/api/ignore-list`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-concatenator-token': testToken,
          'x-worker-id': '999',
        },
        body: JSON.stringify(['*.raw-array-disallowed']),
      }
    )
    expect(rawArrayPost.status).toBe(400)

    // 6. Invalid workerId rejection in header
    const invalidWorkerRes = await fetch(
      `http://127.0.0.1:${port}/api/ignore-list`,
      {
        headers: {
          'x-concatenator-token': testToken,
          'x-worker-id': 'invalid-path-../evil',
        },
      }
    )
    expect(invalidWorkerRes.status).toBe(400)

    // 7. Invalid workerId rejection in query string
    const invalidQueryWorkerRes = await fetch(
      `http://127.0.0.1:${port}/api/ignore-list?workerId=../evil`,
      {
        headers: {
          'x-concatenator-token': testToken,
        },
      }
    )
    expect(invalidQueryWorkerRes.status).toBe(400)

    // 8. DELETE worker ignore list
    const delRes = await fetch(`http://127.0.0.1:${port}/api/ignore-list`, {
      method: 'DELETE',
      headers: {
        'x-concatenator-token': testToken,
        'x-worker-id': '999',
      },
    })
    expect(delRes.status).toBe(200)
  })

  it('handles /api/vfs and /api/vfs/file with path traversal protection', async () => {
    // 1. GET /api/vfs when VFS_PATH not set
    const originalVfsPath = process.env.VFS_PATH
    delete process.env.VFS_PATH

    const vfsNullRes = await fetch(`http://127.0.0.1:${port}/api/vfs`, {
      headers: { 'x-concatenator-token': testToken },
    })
    expect(vfsNullRes.status).toBe(200)
    const nullTree = await vfsNullRes.json()
    expect(nullTree.tree).toBeNull()

    // 2. GET /api/vfs with valid VFS_PATH
    process.env.VFS_PATH = tmpDir
    const vfsRes = await fetch(`http://127.0.0.1:${port}/api/vfs`, {
      headers: { 'x-concatenator-token': testToken },
    })
    expect(vfsRes.status).toBe(200)
    const tree = await vfsRes.json()
    expect(tree).toHaveProperty('tree')

    // 3. GET /api/vfs/file missing path param
    const missingParamRes = await fetch(
      `http://127.0.0.1:${port}/api/vfs/file`,
      {
        headers: { 'x-concatenator-token': testToken },
      }
    )
    expect(missingParamRes.status).toBe(400)

    // 4. GET /api/vfs/file valid file
    const validFileRes = await fetch(
      `http://127.0.0.1:${port}/api/vfs/file?path=test1.ts`,
      {
        headers: { 'x-concatenator-token': testToken },
      }
    )
    expect(validFileRes.status).toBe(200)
    const content = await validFileRes.text()
    expect(content).toContain('console.log("hello");')

    // 5. GET /api/vfs/file path traversal attempt
    const traversalRes = await fetch(
      `http://127.0.0.1:${port}/api/vfs/file?path=../../../../etc/passwd`,
      {
        headers: { 'x-concatenator-token': testToken },
      }
    )
    expect(traversalRes.status).toBe(403)

    // 6. GET /api/vfs/file non-existent file
    const missingFileRes = await fetch(
      `http://127.0.0.1:${port}/api/vfs/file?path=does-not-exist.ts`,
      {
        headers: { 'x-concatenator-token': testToken },
      }
    )
    expect(missingFileRes.status).toBe(404)

    // Restore env
    if (originalVfsPath) process.env.VFS_PATH = originalVfsPath
    else delete process.env.VFS_PATH
  })

  it('returns 404 for unrecognized routes', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/unknown`, {
      method: 'GET',
      headers: {
        'x-concatenator-token': testToken,
      },
    })

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toContain('API endpoint not found')
  })
})
