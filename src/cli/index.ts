#!/usr/bin/env npx tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  concatenate,
  deconcatenate,
  validateConcatenation,
} from '../core/engine.js'
import { prunePaths } from '../core/reconciler.js'
import { isDirectoryTainted } from '../core/utils/fs-utils.js'
import { createZipFromVirtualFiles } from '../drivers/zip-driver.js'
import { logger } from '../lib/logger.js'
import { IgnoreEngine } from '../core/ignore/IgnoreEngine.js'
import { TokenService } from '../core/TokenService.js'
import { formatFileSize } from '../lib/utils.js'

import { getEncoding } from 'js-tiktoken'

const loadCliPrecision = async () => {
  try {
    await TokenService.loadPrecisionStrategy(getEncoding('o200k_base'))
  } catch {
    try {
      await TokenService.loadPrecisionStrategy(getEncoding('cl100k_base'))
    } catch {
      await TokenService.loadPrecisionStrategy()
    }
  }
}

// Initialize TokenService precision strategy in background for immediate CLI use
loadCliPrecision().catch(() => {})
import { UnifiedCrawler } from '../core/Crawler.js'
import { PulseEmitter } from '../core/PulseEmitter.js'
import {
  launchUI,
  handleError,
  getIgnorePatterns,
  collectFiles,
  checkOutputPath,
  reconstructFiles,
  formatValidationReport,
  startPulseMirror,
  type FileWithMetadata,
  UserError,
} from './cli-utils.js'
import { TamperDetectedError, SecurityViolation } from '../core/errors.js'

// Build-time flags injected by esbuild
declare const PROCESS_IS_UNSIGNED: boolean
declare const PROCESS_VERSION: string

const IS_UNSIGNED =
  process.env.CONCATENATOR_FORCE_UNSIGNED === 'true' ||
  (typeof PROCESS_IS_UNSIGNED !== 'undefined' ? PROCESS_IS_UNSIGNED : false)

// Load version from package.json or build-time flag
let cliVersion =
  typeof PROCESS_VERSION !== 'undefined' ? PROCESS_VERSION : '0.6.0'
try {
  if (
    typeof import.meta !== 'undefined' &&
    (import.meta as { url?: string }).url &&
    typeof PROCESS_VERSION === 'undefined' // Only try on-disk lookup if not bundled
  ) {
    const __filename = fileURLToPath(
      (import.meta as { url?: string }).url as string
    )
    const __dirname = dirname(__filename)
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf-8')
    )
    cliVersion = packageJson.version
  }
} catch {
  // Fallback if not available
}

// Initialize Commander program
const program = new Command()
  .name('concatenator')
  .description(
    'Bundle and unbundle directories into LLM-ready concatenated files'
  )
  .version(cliVersion)
  .option('--ui', 'Launch the web-based Workbench UI')
  .configureOutput({
    writeErr: (str) => logger.error(str.trim()),
    outputError: (str) => {
      logger.error(str.trim())
    },
  })

// UI command
program
  .command('ui [path]')
  .description('Launch the web-based Workbench UI')
  .option('-m, --max-files <number>', 'Preset the maximum file limit', parseInt)
  .option('-i, --ignore-file <file>', 'Specify a custom ignore file')
  .action((path, options) => {
    launchUI(path, { ...options, version: cliVersion })
  })

// Start command (alias for UI, with security check)
program
  .command('start [path]')
  .description('Launch the Workbench UI (checked for macOS security)')
  .option('-m, --max-files <number>', 'Preset the maximum file limit', parseInt)
  .option('-i, --ignore-file <file>', 'Specify a custom ignore file')
  .action(async (path, options) => {
    if (IS_UNSIGNED) {
      const { checkQuarantine } = await import('./cli-utils.js')
      checkQuarantine()
    }
    await launchUI(path, { ...options, version: cliVersion })
  })

// Verify command
program
  .command('verify')
  .argument(
    '[target]',
    'Path to binary to verify, or "self" for the current executable',
    'self'
  )
  .summary('Cryptographically verify a standalone binary')
  .description(
    'Verify the integrity of a binary by checking its SHA256 hash against the GPG-signed SHA256SUMS.asc manifest.\n\n' +
      'Example for deep cryptographic debugging:\n' +
      '  $ npx @kolla/concatenator verify ./concatenator-windows-x64.exe --verbose'
  )
  .option('-m, --manifest <path>', 'Explicit path to SHA256SUMS.asc')
  .option('-v, --verbose', 'Show deeper cryptographic debugging output')
  .action(async (target, options) => {
    const { calculateFileHash } = await import('./cli-utils.js')
    const { OFFICIAL_MANIFEST_URL, ARCHITECT_PGP_FINGERPRINT } =
      await import('../core/constants.js')
    const { execSync } = await import('node:child_process')

    const targetPath = target === 'self' ? process.execPath : resolve(target)
    const manifestPath =
      options.manifest || join(dirname(targetPath), 'SHA256SUMS.asc')

    logger.raw('\n🛡️  Concatenator Integrity Verification')
    logger.raw(''.padEnd(40, '─'))

    try {
      if (!existsSync(targetPath)) {
        throw new Error(`Target binary not found: ${targetPath}`)
      }

      // 1. GPG Keychain Check
      let hasKey = false
      try {
        execSync(
          `gpg --list-keys "${ARCHITECT_PGP_FINGERPRINT.replace(/\s/g, '')}"`,
          { stdio: 'ignore' }
        )
        hasKey = true
      } catch {
        logger.warn('⚠️  Architect PGP Public Key not found in local keychain.')
        logger.raw(`🖋️  Fingerprint: ${ARCHITECT_PGP_FINGERPRINT}`)
        logger.raw(
          `🌐 Download Key: ${OFFICIAL_MANIFEST_URL.replace('SHA256SUMS.asc', 'public.key')}`
        )
        logger.raw(
          '💡 Run: gpg --import public.key && gpg --verify SHA256SUMS.asc\n'
        )
      }

      // 2. Locate and Parse Manifest
      if (!existsSync(manifestPath)) {
        throw new Error(
          `Manifest not found: ${manifestPath}\nEnsure SHA256SUMS.asc is present in the target directory.`
        )
      }

      const manifestRaw = readFileSync(manifestPath, 'utf-8')
      const currentHash = calculateFileHash(targetPath)

      // Extract signed content if it's a clearsigned GPG message
      let manifestBody = manifestRaw
      if (manifestRaw.includes('-----BEGIN PGP SIGNED MESSAGE-----')) {
        const parts = manifestRaw.split('-----BEGIN PGP SIGNATURE-----')
        const bodyWithHeaders = parts[0].split(
          '-----BEGIN PGP SIGNED MESSAGE-----'
        )[1]
        // Remove GPG headers (Hash: SHA256, etc.) and leading/trailing whitespace
        manifestBody = bodyWithHeaders
          .split('\n\n')
          .slice(1)
          .join('\n\n')
          .trim()
      }

      const lines = manifestBody.split('\n')
      const filename = basename(targetPath)

      // Find matching entry (either by hash or by filename)
      const hashMatch = lines.find((line) =>
        line.trim().startsWith(currentHash)
      )
      const nameMatch = lines.find((line) => line.trim().endsWith(filename))

      const manifestHash = hashMatch
        ? currentHash
        : nameMatch
          ? nameMatch.split(/\s+/)[0]
          : 'NOT FOUND'
      const result = currentHash === manifestHash ? 'VERIFIED' : 'COMPROMISED'

      // 3. High-Density Table Output
      const colWidth = { file: 15, hash: 32, result: 12 }
      const separator = `+${'─'.repeat(colWidth.file + 2)}+${'─'.repeat(colWidth.hash + 2)}+${'─'.repeat(colWidth.hash + 2)}+${'─'.repeat(colWidth.result + 2)}+`

      logger.raw(separator)
      logger.raw(
        `| ${'File'.padEnd(colWidth.file)} | ${'Calculated Hash'.padEnd(colWidth.hash)} | ${'Manifest Hash'.padEnd(colWidth.hash)} | ${'Result'.padEnd(colWidth.result)} |`
      )
      logger.raw(separator)

      const truncatedCalc = currentHash.substring(0, 29) + '...'
      const truncatedManifest = manifestHash.substring(0, 29) + '...'
      const resultColor = result === 'VERIFIED' ? '\x1b[32m' : '\x1b[31m'
      const reset = '\x1b[0m'

      logger.raw(
        `| ${filename.padEnd(colWidth.file)} | ${truncatedCalc.padEnd(colWidth.hash)} | ${truncatedManifest.padEnd(colWidth.hash)} | ${resultColor}${result.padEnd(colWidth.result)}${reset} |`
      )
      logger.raw(separator)

      if (result === 'VERIFIED') {
        logger.raw(
          '\n✅ Integrity check passed. This binary matches the official signed manifest.'
        )
        if (hasKey)
          logger.raw(
            '🛡️  Signature valid (manually verified via GPG keychain).'
          )
        if (options.verbose) {
          logger.raw(
            `\n[DEBUG] Cryptographic details:\n  Target: ${targetPath}\n  Manifest: ${manifestPath}\n  Hash: ${manifestHash}`
          )
        }
      } else {
        logger.rawError('\n❌ Integrity: COMPROMISED')
        logger.rawError(
          '⚠️  The binary hash does not match the manifest. Do not execute this tool!'
        )
        process.exit(1)
      }
    } catch (error: unknown) {
      logger.rawError(
        '\n❌ Verification failed:',
        error instanceof Error ? error.message : String(error)
      )
      process.exit(1)
    }
  })

// Hidden test command for E2E verification of the security brief
program
  .command('test-security-brief', { hidden: true })
  .description('Triggers the security brief and exits (for testing)')
  .action(async () => {
    const { checkQuarantine } = await import('./cli-utils.js')
    checkQuarantine()
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
    'Path to an ignore file (.concatenate-ignore, .gitignore, etc.)'
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
  .option(
    '--follow-symlinks',
    'Follow symbolic links during traversal (CAUTION: may cause infinite loops)',
    false
  )
  .option('-q, --quiet', 'Suppress all logging output', false)
  .option(
    '--pulse',
    'Mirror pulse data to stderr for headless CI environments',
    false
  )
  .option('--show-ignored', 'Show ignored files and reasons in stderr', false)
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
        followSymlinks: boolean
        quiet: boolean
        pulse: boolean
        showIgnored: boolean
      }
    ) => {
      // Ensure high-precision BPE strategy is loaded before execution
      await loadCliPrecision()
      try {
        if (options.quiet) {
          logger._setLevel('error')
        }
        if (options.pulse) {
          startPulseMirror()
        }
        // Security Boundary: Reject explicit path traversal in input arguments
        for (const p of paths) {
          if (p.includes('..')) {
            throw new UserError(
              `Security Violation: Path traversal detected in input path: "${p}". Traversal segments (../) are forbidden for security reasons.`
            )
          }
        }

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
        const ignorePatterns = getIgnorePatterns(options, remaining)
        const ignoreEngine = new IgnoreEngine(ignorePatterns)

        const allFiles: FileWithMetadata[] = []
        let totalTokens = 0

        for (const inputPath of remaining) {
          if (!existsSync(inputPath)) {
            logger.warn(`Warning: Path ${inputPath} does not exist. Skipping.`)
            continue
          }

          const stats = statSync(inputPath)
          const baseDir = stats.isDirectory()
            ? remaining.length === 1
              ? inputPath
              : dirname(inputPath)
            : dirname(inputPath)

          const crawler = new UnifiedCrawler({
            rootPath: baseDir,
            ignoreEngine,
            followSymlinks: options.followSymlinks,
          })

          const entries = crawler.collect(inputPath)

          // ── Pass 1: read files and accumulate tokens per directory ──────────
          const dirTokens = new Map<string, number>()

          for (const entry of entries) {
            if (entry.status === 'ignored' || entry.status === 'rejected') {
              if (options.showIgnored) {
                process.stderr.write(
                  `[-] skipped ${entry.path} (${entry.reason})\n`
                )
              }
              continue
            }

            try {
              const content = readFileSync(entry.fullPath, 'utf-8')
              const tokens = TokenService.getTokenCount(content).count

              allFiles.push({
                path: entry.path,
                content,
                tokens,
                size: entry.size,
              })

              totalTokens += tokens

              if (options.verbose >= 2) {
                logger.info(
                  `  [${tokens.toLocaleString().padStart(8)} tokens] ${entry.path}`
                )
              }

              // Roll tokens up to every ancestor directory
              if (options.verbose >= 1) {
                const parts = entry.path.split('/')
                for (let depth = 1; depth < parts.length; depth++) {
                  const dirPath = parts.slice(0, depth).join('/')
                  dirTokens.set(dirPath, (dirTokens.get(dirPath) ?? 0) + tokens)
                }
                dirTokens.set('.', (dirTokens.get('.') ?? 0) + tokens)
              }
            } catch {
              // Skip files that can't be read
            }
          }

          // ── Pass 2: log directory summaries (verbose -v) ────────────────────
          if (options.verbose >= 1) {
            const sortedDirs = [...dirTokens.entries()].sort((a, b) => {
              const depthA = a[0] === '.' ? 0 : a[0].split('/').length
              const depthB = b[0] === '.' ? 0 : b[0].split('/').length
              return depthB - depthA // deepest first
            })
            for (const [dirPath, tokens] of sortedDirs) {
              logger.info(`Dir: ${dirPath} (${tokens.toLocaleString()} tokens)`)
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

        const pulseEmitter = options.pulse
          ? new PulseEmitter('Concatenation')
          : null
        if (pulseEmitter) pulseEmitter.start()

        const result = concatenate(
          allFiles,
          undefined,
          undefined,
          (progress) => {
            if (pulseEmitter) pulseEmitter.update(progress)
          }
        )

        if (pulseEmitter) pulseEmitter.stop()

        const bundleSize = Buffer.byteLength(result, 'utf-8')

        if (options.output) {
          // Check for directory collision before writing
          checkOutputPath(options.output, options.force, 'file')
          writeFileSync(options.output, result)
          const finalTokenResult = TokenService.getTokenCount(result)
          const finalOutputTokens = finalTokenResult.count
          const tokensSaved = Math.max(0, totalTokens - finalOutputTokens)
          const savedPercent =
            totalTokens > 0
              ? ((tokensSaved / totalTokens) * 100).toFixed(1)
              : '0'

          const isPrecise = TokenService.isPrecise()
          logger.info(
            `✔ Created ${options.output} (${formatFileSize(bundleSize)} | Total Tokens (${finalTokenResult.model}): ${finalOutputTokens.toLocaleString()}${isPrecise ? '' : ' [Heuristic Estimation]'}).`
          )
          if (tokensSaved > 0) {
            logger.info(
              `  └─ Tokens Saved: ${tokensSaved.toLocaleString()} (${savedPercent}%)`
            )
          }
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
    'Bundle extracted files into a single .zip archive instead of reconstructing the directory tree on disk',
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
  .option('-q, --quiet', 'Suppress all logging output', false)
  .option(
    '--pulse',
    'Mirror pulse data to stderr for headless CI environments',
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
        quiet: boolean
        pulse: boolean
      }
    ) => {
      // Ensure high-precision BPE strategy is loaded before execution
      await loadCliPrecision()
      try {
        if (options.quiet) {
          logger._setLevel('error')
        }
        if (options.pulse) {
          startPulseMirror()
        }
        const content = readFileSync(inputFile, 'utf-8')

        const pulseEmitter = options.pulse
          ? new PulseEmitter('Deconcatenation')
          : null
        if (pulseEmitter) pulseEmitter.start()

        const result = deconcatenate(content)

        if (pulseEmitter) pulseEmitter.stop()

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

          // Check for overwrites if output directory is specified
          const overwrites: string[] = []
          if (options.output) {
            for (const relPath of validationResult.targetFiles) {
              const fullPath = join(options.output, relPath)
              if (existsSync(fullPath)) {
                overwrites.push(relPath)
              }
            }
          }
          validationResult.overwrites = overwrites

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
    'Path to an ignore file (.concatenate-ignore, .gitignore, etc.)'
  )
  .option('-q, --quiet', 'Suppress all logging output', false)
  .action(
    async (
      paths: string[],
      options: {
        tokens: boolean
        verbose: number
        exclude: string
        ignoreFile?: string
        quiet: boolean
      }
    ) => {
      // Ensure high-precision BPE strategy is loaded before execution
      await loadCliPrecision()
      try {
        if (options.quiet) {
          logger._setLevel('error')
        }
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
                `TOTAL CONTEXT WEIGHT (Precise Tokens): ${totalTokens.toLocaleString()}`
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
                `✓ Pre-flight check passed for ${inputPath}: ${files.length} files, ${totalTokens.toLocaleString()} tokens.`
              )
            }
          } else {
            // File validation
            try {
              const content = readFileSync(inputPath, 'utf-8')
              const result = validateConcatenation(content)
              formatValidationReport(result, inputPath, options.verbose, false)
              if (!result.isValid) {
                process.exit(1)
              }
            } catch (error: unknown) {
              if (
                error instanceof TamperDetectedError ||
                error instanceof SecurityViolation ||
                (error instanceof Error && error.name === 'TamperDetectedError')
              ) {
                logger.rawError('\n❌ CRYPTOGRAPHIC VALIDATION FAILURE: Tampered Bundle Detected!')
                logger.rawError(
                  `⚠️  ${error instanceof Error ? error.message : String(error)}`
                )
                process.exit(1)
              }
              throw error
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
  logger.raw('')
  logger.raw('Examples:')
  logger.raw('  $ concatenator --ui')
  logger.raw('  $ concatenator concat -o context.txt ./src')
  logger.raw('  $ concatenator concat -v -e node_modules,dist ./my-project')
  logger.raw('  $ concatenator extract -o ./restored bundle.txt')
  logger.raw('  $ concatenator extract --zip -o restored.zip bundle.txt')
  logger.raw('  $ concatenator validate --verbose bundle.txt')
})

// Parse CLI arguments if not launching UI and not in test environment
if (!process.env.VITEST) {
  if (process.argv.includes('--ui') && !process.argv.includes('ui')) {
    // Backwards compatibility for --ui flag without arguments
    launchUI(undefined, { version: cliVersion })
  } else {
    program.parse()
  }
}
