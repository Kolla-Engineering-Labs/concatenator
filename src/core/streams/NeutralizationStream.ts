/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * On-the-fly TransformStream that escapes LLM-breaking characters (triple backticks)
 * while ensuring multi-byte UTF-8 preservation and chunk-boundary split safety.
 *
 * Employs a strictly bounded 2-character tail buffer (max length = targetToken.length - 1).
 */
export class NeutralizationStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {
  constructor(enableNeutralization: boolean) {
    let tail = ''
    const decoder = new TextDecoder('utf-8')
    const encoder = new TextEncoder()

    super({
      transform(chunk, controller) {
        // Fast-path bypass if neutralization is disabled
        if (!enableNeutralization) {
          controller.enqueue(chunk)
          return
        }

        // Decode chunk. The { stream: true } flag ensures multi-byte UTF-8
        // sequences cut at the chunk boundary are safely buffered internally by V8.
        const decoded = decoder.decode(chunk, { stream: true })
        let combined = tail + decoded

        // Neutralize all complete triple backticks in the current window
        combined = combined.replace(/```/g, '\\`\\`\\`')

        // Boundary Check: If the chunk ends with 1 or 2 backticks, they might
        // form a triple backtick with the next chunk. Hold them in the tail buffer.
        if (combined.endsWith('``')) {
          tail = '``'
          combined = combined.slice(0, -2)
        } else if (combined.endsWith('`')) {
          tail = '`'
          combined = combined.slice(0, -1)
        } else {
          tail = ''
        }

        // Push the safe, neutralized bytes downstream
        if (combined.length > 0) {
          controller.enqueue(encoder.encode(combined))
        }
      },

      flush(controller) {
        // Fast-path bypass: if neutralization is disabled no bytes were ever buffered.
        if (!enableNeutralization) return

        // ── EOF Two-Source Drain ──────────────────────────────────────────────
        // At stream termination, two independent byte sources may still hold data:
        //
        //   1. `tail` (this class's 2-char boundary buffer): Holds 1 or 2 backtick
        //      characters that were withheld from the previous chunk because they
        //      *might* have completed a triple-backtick with the *next* chunk.
        //      Since there is no next chunk, they must be emitted as-is (they
        //      cannot form a triple backtick at EOF).
        //
        //   2. `decoder.decode()` (TextDecoder internal state): Called with no
        //      arguments, this performs an EOF flush of any incomplete multi-byte
        //      UTF-8 sequence that was buffered internally by V8 (e.g., a 4-byte
        //      emoji whose first 3 bytes arrived in the last chunk). This is a
        //      distinct buffer from `tail` and must be flushed independently.
        //
        // Both sources are concatenated before the final neutralization pass to
        // ensure the combined window is checked for triple backticks one last time.
        // Invariant: after flush() returns, `tail` is effectively discarded and
        // the TextDecoder is reset — no bytes remain in either buffer.
        let combined = tail + decoder.decode()

        // Final neutralization pass across the combined EOF window
        combined = combined.replace(/```/g, '\\`\\`\\`')

        if (combined.length > 0) {
          controller.enqueue(encoder.encode(combined))
        }
      },
    })
  }
}
