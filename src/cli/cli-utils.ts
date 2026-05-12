/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  type VirtualFile,
  type ValidationResult,
  generateSessionId,
} from '../core/engine.js'
import { isDirectoryTainted } from '../core/utils/fs-utils.js'
import { UserError } from '../core/errors.js'
export { UserError }
import { logger } from '../lib/logger.js'
import { IgnoreEngine } from '../core/ignore/IgnoreEngine.js'
import { TokenService } from '../core/TokenService.js'

export interface UIConfig {
  maxFiles?: number
  ignoreFile?: string
  version?: string
}

/**
 * Calculate SHA256 hash of a file.
 */
export function calculateFileHash(filePath: string): string {
  const buffer = readFileSync(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Check if the binary is quarantined on macOS and print a security brief.
 */
export function checkQuarantine(): void {
  const isMocked = process.env.CONCATENATOR_MOCK_QUARANTINE === 'true'
  if (process.platform !== 'darwin' && !isMocked) return

  try {
    const exePath = process.execPath
    // Check for quarantine attribute
    let isQuarantined = false

    if (isMocked) {
      isQuarantined = true
    } else {
      const output = execSync(`ls -l@ "${exePath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      isQuarantined = output.includes('com.apple.quarantine')
    }

    if (isQuarantined) {
      console.log('\n' + '█'.repeat(80))
      console.log(' 🛡️  SECURITY BRIEF: MACOS QUARANTINE DETECTED')
      console.log('█'.repeat(80))
      console.log(
        '\nThis tool is currently restricted by macOS Gatekeeper because it is ad-hoc signed.'
      )
      console.log(
        'To unlock full functionality and bypass security prompts, run:'
      )
      console.log(
        '\n  \x1b[33m%s\x1b[0m',
        `xattr -d com.apple.quarantine "${exePath}"`
      )
      console.log(
        '\n--------------------------------------------------------------------------------'
      )
      console.log('WHY THIS IS HAPPENING:')
      console.log(
        'The SHA-256 hash in our GPG-signed manifest is the \x1b[1mPrimary Proof of Integrity\x1b[0m,'
      )
      console.log(
        'overriding the OS\'s "Unsigned" warning to provide a verifiable guarantee'
      )
      console.log('without centralized dependencies or the "Apple Tax".')
      console.log('\nDetailed rationale: docs/MACOS_SECURITY.md')
      console.log(
        '--------------------------------------------------------------------------------'
      )
      console.log('█'.repeat(80) + '\n')
    }
  } catch {
    // If ls -l@ fails, we just continue
  }
}

/**
 * Generate a short SHA-256 hash of the normalized absolute path.
 */
export function getProjectHash(path: string): string {
  const normalizedPath = resolve(path)
  return createHash('sha256')
    .update(normalizedPath)
    .digest('hex')
    .substring(0, 8)
}

/**
 * Write a lock file containing process and session information.
 */
export function acquireLock(
  projectPath: string,
  data: { pid: number; port: number; token: string; sessionId: string }
): void {
  const lockPath = join(projectPath, '.concatenator.lock')
  writeFileSync(lockPath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Mirror pulse data to stderr for headless CI environments.
 */
export function startPulseMirror(): void {
  const pulsePath = join(process.cwd(), '.concatenator', 'pulse.json')
  let lastTs = 0

  const interval = setInterval(() => {
    if (existsSync(pulsePath)) {
      try {
        const data = JSON.parse(readFileSync(pulsePath, 'utf-8'))
        if (data.ts > lastTs) {
          process.stderr.write(
            `[PULSE] ${data.op}: ${data.progress}% (${data.active ? 'active' : 'done'})\n`
          )
          lastTs = data.ts
        }
        if (!data.active) {
          clearInterval(interval)
        }
      } catch {
        // Ignore read errors
      }
    }
  }, 500)
}

/**
 * Ensure .concatenator.lock is added to .gitignore if it's missing.
 */
export function ensureLockInGitignore(projectPath: string): void {
  const gitignorePath = join(projectPath, '.gitignore')
  const lockEntry = '.concatenator.lock'

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    if (!content.split(/\r?\n/).some((line) => line.trim() === lockEntry)) {
      const separator = content.endsWith('\n') ? '' : '\n'
      writeFileSync(
        gitignorePath,
        `${content}${separator}${lockEntry}\n`,
        'utf-8'
      )
      logger.info(`Added ${lockEntry} to .gitignore`)
    }
  }
}

/**
 * File metadata with token and size info
 */
export interface FileWithMetadata {
  path: string
  content: string
  tokens: number
  size: number
}

/**
 * Recursively collect all files from a directory and calculate tokens
 */
export function collectFiles(
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
export function getIgnorePatterns(
  options: {
    exclude?: string
    ignoreFile?: string
  },
  inputPaths: string[] = []
): string[] {
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
    // Auto-discovery in CWD: .concatenate-ignore then .gitignore
    if (existsSync('.concatenate-ignore')) {
      ignoreFilePath = '.concatenate-ignore'
    } else if (existsSync('.gitignore')) {
      ignoreFilePath = '.gitignore'
    }
  }

  // 3. Load patterns from explicit or auto-discovered file
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

  // 4. If no explicit ignore file, also look for local ignore files in input paths
  if (!isExplicit) {
    for (const inputPath of inputPaths) {
      try {
        const stats = statSync(inputPath)
        const baseDir = stats.isDirectory() ? inputPath : dirname(inputPath)

        const candidates = ['.concatenate-ignore', '.gitignore']
        for (const candidate of candidates) {
          const localPath = join(baseDir, candidate)
          if (existsSync(localPath) && localPath !== ignoreFilePath) {
            const content = readFileSync(localPath, 'utf-8')
            const localPatterns = IgnoreEngine.parseIgnoreFile(content)
            patterns = patterns.concat(localPatterns)
          }
        }
      } catch {
        // Skip if path doesn't exist or other error
      }
    }
  }

  // Deduplicate patterns
  return Array.from(new Set(patterns))
}

/**
 * Check if output path exists and handle collisions
 * Returns true if path is safe to write, false if handled by force
 * Throws user-friendly error if collision detected without force
 */
export function checkOutputPath(
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
    throw new UserError(
      `Path ${outputPath} exists as a directory. Please provide a different filename or use --force to overwrite.`
    )
  }

  if (!isDir && itemType === 'directory') {
    if (force) {
      rmSync(outputPath, { recursive: true, force: true })
      return true
    }
    throw new UserError(
      `Path ${outputPath} exists as a file. Please provide a different directory name or use --force to overwrite.`
    )
  }

  if (isDir && itemType === 'directory') {
    if (force) {
      rmSync(outputPath, { recursive: true, force: true })
      return true
    }
    if (isDirectoryTainted(outputPath)) {
      throw new UserError(
        `Directory ${outputPath} already exists and is not empty. Please provide a different directory name or use --force to overwrite.`
      )
    }
    return true
  }

  // File exists and itemType is file
  if (force) {
    rmSync(outputPath, { recursive: true, force: true })
    return true
  }

  throw new UserError(
    `File ${outputPath} already exists. Use --force to overwrite.`
  )
}

/**
 * Reconstruct files from deconcatenated content (File Explosion mode)
 */
export function reconstructFiles(
  files: VirtualFile[],
  outputDir: string,
  force = false
): void {
  // Check if output directory exists as a file
  checkOutputPath(outputDir, force, 'directory')

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  for (const file of files) {
    const fullPath = join(outputDir, file.path)
    const dir = dirname(fullPath)

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    checkOutputPath(fullPath, force, 'file')
    writeFileSync(fullPath, file.content, 'utf-8')
  }
}

/**
 * Format validation result for CLI output
 * Displays a professional summary with colors (if supported)
 */
export function formatValidationReport(
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

  // Segmented file summary
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

  // File list
  if (result.targetFiles.length > 0) {
    logger.info('')
    logger.info(`Files to be Extracted (${result.targetFiles.length}):`)
    for (const path of result.targetFiles) {
      logger.info(`  ✓ ${path}`)
    }
  }

  // Foreign files (verbose mode)
  if (verbose && result.foreignFiles.length > 0) {
    logger.info('')
    logger.info(`Foreign Markers Ignored (${result.foreignFiles.length}):`)
    const limit = isVeryVerbose ? result.foreignFiles.length : 20
    for (const path of result.foreignFiles.slice(0, limit)) {
      logger.info(`  • ${path}`)
    }
    if (!isVeryVerbose && result.foreignFiles.length > 20) {
      logger.info(
        `  ... and ${result.foreignFiles.length - 20} more (use -vv to see all)`
      )
    }
  }

  // Overwrites (Dry Run Only)
  if (isDryRun && result.overwrites && result.overwrites.length > 0) {
    logger.info('')
    logger.warn(`Potential Overwrites (${result.overwrites.length}):`)
    const limit = isVeryVerbose ? result.overwrites.length : 10
    for (const path of result.overwrites.slice(0, limit)) {
      logger.warn(`  ! ${path}`)
    }
    if (!isVeryVerbose && result.overwrites.length > 10) {
      logger.info(
        `  ... and ${result.overwrites.length - 10} more (use -vv to see all)`
      )
    }
    logger.warn(`Use --force to permit overwriting these files.`)
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
export function handleError(error: unknown): void {
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

/**
 * Launch the web-based Workbench UI
 */
export async function launchUI(path?: string, options: UIConfig = {}) {
  const projectPath = resolve(path || process.cwd())
  const projectHash = getProjectHash(projectPath)
  const lockPath = join(projectPath, '.concatenator.lock')

  logger.debug(`CLI: Project Scope [${projectHash}] at ${projectPath}`)
  if (existsSync(lockPath)) {
    try {
      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'))
      const response = await fetch(
        `http://localhost:${lockData.port}/api/health`,
        {
          method: 'GET',
        }
      ).catch(() => null)

      if (response && response.ok) {
        const health = await response.json()
        if (health.pid === lockData.pid) {
          logger.info(
            `\n🚀 Server already running for this project at http://localhost:${lockData.port}\n`
          )
          const { exec } = await import('node:child_process')
          const startCmd =
            process.platform === 'win32'
              ? 'start ""'
              : process.platform === 'darwin'
                ? 'open'
                : 'xdg-open'
          exec(`${startCmd} "http://localhost:${lockData.port}"`)
          return
        }
      }
    } catch {
      // Corrupted lock or dead server, proceed
    }
  }

  try {
    const { UIServer } = await import('../core/UIServer.js')
    const { webAssets } = await import('./web-assets.js')
    const sessionId = generateSessionId()
    const tokenBuffer = randomBytes(32)
    const token = tokenBuffer.toString('hex')

    // Pass session and token via environment
    process.env.CONCATENATOR_SESSION_ID = sessionId
    process.env.CONCATENATOR_TOKEN = token

    const server = new UIServer(0, webAssets, {
      path,
      maxFiles: options.maxFiles,
      ignoreFile: options.ignoreFile,
      version: options.version,
    })
    const port = await server.start()

    // Acquire lock and update .gitignore
    acquireLock(projectPath, {
      pid: process.pid,
      port,
      token: token,
      sessionId,
    })
    ensureLockInGitignore(projectPath)

    const url = `http://127.0.0.1:${port}`
    const authenticatedUrl = `${url}?t=${token}`
    logger.info(`\n🚀 Starting Concatenator Workbench UI at ${url}\n`)

    // Launch browser
    const { exec } = await import('node:child_process')
    const startCmd =
      process.platform === 'win32'
        ? 'start ""'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open'
    exec(`${startCmd} "${authenticatedUrl}"`, (err) => {
      if (err) {
        logger.warn(
          `\nCould not automatically open browser. Please manually visit: ${authenticatedUrl}`
        )
      }
    })

    // ── Graceful Shutdown Handler ───────────────────────────────────────────────
    process.on('SIGINT', async () => {
      logger.info('\n\nCLI: Termination signal received. Securing VFS...')

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        logger.error('CLI: Shutdown timeout exceeded. Forcing exit.')
        process.exit(1)
      }, 2000)

      try {
        const response = await fetch(`${url}/api/shutdown`, {
          method: 'POST',
          headers: {
            'X-Concatenator-Token': token,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        })

        if (response.ok) {
          logger.info('CLI: Shutdown sequence initiated.')
          tokenBuffer.fill(0)
          delete process.env.CONCATENATOR_TOKEN
        } else {
          const errorText = await response.text()
          logger.error(
            `CLI: Shutdown request failed: ${response.status} ${errorText}`
          )
          process.exit(1)
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // Handled by timeout
        } else {
          logger.error(
            `CLI: Error communicating with server: ${error instanceof Error ? error.message : String(error)}`
          )
          process.exit(1)
        }
      } finally {
        clearTimeout(timeoutId)
      }
    })

    process.stdin.resume()
  } catch (e) {
    logger.error('Failed to start UI:', e)
    process.exit(1)
  }
}
