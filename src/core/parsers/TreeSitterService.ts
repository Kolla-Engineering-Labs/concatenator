/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Parser, Language, type Tree } from 'web-tree-sitter'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Isomorphically loads a WASM binary buffer across Browser, Node SEA, and Node dev runtimes.
 *
 * @param assetPath Relative asset path (e.g., 'wasm/tree-sitter.wasm')
 * @returns Uint8Array buffer of the WASM binary
 */
export async function loadWasmBuffer(assetPath: string): Promise<Uint8Array> {
  const normalizedKey = assetPath.replace(/^\/+/, '')

  try {
    // 1. Node.js SEA (Single Executable Application) or Node.js environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        // Obscure the literal from Vite's static analyzer to prevent bundling panics
        const seaModule = 'node:sea'
        const sea = await import(/* @vite-ignore */ seaModule)
        if (typeof sea.isSea === 'function' && sea.isSea()) {
          const rawAsset = sea.getRawAsset(normalizedKey)
          return new Uint8Array(rawAsset)
        }
      } catch {
        // Non-SEA or node:sea not active; fallback to local filesystem
      }

      // Node.js local filesystem fallback (for dev / testing / CLI)
      try {
        const fs = await import('node:fs')

        // Resolve the physical location of this file, then traverse up to the package root
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = dirname(__filename)
        // Adjust the traversal depth ('../../..') depending on where your compiled output lands vs src
        const packageRoot = join(__dirname, '../../..')

        const candidatePaths = [
          join(packageRoot, 'public', normalizedKey),
          join(packageRoot, 'dist', normalizedKey),
          join(process.cwd(), normalizedKey), // Keep as absolute final fallback for SEA
        ]

        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            const buf = fs.readFileSync(p)
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
          }
        }
      } catch {
        // Fall through to fetch API if filesystem read fails
      }
    }

    // 2. Browser / Worker environment via Fetch API
    if (typeof fetch === 'function') {
      const fetchUrl = `/${normalizedKey}`
      const response = await fetch(fetchUrl)
      if (!response.ok) {
        throw new Error(
          `Failed to fetch WASM binary at '${fetchUrl}': HTTP ${response.status} ${response.statusText}`
        )
      }
      const arrayBuffer = await response.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    }

    throw new Error(
      `Unable to load WASM binary '${assetPath}': Unsupported runtime environment.`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.startsWith('Failed to fetch WASM binary') ||
      message.startsWith('Failed to load WASM binary')
    ) {
      throw error instanceof Error ? error : new Error(message)
    }
    throw new Error(
      `Failed to load WASM binary from '${assetPath}': ${message}`
    )
  }
}

/**
 * Isomorphic Singleton Tree-Sitter Service for @concatenator/core
 * Encapsulates WASM initialization, grammar hot-swapping, and AST parsing.
 */
export class TreeSitterService {
  private static instance: TreeSitterService | null = null

  private parser: Parser | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  private readonly grammars: Map<string, Language> = new Map()
  private readonly extensionMap: Map<string, string> = new Map([
    ['.ts', 'typescript'],
    ['.tsx', 'typescript'],
    ['.js', 'typescript'],
    ['.jsx', 'typescript'],
    ['.mjs', 'typescript'],
    ['.cjs', 'typescript'],
    ['ts', 'typescript'],
    ['tsx', 'typescript'],
    ['js', 'typescript'],
    ['jsx', 'typescript'],
    ['mjs', 'typescript'],
    ['cjs', 'typescript'],
    ['typescript', 'typescript'],
    ['javascript', 'typescript'],
  ])

  private readonly grammarAssetMap: Map<string, string> = new Map([
    ['typescript', 'wasm/tree-sitter-typescript.wasm'],
  ])

  private constructor() {}

  /**
   * Access the singleton TreeSitterService instance
   */
  public static getInstance(): TreeSitterService {
    if (!TreeSitterService.instance) {
      TreeSitterService.instance = new TreeSitterService()
    }
    return TreeSitterService.instance
  }

  /**
   * Reset singleton instance (primarily for testing and environment isolation)
   */
  public static resetInstance(): void {
    if (TreeSitterService.instance) {
      TreeSitterService.instance.dispose()
      TreeSitterService.instance = null
    }
  }

  /**
   * Isomorphically initialize web-tree-sitter parser engine
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return

    if (this.initPromise !== null && this.initPromise !== undefined) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      try {
        // Strict Node detection bypasses JSDOM/HappyDOM false-positives in Vitest
        const isNodeEnv =
          typeof process !== 'undefined' && !!process.versions?.node

        if (isNodeEnv) {
          // Node / SEA / Vitest environment: Mandate our isomorphic buffer loader
          const wasmBinary = await loadWasmBuffer('wasm/tree-sitter.wasm')
          await Parser.init({ wasmBinary })
        } else {
          // Pure Browser environment
          await Parser.init({
            locateFile: () => '/wasm/tree-sitter.wasm',
          })
        }

        this.parser = new Parser()
        this.initialized = true
      } catch (error) {
        this.initialized = false
        this.initPromise = null
        throw new Error(
          `[TreeSitterService] Failed to initialize web-tree-sitter engine: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    })()

    return this.initPromise
  }

  /**
   * Check whether the service has completed initialization
   */
  public isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Asynchronously checks whether the WASM parser engine is ready.
   */
  public async checkWasmReady(): Promise<boolean> {
    if (this.initialized) return true
    if (this.initPromise !== null && this.initPromise !== undefined) {
      try {
        await this.initPromise
        return this.initialized
      } catch {
        return false
      }
    }
    return false
  }

  /**
   * Resolve canonical language name from file extension or language tag
   */
  public resolveLanguageName(languageOrExtension: string): string | null {
    const normalized = languageOrExtension.trim().toLowerCase()
    return this.extensionMap.get(normalized) ?? null
  }

  /**
   * Register a custom file extension mapping
   */
  public registerExtension(extension: string, languageName: string): void {
    const normExt = extension.trim().toLowerCase()
    this.extensionMap.set(normExt, languageName.trim().toLowerCase())
  }

  /**
   * Register an already instantiated grammar in the registry
   */
  public registerLanguage(languageName: string, language: Language): void {
    this.grammars.set(languageName.trim().toLowerCase(), language)
  }

  /**
   * Load and cache a grammar dynamically
   */
  public async loadLanguage(languageOrExtension: string): Promise<Language> {
    await this.initialize()

    const canonicalLang =
      this.resolveLanguageName(languageOrExtension) ??
      languageOrExtension.trim().toLowerCase()

    if (this.grammars.has(canonicalLang)) {
      return this.grammars.get(canonicalLang)!
    }

    const assetPath =
      this.grammarAssetMap.get(canonicalLang) ??
      `wasm/tree-sitter-${canonicalLang}.wasm`

    try {
      const grammarBuffer = await loadWasmBuffer(assetPath)
      const language = await Language.load(grammarBuffer)
      this.grammars.set(canonicalLang, language)
      return language
    } catch (error) {
      throw new Error(
        `[TreeSitterService] Failed to load grammar '${canonicalLang}' from '${assetPath}': ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  /**
   * Check whether a grammar is registered or available for a given language/extension
   */
  public isLanguageSupported(languageOrExtension: string): boolean {
    const canonical =
      this.resolveLanguageName(languageOrExtension) ??
      languageOrExtension.trim().toLowerCase()
    return this.grammars.has(canonical) || this.grammarAssetMap.has(canonical)
  }

  /**
   * Parse source code into a syntax Tree asynchronously.
   * If the file type is unmapped / unsupported (e.g. .txt, .env, .md), returns null cleanly.
   */
  public async parse(
    code: string,
    languageOrExtension: string
  ): Promise<Tree | null> {
    const canonicalLang =
      this.resolveLanguageName(languageOrExtension) ??
      languageOrExtension.trim().toLowerCase()

    if (!this.isLanguageSupported(languageOrExtension)) {
      return null
    }

    try {
      await this.initialize()
      const language = await this.loadLanguage(canonicalLang)
      if (!this.parser) {
        throw new Error('Parser is not initialized')
      }

      this.parser.setLanguage(language)
      return this.parser.parse(code)
    } catch (error) {
      console.warn(
        `[TreeSitterService] Parse failed for language '${languageOrExtension}':`,
        error instanceof Error ? error.message : String(error)
      )
      return null
    }
  }

  /**
   * Parse source code synchronously using a pre-loaded grammar
   */
  public parseSync(code: string, languageOrExtension: string): Tree | null {
    if (!this.initialized || !this.parser) {
      return null
    }

    const canonicalLang =
      this.resolveLanguageName(languageOrExtension) ??
      languageOrExtension.trim().toLowerCase()

    const language = this.grammars.get(canonicalLang)
    if (!language) {
      return null
    }

    try {
      this.parser.setLanguage(language)
      return this.parser.parse(code)
    } catch (error) {
      console.warn(
        `[TreeSitterService] parseSync failed for '${canonicalLang}':`,
        error instanceof Error ? error.message : String(error)
      )
      return null
    }
  }

  /**
   * Dispose all active parsers, cached grammars, and reset state
   */
  public dispose(): void {
    if (this.parser) {
      try {
        this.parser.delete()
      } catch {
        // Suppress deletion errors during disposal
      }
      this.parser = null
    }
    this.grammars.clear()
    this.initialized = false
    this.initPromise = null
  }
}

export const treeSitterService = TreeSitterService.getInstance()
