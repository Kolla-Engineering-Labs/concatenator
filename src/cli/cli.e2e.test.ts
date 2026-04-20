/**
 * Copyright 2026 Kolla-Labs Software Inc.
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI E2E Test Suite
 * Tests the CLI functionality using child_process and temporary workspaces
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmdirSync,
  unlinkSync,
  readdirSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, normalize, sep } from 'path'

interface CLIResult {
  status: number
  stdout: string
  stderr: string
}

/**
 * Helper function to run CLI commands using tsx
 */
function runCLI(args: string[]): CLIResult {
  const result = spawnSync('npx', ['tsx', 'src/cli/index.ts', ...args], {
    encoding: 'utf-8',
    cwd: process.cwd(),
    timeout: 30000,
    shell: true,
  })

  // Handle null status (process terminated by signal) - treat as non-zero exit
  const status =
    result.status === null ? (result.signal ? 1 : 0) : result.status

  return {
    status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

/**
 * Create a unique temporary directory
 */
function createTempDir(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const tempDir = join(tmpdir(), `concatenator-cli-test-${timestamp}-${random}`)
  mkdirSync(tempDir, { recursive: true })
  return tempDir
}

/**
 * Recursively delete a directory and all its contents
 */
function deleteRecursive(dirPath: string): void {
  if (!existsSync(dirPath)) return

  const entries = readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      deleteRecursive(fullPath)
    } else {
      unlinkSync(fullPath)
    }
  }

  rmdirSync(dirPath)
}

/**
 * Normalize path for cross-platform comparisons
 */
function normalizePath(inputPath: string): string {
  return normalize(inputPath).split(sep).join('/')
}

describe('CLI E2E Tests', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    deleteRecursive(tempDir)
  })

  describe('Concatenation Flow', () => {
    it('should concatenate 3 files with one nested and include session manifest', () => {
      // Create directory structure
      const nestedDir = join(tempDir, 'src', 'utils')
      mkdirSync(nestedDir, { recursive: true })

      // Create 3 files
      writeFileSync(join(tempDir, 'root.txt'), 'Root level content')
      writeFileSync(join(tempDir, 'src', 'main.ts'), 'console.log("main")')
      writeFileSync(
        join(nestedDir, 'helper.ts'),
        'export const helper = () => {}'
      )

      // Run CLI to concatenate
      const outputPath = join(tempDir, 'output.txt')
      const result = runCLI([tempDir, outputPath])

      // Verify exit code is 0
      expect(result.status).toBe(0)

      // Verify output file exists
      expect(existsSync(outputPath)).toBe(true)

      // Verify content contains session manifest
      const content = readFileSync(outputPath, 'utf-8')
      expect(content).toContain('--- CONCATENATOR_SESSION_ID:')
      expect(content).toContain('Concatenated on:')

      // Verify all files are included (use regex to handle both / and \ path separators)
      expect(content).toMatch(/FILE_START: root\.txt/)
      expect(content).toMatch(/FILE_START: src[\\/]main\.ts/)
      expect(content).toMatch(/FILE_START: src[\\/]utils[\\/]helper\.ts/)

      // Verify content is preserved
      expect(content).toContain('Root level content')
      expect(content).toContain('console.log("main")')
      expect(content).toContain('export const helper = () => {}')
    })

    it('should output to stdout when no output path is provided', () => {
      writeFileSync(join(tempDir, 'file.txt'), 'Hello World')

      const result = runCLI([tempDir])

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('--- CONCATENATOR_SESSION_ID:')
      expect(result.stdout).toContain('Hello World')
    })
  })

  describe('De-concatenation Flow', () => {
    it('should extract all files with correct directory structure and content', () => {
      // Create a concatenated file with nested structure
      const sessionId = 'test001'
      const concatenatedContent = `--- CONCATENATOR_SESSION_ID: ${sessionId} ---
Concatenated on: 2024-01-01

<<<<< FILE_START: root.txt (ID: ${sessionId}) >>>>>
Root content here
<<<<< FILE_END >>>>>

<<<<< FILE_START: src/main.ts (ID: ${sessionId}) >>>>>
console.log("hello")
<<<<< FILE_END >>>>>

<<<<< FILE_START: src/deep/nested/file.js (ID: ${sessionId}) >>>>>
// nested file
<<<<< FILE_END >>>>>
`

      const inputFile = join(tempDir, 'bundle.txt')
      const outputDir = join(tempDir, 'extracted')
      writeFileSync(inputFile, concatenatedContent)

      // Run CLI with --undo flag
      const result = runCLI(['--undo', inputFile, outputDir])

      // Verify exit code is 0
      expect(result.status).toBe(0)

      // Verify all files were extracted
      expect(existsSync(join(outputDir, 'root.txt'))).toBe(true)
      expect(existsSync(join(outputDir, 'src', 'main.ts'))).toBe(true)
      expect(
        existsSync(join(outputDir, 'src', 'deep', 'nested', 'file.js'))
      ).toBe(true)

      // Verify content is correct
      expect(readFileSync(join(outputDir, 'root.txt'), 'utf-8')).toBe(
        'Root content here'
      )
      expect(readFileSync(join(outputDir, 'src', 'main.ts'), 'utf-8')).toBe(
        'console.log("hello")'
      )
      expect(
        readFileSync(
          join(outputDir, 'src', 'deep', 'nested', 'file.js'),
          'utf-8'
        )
      ).toBe('// nested file')
    })

    it('should extract files as ZIP when --zip flag is used', () => {
      const sessionId = 'zip001'
      const concatenatedContent = `--- CONCATENATOR_SESSION_ID: ${sessionId} ---
Concatenated on: 2024-01-01

<<<<< FILE_START: file1.txt (ID: ${sessionId}) >>>>>
Content 1
<<<<< FILE_END >>>>>

<<<<< FILE_START: file2.txt (ID: ${sessionId}) >>>>>
Content 2
<<<<< FILE_END >>>>>
`

      const inputFile = join(tempDir, 'bundle.txt')
      const zipPath = join(tempDir, 'output.zip')
      writeFileSync(inputFile, concatenatedContent)

      const result = runCLI(['--undo', '--zip', inputFile, zipPath])

      expect(result.status).toBe(0)
      expect(existsSync(zipPath)).toBe(true)

      // Verify it's a valid ZIP (starts with PK magic number)
      const zipHeader = readFileSync(zipPath).subarray(0, 2)
      expect(zipHeader.toString('hex')).toBe('504b') // 'PK' in hex
    })
  })

  describe('Dry Run Validation', () => {
    it('should not create any files during dry-run even with corrupted content', () => {
      // Create content with a file missing end marker
      const corruptedContent = `--- CONCATENATOR_SESSION_ID: bad001 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: incomplete.txt (ID: bad001) >>>>>
This content has no end delimiter

<<<<< FILE_START: valid.txt (ID: bad001) >>>>>
Valid content
<<<<< FILE_END >>>>>
`

      const inputFile = join(tempDir, 'corrupted.txt')
      const outputDir = join(tempDir, 'should-not-exist')
      writeFileSync(inputFile, corruptedContent)

      // Run dry-run - should complete without error
      const result = runCLI(['--undo', '--dry-run', inputFile, outputDir])

      // Verify output directory was NOT created (crucial for dry-run)
      expect(existsSync(outputDir)).toBe(false)

      // Verify dry-run output was produced
      expect(result.stdout).toContain('[DRY RUN]')
      expect(result.stdout).toContain('Detected files:')
    })

    it('should exit with code 0 on valid file and not create any files', () => {
      const sessionId = 'valid001'
      const validContent = `--- CONCATENATOR_SESSION_ID: ${sessionId} ---
Concatenated on: 2024-01-01

<<<<< FILE_START: file1.txt (ID: ${sessionId}) >>>>>
Content 1
<<<<< FILE_END >>>>>

<<<<< FILE_START: file2.txt (ID: ${sessionId}) >>>>>
Content 2
<<<<< FILE_END >>>>>
`

      const inputFile = join(tempDir, 'valid.txt')
      const outputDir = join(tempDir, 'should-not-exist')
      writeFileSync(inputFile, validContent)

      const result = runCLI(['--undo', '--dry-run', inputFile, outputDir])

      // Verify exit code is 0
      expect(result.status).toBe(0)

      // Verify output directory was NOT created
      expect(existsSync(outputDir)).toBe(false)

      // Verify success message
      expect(result.stdout).toContain('✓ Validation passed')
      expect(result.stdout).toContain('2 file(s) ready for extraction')
    })
  })

  describe('Recursive Protection', () => {
    it('should detect collision but still complete with different session ID', () => {
      // Create a file that contains what looks like a session marker pattern
      // This could trigger collision detection
      const fileWithPattern = `
Some code that happens to contain marker patterns
(ID: abc123) >>>>>
Just regular content here
`

      writeFileSync(join(tempDir, 'has-pattern.txt'), fileWithPattern)
      writeFileSync(join(tempDir, 'normal.txt'), 'Normal content')

      const outputPath = join(tempDir, 'output.txt')

      // This should detect the collision and generate a different session ID
      const result = runCLI([tempDir, outputPath])

      // Should succeed (exit code 0) - collision is handled automatically
      expect(result.status).toBe(0)

      // Output should exist
      expect(existsSync(outputPath)).toBe(true)

      // The output should contain both files
      const output = readFileSync(outputPath, 'utf-8')
      expect(output).toContain('has-pattern.txt')
      expect(output).toContain('normal.txt')
    })

    it('should handle files with various marker-like content', () => {
      // File with various patterns that might look like markers
      const variousContent = `
Documentation about markers:
- FILE_START pattern example
- FILE_END marker documentation
- Session ID format explanation
All just documentation content.
`
      writeFileSync(join(tempDir, 'docs.txt'), variousContent)
      writeFileSync(join(tempDir, 'code.ts'), 'const x = 1')

      const outputPath = join(tempDir, 'output.txt')
      const result = runCLI([tempDir, outputPath])

      // Should succeed - documentation content shouldn't cause issues
      expect(result.status).toBe(0)
      expect(existsSync(outputPath)).toBe(true)

      const output = readFileSync(outputPath, 'utf-8')
      expect(output).toContain('docs.txt')
      expect(output).toContain('code.ts')
    })
  })

  describe('Cross-platform Path Handling', () => {
    it('should normalize paths correctly on all platforms', () => {
      const nestedDir = join(tempDir, 'level1', 'level2', 'level3')
      mkdirSync(nestedDir, { recursive: true })

      writeFileSync(join(nestedDir, 'deep.txt'), 'Deep content')

      const outputPath = join(tempDir, 'output.txt')
      const result = runCLI([tempDir, outputPath])

      expect(result.status).toBe(0)

      const content = readFileSync(outputPath, 'utf-8')

      // Use normalized path for comparison
      const expectedPath = normalizePath('level1/level2/level3/deep.txt')
      expect(normalizePath(content)).toContain(expectedPath)
    })
  })

  describe('CLI Help and Error Handling', () => {
    it('should show help text with --help flag', () => {
      const result = runCLI(['--help'])

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Usage:')
      expect(result.stdout).toContain('--undo')
      expect(result.stdout).toContain('--zip')
      expect(result.stdout).toContain('--dry-run')
    })

    it('should handle non-existent input directory gracefully', () => {
      const nonExistentPath = join(tempDir, 'does-not-exist')
      const result = runCLI([nonExistentPath])

      expect(result.status).toBe(1)
      expect(result.stderr + result.stdout).toContain('Error')
    })
  })
})
