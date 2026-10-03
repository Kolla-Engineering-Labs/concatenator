/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import * as fs from 'node:fs'
import { resolve } from 'node:path'
import {
  createConcatenationStream,
  ExecutionMatrixPayload,
  HydratedStreamFile,
} from '../../../core/engine.js'
import { SecurityViolation } from '../../../core/errors.js'
import { IgnoreEngine } from '../../../core/ignore/IgnoreEngine.js'
import { UnifiedCrawler } from '../../../core/Crawler.js'
import { DEFAULT_IGNORE_LIST } from '../../../core/constants.js'
interface TargetPayload {
  path: string
  content?: string
}

interface ClientMatrixPayload {
  outputFormat?: 'markdown' | 'xml' | 'text' | 'pdf'
  enableNeutralization?: boolean
  injectManifest?: boolean
  targets?: (string | TargetPayload)[]
}

// Circuit breaker stream body parser with 50MB ceiling
export const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024 // 50MB

export const parseJSONBody = async <T>(
  req: IncomingMessage,
  maxBytes: number = MAX_PAYLOAD_BYTES
): Promise<T> => {
  let body = ''
  let bytesReceived = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytesReceived += buffer.length
    if (bytesReceived > maxBytes) {
      req.destroy()
      const err = new Error('Payload Too Large')
      ;(err as unknown as { statusCode: number }).statusCode = 413
      throw err
    }
    body += buffer.toString('utf-8')
  }

  if (!body.trim()) {
    return {} as T
  }

  try {
    return JSON.parse(body) as T
  } catch {
    const err = new Error('Invalid JSON Payload')
    ;(err as unknown as { statusCode: number }).statusCode = 400
    throw err
  }
}

export const handleConcatenate = async (
  req: IncomingMessage,
  res: ServerResponse,
  expectedToken?: string,
  targetDirectory?: string
): Promise<void> => {
  if (expectedToken) {
    const clientToken = req.headers['x-concatenator-token']
    if (!clientToken || clientToken !== expectedToken) {
      console.warn('[KEL Protocol] Unauthorized execution attempt blocked.')
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Zero-Trust Perimeter Violation' }))
      return
    }
  }

  try {
    const body = await parseJSONBody<
      {
        matrix?: ClientMatrixPayload
        customIgnores?: string[]
      } & ClientMatrixPayload
    >(req)

    const matrixPayload = body.matrix || body
    const targets = matrixPayload.targets || body.targets || []
    const targetDir = resolve(targetDirectory || process.cwd())

    if (fs.lstatSync(targetDir).isSymbolicLink()) {
      throw new SecurityViolation(
        `Security Violation: Root execution directory '${targetDir}' is a symbolic link.`
      )
    }

    const resolvedRoot = fs.realpathSync(targetDir)
    const streamFiles: HydratedStreamFile[] = []

    if (targets && targets.length > 0) {
      for (const target of targets) {
        const targetPath = typeof target === 'string' ? target : target.path
        const targetContent =
          typeof target === 'object' ? target.content : undefined

        const safePath = targetPath.replace(/^(\.\.?[/\\])+/, '')
        const fullPath = resolve(resolvedRoot, safePath)

        if (targetContent !== undefined) {
          // Drag-and-Drop Mode: Bypass disk and pass memory string to the stream engine
          streamFiles.push({
            path: safePath,
            fullPath,
            mode: '0666',
            content: targetContent,
          })
        } else {
          // VFS Mode: Read from the local disk boundary
          if (!fullPath.startsWith(resolvedRoot)) {
            console.warn(`[SECURITY] Path traversal blocked: ${targetPath}`)
            continue
          }

          if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath)
            if (stat.isFile()) {
              const modeStr = (stat.mode & 0o777).toString(8).padStart(4, '0')
              streamFiles.push({ path: safePath, fullPath, mode: modeStr })
            }
          }
        }
      }
    } else {
      // CLI Fallback
      const customIgnores = body.customIgnores || []
      const defaultIgnores = [...DEFAULT_IGNORE_LIST, ...customIgnores]
      const ignoreEngine = new IgnoreEngine(defaultIgnores)
      const crawler = new UnifiedCrawler({
        rootPath: resolvedRoot,
        ignoreEngine,
      })
      const entries = crawler.collect(resolvedRoot)

      for (const entry of entries) {
        if (entry.kind === 'file' && entry.status === 'included') {
          const stat = fs.statSync(entry.fullPath)
          const modeStr = (stat.mode & 0o777).toString(8).padStart(4, '0')
          streamFiles.push({
            path: entry.path,
            fullPath: entry.fullPath,
            mode: modeStr,
          })
        }
      }
    }

    const matrix: ExecutionMatrixPayload = {
      outputFormat: matrixPayload.outputFormat === 'xml' ? 'xml' : 'markdown',
      enableNeutralization: Boolean(matrixPayload.enableNeutralization),
      injectManifest: true,
    }

    const webStream = createConcatenationStream(streamFiles, matrix)
    const outputFormat = matrixPayload.outputFormat || 'markdown'

    let extension = 'md'
    if (outputFormat === 'xml') extension = 'xml'
    else if (outputFormat === 'text') extension = 'txt'
    else if (outputFormat === 'pdf') extension = 'pdf'

    const filename = `concatenator-export-${Date.now()}.${extension}`

    res.statusCode = 200
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Kolla-Stream, Content-Disposition'
    )
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader(
      'Content-Type',
      outputFormat === 'xml' ? 'application/xml' : 'text/markdown'
    )
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('X-Kolla-Stream', 'active')

    const nodeReadable = Readable.fromWeb(
      webStream as unknown as import('node:stream/web').ReadableStream
    )

    // Handle client abortion and resource cleanup
    res.on('close', () => {
      if (!res.writableEnded) {
        nodeReadable.destroy()
      }
    })

    nodeReadable.on('error', (streamErr) => {
      console.error('[KEL Protocol] Stream error:', streamErr)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: streamErr.message }))
      } else {
        res.destroy(streamErr)
      }
    })

    nodeReadable.pipe(res)
  } catch (error) {
    const err = error as Error & { statusCode?: number }
    const statusCode =
      err.statusCode ||
      (err.message === 'Payload Too Large'
        ? 413
        : err.message === 'Invalid JSON Payload'
          ? 400
          : 500)
    console.error('[KEL Protocol] Synthesis failure:', err)
    if (!res.headersSent) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    } else {
      res.destroy(err)
    }
  }
}
