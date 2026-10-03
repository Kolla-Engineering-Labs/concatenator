/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config'
import http, { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'
import { mkdirSync, existsSync, statSync, createReadStream } from 'node:fs'
import { URL } from 'node:url'
import { logger } from '../../lib/logger.js'
import { DEFAULT_IGNORE_LIST } from '../../core/constants.js'
import { VFSManager } from '../../core/VFSManager.js'
import { mergeIgnoreFileWithComments } from '../../lib/ignore-file.js'
import { LifecycleManager } from '../../core/LifecycleManager.js'
import { handleConcatenate, parseJSONBody } from './controllers/concatenate.js'

// Simple in-memory rate limiter for production mode
interface RateLimiterRecord {
  count: number
  resetTime: number
}

class MicroRateLimiter {
  private records = new Map<string, RateLimiterRecord>()

  constructor(
    private windowMs: number,
    private max: number
  ) {}

  public check(ip: string): {
    allowed: boolean
    remaining: number
    reset: number
  } {
    const now = Date.now()
    const record = this.records.get(ip)

    if (!record || now > record.resetTime) {
      this.records.set(ip, {
        count: 1,
        resetTime: now + this.windowMs,
      })
      return {
        allowed: true,
        remaining: this.max - 1,
        reset: now + this.windowMs,
      }
    }

    record.count += 1
    const allowed = record.count <= this.max
    const remaining = Math.max(0, this.max - record.count)
    return { allowed, remaining, reset: record.resetTime }
  }

  public reset(): void {
    this.records.clear()
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Send JSON response
 */
function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  if (res.headersSent) return
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  })
  res.end(JSON.stringify(data))
}

/**
 * Send standard JSON error response
 */
function sendError(
  res: ServerResponse,
  statusCode: number,
  errorMessage: string,
  extraHeaders: Record<string, string> = {}
): void {
  sendJson(res, statusCode, { error: errorMessage }, extraHeaders)
}

/**
 * Read an ignore list from `primaryPath`.
 * Falls back to `.gitignore` if the primary file is absent, then to DEFAULT_IGNORE_LIST.
 */
async function resolveIgnoreList(
  primaryPath: string,
  defaultList: string[]
): Promise<string[]> {
  const tryRead = async (filePath: string): Promise<string[] | null> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '' && !l.startsWith('#'))
    } catch (e: unknown) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'ENOENT'
      ) {
        return null
      }
      throw e
    }
  }

  const primary = await tryRead(primaryPath)
  if (primary !== null) return primary

  const gitignorePath = path.join(process.cwd(), '.gitignore')
  const gitignore = await tryRead(gitignorePath)
  if (gitignore !== null) return gitignore

  return [...defaultList]
}

export async function startServer(
  portOverride?: number,
  tokenOverride?: string,
  cwdOverride?: string,
  uiOriginOverride?: string
): Promise<http.Server> {
  const PORT = portOverride ?? parseInt(process.env.PORT || '3000')

  // Load version from package.json
  let version = '0.0.0'
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const pkgContent = await fs.readFile(pkgPath, 'utf-8')
    version = JSON.parse(pkgContent).version
  } catch {
    logger.warn('Failed to read package.json for version, defaulting to 0.0.0')
  }

  const API_TOKEN =
    tokenOverride ||
    process.env.KEL_TEST_TOKEN ||
    process.env.CONCATENATOR_API_TOKEN

  if (!API_TOKEN) {
    logger.warn(
      '[Security] CONCATENATOR_API_TOKEN is not set. API endpoints are unprotected.'
    )
  }

  // Rate limiters for production mode
  const vfsRateLimiter = new MicroRateLimiter(60 * 1000, 120) // 120 per min
  const ignoreListRateLimiter = new MicroRateLimiter(15 * 60 * 1000, 100) // 100 per 15 min
  const concatenateRateLimiter = new MicroRateLimiter(60 * 1000, 100) // 100 per min

  const DEFAULT_IGNORE_FILE_PATH = path.join(
    process.cwd(),
    '.concatenate-ignore'
  )
  const IGNORE_FILES_DIR = path.resolve(process.cwd(), 'temp_ignore_files')

  try {
    mkdirSync(IGNORE_FILES_DIR, { recursive: true })
  } catch {
    logger.error('Failed to create ignore files directory')
  }

  const sanitizeWorkerId = (workerId: string | undefined): string | null => {
    if (workerId === undefined || workerId === '') return null
    if (typeof workerId !== 'string' || !/^\d+$/.test(workerId)) {
      throw new Error('Invalid workerId')
    }
    return workerId
  }

  const getIgnoreFilePath = (workerId: string | undefined): string => {
    const sanitizedId = sanitizeWorkerId(workerId)
    if (sanitizedId) {
      const fileName = `.concatenate-ignore-worker-${sanitizedId}`
      const resolvedPath = path.resolve(IGNORE_FILES_DIR, fileName)
      if (!resolvedPath.startsWith(IGNORE_FILES_DIR + path.sep)) {
        throw new Error(`Path traversal detected: ${resolvedPath}`)
      }
      return resolvedPath
    }
    return process.env.CONCATENATE_IGNORE_FILE_PATH
      ? path.resolve(process.env.CONCATENATE_IGNORE_FILE_PATH)
      : DEFAULT_IGNORE_FILE_PATH
  }

  const distPath = path.join(process.cwd(), 'dist')
  const isProduction = process.env.NODE_ENV === 'production'

  const server = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const clientIp = req.socket.remoteAddress || '127.0.0.1'
      const origin =
        uiOriginOverride || req.headers.origin || 'http://127.0.0.1:5173'

      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, OPTIONS, DELETE'
      )
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Concatenator-Token, X-Worker-Id'
      )
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-Kolla-Stream, Content-Disposition'
      )

      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      const host = req.headers.host || `127.0.0.1:${PORT}`
      const url = new URL(req.url || '/', `http://${host}`)
      const pathname = url.pathname

      // ── API Token Guard ────────────────────────────────────────────────────────
      if (API_TOKEN) {
        const isPublic =
          pathname === '/api/health' ||
          pathname === '/health' ||
          !pathname.startsWith('/api')

        if (!isPublic) {
          const providedToken = req.headers['x-concatenator-token']
          if (providedToken !== API_TOKEN) {
            console.error(
              '[AUTH FAILURE] Expected: %s | Received: %s | Headers:',
              API_TOKEN,
              providedToken,
              req.headers
            )
            sendError(res, 403, 'Zero-Trust Perimeter Violation')
            return
          }
        }
      }

      // ── Routes ─────────────────────────────────────────────────────────────────

      // POST /api/concatenate
      if (pathname === '/api/concatenate' && req.method === 'POST') {
        if (isProduction) {
          const limitCheck = concatenateRateLimiter.check(clientIp)
          if (!limitCheck.allowed) {
            sendError(
              res,
              429,
              'Rate limit exceeded. Local perimeter defense active.'
            )
            return
          }
        }
        res.setHeader(
          'Access-Control-Expose-Headers',
          'X-Kolla-Stream, Content-Disposition'
        )
        await handleConcatenate(
          req,
          res,
          API_TOKEN || '',
          cwdOverride || process.cwd()
        )
        return
      }

      // GET /api/health or /health
      if (
        (pathname === '/api/health' || pathname === '/health') &&
        req.method === 'GET'
      ) {
        sendJson(res, 200, {
          status: 'ready',
          version,
          pid: process.pid,
          uptime: Math.floor(process.uptime()),
        })
        return
      }

      // POST /api/shutdown
      if (pathname === '/api/shutdown' && req.method === 'POST') {
        logger.info('Server: Shutdown signal received via API')
        sendJson(res, 200, { success: true, message: 'Shutting down...' })

        try {
          const lifecycle = LifecycleManager.getInstance()
          await lifecycle.prepareShutdown()
          setTimeout(() => process.exit(0), 500)
        } catch (error) {
          logger.error('Server: Error during shutdown', error)
          process.exit(1)
        }
        return
      }

      // GET /api/config
      if (pathname === '/api/config' && req.method === 'GET') {
        sendJson(res, 200, {
          path: process.env.VFS_PATH,
          maxFiles: process.env.MAX_FILES
            ? parseInt(process.env.MAX_FILES)
            : undefined,
          autoSaveIgnore: false,
        })
        return
      }

      // /api/ignore-list
      if (pathname === '/api/ignore-list') {
        const queryWorkerId = url.searchParams.get('workerId') || undefined
        const headerWorkerId =
          (req.headers['x-worker-id'] as string | undefined) || undefined
        const workerId = queryWorkerId || headerWorkerId

        let ignoreFilePath: string
        try {
          ignoreFilePath = getIgnoreFilePath(workerId)
        } catch {
          sendError(res, 400, 'Bad Request: Invalid workerId')
          return
        }

        if (isProduction) {
          const limitCheck = ignoreListRateLimiter.check(clientIp)
          res.setHeader('ratelimit-limit', '100')
          if (!limitCheck.allowed) {
            sendError(res, 429, 'Rate limit exceeded.')
            return
          }
        }

        if (req.method === 'GET') {
          try {
            const list = await resolveIgnoreList(
              ignoreFilePath,
              DEFAULT_IGNORE_LIST
            )
            sendJson(res, 200, list)
          } catch (error) {
            logger.error('Error reading ignore file:', error)
            sendError(res, 500, 'Failed to read ignore list')
          }
          return
        }

        if (req.method === 'POST') {
          try {
            let body: unknown
            try {
              body = await parseJSONBody<unknown>(req, 1024 * 1024)
            } catch {
              sendError(res, 400, 'Bad Request: Invalid payload structure')
              return
            }

            // Strictly enforce single schema: { workerId?: string; patterns: string[] }. Reject raw arrays and non-matching structures.
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
              sendError(res, 400, 'Bad Request: Invalid payload structure')
              return
            }

            const bodyObj = body as Record<string, unknown>
            if (
              !Array.isArray(bodyObj.patterns) ||
              !bodyObj.patterns.every((p) => typeof p === 'string')
            ) {
              sendError(res, 400, 'Bad Request: Invalid payload structure')
              return
            }

            let postIgnoreFilePath = ignoreFilePath
            if (bodyObj.workerId !== undefined) {
              if (typeof bodyObj.workerId !== 'string') {
                sendError(res, 400, 'Bad Request: Invalid payload structure')
                return
              }
              try {
                postIgnoreFilePath = getIgnoreFilePath(bodyObj.workerId)
              } catch {
                sendError(res, 400, 'Bad Request: Invalid workerId')
                return
              }
            }

            let existingContent = ''
            try {
              existingContent = await fs.readFile(postIgnoreFilePath, 'utf-8')
            } catch {
              /* start fresh */
            }
            const mergedContent = mergeIgnoreFileWithComments(
              existingContent,
              bodyObj.patterns as string[]
            )
            await fs.writeFile(postIgnoreFilePath, mergedContent, 'utf-8')
            sendJson(res, 200, { success: true })
          } catch (error) {
            logger.error('Error writing ignore file:', error)
            sendError(res, 500, 'Failed to update ignore list')
          }
          return
        }

        if (req.method === 'DELETE') {
          if (process.env.NODE_ENV !== 'production') {
            if (ignoreFilePath === DEFAULT_IGNORE_FILE_PATH) {
              sendError(res, 400, 'Cannot delete default ignore file')
              return
            }
            try {
              await fs.unlink(ignoreFilePath).catch(() => {})
              sendJson(res, 200, { success: true })
            } catch (error) {
              logger.error('Error resetting ignore file:', error)
              sendError(res, 500, 'Failed to reset ignore list')
            }
            return
          }
        }
      }

      // GET /api/vfs
      if (pathname === '/api/vfs' && req.method === 'GET') {
        const extraHeaders: Record<string, string> = {}
        if (isProduction) {
          const limitCheck = vfsRateLimiter.check(clientIp)
          extraHeaders['ratelimit-limit'] = '120'
          if (!limitCheck.allowed) {
            sendError(res, 429, 'Rate limit exceeded.', extraHeaders)
            return
          }
        }

        try {
          const queryWorkerId = url.searchParams.get('workerId') || undefined
          const headerWorkerId =
            (req.headers['x-worker-id'] as string | undefined) || undefined
          const workerId = queryWorkerId || headerWorkerId
          let ignoreFilePath: string
          try {
            ignoreFilePath = getIgnoreFilePath(workerId)
          } catch {
            sendError(res, 400, 'Bad Request: Invalid workerId', extraHeaders)
            return
          }

          if (!process.env.VFS_PATH) {
            sendJson(res, 200, { tree: null, partial: false }, extraHeaders)
            return
          }

          const ignoreList = await resolveIgnoreList(
            ignoreFilePath,
            DEFAULT_IGNORE_LIST
          )

          const vfsRoot = path.resolve(process.cwd(), process.env.VFS_PATH)
          const maxFiles = process.env.MAX_FILES
            ? parseInt(process.env.MAX_FILES)
            : 10000
          const vfs = new VFSManager(vfsRoot, ignoreList, maxFiles)
          const result = vfs.getTree()
          sendJson(res, 200, result, extraHeaders)
        } catch (error) {
          logger.error('Error generating VFS tree:', error)
          sendError(res, 500, 'Failed to generate VFS tree', extraHeaders)
        }
        return
      }

      // GET /api/vfs/file
      if (pathname === '/api/vfs/file' && req.method === 'GET') {
        const filePath = url.searchParams.get('path')
        if (!filePath) {
          sendError(res, 400, 'Missing path parameter')
          return
        }

        const vfsRoot = process.env.VFS_PATH
          ? path.resolve(process.cwd(), process.env.VFS_PATH)
          : process.cwd()
        const fullPath = path.join(vfsRoot, filePath)

        if (!fullPath.startsWith(vfsRoot)) {
          sendError(res, 403, 'Access denied')
          return
        }

        try {
          await fs.access(fullPath)
          const buffer = await fs.readFile(fullPath)
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
          })
          res.end(buffer)
        } catch {
          sendError(res, 404, 'File not found')
        }
        return
      }

      // ── API Firewall (Zero-Trust Fallback) ──────────────────────────────────────
      if (pathname.startsWith('/api')) {
        sendError(res, 404, 'API endpoint not found or unsupported method.')
        return
      }

      // ── Static Frontend & SPA Fallback ─────────────────────────────────────────
      if (existsSync(distPath)) {
        const safeRelativePath = path
          .normalize(pathname)
          .replace(/^(\.\.[/\\])+/, '')
        const candidateFile = path.join(distPath, safeRelativePath)

        if (existsSync(candidateFile) && statSync(candidateFile).isFile()) {
          const ext = path.extname(candidateFile).toLowerCase()
          const contentType = MIME_TYPES[ext] || 'application/octet-stream'
          res.writeHead(200, { 'Content-Type': contentType })
          createReadStream(candidateFile).pipe(res)
          return
        }

        const indexFile = path.join(distPath, 'index.html')
        if (existsSync(indexFile)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          createReadStream(indexFile).pipe(res)
          return
        }
      }

      // Fallback if dist is not built
      if (pathname === '/') {
        sendError(res, 404, 'Frontend UI not built. API is active.')
        return
      }

      sendError(res, 404, 'Not Found')
    }
  )

  return new Promise((resolveServer, rejectServer) => {
    server.listen(PORT, '127.0.0.1', () => {
      const addr = server.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : PORT

      if (API_TOKEN) {
        logger.info(
          `Server running on http://127.0.0.1:${actualPort}/?token=${API_TOKEN}`
        )
      } else {
        logger.info(`Server running on http://127.0.0.1:${actualPort}`)
      }

      resolveServer(server)
    })

    server.on('error', (err) => {
      rejectServer(err)
    })
  })
}

if (!process.env.VITEST) {
  startServer()
}
