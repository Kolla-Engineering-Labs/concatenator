/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  START_DELIMITER,
  END_DELIMITER,
  MANIFEST_PREFIX,
  MANIFEST_SUFFIX,
  POST_MATTER_MANIFEST_START,
  POST_MATTER_MANIFEST_END,
} from '../constants.js'
import type { ConcatenateInputFile } from './contracts/IFormatter.js'

export interface PostMatterLedgerItem {
  path: string
  mode: string
  hash: string
}

/**
 * Compute an xxHash32 8-character hexadecimal string digest on raw buffer or string
 *
 * @param input - Buffer, Uint8Array, or string input to hash
 * @returns 8-character hex digest
 */
export function computeHash(input: Buffer | Uint8Array | string): string {
  // KEL Protocol: OS-Agnostic Cryptography
  // Normalize CRLF to LF and strip parser boundary bleed
  let strContent: string
  if (typeof input === 'string') {
    strContent = input
  } else if (Buffer.isBuffer(input)) {
    strContent = input.toString('utf8')
  } else {
    strContent = new TextDecoder().decode(input)
  }

  const normalizedContent = strContent.replace(/\r\n/g, '\n').trimEnd()
  const data = new TextEncoder().encode(normalizedContent)

  const len = data.length
  const seed = 0

  const PRIME32_1 = 2654435761
  const PRIME32_2 = 2246822519
  const PRIME32_3 = 3266489917
  const PRIME32_4 = 668265261
  const PRIME32_5 = 374761393

  let h32 = 0

  if (len >= 16) {
    let v1 = (seed + PRIME32_1 + PRIME32_2) >>> 0
    let v2 = (seed + PRIME32_2) >>> 0
    let v3 = (seed + 0) >>> 0
    let v4 = (seed - PRIME32_1) >>> 0

    const limit = len - 16
    let i = 0

    while (i <= limit) {
      const read32 = (offset: number) =>
        (data[offset] |
          (data[offset + 1] << 8) |
          (data[offset + 2] << 16) |
          (data[offset + 3] << 24)) >>>
        0

      v1 =
        Math.imul((v1 + Math.imul(read32(i), PRIME32_2)) >>> 0, PRIME32_1) >>> 0
      v1 = ((v1 << 13) | (v1 >>> 19)) >>> 0

      v2 =
        Math.imul(
          (v2 + Math.imul(read32(i + 4), PRIME32_2)) >>> 0,
          PRIME32_1
        ) >>> 0
      v2 = ((v2 << 13) | (v2 >>> 19)) >>> 0

      v3 =
        Math.imul(
          (v3 + Math.imul(read32(i + 8), PRIME32_2)) >>> 0,
          PRIME32_1
        ) >>> 0
      v3 = ((v3 << 13) | (v3 >>> 19)) >>> 0

      v4 =
        Math.imul(
          (v4 + Math.imul(read32(i + 12), PRIME32_2)) >>> 0,
          PRIME32_1
        ) >>> 0
      v4 = ((v4 << 13) | (v4 >>> 19)) >>> 0

      i += 16
    }

    h32 =
      (((v1 << 1) | (v1 >>> 31)) +
        ((v2 << 7) | (v2 >>> 25)) +
        ((v3 << 12) | (v3 >>> 20)) +
        ((v4 << 18) | (v4 >>> 14))) >>>
      0
  } else {
    h32 = (seed + PRIME32_5) >>> 0
  }

  h32 = (h32 + len) >>> 0

  let p = len >= 16 ? len - (len % 16) : 0
  while (p + 4 <= len) {
    const lane =
      (data[p] |
        (data[p + 1] << 8) |
        (data[p + 2] << 16) |
        (data[p + 3] << 24)) >>>
      0
    h32 = (h32 + Math.imul(lane, PRIME32_3)) >>> 0
    h32 = Math.imul(((h32 << 17) | (h32 >>> 15)) >>> 0, PRIME32_4) >>> 0
    p += 4
  }

  while (p < len) {
    h32 = (h32 + Math.imul(data[p], PRIME32_5)) >>> 0
    h32 = Math.imul(((h32 << 11) | (h32 >>> 21)) >>> 0, PRIME32_1) >>> 0
    p++
  }

  h32 = Math.imul(h32 ^ (h32 >>> 15), PRIME32_2) >>> 0
  h32 = Math.imul(h32 ^ (h32 >>> 13), PRIME32_3) >>> 0
  h32 = (h32 ^ (h32 >>> 16)) >>> 0

  return (h32 >>> 0).toString(16).padStart(8, '0')
}

/**
 * Safely normalize file mode cross-platform (Windows vs POSIX)
 *
 * @param stats - Optional file stats containing mode integer
 * @returns Octal mode string ('0644' or '0755')
 */
export function normalizeFileMode(stats?: { mode?: number }): string {
  if (!stats || typeof stats.mode !== 'number') {
    return '0644'
  }
  const posixBits = stats.mode & 0o777
  if (posixBits === 0) {
    return '0644'
  }
  const isExecutable = (posixBits & 0o111) !== 0
  return isExecutable ? '0755' : '0644'
}

/**
 * Generate pipe-delimited Post-Matter EOF manifest block
 *
 * @param ledger - Array of PostMatterLedgerItem tuples
 * @param sessionId - Optional session ID
 * @returns Formatted Post-Matter EOF manifest chunk
 */
export function formatPostMatterManifest(
  ledger: PostMatterLedgerItem[],
  sessionId?: string
): string {
  const sidPart = sessionId ? ` (ID: ${sessionId})` : ''
  let result = `${POST_MATTER_MANIFEST_START}${sidPart} >>>>>\n`
  for (const item of ledger) {
    const normalizedPath = item.path.replace(/\\/g, '/')
    result += `${normalizedPath}|${item.mode}|${item.hash}\n`
  }
  result += `${POST_MATTER_MANIFEST_END}\n`
  return result
}

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
    hash: f.hash,
    mode: f.mode,
  }))
}
