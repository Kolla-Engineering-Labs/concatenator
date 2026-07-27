/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { computeHash } from './builder/BuilderUtils.js'
import {
  POST_MATTER_MANIFEST_START,
  POST_MATTER_MANIFEST_END,
  FILE_END_DELIMITER,
  START_DELIMITER,
  END_DELIMITER,
} from './constants.js'
import { TamperDetectedError } from './errors.js'
import { Neutralizer } from './shared/Neutralizer.js'

export interface ManifestEntry {
  path: string
  mode: string
  hash: string
}

/**
 * ManifestValidator performs Two-Key Cryptographic Verification of concatenated bundles
 * against the Post-Matter EOF Manifest block.
 */
export class ManifestValidator {
  private neutralizer = new Neutralizer()

  /**
   * Validate Post-Matter Manifest entries against computed file chunk hashes.
   * Enforces strict cryptographic rejection (throws TamperDetectedError).
   *
   * @param content - Full concatenated bundle string
   * @throws TamperDetectedError if any mismatch, corruption, or trailing data is detected
   */
  public validate(content: string): void {
    const startIdx = content.indexOf(POST_MATTER_MANIFEST_START)
    if (startIdx === -1) {
      // Legacy bundles without Post-Matter Manifest skip cryptographic verification
      return
    }

    const endIdx = content.indexOf(POST_MATTER_MANIFEST_END, startIdx)
    if (endIdx === -1) {
      throw new TamperDetectedError(
        'Corrupted Post-Matter Manifest: missing end marker.'
      )
    }

    // 1. Strict Trailing Data Check: reject unauthorized data appended after manifest end
    const manifestEndLineEnd = content.indexOf('\n', endIdx)
    const trailingContent =
      manifestEndLineEnd !== -1
        ? content.substring(manifestEndLineEnd).trim()
        : content.substring(endIdx + POST_MATTER_MANIFEST_END.length).trim()

    if (trailingContent.length > 0) {
      throw new TamperDetectedError(
        `Cryptographic Tampering Detected: Unauthorized data appended after Post-Matter Manifest. Found: "${trailingContent.substring(0, 50)}"`
      )
    }

    // 2. Parse Post-Matter Manifest Header and path|mode|hash entries
    const manifestHeaderEnd = content.indexOf('\n', startIdx)
    if (manifestHeaderEnd === -1 || manifestHeaderEnd >= endIdx) {
      throw new TamperDetectedError(
        'Corrupted Post-Matter Manifest header format.'
      )
    }

    const manifestLines = content
      .substring(manifestHeaderEnd, endIdx)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    const parsedEntries = new Map<string, ManifestEntry>()
    for (const line of manifestLines) {
      const parts = line.split('|')
      if (parts.length < 3) continue
      const [path, mode, hash] = parts
      parsedEntries.set(path.trim(), {
        path: path.trim(),
        mode: mode.trim(),
        hash: hash.trim(),
      })
    }

    // 3. Scan bundle chunks and verify computed hash against Post-Matter Manifest
    const escapedStart = START_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedEnd = END_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const startMarkerRegex = new RegExp(
      `${escapedStart}(.+?)(?:\\s*\\(ID:\\s*[a-zA-Z0-9]+\\s*\\))?${escapedEnd}`,
      'gi'
    )

    const checkedPaths = new Set<string>()
    let match: RegExpExecArray | null

    while ((match = startMarkerRegex.exec(content)) !== null) {
      if (match.index >= startIdx) break // Reached Post-Matter block

      const rawPathWithId = match[1].trim()
      const path = rawPathWithId.includes('(ID:')
        ? rawPathWithId.substring(0, rawPathWithId.indexOf('(ID:')).trim()
        : rawPathWithId

      const contentStart = match.index + match[0].length
      const fileEndIdx = content.indexOf(FILE_END_DELIMITER, contentStart)

      if (fileEndIdx === -1 || fileEndIdx > startIdx) {
        throw new TamperDetectedError(
          `Cryptographic Tampering Detected: File chunk '${path}' is missing matching FILE_END marker.`
        )
      }

      let rawContent = content.substring(contentStart, fileEndIdx)

      // Surgically strip ONLY the single structural newlines injected by the Builder,
      // preserving any authentic leading/trailing whitespace native to the source file.
      if (rawContent.startsWith('\r\n')) rawContent = rawContent.substring(2)
      else if (rawContent.startsWith('\n')) rawContent = rawContent.substring(1)

      if (rawContent.endsWith('\r\n'))
        rawContent = rawContent.substring(0, rawContent.length - 2)
      else if (rawContent.endsWith('\n'))
        rawContent = rawContent.substring(0, rawContent.length - 1)

      const unneutralizedContent = this.neutralizer.unneutralize(rawContent)
      const computedHash = computeHash(unneutralizedContent)

      const expectedEntry = parsedEntries.get(path)
      if (expectedEntry) {
        // Enforce strict === string equality
        if (computedHash !== expectedEntry.hash) {
          throw new TamperDetectedError(
            `Cryptographic Hash Mismatch: File '${path}' computed SHA-256 hash '${computedHash}' does not match manifest hash '${expectedEntry.hash}'.`
          )
        }
        checkedPaths.add(path)
      }
    }

    // 4. Verification completeness check
    for (const [manifestPath] of parsedEntries) {
      if (!checkedPaths.has(manifestPath)) {
        throw new TamperDetectedError(
          `Cryptographic Tampering Detected: Manifest entry '${manifestPath}' missing from bundle payload.`
        )
      }
    }
  }
}
