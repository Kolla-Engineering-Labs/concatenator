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
  renameSync,
  readdirSync,
  statSync,
} from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'
import { signBinary, verifyBinary, isSigningEnabled } from './sign-utils.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = dirname(__dirname)
const distDir = join(rootDir, 'dist')
const seaDir = join(distDir, 'sea')
const platform = process.platform

console.log('🔨 Building Concatenator SEA...\n')

// Resolve and validate Node.js binary
/**
 * Resolves the Node.js binary path and validates its version.
 * Priority:
 * 1. CONCATENATOR_NODE_EXE environment variable
 * 2. process.execPath
 *
 * @returns {string} The validated path to the Node.js binary.
 */
function resolveNodePath() {
  const pathOverride = process.env.CONCATENATOR_NODE_EXE
  const nodePath = pathOverride || process.execPath

  try {
    // Validate path exists and is executable by checking version
    const versionOutput = execSync(`"${nodePath}" --version`, {
      encoding: 'utf8',
    }).trim()

    // Parse major version (v22.0.0 -> 22)
    const majorVersion = parseInt(versionOutput.replace(/^v/, '').split('.')[0])

    if (isNaN(majorVersion) || majorVersion < 22) {
      throw new Error(`Node.js 22+ required, found ${versionOutput}`)
    }

    return nodePath
  } catch (error) {
    const isVersionError = error.message.includes('Node.js 22+ required')
    const baseError = isVersionError
      ? error.message
      : `Unreachable or invalid Node.js binary at "${nodePath}"`

    throw new Error(
      `❌ ${baseError}\n\n` +
        `💡 To resolve this:\n` +
        `   - Ensure Node.js 22 or newer is installed.\n` +
        `   - You can override the path by setting the CONCATENATOR_NODE_EXE environment variable.\n` +
        `   - Current resolution: ${nodePath}`
    )
  }
}

let nodePath
try {
  nodePath = resolveNodePath()
} catch (error) {
  console.error(error.message)
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
const isUnsigned = platform === 'darwin' && !isSigningEnabled(platform)

try {
  const defineArgs = [`--define:PROCESS_IS_UNSIGNED=${isUnsigned}`]

  execSync(
    `npx esbuild src/cli/index.ts --bundle --platform=node --format=cjs --outfile=dist/sea/concatenator.js --external:fs --external:path --external:url --external:os ${defineArgs.join(' ')}`,
    {
      cwd: rootDir,
      stdio: 'inherit',
    }
  )
} catch {
  console.log('⚠️  esbuild not found, trying with tsx...')
  // Fallback: just copy and mark as ESM
  let cliContent = readFileSync(join(rootDir, 'src/cli/index.ts'), 'utf-8')
  // Simple replacement for fallback
  cliContent = cliContent.replace(
    'globalThis.IS_UNSIGNED_BUILD_FLAG',
    String(isUnsigned)
  )
  writeFileSync(join(seaDir, 'concatenator.js'), cliContent)
}

// Step 2: Generate SEA configuration
console.log('\n⚙️  Generating SEA config (Deterministic VFS)...')

/**
 * Normalizes an object by sorting its keys alphabetically.
 * Ensures deterministic JSON stringification for reproducible builds.
 */
function sortObjectKeys(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = obj[key]
      return acc
    }, {})
}

// Check for SOURCE_DATE_EPOCH for reproducible timestamps
const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH
if (sourceDateEpoch) {
  console.log(
    `📅 Normalizing build time to SOURCE_DATE_EPOCH: ${sourceDateEpoch}`
  )
}

// In v0.6.0+, we move towards native SEA VFS for web assets
// Here we ensure any assets mapped into the blob are sorted alphabetically
const assets = {}
const distAssetsDir = join(rootDir, 'dist')
if (existsSync(distAssetsDir)) {
  const walk = (dir) => {
    const files = readdirSync(dir).sort()
    for (const file of files) {
      const fullPath = join(dir, file)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        // Skip SEA and versioned output dirs to avoid recursion
        if (file !== 'sea' && !file.startsWith('v')) {
          walk(fullPath)
        }
      } else {
        // Skip non-deterministic or unnecessary artifacts
        if (file.endsWith('.map') || file === 'concatenator-bundle-stats.html')
          continue

        const relPath = relative(distAssetsDir, fullPath).replace(/\\/g, '/')
        // Use relative path from rootDir for the source file to ensure determinism
        assets[relPath] = relative(rootDir, fullPath).replace(/\\/g, '/')
      }
    }
  }
  walk(distAssetsDir)
}

const seaConfig = {
  main: 'dist/sea/concatenator.js',
  output: 'dist/sea/concatenator.blob',
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false, // Disabled for bit-for-bit determinism
  assets: sortObjectKeys(assets), // Deterministic VFS sorting
}

// Sort the top-level config keys as well
const sortedSeaConfig = sortObjectKeys(seaConfig)

writeFileSync(
  join(rootDir, 'sea-config.json'),
  JSON.stringify(sortedSeaConfig, null, 2) + '\n'
)

// Step 3: Generate the blob
console.log('\n🗜️  Generating SEA blob...')
try {
  const env = { ...process.env }
  if (sourceDateEpoch) env.SOURCE_DATE_EPOCH = sourceDateEpoch

  execSync(`"${nodePath}" --experimental-sea-config sea-config.json`, {
    cwd: rootDir,
    stdio: 'inherit',
    env,
  })
} catch (error) {
  console.error('❌ Failed to generate SEA blob:', error.message)
  process.exit(1)
}

// Step 4: Copy node binary and inject blob
console.log('\n💉 Creating executable...')
const exeName = platform === 'win32' ? 'concatenator.exe' : 'concatenator'
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

  // Step 5: Sign and Verify
  try {
    const signed = signBinary(exePath, platform)
    if (signed) {
      verifyBinary(exePath, platform)
    } else {
      console.log('⚠️  Skipping verification for unsigned/development binary.')
    }
  } catch (error) {
    console.error('❌ Signing or verification failed:', error.message)
    process.exit(1)
  }

  // Step 6: Move to versioned dist folder
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))
  const version = pkg.version
  const finalDistDir = join(distDir, `v${version}`, platform)

  if (!existsSync(dirname(finalDistDir)))
    mkdirSync(dirname(finalDistDir), { recursive: true })
  if (!existsSync(finalDistDir)) mkdirSync(finalDistDir, { recursive: true })

  const finalExePath = join(finalDistDir, exeName)
  renameSync(exePath, finalExePath)

  console.log(`\n🚀 Artifact moved to: ${finalExePath}`)
  console.log(`\nUsage: ${finalExePath} --help`)
} catch (error) {
  console.error('❌ Failed to create executable:', error.message)
  console.log('\n💡 Manual steps:')
  console.log(`   1. Copy node binary: cp ${nodePath} ${exePath}`)
  console.log('   2. Inject blob with postject')
  process.exit(1)
}
