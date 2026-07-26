/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveAndJail } from '../PathValidator.js'
import { SymlinkRejectedError, PathTraversalError } from '../errors.js'
import { START_DELIMITER, END_DELIMITER } from '../constants.js'
import type { VirtualFile, TelemetryPayload } from '../engine.js'

/**
 * Extract session ID from manifest header
 *
 * Format: --- CONCATENATOR_SESSION_ID: [######] ---
 *
 * @param content - The concatenated content
 * @returns Session ID or null if not found
 */
export function extractSessionId(content: string): string | null {
  const manifestRegex = /---\s*CONCATENATOR_SESSION_ID:\s*([a-zA-Z0-9]+)\s*---/i
  const match = content.match(manifestRegex)
  return match ? match[1] : null
}

/**
 * Build session-specific file start marker regex
 *
 * @param sessionId - The session ID
 * @returns RegExp to match file start markers with this session ID
 */
export function buildFileStartRegex(sessionId: string): RegExp {
  const escapedStart = START_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = END_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(
    `${escapedStart}(.+?)\\s*\\(ID:\\s*${sessionId}\\s*\\)\\s*${escapedEnd}`,
    'g'
  )
}

/**
 * Sanitize a file path to prevent path traversal attacks
 *
 * - Removes null bytes
 * - Normalizes backslashes to forward slashes
 * - Removes leading slashes (absolute path prevention)
 * - Removes Windows drive letters
 * - Resolves ../ sequences
 *
 * @param path - The raw path from the concatenated file
 * @returns Sanitized path safe for use
 */
export function sanitizePath(path: string): string {
  const sanitized = path
    .replace(new RegExp(String.fromCharCode(0), 'g'), '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^[a-zA-Z]:\//, '')
    .replace(/^\\?\//, '')

  const parts = sanitized.split('/')
  const safeParts: string[] = []
  for (const part of parts) {
    if (part === '..') {
      if (safeParts.length > 0) {
        safeParts.pop()
      }
    } else if (part === '.' || part === '') {
      continue
    } else {
      safeParts.push(part)
    }
  }

  return safeParts.join('/')
}

/**
 * Generate a unique path by appending a counter suffix if the path already exists
 *
 * Example: file.js -> file(1).js, file(2).js, etc.
 *
 * @param path - The desired file path
 * @param existingPaths - Set of already used paths
 * @returns A unique path (original or with counter suffix)
 */
export function dedupePath(path: string, existingPaths: Set<string>): string {
  if (!existingPaths.has(path)) {
    return path
  }

  let counter = 1
  const lastDotIndex = path.lastIndexOf('.')
  const hasExtension = lastDotIndex > path.lastIndexOf('/')
  const baseName = hasExtension ? path.slice(0, lastDotIndex) : path
  const extension = hasExtension ? path.slice(lastDotIndex) : ''

  let finalPath = path
  while (existingPaths.has(finalPath)) {
    finalPath = `${baseName}(${counter})${extension}`
    counter++
  }

  return finalPath
}

/**
 * Process extracted file: sanitize path, check jailing, deduplicate, and record telemetry
 *
 * @param rawPath - Raw path string extracted from marker
 * @param fileContent - Content extracted from marker bounds
 * @param rootDir - Root directory for path jailing assertion
 * @param files - Target virtual file array
 * @param skippedPaths - Array tracking skipped raw paths
 * @param addedPaths - Set tracking accumulated unique paths
 * @param telemetry - Observability telemetry payload
 * @returns true if file was successfully validated and added, false otherwise
 */
export function processExtractedFile(
  rawPath: string,
  fileContent: string,
  rootDir: string,
  files: VirtualFile[],
  skippedPaths: string[],
  addedPaths: Set<string>,
  telemetry: TelemetryPayload
): boolean {
  const sanitizedPath = sanitizePath(rawPath)
  if (!sanitizedPath) return false

  try {
    resolveAndJail(sanitizedPath, rootDir)

    const finalPath = dedupePath(sanitizedPath, addedPaths)
    addedPaths.add(finalPath)
    files.push({ path: finalPath, content: fileContent })
    return true
  } catch (err: unknown) {
    if (err instanceof SymlinkRejectedError) {
      skippedPaths.push(rawPath)
      telemetry.skipped.push({ path: rawPath, reason: 'Symlink Rejected' })
      telemetry.symlinksRejected++
      return false
    }
    if (err instanceof PathTraversalError) {
      skippedPaths.push(rawPath)
      telemetry.skipped.push({
        path: rawPath,
        reason: 'Path Traversal Rejected',
      })
      telemetry.pathTraversalsRejected++
      return false
    }
    throw err
  }
}
