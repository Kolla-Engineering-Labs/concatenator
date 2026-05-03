import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { ARCHITECT_PGP_FINGERPRINT } from '../src/core/constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const distDir = join(rootDir, 'dist')
const manifestPath = join(distDir, 'SHA256SUMS.asc')

const PASS = '\x1b[32m✔\x1b[0m'
const FAIL = '\x1b[31m✘\x1b[0m'
const WARN = '\x1b[33m⚠\x1b[0m'

function calculateHash(filePath: string): string {
  const fileBuffer = readFileSync(filePath)
  return createHash('sha256').update(fileBuffer).digest('hex')
}

async function verifyRelease() {
  console.log('\n🔍 Starting Release Candidate Audit...')
  console.log('====================================')

  if (!existsSync(manifestPath)) {
    console.error(`${FAIL} Manifest not found: ${manifestPath}`)
    console.log('   Run "npm run build:manifest" and sign it first.')
    process.exit(1)
  }

  // 1. Verify GPG Signature
  console.log('\n[1/2] Verifying GPG Signature...')
  let gpgOutput = ''
  try {
    // gpg --verify often writes to stderr
    gpgOutput = execSync(
      `gpg --verify "${manifestPath.replace(/\\/g, '/')}" 2>&1`,
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      }
    ).toString()
  } catch (error: unknown) {
    if (error instanceof Error) {
      const execError = error as { stderr?: Buffer | string }
      gpgOutput = execError.stderr?.toString() || error.message
    } else {
      gpgOutput = String(error)
    }
  }

  const cleanFingerprint = ARCHITECT_PGP_FINGERPRINT.replace(/\s/g, '')
  const hasGoodSignature = gpgOutput.includes(
    'Good signature from "Christopher Vrooman'
  )
  const hasCorrectKey =
    gpgOutput.includes(cleanFingerprint) ||
    gpgOutput.includes(cleanFingerprint.slice(-16)) // Check full or long ID

  if (!hasGoodSignature) {
    console.error(
      `${FAIL} Invalid signature. Expected "Good signature from Christopher Vrooman".`
    )
    console.error(gpgOutput)
    process.exit(1)
  }

  if (!hasCorrectKey) {
    console.error(`${FAIL} Fingerprint mismatch.`)
    console.log(`   Expected: ${ARCHITECT_PGP_FINGERPRINT}`)
    console.error(gpgOutput)
    process.exit(1)
  }

  if (gpgOutput.toLowerCase().includes('expired')) {
    console.error(`${FAIL} Signature or key is EXPIRED.`)
    console.error(gpgOutput)
    process.exit(1)
  }

  if (
    gpgOutput.includes('Untrusted') ||
    gpgOutput.includes('not certified with a trusted signature')
  ) {
    // Note: GPG often warns about trust if the key isn't in the trust db.
    // The user specifically mentioned "Untrusted (locally)" should fail.
    console.warn(`${WARN} Signature is UNTRUSTED locally.`)
    // If the user wants to fail on untrusted:
    // process.exit(1);
    // Let's be strict as requested.
    console.error(`${FAIL} Audit failed: Untrusted signature.`)
    process.exit(1)
  }

  console.log(`${PASS} Signature verified and matches Architect Fingerprint.`)

  // 2. Verify SHA256 Hashes
  console.log('\n[2/2] Verifying Artifact Integrity...')

  // Extract manifest content (clearsigned)
  const manifestRaw = readFileSync(manifestPath, 'utf-8')
  const manifestLines = manifestRaw.split('\n')
  let inMessage = false
  const filesToVerify: { hash: string; path: string }[] = []

  for (const line of manifestLines) {
    if (line.startsWith('-----BEGIN PGP SIGNED MESSAGE-----')) {
      inMessage = true
      continue
    }
    if (line.startsWith('-----BEGIN PGP SIGNATURE-----')) {
      inMessage = false
      break
    }
    if (inMessage && line.trim() && !line.startsWith('Hash:')) {
      // Manifest format: hash  filename
      const match = line.match(/^([a-f0-9]{64})\s+(.+)$/)
      if (match) {
        filesToVerify.push({ hash: match[1], path: match[2].trim() })
      }
    }
  }

  if (filesToVerify.length === 0) {
    console.error(`${FAIL} No files found in manifest to verify.`)
    process.exit(1)
  }

  let allPassed = true
  for (const item of filesToVerify) {
    const fullPath = join(distDir, item.path)
    if (!existsSync(fullPath)) {
      console.error(`${FAIL} Missing artifact: ${item.path}`)
      allPassed = false
      continue
    }

    const actualHash = calculateHash(fullPath)
    if (actualHash === item.hash) {
      console.log(`${PASS} ${item.path}: Integrity OK`)
    } else {
      console.error(`${FAIL} ${item.path}: HASH MISMATCH!`)
      console.log(`   Expected: ${item.hash}`)
      console.log(`   Actual:   ${actualHash}`)
      allPassed = false
    }
  }

  if (!allPassed) {
    console.error(`\n${FAIL} Release Candidate Audit FAILED.`)
    process.exit(1)
  }

  console.log('\n✨ Release Candidate Audit PASSED.')
  console.log('🚀 Ready for distribution.')
}

verifyRelease().catch((err) => {
  console.error(`\n${FAIL} Unexpected error during audit:`, err)
  process.exit(1)
})
