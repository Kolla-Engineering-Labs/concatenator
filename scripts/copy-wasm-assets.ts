/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = dirname(__dirname)

const srcWasmDir = join(rootDir, 'src', 'assets', 'wasm')
const publicWasmDir = join(rootDir, 'public', 'wasm')

if (!existsSync(publicWasmDir)) {
  mkdirSync(publicWasmDir, { recursive: true })
}

if (!existsSync(srcWasmDir)) {
  console.error(`❌ Critical: Source WASM directory missing at ${srcWasmDir}`)
  process.exit(1)
}

// 1. Isomorphic sync of all static WASM artifacts
cpSync(srcWasmDir, publicWasmDir, { recursive: true })
console.log(`✅ Deterministic WASM payload secured in ${publicWasmDir}`)
