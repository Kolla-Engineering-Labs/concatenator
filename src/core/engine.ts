/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  START_DELIMITER,
  END_DELIMITER,
  FILE_END_DELIMITER,
  MANIFEST_PREFIX,
  POST_MATTER_MANIFEST_START,
} from './constants.js'
import type { IContextParser } from './parsers/IContextParser.js'
import {
  extractSessionId,
  extractPostMatterManifest,
} from './parsers/ParserUtils.js'
import { computeHash } from './builder/BuilderUtils.js'
import { SessionParser } from './parsers/SessionParser.js'
import { LegacyParser } from './parsers/LegacyParser.js'
import { HeaderParser } from './parsers/HeaderParser.js'
import { Neutralizer } from './shared/Neutralizer.js'

export {
  sanitizePath,
  dedupePath,
  extractPostMatterManifest,
} from './parsers/ParserUtils.js'

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

export type {
  ConcatenateInputFile,
  FormatterOptions,
  IFormatter,
} from './builder/contracts/IFormatter.js'
export type { INeutralizer } from './shared/contracts/INeutralizer.js'
export { Neutralizer }
export {
  generateSessionId,
  generateCollisionFreeSessionId,
  checkSessionIdCollision,
  generateFileTimestamp,
  computeHash,
  normalizeFileMode,
  formatPostMatterManifest,
  type PostMatterLedgerItem,
} from './builder/BuilderUtils.js'
export { concatenate, ConcatenationBuilder } from './builder/builder.js'

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
export function validateConcatenation(
  input: string,
  parsedFiles?: VirtualFile[]
): ValidationResult {
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
          if (
            !postMarkerContent.startsWith(START_DELIMITER) &&
            !postMarkerContent.startsWith(POST_MATTER_MANIFEST_START)
          ) {
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

  // 2. Two-Key Verification: Post-Matter Manifest Validation
  const manifest = extractPostMatterManifest(input)
  if (manifest) {
    if (sessionId && manifest.sessionId && sessionId !== manifest.sessionId) {
      errors.push(
        'Session ID mismatch between manifest header and Post-Matter manifest'
      )
    }

    const filesToValidate = parsedFiles ?? deconcatenate(input).files

    // FAIL CLOSED: Missing manifest entries, empty array, or mismatched lengths
    if (
      manifest.entries.length === 0 ||
      manifest.entries.length !== filesToValidate.length
    ) {
      errors.push(
        'CORRUPTION DETECTED: Post-Matter Manifest is missing, malformed, or out of sync with payload.'
      )
    } else {
      // STRICT VERIFICATION: H(M_payload) == H(M_manifest)
      const neutralizer = new Neutralizer()
      const isPostMatterValid = manifest.entries.every((entry) => {
        const extractedFile = filesToValidate.find(
          (f) => f.path.replace(/\\/g, '/') === entry.path.replace(/\\/g, '/')
        )
        if (!extractedFile) return false

        const unneutralized = neutralizer.unneutralize(extractedFile.content)
        const calculatedHash1 = computeHash(unneutralized)
        const calculatedHash2 = computeHash(extractedFile.content)
        return calculatedHash1 === entry.hash || calculatedHash2 === entry.hash
      })

      if (!isPostMatterValid) {
        errors.push(
          'CORRUPTION DETECTED: Cryptographic hash mismatch in bundle payload.'
        )
      }
    }
  } else if (input.includes(POST_MATTER_MANIFEST_START)) {
    errors.push(
      'CORRUPTION DETECTED: Post-Matter Manifest is missing, malformed, or out of sync with payload.'
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
  const neutralizer = new Neutralizer()

  for (const file of files) {
    fileMap[file.path] = neutralizer.unneutralize(file.content)
  }

  return { fileMap, skippedPaths }
}
