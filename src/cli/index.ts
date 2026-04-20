#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { concatenate } from '../core/engine.ts'

/**
 * Recursively collect all files from a directory
 */
function collectFiles(dir: string, baseDir: string, files: Array<{ path: string; content: string }> = []): Array<{ path: string; content: string }> {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = relative(baseDir, fullPath)

    if (entry.isDirectory()) {
      collectFiles(fullPath, baseDir, files)
    } else if (entry.isFile()) {
      try {
        const content = readFileSync(fullPath, 'utf-8')
        files.push({ path: relativePath, content })
      } catch {
        // Skip files that can't be read (binary, permissions, etc.)
      }
    }
  }

  return files
}

/**
 * CLI entry point
 */
function main(): void {
  const targetDir = process.argv[2] || '.'

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Usage: concatenator [directory]

Concatenates all text files in a directory recursively.

Arguments:
  directory    Path to directory (default: current directory)

Example:
  concatenator ./src
  npx concatenator ./my-project`)
    process.exit(0)
  }

  try {
    const stats = statSync(targetDir)
    if (!stats.isDirectory()) {
      console.error(`Error: ${targetDir} is not a directory`)
      process.exit(1)
    }

    const files = collectFiles(targetDir, targetDir)

    if (files.length === 0) {
      console.error(`Error: No readable files found in ${targetDir}`)
      process.exit(1)
    }

    const result = concatenate(files)
    process.stdout.write(result)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

main()
