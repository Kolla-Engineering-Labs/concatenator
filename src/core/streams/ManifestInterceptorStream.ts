/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KEL_MANIFEST_END, DEFAULT_MAX_MANIFEST_BYTES } from '../constants.js'
import { PathValidator, type IVFSAdapter } from '../PathValidator.js'
import {
  extractPreMatterManifest,
  type PreMatterManifest,
} from '../parsers/ParserUtils.js'
import { ManifestSizeExceededError, SecurityViolation } from '../errors.js'

export interface ManifestInterceptorOptions {
  rootDir?: string
  vfsAdapter?: IVFSAdapter
  maxManifestBytes?: number
  batchSize?: number
  onManifestParsed?: (manifest: PreMatterManifest) => void
}

/**
 * Intercepts incoming stream chunks at the front of the read pipeline to validate
 * Pre-Matter KEL Manifest boundaries before any payload bytes are flushed downstream.
 *
 * Employs:
 * - Strict MAX_MANIFEST_BYTES circuit breaker against preamble flood attacks.
 * - Bounded asynchronous VFS validation (batch size 64) to prevent EMFILE exhaustion.
 * - Instant stream destruction (controller.error) upon security or path traversal violations.
 * - Zero-overhead passthrough transition once the manifest is validated.
 */
export class ManifestInterceptorStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {
  constructor(options?: ManifestInterceptorOptions) {
    let state: 'INTERCEPTING' | 'PASSTHROUGH' = 'INTERCEPTING'
    const rootDir = options?.rootDir ?? '.'
    const vfsAdapter = options?.vfsAdapter
    const maxManifestBytes =
      options?.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES
    const batchSize = options?.batchSize ?? 64
    const onManifestParsed = options?.onManifestParsed

    const decoder = new TextDecoder('utf-8')
    const encoder = new TextEncoder()
    const bufferedChunks: Uint8Array[] = []
    let accumulatedBytes = 0

    super({
      async transform(chunk, controller) {
        if (state === 'PASSTHROUGH') {
          controller.enqueue(chunk)
          return
        }

        // 1. Interception Accumulation & Circuit Breaker
        accumulatedBytes += chunk.byteLength
        if (accumulatedBytes > maxManifestBytes) {
          controller.error(
            new ManifestSizeExceededError(
              `Security Violation: Manifest preamble size exceeded threshold of ${maxManifestBytes} bytes`
            )
          )
          return
        }

        bufferedChunks.push(chunk)

        // 2. Concatenate buffer and search for KEL_MANIFEST_END delimiter
        let totalBuffer: Uint8Array
        if (bufferedChunks.length === 1) {
          totalBuffer = bufferedChunks[0]
        } else {
          totalBuffer = new Uint8Array(accumulatedBytes)
          let offset = 0
          for (const part of bufferedChunks) {
            totalBuffer.set(part, offset)
            offset += part.byteLength
          }
        }

        const totalText = decoder.decode(totalBuffer)
        const endMarkerIndex = totalText.indexOf(KEL_MANIFEST_END)

        if (endMarkerIndex === -1) {
          // Still waiting for complete Pre-Matter Header
          return
        }

        // 3. Extract Manifest Header Text and Delimit from Payload
        const markerEnd = endMarkerIndex + KEL_MANIFEST_END.length
        let headerCutIndex = markerEnd
        if (
          totalText[markerEnd] === '\r' &&
          totalText[markerEnd + 1] === '\n'
        ) {
          headerCutIndex = markerEnd + 2
        } else if (totalText[markerEnd] === '\n') {
          headerCutIndex = markerEnd + 1
        }

        const manifestHeader = totalText.substring(0, headerCutIndex)
        const manifest = extractPreMatterManifest(manifestHeader)

        if (!manifest) {
          controller.error(
            new SecurityViolation(
              'Security Violation: Malformed Pre-Matter Manifest header detected'
            )
          )
          return
        }

        if (onManifestParsed) {
          onManifestParsed(manifest)
        }

        // 4. Bounded Asynchronous VFS Sandboxing (EMFILE Protection)
        try {
          const entries = manifest.entries
          for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize)
            await Promise.all(
              batch.map((entry) =>
                PathValidator.resolveAndJailAsync(
                  entry.path,
                  rootDir,
                  vfsAdapter
                )
              )
            )
          }
        } catch (err) {
          controller.error(err)
          return
        }

        // 5. Activate Zero-Overhead Passthrough
        state = 'PASSTHROUGH'
        bufferedChunks.length = 0 // Discard buffer for V8 GC

        // 6. Enqueue any payload bytes remaining in the initial buffer
        const manifestBytesLength = encoder.encode(manifestHeader).byteLength
        if (totalBuffer.byteLength > manifestBytesLength) {
          const remainder = totalBuffer.subarray(manifestBytesLength)
          controller.enqueue(remainder)
        }
      },

      flush(controller) {
        if (state === 'INTERCEPTING' && accumulatedBytes > 0) {
          controller.error(
            new SecurityViolation(
              'Security Violation: Stream ended prematurely without KEL_MANIFEST_END delimiter'
            )
          )
        }
      },
    })
  }
}
