import { execFileSync } from 'child_process'
import { copyFileSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distDir = resolve(__dirname, '../dist')
const blobPath = resolve(distDir, 'sea-prep.blob')
const configPath = resolve(__dirname, '../sea-config.json')

// Determine OS-specific binary extension
const isWindows = os.platform() === 'win32'
const isMac = os.platform() === 'darwin'
const binaryName = isWindows ? 'concatenator.exe' : 'concatenator'
const binaryPath = resolve(distDir, binaryName)

console.log('[KEL Protocol] Initiating Phase D Binary Orchestration...')

try {
  // Step 1: Generate the V8 SEA Blob
  console.log('1. Generating V8 SEA Blob...')
  // PATCH: Bypass the OS shell entirely by passing arguments as an array
  execFileSync('node', ['--experimental-sea-config', configPath], {
    stdio: 'inherit',
  })

  // Step 2: Clone the Host Node Binary
  console.log(`2. Cloning host Node executable to ${binaryName}...`)
  if (existsSync(binaryPath)) rmSync(binaryPath, { force: true })
  copyFileSync(process.execPath, binaryPath)

  // Step 3: Inject the Blob via Postject
  console.log('3. Injecting V8 Blob into executable...')
  // The sentinel fuse is a strict requirement for Node SEA
  const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

  const npxCommand = isWindows ? 'npx.cmd' : 'npx'
  const postjectArgs = [
    'postject',
    binaryPath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    sentinelFuse,
  ]

  if (isMac) {
    postjectArgs.push('--macho-segment-name', 'NODE_SEA')
  }

  execFileSync(npxCommand, postjectArgs, { stdio: 'inherit' })

  console.log(
    `✓ [KEL Protocol] Single Executable Application compiled: dist/${binaryName}`
  )
} catch (error) {
  console.error(
    '✗ [KEL Protocol] Fatal error during SEA compilation:',
    (error as Error).message
  )
  process.exit(1)
}
