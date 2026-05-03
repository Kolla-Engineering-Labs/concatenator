/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createServer,
  Server,
  IncomingMessage,
  ServerResponse,
} from 'node:http'
import * as fsDefault from 'node:fs'
import { createReadStream } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { URL, fileURLToPath } from 'node:url'
import { VFSManager } from './VFSManager.js'
import { DEFAULT_IGNORE_LIST } from './constants.js'
import { logger } from '../lib/logger.js'
import { mergeIgnoreFileWithComments } from '../lib/ignore-file.js'
import { LifecycleManager } from './LifecycleManager.js'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { ARCHITECT_PGP_FINGERPRINT } from './constants.js'

export interface UIServerFileSystem {
  readFileSync: typeof fsDefault.readFileSync
  writeFileSync: typeof fsDefault.writeFileSync
  existsSync: typeof fsDefault.existsSync
  lstatSync?: typeof fsDefault.lstatSync
  readdirSync?: typeof fsDefault.readdirSync
  realpathSync?: typeof fsDefault.realpathSync
}

export interface WebAsset {
  contentType: string
  content: string // base64 encoded
}

export interface UIConfig {
  path?: string
  maxFiles?: number
  ignoreFile?: string
}

export class UIServer {
  private server: Server
  private port: number
  private assets: Record<string, WebAsset>
  private ignoreFilePath: string
  private uiConfig: UIConfig
  private shutdownToken: Buffer
  private buildHash: string = ''

  constructor(
    port: number,
    assets: Record<string, WebAsset>,
    uiConfig: UIConfig = {},
    private fs: UIServerFileSystem = fsDefault
  ) {
    this.port = port
    this.assets = assets
    this.uiConfig = uiConfig
    this.ignoreFilePath = uiConfig.ignoreFile
      ? resolve(process.cwd(), uiConfig.ignoreFile)
      : join(process.cwd(), '.concatenate-ignore')
    this.shutdownToken = Buffer.from(
      process.env.CONCATENATOR_TOKEN ||
        process.env.CONCATENATOR_SHUTDOWN_TOKEN ||
        randomBytes(32).toString('hex')
    )

    // Clear from env immediately after ingestion
    delete process.env.CONCATENATOR_TOKEN
    delete process.env.CONCATENATOR_SHUTDOWN_TOKEN

    this.calculateBuildHash()

    this.server = createServer(async (req, res) => {
      try {
        const lifecycle = LifecycleManager.getInstance()

        // API Routes
        const url = new URL(
          req.url || '/',
          `http://${req.headers.host || '127.0.0.1'}`
        )
        const pathname = url.pathname

        // 1. CORS Check (Early Exit)
        if (!this.corsMiddleware(req, res)) return

        // 2. Static Assets (Bypass Auth)
        const isApi = pathname.startsWith('/api/')
        const isHealth = pathname === '/api/health'

        if (!isApi) {
          this.handleStaticAssets(req, res)
          return
        }

        // 3. Health check (Bypass Auth)
        if (isHealth && req.method === 'GET') {
          this.handleGetHealth(req, res)
          return
        }

        // 4. Activity Middleware: update timestamp for all authenticated requests
        if (pathname !== '/api/heartbeat') {
          lifecycle.updateActiveTimestamp()
        }

        // 5. Auth Middleware (Required for all other API routes)
        if (!this.authMiddleware(req, res)) return

        // 6. Route Handling
        if (pathname === '/api/heartbeat' && req.method === 'POST') {
          this.handlePostHeartbeat(req, res)
        } else if (pathname === '/api/pulse' && req.method === 'GET') {
          this.handleGetPulse(req, res)
        } else if (pathname === '/api/config' && req.method === 'GET') {
          this.handleGetConfig(req, res)
        } else if (pathname === '/api/ignore-list' && req.method === 'GET') {
          this.handleGetIgnoreList(req, res)
        } else if (pathname === '/api/ignore-list' && req.method === 'POST') {
          await this.handlePostIgnoreList(req, res)
        } else if (pathname === '/api/ignore-list' && req.method === 'DELETE') {
          this.handleDeleteIgnoreList(req, res)
        } else if (pathname === '/api/vfs' && req.method === 'GET') {
          this.handleGetVfs(req, res)
        } else if (pathname === '/api/vfs/file' && req.method === 'GET') {
          this.handleGetVfsFile(req, res, url.searchParams)
        } else if (pathname === '/api/security/info' && req.method === 'GET') {
          this.handleGetSecurityInfo(req, res)
        } else if (pathname === '/api/shutdown' && req.method === 'POST') {
          await this.handlePostShutdown(req, res)
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Not Found' }))
        }
      } catch (error) {
        logger.error(`Error handling request ${req.url}:`, error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal Server Error' }))
      }
    })
  }

  private authMiddleware(req: IncomingMessage, res: ServerResponse): boolean {
    const providedToken = req.headers['x-concatenator-token'] as string
    if (!this.isValidToken(providedToken)) {
      logger.warn(
        `Unauthorized access attempt to ${req.url} from ${req.socket.remoteAddress}`
      )
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'Forbidden: Invalid or Missing Security Token',
        })
      )
      return false
    }
    return true
  }

  private corsMiddleware(req: IncomingMessage, res: ServerResponse): boolean {
    const origin = req.headers['origin']
    if (!origin) return true // Allow non-browser clients (CLI, etc.)

    // Strict local-only origin check
    const isLocal =
      origin === 'http://127.0.0.1' ||
      origin.startsWith('http://127.0.0.1:') ||
      origin === 'http://localhost' ||
      origin.startsWith('http://localhost:')

    if (!isLocal) {
      logger.error(
        `CORS Blocked: Illegal origin ${origin} attempted to access API`
      )
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({ error: 'Forbidden: Cross-Origin Request Blocked' })
      )
      return false
    }
    return true
  }

  public async start(): Promise<number> {
    const lifecycle = LifecycleManager.getInstance()
    lifecycle.startIdleMonitor()

    return new Promise((resolve, reject) => {
      this.server.on('error', reject)
      this.server.listen(this.port, '127.0.0.1', () => {
        const address = this.server.address()
        const actualPort =
          typeof address === 'object' && address ? address.port : this.port
        logger.debug(`UIServer: Listening on http://localhost:${actualPort}`)
        resolve(actualPort)
      })
    })
  }

  public getShutdownToken(): string {
    return this.shutdownToken.toString()
  }

  public stop(): void {
    this.purgeToken()
    this.server.close()
  }

  private isValidToken(provided: string | undefined): boolean {
    if (!provided) return false
    const providedBuf = Buffer.from(provided)
    if (providedBuf.length !== this.shutdownToken.length) return false
    return timingSafeEqual(providedBuf, this.shutdownToken)
  }

  private purgeToken(): void {
    this.shutdownToken.fill(0)
    delete process.env.CONCATENATOR_TOKEN
    delete process.env.CONCATENATOR_SHUTDOWN_TOKEN
    logger.debug('UIServer: Token purged from memory')
  }

  /**
   * Read ignore patterns from `primaryPath`, falling back to `.gitignore`
   * then `DEFAULT_IGNORE_LIST` if neither file exists.
   */
  private resolveIgnoreListSync(primaryPath: string): string[] {
    const tryRead = (filePath: string): string[] | null => {
      if (!this.fs.existsSync(filePath)) return null
      try {
        return this.fs
          .readFileSync(filePath, 'utf-8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l !== '' && !l.startsWith('#'))
      } catch {
        return null
      }
    }

    const primary = tryRead(primaryPath)
    if (primary !== null) return primary

    // Fallback: .gitignore in cwd
    const gitignore = tryRead(join(dirname(primaryPath), '.gitignore'))
    if (gitignore !== null) return gitignore

    return [...DEFAULT_IGNORE_LIST]
  }

  private getIgnoreFilePath(req: IncomingMessage): string {
    const workerId = req.headers['x-worker-id']
    if (workerId && typeof workerId === 'string') {
      return `${this.ignoreFilePath}.${workerId}`
    }
    return this.ignoreFilePath
  }

  private handleGetHealth(req: IncomingMessage, res: ServerResponse): void {
    let version = '0.0.0'
    try {
      const pkgPath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../package.json'
      )
      version = JSON.parse(this.fs.readFileSync(pkgPath, 'utf-8')).version
    } catch {
      /* ignore */
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ready',
        version,
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
      })
    )
  }

  private handlePostHeartbeat(req: IncomingMessage, res: ServerResponse): void {
    const providedToken = req.headers['x-concatenator-token'] as string
    if (!this.isValidToken(providedToken)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Forbidden: Invalid Token' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'alive', ts: Date.now() }))
  }

  private handleGetPulse(req: IncomingMessage, res: ServerResponse): void {
    const pulsePath = join(process.cwd(), '.concatenator', 'pulse.json')
    if (!fsDefault.existsSync(pulsePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Pulse not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    createReadStream(pulsePath).pipe(res)
  }

  private async handlePostShutdown(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const providedToken = req.headers['x-concatenator-token'] as string
    if (!this.isValidToken(providedToken)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Forbidden: Invalid Shutdown Token' }))
      return
    }

    logger.info('UIServer: Shutdown signal received via API')

    // Respond immediately to acknowledge the request
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, message: 'Shutting down...' }))

    // Trigger cleanup and exit
    try {
      const lifecycle = LifecycleManager.getInstance()
      await lifecycle.prepareShutdown()

      // Purge token before exit
      this.purgeToken()

      // Small delay to allow response to be sent and connections to close
      setTimeout(() => {
        process.exit(0)
      }, 500)
    } catch (error) {
      logger.error('UIServer: Error during shutdown', error)
      this.purgeToken()
      process.exit(1)
    }
  }

  private handleGetConfig(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ...this.uiConfig,
        token: this.shutdownToken.toString(),
      })
    )
  }

  private handleGetIgnoreList(req: IncomingMessage, res: ServerResponse): void {
    const path = this.getIgnoreFilePath(req)
    const ignoreList = this.resolveIgnoreListSync(path)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(ignoreList))
  }

  private async handlePostIgnoreList(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const buffers: Buffer[] = []
    for await (const chunk of req) {
      buffers.push(chunk)
    }
    const body = Buffer.concat(buffers).toString()

    try {
      const list = JSON.parse(body)
      if (!Array.isArray(list)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid ignore list format' }))
        return
      }
      // Read existing file to preserve comments, then merge
      const path = this.getIgnoreFilePath(req)
      let existingContent = ''
      if (this.fs.existsSync(path)) {
        try {
          existingContent = this.fs.readFileSync(path, 'utf-8')
        } catch {
          /* unreadable — treat as empty */
        }
      }
      const mergedContent = mergeIgnoreFileWithComments(existingContent, list)
      this.fs.writeFileSync(path, mergedContent, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to update ignore list' }))
    }
  }

  private handleDeleteIgnoreList(
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    // Usually the binary UI shouldn't need to delete the main .concatenate-ignore,
    // but we can implement it as a reset.
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'Cannot delete default ignore file in binary mode',
      })
    )
  }

  private handleGetVfs(req: IncomingMessage, res: ServerResponse): void {
    if (!this.uiConfig.path) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ tree: null, partial: false }))
      return
    }

    const path = this.getIgnoreFilePath(req)
    const ignoreList = this.resolveIgnoreListSync(path)

    const vfsRoot = resolve(process.cwd(), this.uiConfig.path)
    const vfs = new VFSManager(
      vfsRoot,
      ignoreList,
      this.uiConfig.maxFiles || 10000,
      {
        lstatSync: this.fs.lstatSync || fsDefault.lstatSync,
        readdirSync: this.fs.readdirSync || fsDefault.readdirSync,
        realpathSync: this.fs.realpathSync || fsDefault.realpathSync,
      }
    )
    const result = vfs.getTree()

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  }

  private handleGetVfsFile(
    req: IncomingMessage,
    res: ServerResponse,
    searchParams: URLSearchParams
  ): void {
    const filePath = searchParams.get('path')
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing path parameter' }))
      return
    }

    const vfsRoot = this.uiConfig.path
      ? resolve(process.cwd(), this.uiConfig.path)
      : process.cwd()
    const fullPath = join(vfsRoot, filePath)

    // Security check to prevent path traversal
    if (!fullPath.startsWith(vfsRoot)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Access denied' }))
      return
    }

    if (!this.fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'File not found' }))
      return
    }

    try {
      const buffer = this.fs.readFileSync(fullPath)
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      res.end(buffer)
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to read file' }))
    }
  }

  private handleStaticAssets(req: IncomingMessage, res: ServerResponse): void {
    let urlPath = req.url?.split('?')[0] || '/'
    if (urlPath === '/' || !this.assets[urlPath]) {
      // SPA routing fallback
      urlPath = '/index.html'
    }

    const asset = this.assets[urlPath]
    if (asset) {
      const buffer = Buffer.from(asset.content, 'base64')
      res.writeHead(200, { 'Content-Type': asset.contentType })
      res.end(buffer)
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    }
  }

  private calculateBuildHash(): void {
    try {
      const exePath = process.execPath
      const buffer = fsDefault.readFileSync(exePath)
      this.buildHash = createHash('sha256').update(buffer).digest('hex')
    } catch (err) {
      logger.warn(`Failed to calculate build hash: ${err}`)
      this.buildHash = 'unknown'
    }
  }

  private handleGetSecurityInfo(
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    let version = '0.0.0'
    try {
      const pkgPath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../package.json'
      )
      version = JSON.parse(fsDefault.readFileSync(pkgPath, 'utf-8')).version
    } catch {
      /* ignore */
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        version,
        buildHash: this.buildHash,
        fingerprint: ARCHITECT_PGP_FINGERPRINT,
      })
    )
  }
}
