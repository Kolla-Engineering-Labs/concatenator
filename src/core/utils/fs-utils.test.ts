/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { isDirectoryTainted } from './fs-utils'

describe('fs-utils: isDirectoryTainted', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `fs-utils-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    )
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns false for non-existent path', () => {
    const nonExistent = join(tempDir, 'does-not-exist')
    expect(isDirectoryTainted(nonExistent)).toBe(false)
  })

  it('returns true for a file', () => {
    const filePath = join(tempDir, 'file.txt')
    writeFileSync(filePath, 'content')
    expect(isDirectoryTainted(filePath)).toBe(true)
  })

  it('returns false for an empty directory', () => {
    const subDir = join(tempDir, 'empty-dir')
    mkdirSync(subDir)
    expect(isDirectoryTainted(subDir)).toBe(false)
  })

  it('returns true for a directory with a file', () => {
    const subDir = join(tempDir, 'dir-with-file')
    mkdirSync(subDir)
    writeFileSync(join(subDir, 'hello.txt'), 'hi')
    expect(isDirectoryTainted(subDir)).toBe(true)
  })

  it('returns false for a directory containing only .DS_Store', () => {
    const subDir = join(tempDir, 'dir-with-ds-store')
    mkdirSync(subDir)
    writeFileSync(join(subDir, '.DS_Store'), '')
    expect(isDirectoryTainted(subDir)).toBe(false)
  })

  it('returns false for a directory containing only Thumbs.db', () => {
    const subDir = join(tempDir, 'dir-with-thumbs-db')
    mkdirSync(subDir)
    writeFileSync(join(subDir, 'Thumbs.db'), '')
    expect(isDirectoryTainted(subDir)).toBe(false)
  })

  it('returns false for a directory containing both .DS_Store and Thumbs.db', () => {
    const subDir = join(tempDir, 'dir-with-both')
    mkdirSync(subDir)
    writeFileSync(join(subDir, '.DS_Store'), '')
    writeFileSync(join(subDir, 'Thumbs.db'), '')
    expect(isDirectoryTainted(subDir)).toBe(false)
  })

  it('returns true if a directory contains a normal file plus .DS_Store', () => {
    const subDir = join(tempDir, 'dir-complex')
    mkdirSync(subDir)
    writeFileSync(join(subDir, '.DS_Store'), '')
    writeFileSync(join(subDir, 'real-file.txt'), 'content')
    expect(isDirectoryTainted(subDir)).toBe(true)
  })
})
