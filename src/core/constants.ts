/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Obfuscated delimiters to prevent self-hosting paradox
// The actual marker strings are constructed at runtime
const START_MARKER_PARTS = [
  '<',
  '<',
  '<',
  '<',
  '<',
  ' ',
  'F',
  'I',
  'L',
  'E',
  '_',
  'S',
  'T',
  'A',
  'R',
  'T',
  ':',
  ' ',
]
const END_MARKER_PARTS = [' ', '>', '>', '>', '>', '>']
const FILE_END_MARKER_PARTS = [
  '<',
  '<',
  '<',
  '<',
  '<',
  ' ',
  'F',
  'I',
  'L',
  'E',
  '_',
  'E',
  'N',
  'D',
  ' ',
  '>',
  '>',
  '>',
  '>',
  '>',
]

export const START_DELIMITER = START_MARKER_PARTS.join('')
export const END_DELIMITER = END_MARKER_PARTS.join('')
export const FILE_END_DELIMITER = FILE_END_MARKER_PARTS.join('')

// Manifest header template (uses different pattern to avoid collision)
const MANIFEST_PREFIX_PARTS = [
  '-',
  '-',
  '-',
  ' ',
  'C',
  'O',
  'N',
  'C',
  'A',
  'T',
  'E',
  'N',
  'A',
  'T',
  'O',
  'R',
  '_',
  'S',
  'E',
  'S',
  'S',
  'I',
  'O',
  'N',
  '_',
  'I',
  'D',
  ':',
  ' ',
]
const MANIFEST_SUFFIX_PARTS = [' ', '-', '-', '-']

export const MANIFEST_PREFIX = MANIFEST_PREFIX_PARTS.join('')
export const MANIFEST_SUFFIX = MANIFEST_SUFFIX_PARTS.join('')

export const DEFAULT_IGNORE_LIST = [
  '.concatenate-ignore',
  '.DS_Store',
  '.env',
  '.expo',
  '.git',
  '.gradle',
  '.next',
  '.secrets',
  '.terraform',
  '.vagrant',
  '.vscode',
  '/^\\.concatenate-ignore-worker-\\d+$/',
  '/\\.class$',
  '/\\.exe$/',
  '/\\.jar$/',
  '/\\.log$/',
  '/\\.o$/',
  '/\\.obj$/',
  '/\\.swp$/',
  '/^__.*cache__$/',
  '/^\\..*_cache$/',
  'bin',
  'build',
  'desktop.ini',
  'dist',
  'node_modules',
  'obj',
  'package-lock.json',
  'ruff_output.txt',
  'target',
  'Thumbs.db',
  'vendor',
  'venv',
]
