/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveAndJail } from '../PathValidator.js'
import { SymlinkRejectedError, PathTraversalError } from '../errors.js'
import {
  START_DELIMITER,
  END_DELIMITER,
  KEL_MANIFEST_START,
  KEL_MANIFEST_END,
  POST_MATTER_MANIFEST_START,
  POST_MATTER_MANIFEST_END,
} from '../constants.js'
import { logger } from '../../lib/logger.js'
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
 * Safely validate and add an extracted file to results
 *
 * @param rawPath - The raw path from marker
 * @param fileContent - The extracted content
 * @param rootDir - Root directory boundary
 * @param files - Results array to append to
 * @param skippedPaths - Array to record skipped paths
 * @param addedPaths - Set tracking deduplicated paths
 * @param telemetry - Telemetry payload for tracking skipped files
 * @returns True if file was added, false if skipped
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
  try {
    resolveAndJail(rawPath, rootDir)
    const sanitized = sanitizePath(rawPath)
    const finalPath = dedupePath(sanitized, addedPaths)
    addedPaths.add(finalPath)
    files.push({
      path: finalPath,
      content: fileContent,
    })
    return true
  } catch (err: unknown) {
    if (err instanceof SymlinkRejectedError) {
      skippedPaths.push(rawPath)
      telemetry.skipped.push({
        path: rawPath,
        reason: 'Symbolic Link Rejected',
      })
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

export interface PostMatterEntry {
  path: string
  mode: string
  hash: string
}

export type PreMatterEntry = PostMatterEntry

export interface PostMatterManifest {
  sessionId: string | null
  entries: PostMatterEntry[]
}

export type PreMatterManifest = PostMatterManifest

/**
 * Extract Pre-Matter KEL manifest from the head of concatenated content
 *
 * Format:
 * <<<<< KEL_MANIFEST_START (ID: sessionId) >>>>>
 * path/to/file|0644|hash
 * <<<<< KEL_MANIFEST_END >>>>>
 *
 * @param content - The concatenated content
 * @returns PreMatterManifest or null if not found
 */
export function extractPreMatterManifest(
  content: string
): PreMatterManifest | null {
  const startIndex = content.indexOf(KEL_MANIFEST_START)
  if (startIndex === -1) return null

  const endIndex = content.indexOf(KEL_MANIFEST_END, startIndex)
  if (endIndex === -1) return null

  const lineEnd = content.indexOf('\n', startIndex)
  const startLine =
    lineEnd !== -1
      ? content.substring(startIndex, lineEnd)
      : content.substring(startIndex)

  const sessionMatch = startLine.match(/\(ID:\s*([a-zA-Z0-9]+)\s*\)/i)
  const sessionId = sessionMatch ? sessionMatch[1] : null

  const manifestBody = content.substring(
    lineEnd !== -1 ? lineEnd + 1 : startIndex + startLine.length,
    endIndex
  )

  const lines = manifestBody.split(/\r?\n/)
  const entries: PreMatterEntry[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split('|')
    if (parts.length >= 3) {
      entries.push({
        path: parts[0].trim(),
        mode: parts[1].trim(),
        hash: parts[2].trim(),
      })
    }
  }

  return {
    sessionId,
    entries,
  }
}

/**
 * Extract Post-Matter EOF manifest from concatenated content (legacy compatibility)
 *
 * Format:
 * <<<<< POST_MATTER_MANIFEST_START (ID: sessionId) >>>>>
 * path/to/file|0644|hash
 * <<<<< POST_MATTER_MANIFEST_END >>>>>
 *
 * @param content - The concatenated content
 * @returns PostMatterManifest or null if not found
 */
export function extractPostMatterManifest(
  content: string
): PostMatterManifest | null {
  const startIndex = content.indexOf(POST_MATTER_MANIFEST_START)
  if (startIndex === -1) return null

  logger.warn(
    '[DEPRECATION WARNING] Post-Matter EOF manifests are deprecated and will be actively rejected in v2.0.0. Migrate bundles to KEL Pre-Matter headers.'
  )

  const endIndex = content.indexOf(POST_MATTER_MANIFEST_END, startIndex)
  if (endIndex === -1) return null

  const lineEnd = content.indexOf('\n', startIndex)
  const startLine =
    lineEnd !== -1
      ? content.substring(startIndex, lineEnd)
      : content.substring(startIndex)

  const sessionMatch = startLine.match(/\(ID:\s*([a-zA-Z0-9]+)\s*\)/i)
  const sessionId = sessionMatch ? sessionMatch[1] : null

  const manifestBody = content.substring(
    lineEnd !== -1 ? lineEnd + 1 : startIndex + startLine.length,
    endIndex
  )

  const lines = manifestBody.split(/\r?\n/)
  const entries: PostMatterEntry[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split('|')
    if (parts.length >= 3) {
      entries.push({
        path: parts[0].trim(),
        mode: parts[1].trim(),
        hash: parts[2].trim(),
      })
    }
  }

  return {
    sessionId,
    entries,
  }
}
