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
        if (!enableNeutralization) return

        // Flush any remaining characters trapped in the TextDecoder buffer
        let combined = tail + decoder.decode()

        // Final neutralization pass for the end of the stream
        combined = combined.replace(/```/g, '\\`\\`\\`')

        if (combined.length > 0) {
          controller.enqueue(encoder.encode(combined))
        }
      },
    })
  }
}
