/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { START_DELIMITER, END_DELIMITER, FILE_END_DELIMITER } from './constants'

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
 * Parse concatenated content and extract individual files
 *
 * Handles fault tolerance for:
 * - Missing FILE_END_DELIMITER (LLM hallucinations, deletions, truncation)
 * - Malformed markers or nested delimiters
 * - Path traversal attempts (sanitizes paths)
 * - Duplicate paths (renames with counter suffix)
 *
 * @param content - The concatenated text content to parse
 * @returns DeconcatenateResult with extracted files and skipped paths
 */
export function deconcatenate(content: string): DeconcatenateResult {
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

    // Look ahead to detect if next file starts before current file ends
    // This indicates a missing FILE_END_DELIMITER (e.g., LLM deleted it)
    const nextStartDelimiter = content.indexOf(START_DELIMITER, pathStart)

    const contentStartRaw = pathEnd + END_DELIMITER.length
    const fileEndIndex = content.indexOf(FILE_END_DELIMITER, contentStartRaw)

    const path = content.substring(pathStart, pathEnd).trim()

    // Partial File Detection
    if (
      fileEndIndex === -1 ||
      (nextStartDelimiter !== -1 && nextStartDelimiter < fileEndIndex)
    ) {
      skippedPaths.push(path || '(unknown path)')
      // Resume at next file's start, or end of content if no more files
      searchIndex =
        nextStartDelimiter !== -1 ? nextStartDelimiter : content.length
      continue
    }

    // Comprehensive path traversal sanitization
    const sanitizedPath = sanitizePath(path)

    let fileContent = content.substring(contentStartRaw, fileEndIndex)
    fileContent = fileContent.replace(/^[\r\n]+|[\r\n]+$/g, '')

    if (sanitizedPath) {
      // Handle duplicate paths by appending a counter suffix
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
 * Concatenate multiple files into a single text output with delimiters
 *
 * Format:
 *   Concatenated on: {timestamp}
 *
 *   <<<<< CONCATENATOR_FILE_START: {path} >>>>>
 *   {content}
 *   <<<<< CONCATENATOR_FILE_END >>>>>
 *
 * @param files - Array of files to concatenate
 * @param timestamp - Optional timestamp string (defaults to current locale time)
 * @returns Concatenated text content
 */
export function concatenate(
  files: ConcatenateInputFile[],
  timestamp?: string
): string {
  const ts = timestamp || new Date().toLocaleString()

  let result = `Concatenated on: ${ts}\n\n`

  for (const file of files) {
    result += `${START_DELIMITER}${file.path}${END_DELIMITER}\n`
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
