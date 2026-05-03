#!/ dream/env node
/**
 * Generate SHA256SUMS for built artifacts in /dist
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, relative, dirname } from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const distDir = join(rootDir, 'dist')

/**
 * Recursively find all executable binaries in dist folder
 */
function findBinaries(dir, fileList = []) {
  if (!readdirSync(dir).length) return fileList

  const files = readdirSync(dir)
  files.forEach((file) => {
    const filePath = join(dir, file)
    if (statSync(filePath).isDirectory()) {
      if (
        file !== 'sea' &&
        file !== 'assets' &&
        file !== 'img' &&
        file !== 'favicon'
      ) {
        findBinaries(filePath, fileList)
      }
    } else {
      // Look for executables (concatenator, concatenator.exe)
      if (file === 'concatenator' || file === 'concatenator.exe') {
        fileList.push(filePath)
      }
    }
  })
  return fileList
}

function calculateHash(filePath) {
  const fileBuffer = readFileSync(filePath)
  const hashSum = createHash('sha256')
  hashSum.update(fileBuffer)
  return hashSum.digest('hex')
}

console.log('🔍 Scanning /dist for binaries...')
const binaries = findBinaries(distDir)

if (binaries.length === 0) {
  console.error('❌ No binaries found in /dist. Run build:exe first.')
  process.exit(1)
}

let manifestContent = ''
binaries.forEach((binPath) => {
  const hash = calculateHash(binPath)
  const relPath = relative(distDir, binPath).replace(/\\/g, '/')
  console.log(`✅ ${relPath}: ${hash}`)
  manifestContent += `${hash}  ${relPath}\n`
})

const manifestPath = join(distDir, 'SHA256SUMS')
writeFileSync(manifestPath, manifestContent)

console.log(`\n📄 Manifest generated: ${manifestPath}`)
console.log('\n🔐 NEXT STEPS (Architect Only):')
console.log('-------------------------------')
console.log('1. Run the following command to sign the manifest:')
console.log(`   gpg --clearsign ${relative(rootDir, manifestPath).replace(/\\/g, '/')}`)
console.log('\n2. This will create dist/SHA256SUMS.asc.')
console.log('3. Upload SHA256SUMS.asc along with the release.')
