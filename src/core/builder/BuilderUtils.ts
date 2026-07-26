/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  START_DELIMITER,
  END_DELIMITER,
  MANIFEST_PREFIX,
  MANIFEST_SUFFIX,
} from '../constants.js'
import type { ConcatenateInputFile } from './contracts/IFormatter.js'

/**
 * Generate a short, unique 6-character hex session ID
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
 * @param sessionId - The session ID to check
 * @param files - Array of files to check against
 * @returns true if collision detected, false otherwise
 */
export function checkSessionIdCollision(
  sessionId: string,
  files: ConcatenateInputFile[]
): boolean {
  const manifestPattern = `${MANIFEST_PREFIX}${sessionId}${MANIFEST_SUFFIX}`
  const sessionMarkerCore = `(ID: ${sessionId})${END_DELIMITER}`

  for (const file of files) {
    if (typeof file.content !== 'string') continue
    if (file.content.includes(manifestPattern)) return true
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
export function generateCollisionFreeSessionId(
  files: ConcatenateInputFile[]
): string {
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
 * Build session-specific file start marker
 *
 * @param path - File path
 * @param sessionId - Session ID
 * @returns Formatted marker string
 */
export function buildFileStartMarker(path: string, sessionId: string): string {
  return `${START_DELIMITER}${path} (ID: ${sessionId})${END_DELIMITER}`
}

/**
 * Normalize path separators and string content in an array of input files
 */
export function normalizeInputFiles(
  files: ConcatenateInputFile[]
): ConcatenateInputFile[] {
  return files.map((f) => ({
    path: f.path.replace(/\\/g, '/'),
    content: typeof f.content === 'string' ? f.content : '',
  }))
}
