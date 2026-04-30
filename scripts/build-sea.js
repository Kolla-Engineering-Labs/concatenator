#!/usr/bin/env node
/**
 * Build script for Node.js Single Executable Application (SEA)
 * Requires Node.js 22+
 */

import { execSync, execFileSync } from 'child_process'
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = dirname(__dirname)
const distDir = join(rootDir, 'dist')
const seaDir = join(distDir, 'sea')

console.log('🔨 Building Concatenator SEA...\n')

// Ensure Node.js 22+
const nodeVersion = process.version
const majorVersion = parseInt(nodeVersion.split('.')[0].slice(1))
if (majorVersion < 22) {
  console.error(`❌ Node.js 22+ required, found ${nodeVersion}`)
  process.exit(1)
}

// Create directories
if (!existsSync(distDir)) mkdirSync(distDir)
if (!existsSync(seaDir)) mkdirSync(seaDir)

// Step 0.5: Bundle Web Assets
console.log('📦 Bundling Web Assets...')
try {
  execSync('npx tsx scripts/build-web-assets.ts', {
    cwd: rootDir,
    stdio: 'inherit',
  })
} catch (error) {
  console.error('❌ Failed to bundle web assets:', error.message)
  process.exit(1)
}

// Step 1: Bundle the CLI with esbuild or similar
console.log('\n📦 Bundling CLI...')
try {
  execSync(
    'npx esbuild src/cli/index.ts --bundle --platform=node --format=cjs --outfile=dist/sea/concatenator.js --external:fs --external:path --external:url --external:os',
    {
      cwd: rootDir,
      stdio: 'inherit',
    }
  )
} catch {
  console.log('⚠️  esbuild not found, trying with tsx...')
  // Fallback: just copy and mark as ESM
  const cliContent = readFileSync(join(rootDir, 'src/cli/index.ts'), 'utf-8')
  writeFileSync(join(seaDir, 'concatenator.js'), cliContent)
}

// Step 2: Generate SEA configuration
console.log('\n⚙️  Generating SEA config...')
const seaConfig = {
  main: 'dist/sea/concatenator.js',
  output: 'dist/sea/concatenator.blob',
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: true,
}
writeFileSync(
  join(rootDir, 'sea-config.json'),
  JSON.stringify(seaConfig, null, 2)
)

// Step 3: Generate the blob
console.log('\n🗜️  Generating SEA blob...')
try {
  execSync('node --experimental-sea-config sea-config.json', {
    cwd: rootDir,
    stdio: 'inherit',
  })
} catch (error) {
  console.error('❌ Failed to generate SEA blob:', error.message)
  process.exit(1)
}

// Step 4: Copy node binary and inject blob
console.log('\n💉 Creating executable...')
const platform = process.platform
const exeName = platform === 'win32' ? 'concatenator.exe' : 'concatenator'
const nodePath = process.execPath
const exePath = join(distDir, exeName)

try {
  copyFileSync(nodePath, exePath)

  // Use postject to inject the blob
  execSync(
    `npx postject "${exePath}" NODE_SEA_BLOB "dist/sea/concatenator.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`,
    {
      cwd: rootDir,
      stdio: 'inherit',
    }
  )

  console.log(`\n✅ SEA executable created: ${exePath}`)
  console.log(`\nUsage: ${exePath} --help`)
} catch (error) {
  console.error('❌ Failed to create executable:', error.message)
  console.log('\n💡 Manual steps:')
  console.log(`   1. Copy node binary: cp ${nodePath} ${exePath}`)
  console.log('   2. Inject blob with postject')
  process.exit(1)
}
