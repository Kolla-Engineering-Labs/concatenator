import { execSync } from 'child_process'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Checks if the required signing tools are available in the PATH.
 * @param {string} platform - The target platform ('win32' or 'darwin').
 * @returns {boolean} True if tools are available.
 */
export function checkTools(platform) {
  try {
    if (platform === 'win32') {
      execSync('signtool /?', { stdio: 'ignore' })
      return true
    } else if (platform === 'darwin') {
      execSync('codesign --version', { stdio: 'ignore' })
      execSync('xcrun --version', { stdio: 'ignore' })
      return true
    }
  } catch {
    return false
  }
  return false
}

/**
 * Checks if signing environment variables are present.
 * @param {string} platform - The target platform.
 * @returns {boolean} True if environment variables are present.
 */
export function isSigningEnabled(platform) {
  if (platform === 'win32') {
    return !!(
      process.env.SIGNING_CERT_DATA && process.env.SIGNING_CERT_PASSWORD
    )
  } else if (platform === 'darwin') {
    return !!(
      process.env.APPLE_ID &&
      process.env.APPLE_ID_PASSWORD &&
      process.env.APPLE_TEAM_ID &&
      process.env.MACOS_CERT_NAME
    )
  }
  return false
}

/**
 * Applies an ad-hoc signature to a macOS binary.
 * @param {string} filePath - Path to the binary.
 */
export function applyAdHocSignature(filePath) {
  console.log(`🖋️  Applying ad-hoc signature: ${filePath}...`)
  try {
    execSync(`codesign -s - "${filePath}"`, { stdio: 'inherit' })
    console.log('✅ Ad-hoc signature applied.')
    return true
  } catch (error) {
    console.error(`❌ Ad-hoc signing failed: ${error.message}`)
    return false
  }
}

/**
 * Signs the binary for the given platform.
 * @param {string} filePath - Path to the binary.
 * @param {string} platform - The target platform.
 * @returns {boolean} True if signing was performed, false if skipped.
 */
export function signBinary(filePath, platform) {
  console.log(`\n🖋️  Signing binary: ${filePath}...`)

  if (!isSigningEnabled(platform)) {
    if (platform === 'darwin') {
      console.warn(
        '[SEC-WARN] Apple Developer credentials missing. Falling back to ad-hoc signing.'
      )
      return applyAdHocSignature(filePath)
    }
    console.warn('[SEC-WARN] Signing skipped: Missing environment variables.')
    return false
  }

  if (!checkTools(platform)) {
    console.error(`[SEC-WARN] Signing tool missing for platform ${platform}.`)
    if (isSigningEnabled(platform)) {
      throw new Error(
        `❌ Signing tools missing in PATH but signing is enabled via environment variables.`
      )
    }
    return
  }

  if (platform === 'win32') {
    const certPath = join(process.cwd(), 'temp_cert.pfx')
    let certBuffer: Buffer | undefined
    try {
      // Decode base64 cert to temporary file
      certBuffer = Buffer.from(process.env.SIGNING_CERT_DATA, 'base64')
      writeFileSync(certPath, certBuffer)

      const tsServer =
        process.env.TIMESTAMP_SERVER || 'http://timestamp.digicert.com'
      const password = process.env.SIGNING_CERT_PASSWORD

      execSync(
        `signtool sign /f "${certPath}" /p "${password}" /tr ${tsServer} /td sha256 /fd sha256 "${filePath}"`,
        { stdio: 'inherit' }
      )
    } finally {
      // Clean up cert file and sensitive memory
      if (existsSync(certPath)) unlinkSync(certPath)
      if (typeof certBuffer !== 'undefined') {
        certBuffer.fill(0)
      }
      delete process.env.SIGNING_CERT_DATA
      delete process.env.SIGNING_CERT_PASSWORD
      console.log('🧹 Sensitive signing data purged from memory and disk.')
    }
  } else if (platform === 'darwin') {
    const entitlementsPath = join(__dirname, 'Entitlements.plist')
    const certName = process.env.MACOS_CERT_NAME

    // 1. Sign with Hardened Runtime
    execSync(
      `codesign --force --options runtime --entitlements "${entitlementsPath}" --sign "${certName}" --timestamp "${filePath}"`,
      { stdio: 'inherit' }
    )

    // 2. Notarize
    console.log('🚀 Submitting for notarization...')
    const appleId = process.env.APPLE_ID
    const appleIdPassword = process.env.APPLE_ID_PASSWORD
    const teamId = process.env.APPLE_TEAM_ID

    // Using notarytool (recommended)
    execSync(
      `xcrun notarytool submit "${filePath}" --apple-id "${appleId}" --password "${appleIdPassword}" --team-id "${teamId}" --wait`,
      { stdio: 'inherit' }
    )

    // 3. Staple
    console.log('📎 Stapling notarization ticket...')
    execSync(`xcrun stapler staple "${filePath}"`, { stdio: 'inherit' })
  }

  return true
}

/**
 * Verifies the signature of the binary.
 * @param {string} filePath - Path to the binary.
 * @param {string} platform - The target platform.
 */
export function verifyBinary(filePath, platform) {
  console.log(`\n🔍 Verifying signature: ${filePath}...`)

  try {
    if (platform === 'win32') {
      execSync(`signtool verify /pa "${filePath}"`, { stdio: 'inherit' })
    } else if (platform === 'darwin') {
      execSync(`spctl --assess --verbose --type execute "${filePath}"`, {
        stdio: 'inherit',
      })
    }
    console.log('✅ Signature verified.')
  } catch (error) {
    throw new Error(
      `❌ Signature verification failed for ${filePath}: ${error.message}`
    )
  }
}
