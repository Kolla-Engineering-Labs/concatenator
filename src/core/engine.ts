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
import type { IContextParser } from './parsers/IContextParser.js'
import { extractSessionId } from './parsers/ParserUtils.js'
import { SessionParser } from './parsers/SessionParser.js'
import { LegacyParser } from './parsers/LegacyParser.js'
import { HeaderParser } from './parsers/HeaderParser.js'

export { sanitizePath, dedupePath } from './parsers/ParserUtils.js'

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
 * Observability telemetry payload tracking skipped files and security rejections
 */
export interface TelemetryPayload {
  skipped: Array<{ path: string; reason: string }>
  symlinksRejected: number
  pathTraversalsRejected: number
}

/**
 * Result of parsing concatenated content
 */
export interface DeconcatenateResult {
  files: VirtualFile[]
  skippedPaths: string[]
  foundAny: boolean
  telemetry: TelemetryPayload
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
    // Defensive check: if content is not a string (e.g. ArrayBuffer from binary file), skip collision check
    if (typeof file.content !== 'string') continue

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
 * Registry of available parser strategies evaluated in order of specificity
 */
const PARSER_STRATEGIES: IContextParser[] = [
  new SessionParser(),
  new LegacyParser(),
  new HeaderParser(),
]

/**
 * Factory function to evaluate payload signature and instantiate/select the matching parser strategy
 *
 * @param content - Concatenated text content to evaluate
 * @returns The matching IContextParser strategy or null if no strategy matches
 */
export function getParserStrategy(content: string): IContextParser | null {
  for (const strategy of PARSER_STRATEGIES) {
    if (strategy.canParse(content)) {
      return strategy
    }
  }
  return null
}

/**
 * Parse concatenated content and extract individual files using strategy pattern orchestration
 *
 * @param content - The concatenated text content to parse
 * @param rootDir - Root jail boundary directory (defaults to current working dir '.')
 * @returns DeconcatenateResult with extracted files, skipped paths, and telemetry payload
 */
export function deconcatenate(
  content: string,
  rootDir = '.'
): DeconcatenateResult {
  const strategy = getParserStrategy(content)
  if (strategy) {
    return strategy.parse(content, rootDir)
  }

  return {
    files: [],
    skippedPaths: [],
    foundAny: false,
    telemetry: {
      skipped: [],
      symlinksRejected: 0,
      pathTraversalsRejected: 0,
    },
  }
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
  sessionId?: string,
  onProgress?: (progress: number) => void,
  tokenBudget?: number
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
  result += `Concatenated on: ${ts}\n`
  if (tokenBudget) {
    result += `Budget: ${tokenBudget.toLocaleString()}\n`
  }
  result += `\n`

  const totalFiles = files.length
  for (let i = 0; i < totalFiles; i++) {
    const file = files[i]
    result += `${buildFileStartMarker(file.path, sid)}\n`
    result += typeof file.content === 'string' ? file.content : ''
    result += `\n${FILE_END_DELIMITER}\n\n`

    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalFiles) * 100))
    }
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

  // 1. Strict Manifest Placement Check
  // The manifest should be the very first non-whitespace thing in the file
  if (sessionId) {
    const manifestIndex = input.indexOf(MANIFEST_PREFIX)
    if (manifestIndex > 0) {
      const leadingContent = input.substring(0, manifestIndex).trim()
      if (leadingContent.length > 0) {
        errors.push('Unauthorized content detected before session manifest')
      }
    }
  }

  // Check if first line looks like a corrupted manifest (starts with --- but wrong content)
  const lines = input.split(/\r?\n/)
  const firstLine = lines.find((l) => l.trim().length > 0) || ''
  const looksLikeCorruptedManifest =
    firstLine.startsWith('--- ') &&
    !firstLine.includes(MANIFEST_PREFIX.trim()) &&
    !firstLine.includes('--- FILE:') &&
    !sessionId

  if (!sessionId) {
    // Check for legacy formats
    const hasLegacyFormat =
      input.includes('<<<<< FILE_START:') ||
      input.includes('<<<<< CONCATENATOR_FILE_START:')
    const hasHeaderProtocol = input.includes('--- FILE:')
    if (looksLikeCorruptedManifest) {
      errors.push('Corrupted manifest header detected')
    } else if (hasLegacyFormat) {
      warnings.push(
        'No session manifest found - using legacy format validation'
      )
    } else if (hasHeaderProtocol) {
      // Header recognized
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

  const headerRegex = /--- FILE: (.+?) ---/gi

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

  // Also look for Header Protocol markers
  while ((match = headerRegex.exec(input)) !== null) {
    fileMarkers.push({
      path: match[1].trim(),
      markerSessionId: null,
      startPos: match.index,
      endPos: match.index + match[0].length,
      hasMatchingEnd: true,
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
  // We only consider other TARGET markers as boundaries, to allow
  // foreign markers (test fixtures, nested content) to exist within a file.
  for (let i = 0; i < targetMarkers.length; i++) {
    const marker = targetMarkers[i]

    const nextTargetMarkerStart =
      i < targetMarkers.length - 1
        ? targetMarkers[i + 1].startPos
        : input.length

    // Look for end marker between this start and next target start (or end of content)
    // Only required for non-header markers
    const isHeaderMarker = input
      .substring(marker.startPos, marker.endPos)
      .includes('--- FILE:')

    if (!isHeaderMarker) {
      const contentAfterStart = input.substring(
        marker.endPos,
        nextTargetMarkerStart
      )
      const hasEndMarker = contentAfterStart.includes(FILE_END_DELIMITER)
      marker.hasMatchingEnd = hasEndMarker

      if (!hasEndMarker) {
        errors.push(`Missing end marker for file: ${marker.path}`)
      } else {
        // Only add to targetFiles if it has a matching end marker (will be extracted)
        targetFiles.push(marker.path)

        const endIndex = contentAfterStart.indexOf(FILE_END_DELIMITER)

        // Check for inter-segment or trailing corruption
        const postMarkerContent = contentAfterStart
          .substring(endIndex + FILE_END_DELIMITER.length)
          .trim()
        if (postMarkerContent.length > 0) {
          // We only flag this if it's not another marker starting (which shouldn't happen here anyway as we use nextTargetMarkerStart)
          if (!postMarkerContent.startsWith(START_DELIMITER)) {
            errors.push(
              `Unauthorized data detected after end of file: ${marker.path}`
            )
          }
        }

        // Check for empty file warning
        const content = contentAfterStart.substring(0, endIndex).trim()
        if (content.length === 0) {
          warnings.push(`Empty file detected: ${marker.path}`)
        }
      }
    } else {
      // Header markers are always considered "balanced"
      targetFiles.push(marker.path)
    }

    detectedFiles.push(marker.path)
  }

  // Also add foreign files to detected list for completeness
  for (const marker of foreignMarkers) {
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
  const hasAnyMarkers = targetMarkers.length > 0 || foreignMarkers.length > 0
  const isValid = errors.length === 0 && hasAnyMarkers

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

/**
 * High-level parser that takes concatenated content and returns a file-map and skipped paths.
 * Includes "un-neutralization" logic for escaped backticks and special markers.
 *
 * @param content - The concatenated string content
 * @returns Object containing fileMap (path -> content) and skippedPaths
 */
export function parseBundle(content: string): {
  fileMap: Record<string, string>
  skippedPaths: string[]
} {
  const { files, skippedPaths } = deconcatenate(content)
  const fileMap: Record<string, string> = {}

  for (const file of files) {
    // Un-neutralize:
    // 1. Backticks: \` -> ` (Reverse of common LLM/Markdown escaping)
    // 2. Delimiter parts: \<<<<< or \>>>>> (Reverse of common manual escaping)
    const processedContent = file.content
      .replace(/\\`/g, '`')
      .replace(/\\<{5}/g, '<<<<<')
      .replace(/\\>{5}/g, '>>>>>')

    fileMap[file.path] = processedContent
  }

  return { fileMap, skippedPaths }
}
