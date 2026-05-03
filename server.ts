import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { mkdirSync } from 'fs'
import { rateLimit } from 'express-rate-limit'
import { logger } from './src/lib/logger.js'
import { DEFAULT_IGNORE_LIST } from './src/core/constants.js'
import { VFSManager } from './src/core/VFSManager.js'
import { mergeIgnoreFileWithComments } from './src/lib/ignore-file.js'
import { LifecycleManager } from './src/core/LifecycleManager.js'

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

async function startServer() {
  const app = express()
  const PORT = parseInt(process.env.PORT || '3000')

  app.use(express.json())
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
  const API_TOKEN = process.env.CONCATENATOR_API_TOKEN
  if (API_TOKEN) {
    app.use((req, res, next) => {
      // Allow health checks and static assets through without a token
      if (req.path === '/api/health' || !req.path.startsWith('/api')) {
        return next()
      }
      const provided = req.headers['x-concatenator-token']
      if (provided !== API_TOKEN) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      next()
    })
  } else {
    logger.warn(
      '[Security] CONCATENATOR_API_TOKEN is not set. API endpoints are unprotected.'
    )
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
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
      maxFiles: 10000,
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
      const vfs = new VFSManager(vfsRoot, ignoreList, 10000)
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

  // Vite middleware removed since we use concurrently with Vite dev server directly
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.get('*', staticFileLimiter, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  // Bind strictly to localhost — external network traffic is rejected at the OS level.
  // This prevents bots or other machines on the LAN from probing the API.
  const server = app.listen(PORT, '127.0.0.1', () => {
    const addr = server.address()
    const actualPort = typeof addr === 'object' && addr ? addr.port : PORT
    logger.info(`Server running on http://localhost:${actualPort}`)
  })
}

startServer()
