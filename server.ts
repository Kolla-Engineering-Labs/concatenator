import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { mkdirSync, existsSync } from 'fs'
import { rateLimit } from 'express-rate-limit'
import { logger } from './src/lib/logger.js'
import { DEFAULT_IGNORE_LIST } from './src/core/constants.js'
import { VFSManager } from './src/core/VFSManager.js'
import { mergeIgnoreFileWithComments } from './src/lib/ignore-file.js'
import { LifecycleManager } from './src/core/LifecycleManager.js'
import { handleConcatenate } from './src/cli/api/controllers/concatenate.js'

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
): Promise<import('http').Server> {
  const app = express()
  const PORT = portOverride ?? parseInt(process.env.PORT || '3000')

  app.use((req, res, next) => {
    const origin =
      uiOriginOverride || req.headers.origin || 'http://127.0.0.1:5173'
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-Concatenator-Token, X-Worker-Id'
    )
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Kolla-Stream, Content-Disposition'
    )

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }
    next()
  })

  // Load version from package.json
  let version = '0.0.0'
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const pkgContent = await fs.readFile(pkgPath, 'utf-8')
    version = JSON.parse(pkgContent).version
  } catch {
    logger.warn('Failed to read package.json for version, defaulting to 0.0.0')
  }

  // ── API Token Guard ──────────────────────────────────────────────────────────
  // Reject requests that don't carry the correct X-Concatenator-Token header.
  // This prevents bots probing the local server from triggering filesystem ops.
  // Token is read from CONCATENATOR_API_TOKEN env var (set in .env).
  // Health-check and static assets bypass this guard.
  const API_TOKEN =
    tokenOverride ||
    process.env.KEL_TEST_TOKEN ||
    process.env.CONCATENATOR_API_TOKEN
  if (API_TOKEN) {
    app.use((req, res, next) => {
      // Allow health checks and static assets through without a token
      if (
        req.path === '/api/health' ||
        req.path === '/health' ||
        !req.path.startsWith('/api')
      ) {
        return next()
      }
      const provided = req.headers['x-concatenator-token']
      if (provided !== API_TOKEN) {
        console.error(
          '[AUTH FAILURE] Expected: %s | Received: %s | Headers:',
          API_TOKEN,
          provided,
          req.headers
        )
        return res.status(403).json({ error: 'Zero-Trust Perimeter Violation' })
      }
      next()
    })
  } else {
    logger.warn(
      '[Security] CONCATENATOR_API_TOKEN is not set. API endpoints are unprotected.'
    )
  }

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  ⚠️  STREAMING BOUNDARY — DO NOT REORDER — ARCHITECTURAL CONSTRAINT  ⚠️  ║
  // ╠══════════════════════════════════════════════════════════════════════════╣
  // ║  POST /api/concatenate MUST be mounted BEFORE express.json() and the   ║
  // ║  rate-limiter middleware. This is a hard architectural requirement.     ║
  // ║                                                                         ║
  // ║  WHY: express.json() calls req.read() internally to drain the socket   ║
  // ║  buffer into a string before passing control to the next handler.      ║
  // ║  This pre-drains the socket, destroying the raw IncomingMessage stream ║
  // ║  that handleConcatenate() requires to parse the JSON body itself via   ║
  // ║  its own streaming body parser (with the 1MB circuit breaker).         ║
  // ║                                                                         ║
  // ║  The controller uses Readable.fromWeb(webStream).pipe(res) to stream   ║
  // ║  the O(1) concatenation pipeline directly to the HTTP response.        ║
  // ║  express.json() must not be in scope for this route.                   ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  const localLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Rate limit exceeded. Local perimeter defense active.' },
  })

  app.use('/api/concatenate', localLimiter)

  app.post('/api/concatenate', (req, res) => {
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Kolla-Stream, Content-Disposition'
    )
    return handleConcatenate(
      req,
      res,
      API_TOKEN || '',
      cwdOverride || process.cwd()
    )
  })

  // ── Standard REST Boundary ───────────────────────────────────────────────────
  // Apply JSON body parsing ONLY to routes that require it (e.g., ignore-list)
  app.use(express.json())

  // Health check endpoint (supports both /api/health and shorter /health)
  app.get(['/api/health', '/health'], (req, res) => {
    res.json({
      status: 'ready',
      version,
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
    })
  })

  // Shutdown endpoint
  app.post('/api/shutdown', async (req, res) => {
    // Already protected by API Token Guard middleware
    logger.info('Server: Shutdown signal received via API')
    res.json({ success: true, message: 'Shutting down...' })

    try {
      const lifecycle = LifecycleManager.getInstance()
      await lifecycle.prepareShutdown()
      setTimeout(() => process.exit(0), 500)
    } catch (error) {
      logger.error('Server: Error during shutdown', error)
      process.exit(1)
    }
  })

  const ignoreListLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })

  const staticFileLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })

  const vfsFileLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // limit file fetch bursts per client IP
    standardHeaders: true,
    legacyHeaders: false,
  })

  // API Routes
  const DEFAULT_IGNORE_FILE_PATH = path.join(
    process.cwd(),
    '.concatenate-ignore'
  )
  // Safe base directory for worker-specific ignore files (CodeQL: js/path-injection prevention)
  const IGNORE_FILES_DIR = path.resolve(process.cwd(), 'temp_ignore_files')

  // Ensure the temp_ignore_files directory exists
  try {
    mkdirSync(IGNORE_FILES_DIR, { recursive: true })
  } catch {
    logger.error('Failed to create ignore files directory')
  }

  /**
   * Sanitize workerId to prevent path injection attacks.
   * Only numeric digits are allowed (since it's a workerIndex from Playwright).
   * CodeQL: https://codeql.github.com/codeql-query-help/javascript/js-path-injection/
   */
  const sanitizeWorkerId = (workerId: string | undefined): string | null => {
    if (!workerId) return null
    // Validate only numeric digits allowed
    if (!/^\d+$/.test(workerId)) {
      return null
    }
    return workerId
  }

  /**
   * Get safe ignore file path with strict validation.
   * Throws error if path traversal detected. Falls back to default if workerId invalid.
   * CodeQL: js/path-injection prevention
   */
  const getIgnoreFilePath = (workerId: string | undefined): string => {
    const sanitizedId = sanitizeWorkerId(workerId)
    if (sanitizedId) {
      const fileName = `.concatenate-ignore-worker-${sanitizedId}`
      const resolvedPath = path.join(IGNORE_FILES_DIR, fileName)
      // Final guard: throw if path traversal occurred
      if (!resolvedPath.startsWith(IGNORE_FILES_DIR + path.sep)) {
        throw new Error(`Path traversal detected: ${resolvedPath}`)
      }
      return resolvedPath
    }
    // Fallback to default ignore file if workerId is missing or invalid
    return process.env.CONCATENATE_IGNORE_FILE_PATH
      ? path.resolve(process.env.CONCATENATE_IGNORE_FILE_PATH)
      : DEFAULT_IGNORE_FILE_PATH
  }

  // Only apply rate limiting in production (skip for E2E tests)
  if (process.env.NODE_ENV === 'production') {
    app.use('/api/ignore-list', ignoreListLimiter)
    app.use('/api/vfs', vfsFileLimiter)
  }

  app.get('/api/ignore-list', async (req, res) => {
    const workerId = req.headers['x-worker-id'] as string | undefined
    let ignoreFilePath: string
    try {
      ignoreFilePath = getIgnoreFilePath(workerId)
    } catch {
      return res.status(400).json({ error: 'Invalid worker ID' })
    }
    try {
      const list = await resolveIgnoreList(ignoreFilePath, DEFAULT_IGNORE_LIST)
      res.json(list)
    } catch (error) {
      logger.error('Error reading ignore file:', error)
      res.status(500).json({ error: 'Failed to read ignore list' })
    }
  })

  app.post('/api/ignore-list', async (req, res) => {
    const workerId = req.headers['x-worker-id'] as string | undefined
    let ignoreFilePath: string
    try {
      ignoreFilePath = getIgnoreFilePath(workerId)
    } catch {
      return res.status(400).json({ error: 'Invalid worker ID' })
    }
    try {
      const list = req.body
      if (!Array.isArray(list)) {
        return res.status(400).json({ error: 'Invalid ignore list format' })
      }
      // Read existing file to preserve comments, then merge
      let existingContent = ''
      try {
        existingContent = await fs.readFile(ignoreFilePath, 'utf-8')
      } catch {
        /* file doesn't exist yet — start fresh */
      }
      const mergedContent = mergeIgnoreFileWithComments(existingContent, list)
      await fs.writeFile(ignoreFilePath, mergedContent, 'utf-8')
      res.json({ success: true })
    } catch (error) {
      logger.error('Error writing ignore file:', error)
      res.status(500).json({ error: 'Failed to update ignore list' })
    }
  })

  // Test-only endpoint to reset ignore list to defaults
  if (process.env.NODE_ENV !== 'production') {
    app.delete('/api/ignore-list', async (req, res) => {
      try {
        const workerId = req.headers['x-worker-id'] as string | undefined
        const ignoreFilePath = getIgnoreFilePath(workerId)
        // Only allow deletion of worker-specific files (not the default)
        if (ignoreFilePath === DEFAULT_IGNORE_FILE_PATH) {
          return res
            .status(400)
            .json({ error: 'Cannot delete default ignore file' })
        }
        await fs.unlink(ignoreFilePath).catch(() => {})
        res.json({ success: true })
      } catch (error) {
        logger.error('Error resetting ignore file:', error)
        res.status(500).json({ error: 'Failed to reset ignore list' })
      }
    })
  }

  app.get('/api/config', (req, res) => {
    res.json({
      path: process.env.VFS_PATH,
      maxFiles: process.env.MAX_FILES
        ? parseInt(process.env.MAX_FILES)
        : undefined,
      autoSaveIgnore: false,
    })
  })

  app.get('/api/vfs', async (req, res) => {
    try {
      const workerId = req.headers['x-worker-id'] as string | undefined
      let ignoreFilePath: string
      try {
        ignoreFilePath = getIgnoreFilePath(workerId)
      } catch {
        return res.status(400).json({ error: 'Invalid worker ID' })
      }

      if (!process.env.VFS_PATH) {
        return res.json({ tree: null, partial: false })
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
      res.json(result)
    } catch (error) {
      logger.error('Error generating VFS tree:', error)
      res.status(500).json({ error: 'Failed to generate VFS tree' })
    }
  })

  app.get('/api/vfs/file', async (req, res) => {
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: 'Missing path parameter' })
    }

    const vfsRoot = process.env.VFS_PATH
      ? path.resolve(process.cwd(), process.env.VFS_PATH)
      : process.cwd()
    const fullPath = path.join(vfsRoot, filePath)

    // Security check to prevent path traversal
    if (!fullPath.startsWith(vfsRoot)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    try {
      await fs.access(fullPath)
      const buffer = await fs.readFile(fullPath)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.send(buffer)
    } catch {
      return res.status(404).json({ error: 'File not found' })
    }
  })

  // ── API Firewall (Zero-Trust Fallback) ───────────────────────────────────────
  // Ensure unrecognized API routes return strict 404 JSON before the SPA catch-all
  // intercepts them and incorrectly returns a 200 OK with index.html.
  app.use('/api', (req, res) => {
    res
      .status(404)
      .json({ error: 'API endpoint not found or unsupported method.' })
  })

  // Vite middleware removed since we use concurrently with Vite dev server directly
  const distPath = path.join(process.cwd(), 'dist')

  if (existsSync(distPath)) {
    logger.info(`[Routing] Mounting static frontend from ${distPath}`)
    app.use(express.static(distPath))
    app.get('*', staticFileLimiter, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  } else {
    logger.warn(
      `[Routing] 'dist' directory not found. Static UI routing bypassed. Run 'npm run build'.`
    )
    // API probing fallback for when the UI isn't built
    app.get('/', (req, res) => {
      res.status(404).json({ error: 'Frontend UI not built. API is active.' })
    })
  }

  // Bind strictly to localhost — external network traffic is rejected at the OS level.
  // This prevents bots or other machines on the LAN from probing the API.
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      const addr = server.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : PORT
      logger.info(`Server running on http://localhost:${actualPort}`)
      resolve(server)
    })

    // Prevent silent hangs during EADDRINUSE collisions in parallel testing
    server.on('error', (err) => {
      reject(err)
    })
  })
}

// Prevent auto-execution during Vitest imports, but allow Playwright subprocesses to boot
if (!process.env.VITEST) {
  startServer()
}
