#!/usr/bin/env npx tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'fs'
import { join, relative, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  concatenate,
  deconcatenate,
  validateConcatenation,
  type VirtualFile,
  type ValidationResult,
} from '../core/engine.js'
import { createZipFromVirtualFiles } from '../drivers/zip-driver.js'
import { logger } from '../lib/logger.js'

// Load version from package.json
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
)

/**
 * Recursively collect all files from a directory
 */
function collectFiles(
  dir: string,
  baseDir: string,
  files: Array<{ path: string; content: string }> = [],
  excludePatterns: string[] = []
): Array<{ path: string; content: string }> {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = relative(baseDir, fullPath)

    // Check if path matches any exclude pattern
    if (excludePatterns.some((pattern) => relativePath.includes(pattern))) {
      continue
    }

    if (entry.isDirectory()) {
      collectFiles(fullPath, baseDir, files, excludePatterns)
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
 * Format validation result for CLI output
 * Displays a professional summary with colors (if supported)
 */
function formatValidationReport(
  result: ValidationResult,
  filePath: string,
  verbose: boolean | number = false,
  isDryRun = false
): void {
  const isVeryVerbose = typeof verbose === 'number' ? verbose > 1 : false
  const prefix = isDryRun ? '[DRY RUN] ' : '[VALIDATION] '
  logger.info(`${prefix}Validating: ${filePath}`)
  logger.info('')

  // Session ID
  if (result.sessionId) {
    logger.info(`✓ Valid session manifest found: ID ${result.sessionId}`)
  } else {
    logger.warn('⚠ No session manifest found (legacy format detected)')
  }

  logger.info('')

  // Segmented file summary - all three classes should sum to total
  // Only count missing end markers as file errors (session mismatches are foreign markers)
  const errorCount = result.errors.filter((e) =>
    e.includes('Missing end marker')
  ).length
  logger.info(`Marker Analysis:`)
  logger.info(`  Total markers found: ${result.totalMarkersFound}`)
  logger.info(
    `    ├── Target files (will be extracted): ${result.targetFileCount}`
  )
  if (result.foreignFileCount > 0) {
    logger.info(
      `    ├── Foreign markers (will be ignored): ${result.foreignFileCount}`
    )
  }
  if (errorCount > 0) {
    logger.info(`    └── Files with errors (skipped): ${errorCount}`)
  }

  // Warnings
  if (result.warnings.length > 0) {
    logger.info('')
    logger.warn(`Warnings (${result.warnings.length}):`)
    for (const warning of result.warnings) {
      logger.warn(`  ⚠ ${warning}`)
    }
  }

  // Errors
  if (result.errors.length > 0) {
    logger.info('')
    logger.error(`Errors (${result.errors.length}):`)
    for (const error of result.errors) {
      logger.error(`  ✗ ${error}`)
    }
  }

  // File list - show target files that will be extracted
  if (result.targetFiles.length > 0) {
    logger.info('')
    logger.info(`Files to be Extracted (${result.targetFiles.length}):`)
    for (const filePath of result.targetFiles) {
      logger.info(`  ✓ ${filePath}`)
    }
  }

  // Show foreign files in verbose mode (all if very verbose, else first 20)
  if (verbose && result.foreignFiles.length > 0) {
    logger.info('')
    logger.info(`Foreign Markers Ignored (${result.foreignFiles.length}):`)
    const limit = isVeryVerbose ? result.foreignFiles.length : 20
    for (const filePath of result.foreignFiles.slice(0, limit)) {
      logger.info(`  • ${filePath}`)
    }
    if (!isVeryVerbose && result.foreignFiles.length > 20) {
      logger.info(
        `  ... and ${result.foreignFiles.length - 20} more (use -vv to see all)`
      )
    }
  }

  // Final summary
  logger.info('')
  if (result.isValid) {
    if (result.foreignFileCount > 0) {
      logger.info(
        `✓ Validation passed: ${result.targetFileCount}/${result.targetFileCount + result.foreignFileCount} target file(s) ready for extraction (${result.foreignFileCount} foreign markers ignored)`
      )
    } else {
      logger.info(
        `✓ Validation passed: ${result.targetFileCount} file(s) ready for extraction`
      )
    }
  } else {
    logger.error(
      `✗ Validation found ${result.errors.length} error(s) - ${result.targetFileCount} valid file(s) can still be extracted`
    )
  }
}

/**
 * Global error handler for CLI commands
 */
function handleError(error: unknown): void {
  logger.error(
    `Error: ${error instanceof Error ? error.message : String(error)}`
  )
  process.exit(1)
}

// Initialize Commander program
const program = new Command()
  .name('concatenator')
  .description(
    'Bundle and unbundle directories into LLM-ready concatenated files'
  )
  .version(packageJson.version)
  .configureOutput({
    writeErr: (str) => logger.error(str.trim()),
    outputError: (str, write) => {
      logger.error(str.trim())
      write(str.trim())
    },
  })

// Concat command (default action)
program
  .command('concat')
  .argument('<path>', 'Directory path to concatenate')
  .description('Bundle a directory into a single LLM-ready file')
  .option('-o, --output <file>', 'Specify output filename (default: stdout)')
  .option(
    '-e, --exclude <pattern>',
    'Additional patterns to ignore (comma-separated)',
    ''
  )
  .option('-v, --verbose', 'Show detailed file processing logs', false)
  .action(
    async (
      inputPath: string,
      options: { output?: string; exclude: string; verbose: boolean }
    ) => {
      try {
        const stats = statSync(inputPath)
        if (!stats.isDirectory()) {
          throw new Error(`${inputPath} is not a directory`)
        }

        // Parse exclude patterns
        const excludePatterns = options.exclude
          ? options.exclude
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : []

        const files = collectFiles(inputPath, inputPath, [], excludePatterns)

        if (files.length === 0) {
          throw new Error(`No readable files found in ${inputPath}`)
        }

        if (options.verbose) {
          logger.info(`Processing ${files.length} file(s)...`)
          for (const file of files) {
            logger.info(`  - ${file.path}`)
          }
        }

        const result = concatenate(files)

        if (options.output) {
          writeFileSync(options.output, result)
          logger.info(
            `Concatenated ${files.length} file(s) to ${options.output}`
          )
        } else {
          process.stdout.write(result)
        }
      } catch (error) {
        handleError(error)
      }
    }
  )

// Extract command
program
  .command('extract')
  .argument('<file>', 'Path to the concatenated file')
  .description('Reconstruct a project from a concatenated file')
  .option('-o, --output <dir>', 'Destination directory', '.')
  .option(
    '-z, --zip',
    'Output as a .zip archive instead of writing to disk',
    false
  )
  .option(
    '-d, --dry-run',
    'Validate integrity and show what would be extracted without writing anything',
    false
  )
  .option(
    '-v, --verbose',
    'Show detailed file processing logs (use -vv for very verbose in dry-run)',
    (value, previous) => previous + 1,
    0
  )
  .action(
    async (
      inputFile: string,
      options: {
        output: string
        zip: boolean
        dryRun: boolean
        verbose: number
      }
    ) => {
      try {
        const content = readFileSync(inputFile, 'utf-8')
        const result = deconcatenate(content)

        if (!result.foundAny) {
          throw new Error('No concatenated files found in input')
        }

        const totalFiles = result.files.length + result.skippedPaths.length

        if (options.verbose > 0) {
          logger.info(
            `Found ${result.files.length}/${totalFiles} file(s) to extract`
          )
          for (const file of result.files) {
            logger.info(`  - ${file.path}`)
          }
          if (result.skippedPaths.length > 0) {
            logger.warn(
              `  Skipped ${result.skippedPaths.length} file(s) with missing end markers`
            )
          }
        }

        if (options.dryRun) {
          // Dry run mode: validate and report only
          const validationResult = validateConcatenation(content)
          formatValidationReport(
            validationResult,
            inputFile,
            options.verbose,
            true
          )
          if (!validationResult.isValid) {
            process.exit(1)
          }
        } else if (options.zip) {
          // Zip bundling mode
          const zipPath = options.output.endsWith('.zip')
            ? options.output
            : join(options.output, 'output.zip')
          const zipData = await createZipFromVirtualFiles(result.files)
          writeFileSync(zipPath, zipData)

          if (result.skippedPaths.length > 0) {
            logger.warn(
              `Skipped ${result.skippedPaths.length} file(s) with missing end markers: ${result.skippedPaths.join(', ')}`
            )
          }

          logger.info(
            `Created ${zipPath} with ${result.files.length}/${totalFiles} file(s)`
          )
        } else {
          // File explosion mode (default)
          reconstructFiles(result.files, options.output)

          if (result.skippedPaths.length > 0) {
            logger.warn(
              `Skipped ${result.skippedPaths.length} file(s) with missing end markers: ${result.skippedPaths.join(', ')}`
            )
          }

          logger.info(
            `Restored ${result.files.length}/${totalFiles} file(s) to ${options.output}`
          )
        }
      } catch (error) {
        handleError(error)
      }
    }
  )

// Validate command
program
  .command('validate')
  .argument('<file>', 'Path to the concatenated file')
  .description('Check the integrity of a concatenated file')
  .option(
    '-v, --verbose',
    'Show detailed validation logs (use -vv for very verbose)',
    (value, previous) => previous + 1,
    0
  )
  .action(async (inputFile: string, options: { verbose: number }) => {
    try {
      const content = readFileSync(inputFile, 'utf-8')
      const result = validateConcatenation(content)
      formatValidationReport(result, inputFile, options.verbose, false)
      process.exit(result.isValid ? 0 : 1)
    } catch (error) {
      handleError(error)
    }
  })

// Add custom help text with examples
program.on('--help', () => {
  console.log('')
  console.log('Examples:')
  console.log('  $ concatenator concat -o context.txt ./src')
  console.log('  $ concatenator concat -v -e node_modules,dist ./my-project')
  console.log('  $ concatenator extract -o ./restored bundle.txt')
  console.log('  $ concatenator extract --zip -o restored.zip bundle.txt')
  console.log('  $ concatenator validate --verbose bundle.txt')
})

// Parse CLI arguments
program.parse()
