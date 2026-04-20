#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, relative, dirname } from 'path'
import { concatenate, deconcatenate, type VirtualFile } from '../core/engine.ts'
import { createZipFromVirtualFiles } from '../drivers/zip-driver.ts'
import { logger } from '../lib/logger.ts'

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
 * Reconstruct files from deconcatenated content (File Explosion mode)
 */
function reconstructFiles(files: VirtualFile[], outputDir: string): void {
  for (const file of files) {
    const fullPath = join(outputDir, file.path)
    const dir = dirname(fullPath)

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(fullPath, file.content, 'utf-8')
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isUndo = args.includes('--undo') || args.includes('-u')
  const inputPath = args.find(arg => !arg.startsWith('-')) || '.'

  if (args.includes('--help') || args.includes('-h')) {
    logger.info(`Usage: concatenator [directory]
       concatenator --undo <concatenated-file> [output-directory]
       concatenator --undo --zip <concatenated-file> [output-zip]

Concatenates all text files in a directory recursively, or
reconstructs files from a concatenated file.

Options:
  --undo, -u   De-concatenate: extract files from concatenated output
  --zip, -z    Create ZIP archive instead of exploding files (use with --undo)

Arguments:
  directory           Path to directory to concatenate (default: .)
  concatenated-file   Path to concatenated file (with --undo)
  output-directory    Output directory for reconstructed files (default: .)
  output-zip          Output ZIP file path (default: output.zip)

Examples:
  concatenator ./src > output.txt
  concatenator --undo output.txt ./restored
  concatenator --undo --zip output.txt restored.zip
  npx concatenator ./my-project | tee output.txt`)
    process.exit(0)
  }

  // Handle deconcatenate mode
  if (isUndo) {
    const filePath = args.find(arg => !arg.startsWith('-'))
    const nonFlagArgs = args.filter(arg => !arg.startsWith('-'))
    const outputPath = nonFlagArgs[1]
    const isZipMode = args.includes('--zip') || args.includes('-z')

    if (!filePath) {
      logger.error('Error: No input file specified for --undo')
      process.exit(1)
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      const result = deconcatenate(content)

      if (!result.foundAny) {
        logger.error('Error: No concatenated files found in input')
        process.exit(1)
      }

      if (isZipMode) {
        // Zip bundling mode
        const zipPath = outputPath || 'output.zip'
        const zipData = await createZipFromVirtualFiles(result.files)
        writeFileSync(zipPath, zipData)

        if (result.skippedPaths.length > 0) {
          logger.warn(`Skipped ${result.skippedPaths.length} file(s) with missing end markers: ${result.skippedPaths.join(', ')}`)
        }

        logger.info(`Created ${zipPath} with ${result.files.length} file(s)`)
      } else {
        // File explosion mode (default)
        const outputDir = outputPath || '.'
        reconstructFiles(result.files, outputDir)

        if (result.skippedPaths.length > 0) {
          logger.warn(`Skipped ${result.skippedPaths.length} file(s) with missing end markers: ${result.skippedPaths.join(', ')}`)
        }

        logger.info(`Restored ${result.files.length} file(s) to ${outputDir}`)
        for (const file of result.files) {
          logger.info(`  - ${file.path}`)
        }
      }
    } catch (error) {
      logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
    return
  }

  // Concatenate mode (default)
  const targetDir = inputPath

  try {
    const stats = statSync(targetDir)
    if (!stats.isDirectory()) {
      logger.error(`Error: ${targetDir} is not a directory`)
      process.exit(1)
    }

    const files = collectFiles(targetDir, targetDir)

    if (files.length === 0) {
      logger.error(`Error: No readable files found in ${targetDir}`)
      process.exit(1)
    }

    const result = concatenate(files)
    process.stdout.write(result)
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
