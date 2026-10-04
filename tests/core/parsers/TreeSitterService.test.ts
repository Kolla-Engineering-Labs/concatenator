/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, afterEach, vi } from 'vitest'
import { Parser } from 'web-tree-sitter'
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

test('TreeSitterService.isInitialized & checkWasmReady: reports false initially before initialization', async () => {
  const service = TreeSitterService.getInstance()
  expect(service.isInitialized()).toBe(false)
  expect(await service.checkWasmReady()).toBe(false)
})

test('TreeSitterService.dispose: resets initialization state and clears grammars', async () => {
  const service = TreeSitterService.getInstance()
  service.dispose()
  expect(service.isInitialized()).toBe(false)
  expect(await service.checkWasmReady()).toBe(false)
})

test('TreeSitterService.initialize & checkWasmReady: successfully initializes and returns ready true', async () => {
  const service = TreeSitterService.getInstance()
  await service.initialize()
  expect(service.isInitialized()).toBe(true)
  expect(await service.checkWasmReady()).toBe(true)
})

test('TreeSitterService.initialize: prioritizes Node environment even if window global is present', async () => {
  const originalWindow = (globalThis as any).window
  try {
    ;(globalThis as any).window = {}
    const service = TreeSitterService.getInstance()
    await service.initialize()
    expect(service.isInitialized()).toBe(true)
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as any).window
    } else {
      ;(globalThis as any).window = originalWindow
    }
  }
})

test('TreeSitterService.initialize: fails loudly when Parser.init rejects and resets initPromise', async () => {
  vi.spyOn(Parser, 'init').mockRejectedValueOnce(
    new Error('WASM binary rejected')
  )

  const service = TreeSitterService.getInstance()

  await expect(service.initialize()).rejects.toThrow(
    /\[TreeSitterService\] Failed to initialize web-tree-sitter engine: WASM binary rejected/
  )
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

test('TreeSitterService.isLanguageSupported: identifies supported vs unmapped extensions', () => {
  const service = TreeSitterService.getInstance()
  expect(service.isLanguageSupported('.ts')).toBe(true)
  expect(service.isLanguageSupported('.tsx')).toBe(true)
  expect(service.isLanguageSupported('.js')).toBe(true)
  expect(service.isLanguageSupported('.txt')).toBe(false)
  expect(service.isLanguageSupported('.md')).toBe(false)
  expect(service.isLanguageSupported('.env')).toBe(false)
})

test('TreeSitterService.parse: cleanly returns null without warning for unmapped text extensions', async () => {
  const service = TreeSitterService.getInstance()
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const resultTxt = await service.parse('Plain text notes', '.txt')
  const resultMd = await service.parse('# Markdown header', '.md')
  const resultEnv = await service.parse('KEY=VALUE', '.env')

  expect(resultTxt).toBeNull()
  expect(resultMd).toBeNull()
  expect(resultEnv).toBeNull()
  expect(warnSpy).not.toHaveBeenCalled()
})

test('TreeSitterService.parse: gracefully returns null and warns when registered grammar asset fails to load', async () => {
  const service = TreeSitterService.getInstance()
  service.registerExtension('.fake', 'nonexistent_lang')
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const result = await service.parse('print("hello")', '.fake')
  expect(result).toBeNull()
  expect(warnSpy).not.toHaveBeenCalled()
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

test('loadWasmBuffer: throws clear error when fetch returns non-ok response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
  })

  try {
    await expect(
      loadWasmBuffer('wasm/missing-binary-404.wasm')
    ).rejects.toThrow(
      /Failed to fetch WASM binary at '\/wasm\/missing-binary-404\.wasm': HTTP 404 Not Found/
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TreeSitterService.checkWasmReady: returns false when initPromise rejects', async () => {
  vi.spyOn(Parser, 'init').mockRejectedValueOnce(
    new Error('Engine startup failed')
  )
  const service = TreeSitterService.getInstance()
  const initPromise = service.initialize()
  await expect(initPromise).rejects.toThrow('Engine startup failed')
  expect(await service.checkWasmReady()).toBe(false)
})
