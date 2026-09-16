/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, afterEach, vi } from 'vitest'
import {
  TreeSitterService,
  treeSitterService,
  loadWasmBuffer,
} from '../../../src/core/parsers/TreeSitterService.js'

afterEach(() => {
  TreeSitterService.resetInstance()
  vi.restoreAllMocks()
})

// ==========================================
// Singleton & Lifecycle
// ==========================================

test('TreeSitterService: getInstance returns identical singleton instance', () => {
  const instanceA = TreeSitterService.getInstance()
  const instanceB = TreeSitterService.getInstance()

  expect(instanceA).toBe(instanceB)
  expect(instanceA).toBe(treeSitterService)
})

test('TreeSitterService: resetInstance cleanly disposes and clears singleton instance', () => {
  const instance1 = TreeSitterService.getInstance()
  TreeSitterService.resetInstance()
  const instance2 = TreeSitterService.getInstance()

  expect(instance1).not.toBe(instance2)
})

test('TreeSitterService.isInitialized: reports false initially before initialization', () => {
  const service = TreeSitterService.getInstance()
  expect(service.isInitialized()).toBe(false)
})

test('TreeSitterService.dispose: resets initialization state and clears grammars', () => {
  const service = TreeSitterService.getInstance()
  service.dispose()
  expect(service.isInitialized()).toBe(false)
})

// ==========================================
// Language Resolution & Extension Mapping
// ==========================================

test('TreeSitterService.resolveLanguageName: resolves common extensions to typescript', () => {
  const service = TreeSitterService.getInstance()

  expect(service.resolveLanguageName('.ts')).toBe('typescript')
  expect(service.resolveLanguageName('.tsx')).toBe('typescript')
  expect(service.resolveLanguageName('.js')).toBe('typescript')
  expect(service.resolveLanguageName('.jsx')).toBe('typescript')
  expect(service.resolveLanguageName('.mjs')).toBe('typescript')
  expect(service.resolveLanguageName('.cjs')).toBe('typescript')
  expect(service.resolveLanguageName('ts')).toBe('typescript')
  expect(service.resolveLanguageName('tsx')).toBe('typescript')
})

test('TreeSitterService.resolveLanguageName: returns null for unknown extensions', () => {
  const service = TreeSitterService.getInstance()
  expect(service.resolveLanguageName('.unknown')).toBeNull()
  expect(service.resolveLanguageName('.rb')).toBeNull()
})

test('TreeSitterService.registerExtension: registers custom extension mapping', () => {
  const service = TreeSitterService.getInstance()
  service.registerExtension('.py', 'python')

  expect(service.resolveLanguageName('.py')).toBe('python')
})

// ==========================================
// Parsing Contracts & Error Safety
// ==========================================

test('TreeSitterService.parseSync: returns null when uninitialized or grammar not cached', () => {
  const service = TreeSitterService.getInstance()
  const tree = service.parseSync('const a = 1;', '.ts')
  expect(tree).toBeNull()
})

test('TreeSitterService.parse: gracefully returns null and warns on missing grammar file', async () => {
  const service = TreeSitterService.getInstance()
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const result = await service.parse(
    'print("hello")',
    'nonexistent_lang_grammar_xyz'
  )
  expect(result).toBeNull()
  expect(warnSpy).toHaveBeenCalled()
})

// ==========================================
// WASM Binary Loader (loadWasmBuffer)
// ==========================================

test('loadWasmBuffer: throws clear error when binary path cannot be resolved', async () => {
  await expect(
    loadWasmBuffer('wasm/nonexistent-binary-for-test-xyz.wasm')
  ).rejects.toThrow(/Failed to (?:load|fetch) WASM binary/)
})

test('loadWasmBuffer: intercepts raw TypeError or fetch rejections and normalizes error format', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi
    .fn()
    .mockRejectedValue(
      new TypeError('Failed to parse URL from /wasm/corrupt.wasm')
    )

  try {
    await expect(
      loadWasmBuffer('wasm/corrupt-test-nonexistent-xyz.wasm')
    ).rejects.toThrow(
      /Failed to load WASM binary from 'wasm\/corrupt-test-nonexistent-xyz\.wasm': Failed to parse URL/
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
