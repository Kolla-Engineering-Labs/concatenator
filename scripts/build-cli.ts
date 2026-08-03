import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read the single source of truth
const pkgPath = resolve(__dirname, '../package.json')
const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf-8')).version

async function compileSEAPayload() {
  console.log('[KEL Protocol] Initiating Phase D AST Bundling...')

  try {
    await build({
      entryPoints: [resolve(__dirname, '../src/cli/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: resolve(__dirname, '../dist/bundle.js'),
      minify: true,
      treeShaking: true,
      // Inject the dynamic package version into the AST
      define: {
        __KEL_VERSION__: JSON.stringify(pkgVersion),
      },
    })

    console.log(`✓ [KEL Protocol] Payload flattened (v${pkgVersion}).`)
  } catch (error) {
    console.error('✗ [KEL Protocol] Fatal error:', error)
    process.exit(1)
  }
}

compileSEAPayload()
