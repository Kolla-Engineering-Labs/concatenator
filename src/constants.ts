/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const START_DELIMITER = '<<<<< CONCATENATOR_FILE_START: ';
export const END_DELIMITER = ' >>>>>';
export const FILE_END_DELIMITER = '<<<<< CONCATENATOR_FILE_END >>>>>';

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
  'venv'
];
