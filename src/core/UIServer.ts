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
import { join, resolve, dirname } from 'node:path'
import { URL, fileURLToPath } from 'node:url'
import { VFSManager } from './VFSManager.js'
import { DEFAULT_IGNORE_LIST } from './constants.js'
import { logger } from '../lib/logger.js'
import { mergeIgnoreFileWithComments } from '../lib/ignore-file.js'

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

    this.server = createServer(async (req, res) => {
      try {
        // API Routes
        const url = new URL(
          req.url || '/',
          `http://${req.headers.host || 'localhost'}`
        )
        const pathname = url.pathname

        if (pathname === '/health' && req.method === 'GET') {
          this.handleGetHealth(req, res)
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
        } else {
          // Static Assets
          this.handleStaticAssets(req, res)
        }
      } catch (error) {
        logger.error(`Error handling request ${req.url}:`, error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal Server Error' }))
      }
    })
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.on('error', reject)
      this.server.listen(this.port, '127.0.0.1', () => {
        const address = this.server.address()
        const actualPort =
          typeof address === 'object' && address ? address.port : this.port
        resolve(actualPort)
      })
    })
  }

  public stop(): void {
    this.server.close()
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
        status: 'ok',
        version,
        uptime: Math.floor(process.uptime()),
      })
    )
  }

  private handleGetConfig(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(this.uiConfig))
  }

  private handleGetIgnoreList(req: IncomingMessage, res: ServerResponse): void {
    const ignoreList = this.resolveIgnoreListSync(this.ignoreFilePath)
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
      let existingContent = ''
      if (this.fs.existsSync(this.ignoreFilePath)) {
        try {
          existingContent = this.fs.readFileSync(this.ignoreFilePath, 'utf-8')
        } catch {
          /* unreadable — treat as empty */
        }
      }
      const mergedContent = mergeIgnoreFileWithComments(existingContent, list)
      this.fs.writeFileSync(this.ignoreFilePath, mergedContent, 'utf-8')
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

    const ignoreList = this.resolveIgnoreListSync(this.ignoreFilePath)

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
}
