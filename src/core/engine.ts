/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  START_DELIMITER,
  END_DELIMITER,
  FILE_END_DELIMITER,
  MANIFEST_PREFIX,
  MANIFEST_SUFFIX,
} from './constants.js'
import type { ValidationResult } from './types.js'

// Re-export types for convenience
export type { ValidationResult } from './types.js'

/**
 * Represents a virtual file with path and content
 */
export interface VirtualFile {
  path: string
  content: string
}

/**
 * Result of parsing concatenated content
 */
export interface DeconcatenateResult {
  files: VirtualFile[]
  skippedPaths: string[]
  foundAny: boolean
}

/**
 * Input file for concatenation
 */
export interface ConcatenateInputFile {
  path: string
  content: string
}

/**
 * Generate a short, unique 6-character hex session ID
 *
 * Uses cryptographically secure random number generation via Web Crypto API,
 * which is available in both modern browsers and Node.js 15+.
 *
 * @returns 6-character hexadecimal string
 */
export function generateSessionId(): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Check if session ID would cause marker collisions within file contents
 *
 * Only checks for complete marker patterns that would actually cause parsing issues:
 * 1. The session-specific manifest header pattern
 * 2. The session-specific file start marker pattern
 *
 * Raw session ID substrings or individual delimiter components are ignored
 * to avoid false positives in source code with hex strings, variable names, etc.
 *
 * @param sessionId - The session ID to check
 * @param files - Array of files to check against
 * @returns true if collision detected, false otherwise
 */
function checkSessionIdCollision(
  sessionId: string,
  files: ConcatenateInputFile[]
): boolean {
  // Build the patterns that would actually cause issues if they existed in source
  const manifestPattern = `${MANIFEST_PREFIX}${sessionId}${MANIFEST_SUFFIX}`
  const sessionMarkerCore = `(ID: ${sessionId})${END_DELIMITER}`

  for (const file of files) {
    // Check for manifest header collision
    if (file.content.includes(manifestPattern)) return true

    // Check for session-specific marker collision
    // This pattern includes the session ID and would cause the deconcatenator
    // to mistakenly identify this as a file boundary
    if (file.content.includes(sessionMarkerCore)) return true
  }
  return false
}

/**
 * Generate a collision-free session ID
 *
 * @param files - Array of files to check for collisions
 * @returns A unique session ID guaranteed not to exist in content
 */
function generateCollisionFreeSessionId(files: ConcatenateInputFile[]): string {
  let sessionId = generateSessionId()
  let attempts = 0
  const maxAttempts = 100

  while (checkSessionIdCollision(sessionId, files) && attempts < maxAttempts) {
    sessionId = generateSessionId()
    attempts++
  }

  if (attempts >= maxAttempts) {
    throw new Error(
      'Failed to generate collision-free session ID after 100 attempts'
    )
  }

  return sessionId
}

/**
 * Extract session ID from manifest header
 *
 * Format: --- CONCATENATOR_SESSION_ID: [######] ---
 *
 * @param content - The concatenated content
 * @returns Session ID or null if not found
 */
function extractSessionId(content: string): string | null {
  const firstLine = content.split('\n')[0]
  if (!firstLine) return null

  const prefixIndex = firstLine.indexOf(MANIFEST_PREFIX)
  if (prefixIndex === -1) return null

  const idStart = prefixIndex + MANIFEST_PREFIX.length
  const suffixIndex = firstLine.indexOf(MANIFEST_SUFFIX, idStart)
  if (suffixIndex === -1) return null

  return firstLine.substring(idStart, suffixIndex)
}

/**
 * Build session-specific file start marker regex
 *
 * @param sessionId - The session ID
 * @returns RegExp to match file start markers with this session ID
 */
function buildFileStartRegex(sessionId: string): RegExp {
  // Escape special chars in delimiters for regex
  const escapedStart = START_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = END_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Pattern: START_DELIMITER + (path) + " (ID: " + sessionId + ")" + END_DELIMITER
  // We use a capturing group for the path portion
  return new RegExp(
    `${escapedStart}(.+?)\\s*\\(ID:\\s*${sessionId}\\s*\\)${escapedEnd}`,
    'g'
  )
}

/**
 * Parse concatenated content and extract individual files using session-aware parsing
 *
 * Handles fault tolerance for:
 * - Missing FILE_END_DELIMITER (LLM hallucinations, deletions, truncation)
 * - Malformed markers or nested delimiters
 * - Path traversal attempts (sanitizes paths)
 * - Duplicate paths (renames with counter suffix)
 * - Legacy/foreign delimiters from other sessions (ignored)
 *
 * @param content - The concatenated text content to parse
 * @returns DeconcatenateResult with extracted files and skipped paths
 */
export function deconcatenate(content: string): DeconcatenateResult {
  const files: VirtualFile[] = []
  const skippedPaths: string[] = []
  const addedPaths = new Set<string>()

  // Extract session ID from manifest
  const sessionId = extractSessionId(content)
  if (!sessionId) {
    // No manifest found - could be legacy format or invalid
    // Try to detect if this looks like old format
    const hasOldFormat = content.includes('<<<<< FILE_START:')
    if (hasOldFormat) {
      // Try legacy parsing (no session ID filtering)
      return deconcatenateLegacy(content)
    }
    return { files: [], skippedPaths: [], foundAny: false }
  }

  // Build regex for finding all file start markers with this session ID
  const fileStartRegex = buildFileStartRegex(sessionId)
  const fileEndDelimiter = FILE_END_DELIMITER

  // Find all potential file markers with their positions
  const matches: Array<{
    path: string
    contentStart: number
    fullMatchEnd: number
  }> = []
  let match

  while ((match = fileStartRegex.exec(content)) !== null) {
    matches.push({
      path: match[1].trim(),
      contentStart: match.index + match[0].length,
      fullMatchEnd: match.index + match[0].length,
    })
  }

  let foundAny = false

  for (let i = 0; i < matches.length; i++) {
    const { path, contentStart } = matches[i]
    const nextMatchStart =
      i < matches.length - 1
        ? matches[i + 1].fullMatchEnd -
          matches[i + 1].path.length -
          START_DELIMITER.length -
          END_DELIMITER.length -
          10 /* approx */
        : null

    // Find the end delimiter for this file
    const fileEndIndex = content.indexOf(fileEndDelimiter, contentStart)

    // Partial File Detection
    if (
      fileEndIndex === -1 ||
      (nextMatchStart !== null && fileEndIndex > nextMatchStart)
    ) {
      skippedPaths.push(path || '(unknown path)')
      continue
    }

    // Extract and clean file content
    let fileContent = content.substring(contentStart, fileEndIndex)
    fileContent = fileContent.replace(/^[\r\n]+|[\r\n]+$/g, '')

    // Sanitize path
    const sanitizedPath = sanitizePath(path)
    if (sanitizedPath) {
      const finalPath = dedupePath(sanitizedPath, addedPaths)
      addedPaths.add(finalPath)
      files.push({ path: finalPath, content: fileContent })
      foundAny = true
    }
  }

  return { files, skippedPaths, foundAny }
}

/**
 * Legacy deconcatenate parser for backwards compatibility
 * Handles old format without session IDs
 *
 * @param content - Legacy concatenated content
 * @returns DeconcatenateResult
 */
function deconcatenateLegacy(content: string): DeconcatenateResult {
  const files: VirtualFile[] = []
  const skippedPaths: string[] = []
  const addedPaths = new Set<string>()

  let searchIndex = 0
  let foundAny = false

  while (true) {
    const startIndex = content.indexOf(START_DELIMITER, searchIndex)
    if (startIndex === -1) break

    const pathStart = startIndex + START_DELIMITER.length
    const pathEnd = content.indexOf(END_DELIMITER, pathStart)
    if (pathEnd === -1) break

    const nextStartDelimiter = content.indexOf(START_DELIMITER, pathStart)
    const contentStartRaw = pathEnd + END_DELIMITER.length
    const fileEndIndex = content.indexOf(FILE_END_DELIMITER, contentStartRaw)

    const path = content.substring(pathStart, pathEnd).trim()

    if (
      fileEndIndex === -1 ||
      (nextStartDelimiter !== -1 && nextStartDelimiter < fileEndIndex)
    ) {
      skippedPaths.push(path || '(unknown path)')
      searchIndex =
        nextStartDelimiter !== -1 ? nextStartDelimiter : content.length
      continue
    }

    const sanitizedPath = sanitizePath(path)
    let fileContent = content.substring(contentStartRaw, fileEndIndex)
    fileContent = fileContent.replace(/^[\r\n]+|[\r\n]+$/g, '')

    if (sanitizedPath) {
      const finalPath = dedupePath(sanitizedPath, addedPaths)
      addedPaths.add(finalPath)
      files.push({ path: finalPath, content: fileContent })
      foundAny = true
    }

    searchIndex = fileEndIndex + FILE_END_DELIMITER.length
  }

  return { files, skippedPaths, foundAny }
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
    // Remove null bytes (using char code to avoid ESLint control-regex error)
    .replace(new RegExp(String.fromCharCode(0), 'g'), '')
    // Normalize backslashes to forward slashes for security
    .replace(/\\/g, '/')
    // Remove leading slashes (absolute path prevention)
    .replace(/^\/+/, '')
    // Remove Windows drive letters (C:, D:, etc.)
    .replace(/^[a-zA-Z]:\//, '')
    // Remove UNC path prefixes (\\?\)
    .replace(/^\\?\//, '')

  // Resolve all ../ sequences throughout the path using stack-based normalization
  const parts = sanitized.split('/')
  const safeParts: string[] = []
  for (const part of parts) {
    if (part === '..') {
      // Attempt to traverse up - pop the last safe directory if possible
      if (safeParts.length > 0) {
        safeParts.pop()
      }
      // If at root, ignore the .. (can't go above root)
    } else if (part === '.' || part === '') {
      // Skip current directory references and empty parts
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
 * Build session-specific file start marker
 *
 * @param path - File path
 * @param sessionId - Session ID
 * @returns Formatted marker string
 */
function buildFileStartMarker(path: string, sessionId: string): string {
  return `${START_DELIMITER}${path} (ID: ${sessionId})${END_DELIMITER}`
}

/**
 * Concatenate multiple files into a single text output with session-based delimiters
 *
 * Format:
 *   --- CONCATENATOR_SESSION_ID: [######] ---
 *   Concatenated on: {timestamp}
 *
 *   <<<<< FILE_START: {path} (ID: ######) >>>>>
 *   {content}
 *   <<<<< FILE_END >>>>>
 *
 * @param files - Array of files to concatenate
 * @param timestamp - Optional timestamp string (defaults to current locale time)
 * @param sessionId - Optional session ID (generated if not provided, collision-checked)
 * @returns Concatenated text content with manifest header
 */
export function concatenate(
  files: ConcatenateInputFile[],
  timestamp?: string,
  sessionId?: string
): string {
  const ts = timestamp || new Date().toLocaleString()
  const sid = sessionId || generateCollisionFreeSessionId(files)

  // Validate provided session ID doesn't collide
  if (sessionId && checkSessionIdCollision(sessionId, files)) {
    throw new Error(
      `Provided session ID '${sessionId}' collides with file content`
    )
  }

  // Manifest header with session ID
  let result = `${MANIFEST_PREFIX}${sid}${MANIFEST_SUFFIX}\n`
  result += `Concatenated on: ${ts}\n\n`

  for (const file of files) {
    result += `${buildFileStartMarker(file.path, sid)}\n`
    result += file.content
    result += `\n${FILE_END_DELIMITER}\n\n`
  }

  return result
}

/**
 * Generate a filename-safe timestamp for output files
 *
 * Format: YYYYMMDD_HHIISS
 *
 * @param date - Optional date (defaults to now)
 * @returns Timestamp string safe for filenames
 */
export function generateFileTimestamp(date: Date = new Date()): string {
  const YYYY = date.getFullYear()
  const MM = String(date.getMonth() + 1).padStart(2, '0')
  const DD = String(date.getDate()).padStart(2, '0')
  const HH = String(date.getHours()).padStart(2, '0')
  const II = String(date.getMinutes()).padStart(2, '0')
  const SS = String(date.getSeconds()).padStart(2, '0')

  return `${YYYY}${MM}${DD}_${HH}${II}${SS}`
}

/**
 * Validate a concatenated content string without extracting files
 *
 * Performs structural analysis to detect:
 * - Valid/invalid manifest header
 * - Session ID consistency
 * - Balanced file markers (every START has an END)
 * - Mismatched or corrupted markers
 *
 * @param input - The concatenated content string to validate
 * @returns ValidationResult with detailed findings
 */
export function validateConcatenation(input: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const detectedFiles: string[] = []
  const targetFiles: string[] = []
  const foreignFiles: string[] = []

  // Extract session ID from manifest header
  const sessionId = extractSessionId(input)

  // Check if first line looks like a corrupted manifest (starts with --- but wrong content)
  const firstLine = input.split('\n')[0] || ''
  const looksLikeCorruptedManifest =
    firstLine.startsWith('--- ') &&
    !firstLine.includes(MANIFEST_PREFIX.trim()) &&
    !sessionId

  if (!sessionId) {
    // Check for legacy format
    const hasLegacyFormat =
      input.includes('<<<<< FILE_START:') ||
      input.includes('<<<<< CONCATENATOR_FILE_START:')
    if (looksLikeCorruptedManifest) {
      errors.push('Corrupted manifest header detected')
    } else if (hasLegacyFormat) {
      warnings.push(
        'No session manifest found - using legacy format validation'
      )
    } else {
      errors.push('No valid session manifest header found')
    }
  }

  // Find all file start markers with their positions
  const fileMarkers: Array<{
    path: string
    markerSessionId: string | null
    startPos: number
    endPos: number
    hasMatchingEnd: boolean
  }> = []

  // Build regex to find all start markers (with or without session ID)
  const escapedStart = START_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = END_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Pattern matches: START_DELIMITER + path + optional " (ID: xxx)" + END_DELIMITER
  // Session ID can be any alphanumeric string
  const startMarkerRegex = new RegExp(
    `${escapedStart}(.+?)(?:\\s*\\(ID:\\s*([a-zA-Z0-9]+)\\s*\\))?${escapedEnd}`,
    'gi'
  )

  let match
  while ((match = startMarkerRegex.exec(input)) !== null) {
    // match[1] contains: "path" or "path (ID: xxx)"
    const rawPath = match[1].trim()
    let path = rawPath
    let markerSessionId: string | null = match[2] || null

    // If no session ID captured by regex, check if it's embedded in the path
    if (!markerSessionId) {
      const sessionMatch = rawPath.match(/\s*\(ID:\s*([a-zA-Z0-9]+)\s*\)$/i)
      if (sessionMatch) {
        markerSessionId = sessionMatch[1]
        path = rawPath.substring(0, rawPath.indexOf('(ID:')).trim()
      }
    }

    const startPos = match.index
    const endPos = match.index + match[0].length

    fileMarkers.push({
      path,
      markerSessionId,
      startPos,
      endPos,
      hasMatchingEnd: false, // Will be determined below
    })
  }

  // Classify markers as target (matching session or legacy no-session) vs foreign (different session)
  const targetMarkers: typeof fileMarkers = []
  const foreignMarkers: typeof fileMarkers = []

  for (const marker of fileMarkers) {
    // Target if: no manifest session (legacy), or marker matches manifest session
    // Foreign if: manifest has session AND marker has different session
    const isTarget = !sessionId || marker.markerSessionId === sessionId
    if (isTarget) {
      targetMarkers.push(marker)
    } else {
      foreignMarkers.push(marker)
      foreignFiles.push(marker.path)
    }
  }

  // Add warning if foreign markers detected
  if (foreignMarkers.length > 0) {
    warnings.push(
      `Note: Detected ${foreignMarkers.length} markers with mismatched Session IDs. These are likely test fixtures or nested content and will be ignored during extraction.`
    )
  }

  // Check each target file marker for matching end marker
  for (let i = 0; i < fileMarkers.length; i++) {
    const marker = fileMarkers[i]
    // Target if: no manifest session (legacy), or marker matches manifest session
    const isTarget = !sessionId || marker.markerSessionId === sessionId

    const nextMarkerStart =
      i < fileMarkers.length - 1 ? fileMarkers[i + 1].startPos : input.length

    // Look for end marker between this start and next start (or end of content)
    const contentAfterStart = input.substring(marker.endPos, nextMarkerStart)
    const hasEndMarker = contentAfterStart.includes(FILE_END_DELIMITER)

    marker.hasMatchingEnd = hasEndMarker

    // Report errors for target files and session mismatches
    if (isTarget) {
      if (!hasEndMarker) {
        errors.push(`Missing end marker for file: ${marker.path}`)
      } else {
        // Only add to targetFiles if it has a matching end marker (will be extracted)
        targetFiles.push(marker.path)

        // Check for empty file warning
        const endIndex = contentAfterStart.indexOf(FILE_END_DELIMITER)
        const content = contentAfterStart.substring(0, endIndex).trim()
        if (content.length === 0) {
          warnings.push(`Empty file detected: ${marker.path}`)
        }
      }
    } else if (
      sessionId &&
      marker.markerSessionId &&
      marker.markerSessionId !== sessionId
    ) {
      // Session ID mismatch: marker has different ID than manifest
      errors.push(
        `Session ID mismatch in marker for ${marker.path}: expected ${sessionId}, found ${marker.markerSessionId}`
      )
    }

    detectedFiles.push(marker.path)
  }

  // Count orphaned end markers (end markers without preceding start)
  const endMarkerCount = (input.match(/<<<<< FILE_END >>>>>/g) || []).length
  const startMarkerCount = fileMarkers.length

  if (endMarkerCount > startMarkerCount) {
    const orphanedCount = endMarkerCount - startMarkerCount
    errors.push(
      `${orphanedCount} orphaned end marker(s) found without matching start markers`
    )
  }

  // Determine overall validity based on TARGET markers only
  // Valid if: no errors AND (has session-based target markers OR valid legacy format)
  // Invalid if: has errors OR (no sessionId AND no valid markers)
  const hasValidTargetMarkers =
    targetMarkers.length > 0 && targetMarkers.some((m) => m.hasMatchingEnd)
  const isValid = errors.length === 0 && hasValidTargetMarkers

  return {
    isValid,
    sessionId,
    fileCount: targetMarkers.filter((m) => m.hasMatchingEnd).length,
    detectedFiles,
    errors,
    warnings,
    // Segmented validation counts
    targetFileCount: targetMarkers.filter((m) => m.hasMatchingEnd).length,
    foreignFileCount: foreignMarkers.length,
    totalMarkersFound: fileMarkers.length,
    targetFiles,
    foreignFiles,
  }
}
