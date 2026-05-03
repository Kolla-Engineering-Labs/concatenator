/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FileItem {
  name: string
  path: string
  kind: 'file' | 'directory'
  content?: string | ArrayBuffer
  size?: number
  tokens?: number
  isPrecise?: boolean
  isIgnored?: boolean
  isNegated?: boolean
}

export interface TreeItem {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: TreeItem[]
  isIgnored?: boolean
  isNegated?: boolean
  file?: FileItem
  tokenWeight?: number
  isPrecise?: boolean
}

export type ViewMode = 'list' | 'tree'
export type AppMode = 'concatenate' | 'deconcatenate'
export type OutputFormat = 'text' | 'pdf'

/**
 * Result of validating a concatenated content string
 */
export interface ValidationResult {
  isValid: boolean
  sessionId: string | null
  /**
   * @deprecated Use targetFileCount instead
   */
  fileCount: number
  detectedFiles: string[]
  errors: string[]
  warnings: string[]
  // Segmented validation counts
  targetFileCount: number
  foreignFileCount: number
  totalMarkersFound: number
  targetFiles: string[]
  foreignFiles: string[]
  overwrites?: string[]
}
