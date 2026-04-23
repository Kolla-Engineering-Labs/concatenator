/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SecretScanner provides logic to detect and mask sensitive information
 * like API keys, tokens, and private keys in text content.
 */
export class SecretScanner {
  // Common secret patterns
  private static readonly PATTERNS = {
    // AWS Access Key ID: 20 chars, starts with AKIA or ASIA
    AWS_ACCESS_KEY: /(AKIA|ASIA)[0-9A-Z]{16}/g,
    // AWS Secret Access Key: 40 chars, base64-like
    AWS_SECRET_KEY: /([^A-Z0-9/+=])([A-Za-z0-9/+=]{40})([^A-Z0-9/+=])/g,
    // Generic high-entropy strings (simplified)
    GENERIC_SECRET:
      /(?:key|secret|token|password|auth|api_key)['"]?\s*[:=]\s*['"]?([a-zA-Z0-9-]{16,})['"]?/gi,
  }

  /**
   * Masks sensitive information in the given content.
   * Preserves structural length to ensure token counts remain accurate.
   *
   * @param content - The text content to scan
   * @returns Masked content
   */
  static maskSecrets(content: string): string {
    if (!content) return content

    let masked = content

    // 1. Mask AWS Access Keys (keep prefix + last 4)
    masked = masked.replace(this.PATTERNS.AWS_ACCESS_KEY, (match) => {
      const prefix = match.substring(0, 4)
      const suffix = match.substring(match.length - 4)
      const maskedPart = '*'.repeat(match.length - 8)
      return `${prefix}${maskedPart}${suffix}`
    })

    // 2. Mask AWS Secret Keys (keep first 4 + last 4)
    // Using a function to handle the capturing groups correctly
    masked = masked.replace(
      this.PATTERNS.AWS_SECRET_KEY,
      (match, p1, p2, p3) => {
        const secret = p2
        const prefix = secret.substring(0, 4)
        const suffix = secret.substring(secret.length - 4)
        const maskedPart = '*'.repeat(secret.length - 8)
        return `${p1}${prefix}${maskedPart}${suffix}${p3}`
      }
    )

    // 3. Mask generic assignments
    masked = masked.replace(this.PATTERNS.GENERIC_SECRET, (match, p1) => {
      const secret = p1
      const prefix = secret.substring(0, 2)
      const suffix = secret.substring(secret.length - 2)
      const maskedPart = '*'.repeat(secret.length - 4)
      const replacement = `${prefix}${maskedPart}${suffix}`
      return match.replace(p1, replacement)
    })

    return masked
  }
}
