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

interface ClientMatrixPayload {
  outputFormat?: 'markdown' | 'xml'
  enableNeutralization?: boolean
  injectManifest?: boolean
}

// Circuit breaker stream body parser with 1MB ceiling
const MAX_PAYLOAD_BYTES = 1024 * 1024 // 1MB

const parseJSONBody = <T>(req: IncomingMessage): Promise<T> => {
  return new Promise((resolve, reject) => {
    let body = ''
    let bytesReceived = 0

    req.on('data', (chunk) => {
      bytesReceived += chunk.length
      if (bytesReceived > MAX_PAYLOAD_BYTES) {
        req.destroy() // Terminate connection immediately
        return reject(new Error('Payload Too Large'))
      }
      body += chunk.toString()
    })

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}') as T
        resolve(parsed)
      } catch {
        reject(new Error('Invalid JSON Payload'))
      }
    })

    req.on('error', (err) => {
      reject(err)
    })
  })
}

export const handleConcatenate = async (
  req: IncomingMessage,
  res: ServerResponse,
  expectedToken?: string,
  targetDirectory?: string
): Promise<void> => {
  // 1. Zero-Trust Perimeter Enforcement
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
    // 2. Extract Configuration Matrix
    const body = await parseJSONBody<{
      matrix?: ClientMatrixPayload
      customIgnores?: string[]
    }>(req)

    const matrixPayload = body.matrix || {}
    const targetDir = resolve(targetDirectory || process.cwd())

    // Symlink Boundary Check (Strict KEL Protocol Directive)
    if (fs.lstatSync(targetDir).isSymbolicLink()) {
      throw new SecurityViolation(
        `Security Violation: Root execution directory '${targetDir}' is a symbolic link.`
      )
    }

    const resolvedRoot = fs.realpathSync(targetDir)

    // 3. Scan & collect files for zero-RAM streaming
    const customIgnores = body.customIgnores || []
    const defaultIgnores = [...DEFAULT_IGNORE_LIST, ...customIgnores]
    const ignoreEngine = new IgnoreEngine(defaultIgnores)
    const crawler = new UnifiedCrawler({
      rootPath: resolvedRoot,
      ignoreEngine,
    })
    const entries = crawler.collect(resolvedRoot)

    const streamFiles: HydratedStreamFile[] = []
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

    const matrix: ExecutionMatrixPayload = {
      outputFormat: matrixPayload.outputFormat === 'xml' ? 'xml' : 'markdown',
      enableNeutralization: Boolean(matrixPayload.enableNeutralization),
      injectManifest: Boolean(matrixPayload.injectManifest),
    }

    // 4. Create Web Stream and pipe directly to HTTP response
    const webStream = createConcatenationStream(streamFiles, matrix)
    const outputFormat = matrixPayload.outputFormat || 'markdown'
    const extension = outputFormat === 'xml' ? 'xml' : 'markdown'
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
    nodeReadable.pipe(res)
  } catch (error) {
    const err = error as Error
    const statusCode = err.message === 'Payload Too Large' ? 413 : 500
    console.error('[KEL Protocol] Synthesis failure:', err)
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
}
