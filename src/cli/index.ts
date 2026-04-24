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
  rmSync,
} from 'fs'
import { join, relative, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  concatenate,
  deconcatenate,
  validateConcatenation,
  type VirtualFile,
  type ValidationResult,
} from '../core/engine.js'
import { prunePaths } from '../core/reconciler.js'
import { isDirectoryTainted } from '../core/utils/fs-utils.js'
import { UserError } from '../core/errors.js'
import { createZipFromVirtualFiles } from '../drivers/zip-driver.js'
import { logger } from '../lib/logger.js'
import { IgnoreEngine } from '../core/ignore/IgnoreEngine.js'
import { TokenService } from '../core/TokenService.js'
import { formatFileSize } from '../lib/utils.js'

// Load version from package.json
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
)

/**
 * File metadata with token and size info
 */
interface FileWithMetadata {
  path: string
  content: string
  tokens: number
  size: number
}

/**
 * Recursively collect all files from a directory and calculate tokens
 */
function collectFiles(
  dir: string,
  baseDir: string,
  ignoreEngine: IgnoreEngine,
  verbose: number = 0,
  files: FileWithMetadata[] = []
): { files: FileWithMetadata[]; totalTokens: number } {
  const entries = readdirSync(dir, { withFileTypes: true })
  let dirTokens = 0

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = relative(baseDir, fullPath)

    // Check if path is ignored
    if (ignoreEngine.isIgnored(relativePath)) {
      continue
    }

    if (entry.isDirectory()) {
      const subResult = collectFiles(
        fullPath,
        baseDir,
        ignoreEngine,
        verbose,
        files
      )
      dirTokens += subResult.totalTokens
    } else if (entry.isFile()) {
      try {
        const stats = statSync(fullPath)
        const content = readFileSync(fullPath, 'utf-8')
        const tokens = TokenService.getTokenEstimate(content)

        files.push({
          path: relativePath,
          content,
          tokens,
          size: stats.size,
        })

        dirTokens += tokens

        if (verbose >= 2) {
          logger.info(
            `  [${tokens.toLocaleString().padStart(8)} tokens] ${relativePath}`
          )
        }
      } catch {
        // Skip files that can't be read (binary, permissions, etc.)
      }
    }
  }

  if (verbose >= 1) {
    const relDir = relative(baseDir, dir) || '.'
    logger.info(`Dir: ${relDir} (~${dirTokens.toLocaleString()} tokens)`)
  }

  return { files, totalTokens: dirTokens }
}

/**
 * Resolve ignore patterns from explicit flags and auto-discovery
 * @returns Array of ignore patterns
 */
function getIgnorePatterns(options: {
  exclude?: string
  ignoreFile?: string
}): string[] {
  let patterns: string[] = []

  // 1. Parse explicit --exclude patterns (comma-separated)
  if (options.exclude) {
    patterns = patterns.concat(
      options.exclude
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    )
  }

  // 2. Determine which ignore file to use
  let ignoreFilePath = options.ignoreFile
  const isExplicit = !!options.ignoreFile

  if (!ignoreFilePath) {
    // Auto-discovery: .concatignore then .gitignore
    if (existsSync('.concatignore')) {
      ignoreFilePath = '.concatignore'
    } else if (existsSync('.gitignore')) {
      ignoreFilePath = '.gitignore'
    }
  }

  // 3. Load patterns from file
  if (ignoreFilePath) {
    if (existsSync(ignoreFilePath)) {
      try {
        const content = readFileSync(ignoreFilePath, 'utf-8')
        const filePatterns = IgnoreEngine.parseIgnoreFile(content)
        patterns = patterns.concat(filePatterns)
      } catch (error) {
        logger.warn(
          `Could not read ignore file ${ignoreFilePath}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    } else if (isExplicit) {
      // Explicitly requested but missing
      throw new Error(`Ignore file ${ignoreFilePath} does not exist.`)
    }
  }

  return patterns
}

/**
 * Check if output path exists and handle collisions
 * Returns true if path is safe to write, false if handled by force
 * Throws user-friendly error if collision detected without force
 */
function checkOutputPath(
  outputPath: string,
  force: boolean,
  itemType: 'file' | 'directory'
): boolean {
  if (!existsSync(outputPath)) {
    return true
  }

  const stats = statSync(outputPath)
  const isDir = stats.isDirectory()

  if (isDir && itemType === 'file') {
    if (force) {
      rmSync(outputPath, { recursive: true, force: true })
      return true
    }
    throw new Error(
      `Path ${outputPath} exists as a directory. Please provide a different filename or use --force to overwrite.`
    )
  }

  if (!isDir && itemType === 'directory') {
    if (force) {
      rmSync(outputPath, { recursive: true, force: true })
      return true
    }
    throw new Error(
      `Path ${outputPath} exists as a file. Please provide a different directory name or use --force to overwrite.`
    )
  }

  if (isDir && itemType === 'directory') {
    if (force) {
      rmSync(outputPath, { recursive: true, force: true })
      return true
    }
    throw new Error(
      `Directory ${outputPath} already exists. Please provide a different directory name or use --force to overwrite.`
    )
  }

  // File exists and itemType is file
  if (force) {
    rmSync(outputPath, { recursive: true, force: true })
    return true
  }

  throw new Error(
    `File ${outputPath} already exists. Use --force to overwrite.`
  )
}

/**
 * Reconstruct files from deconcatenated content (File Explosion mode)
 */
function reconstructFiles(
  files: VirtualFile[],
  outputDir: string,
  force = false
): void {
  // Check if output directory exists as a file
  if (existsSync(outputDir) && !statSync(outputDir).isDirectory()) {
    if (force) {
      rmSync(outputDir, { recursive: true, force: true })
    } else {
      throw new Error(
        `Path ${outputDir} exists as a file. Please provide a different directory name or use --force to overwrite.`
      )
    }
  }

  for (const file of files) {
    const fullPath = join(outputDir, file.path)
    const dir = dirname(fullPath)

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    if (existsSync(fullPath) && !force) {
      throw new Error(
        `File ${fullPath} already exists. Use --force to overwrite.`
      )
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
  if (error instanceof UserError) {
    logger.error(`Error: ${error.message}`)
  } else {
    logger.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
    if (error instanceof Error && error.stack) {
      logger.debug(error.stack)
    }
  }
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
  .argument('<paths...>', 'Directory paths to concatenate')
  .description('Bundle directories into a single LLM-ready file')
  .option('-o, --output <file>', 'Specify output filename (default: stdout)')
  .option(
    '-e, --exclude <patterns>',
    'Additional patterns to ignore (comma-separated)',
    ''
  )
  .option(
    '-i, --ignore-file <path>',
    'Path to an ignore file (.concatignore, .gitignore, etc.)'
  )
  .option(
    '-v, --verbose',
    'Verbosity level. -v: total tokens per dir, -vv: individual file tokens',
    (v, p) => p + 1,
    0
  )
  .option('--max-tokens <number>', 'Budget guard: warn if exceeded', (val) =>
    parseInt(val, 10)
  )
  .option(
    '-f, --force',
    'Overwrite existing files or directories without prompting',
    false
  )
  .action(
    async (
      paths: string[],
      options: {
        output?: string
        exclude: string
        ignoreFile?: string
        verbose: number
        maxTokens?: number
        force: boolean
      }
    ) => {
      try {
        // Path Normalization & Pruning
        const absolutePaths = paths.map((p) => resolve(p))
        const { pruned, remaining } = prunePaths(absolutePaths)

        if (options.verbose && pruned.length > 0) {
          for (const p of pruned) {
            const relPath = relative(process.cwd(), p) || '.'
            logger.info(
              `[info] Pruned redundant sub-path: ${relPath} (already covered by a parent path)`
            )
          }
        }

        // Get ignore patterns and initialize engine
        const ignorePatterns = getIgnorePatterns(options)
        const ignoreEngine = new IgnoreEngine(ignorePatterns)

        const allFiles: FileWithMetadata[] = []
        let totalTokens = 0

        for (const inputPath of remaining) {
          if (!existsSync(inputPath)) {
            logger.warn(`Warning: Path ${inputPath} does not exist. Skipping.`)
            continue
          }

          const stats = statSync(inputPath)
          if (stats.isDirectory()) {
            // For a single input directory, we keep paths relative to it (traditional behavior).
            // For multiple inputs, we preserve the directory name to avoid collisions.
            const baseDir =
              remaining.length === 1 ? inputPath : dirname(inputPath)

            const { totalTokens: tokens } = collectFiles(
              inputPath,
              baseDir,
              ignoreEngine,
              options.verbose,
              allFiles
            )
            totalTokens += tokens
          } else if (stats.isFile()) {
            const content = readFileSync(inputPath, 'utf-8')
            const tokens = TokenService.getTokenEstimate(content)
            // For files, we always use the parent dir as base to get just the filename
            const relativePath = relative(dirname(inputPath), inputPath)

            if (!ignoreEngine.isIgnored(relativePath)) {
              allFiles.push({
                path: relativePath,
                content,
                tokens,
                size: stats.size,
              })
              totalTokens += tokens
            }
          }
        }

        if (allFiles.length === 0) {
          throw new Error(`No readable files found in the provided paths`)
        }

        // Budget Guard
        if (options.maxTokens && totalTokens > options.maxTokens) {
          logger.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
          logger.warn('BUDGET WARNING: Token limit exceeded')
          logger.warn(`Limit:   ${options.maxTokens.toLocaleString()}`)
          logger.warn(`Current: ${totalTokens.toLocaleString()}`)
          logger.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
        }

        const result = concatenate(allFiles)
        const bundleSize = Buffer.byteLength(result, 'utf-8')

        if (options.output) {
          // Check for directory collision before writing
          checkOutputPath(options.output, options.force, 'file')
          writeFileSync(options.output, result)
          logger.info(
            `✔ Created ${options.output} (${formatFileSize(bundleSize)} | ~${totalTokens.toLocaleString()} tokens).`
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
    '-e, --exclude <patterns>',
    'Patterns to ignore during extraction (comma-separated)',
    ''
  )
  .option(
    '-i, --ignore-file <path>',
    'Path to an ignore file to use during extraction'
  )
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
  .option(
    '-f, --force',
    'Overwrite existing files or directories without prompting',
    false
  )
  .action(
    async (
      inputFile: string,
      options: {
        output: string
        exclude: string
        ignoreFile?: string
        zip: boolean
        dryRun: boolean
        verbose: number
        force: boolean
      }
    ) => {
      try {
        const content = readFileSync(inputFile, 'utf-8')
        const result = deconcatenate(content)

        if (!result.foundAny) {
          throw new Error('No concatenated files found in input')
        }

        // Filter files using ignore patterns
        const ignorePatterns = getIgnorePatterns(options)
        const ignoreEngine = new IgnoreEngine(ignorePatterns)
        const filteredFiles = result.files.filter(
          (file) => !ignoreEngine.isIgnored(file.path)
        )

        if (filteredFiles.length === 0 && result.files.length > 0) {
          logger.warn('All files were filtered out by ignore patterns.')
        }

        const totalFiles = result.files.length + result.skippedPaths.length

        if (options.verbose > 0) {
          logger.info(
            `Found ${filteredFiles.length}/${totalFiles} file(s) to extract`
          )
          for (const file of filteredFiles) {
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

          // Check for directory collision before writing zip
          checkOutputPath(zipPath, options.force, 'file')

          const zipData = await createZipFromVirtualFiles(filteredFiles)
          writeFileSync(zipPath, zipData)

          if (result.skippedPaths.length > 0) {
            logger.warn(
              `Skipped ${result.skippedPaths.length} file(s) with missing end markers: ${result.skippedPaths.join(', ')}`
            )
          }

          logger.info(
            `Created ${zipPath} with ${filteredFiles.length}/${totalFiles} file(s)`
          )
        } else {
          // File explosion mode (default)
          // Guard against non-empty target directory or existing file
          if (!options.force && isDirectoryTainted(options.output)) {
            throw new UserError(
              'Target directory is not empty. Use --force to overwrite or merge.'
            )
          }

          reconstructFiles(filteredFiles, options.output, options.force)

          if (result.skippedPaths.length > 0) {
            logger.warn(
              `Skipped ${result.skippedPaths.length} file(s) with missing end markers: ${result.skippedPaths.join(', ')}`
            )
          }

          logger.info(
            `Restored ${filteredFiles.length}/${totalFiles} file(s) to ${options.output}`
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
  .argument(
    '<paths...>',
    'Path to directories (pre-flight) or concatenated files'
  )
  .description(
    'Check the integrity of concatenated files or perform a pre-flight dry run on directories'
  )
  .option('-t, --tokens', 'Show individual token counts for all files', false)
  .option(
    '-v, --verbose',
    'Show detailed validation logs (use -vv for very verbose)',
    (value, previous) => previous + 1,
    0
  )
  .option(
    '-e, --exclude <patterns>',
    'Additional patterns to ignore (comma-separated)',
    ''
  )
  .option(
    '-i, --ignore-file <path>',
    'Path to an ignore file (.concatignore, .gitignore, etc.)'
  )
  .action(
    async (
      paths: string[],
      options: {
        tokens: boolean
        verbose: number
        exclude: string
        ignoreFile?: string
      }
    ) => {
      try {
        // Path Normalization & Pruning
        const absolutePaths = paths.map((p) => resolve(p))
        const { pruned, remaining } = prunePaths(absolutePaths)

        if (options.verbose && pruned.length > 0) {
          for (const p of pruned) {
            const relPath = relative(process.cwd(), p) || '.'
            logger.info(
              `[info] Pruned redundant sub-path: ${relPath} (already covered by a parent path)`
            )
          }
        }

        for (const inputPath of remaining) {
          if (!existsSync(inputPath)) {
            logger.warn(`Warning: Path ${inputPath} does not exist. Skipping.`)
            continue
          }

          if (statSync(inputPath).isDirectory()) {
            // Pre-flight directory dry-run
            const ignorePatterns = getIgnorePatterns(options)
            const ignoreEngine = new IgnoreEngine(ignorePatterns)
            const baseDir =
              remaining.length === 1 ? inputPath : dirname(inputPath)

            if (options.tokens) {
              logger.info(`[DRY RUN] Pre-flight Analysis for: ${inputPath}`)
              const { files, totalTokens } = collectFiles(
                inputPath,
                baseDir,
                ignoreEngine,
                options.verbose
              )

              logger.info(
                '--------------------------------------------------------------------------------'
              )
              logger.info(String('File Path').padEnd(60) + ' | ' + 'Tokens')
              logger.info(
                '--------------------------------------------------------------------------------'
              )
              for (const file of files) {
                logger.info(
                  file.path.padEnd(60) +
                    ' | ' +
                    file.tokens.toLocaleString().padStart(10)
                )
              }
              logger.info(
                '--------------------------------------------------------------------------------'
              )
              logger.info(
                `TOTAL CONTEXT WEIGHT (tokens): ${totalTokens.toLocaleString()}`
              )
              logger.info(
                '--------------------------------------------------------------------------------'
              )
            } else {
              const { files, totalTokens } = collectFiles(
                inputPath,
                baseDir,
                ignoreEngine,
                options.verbose
              )
              logger.info(
                `✓ Pre-flight check passed for ${inputPath}: ${files.length} files, ~${totalTokens.toLocaleString()} tokens.`
              )
            }
          } else {
            // File validation
            const content = readFileSync(inputPath, 'utf-8')
            const result = validateConcatenation(content)
            formatValidationReport(result, inputPath, options.verbose, false)
            if (!result.isValid) {
              process.exit(1)
            }
          }
        }
      } catch (error) {
        handleError(error)
      }
    }
  )

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
