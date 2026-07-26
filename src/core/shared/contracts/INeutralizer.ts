/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared interface contract for string content escaping and neutralization.
 * Used across both Builder (concatenation) and Parser (deconcatenation) domains.
 */
export interface INeutralizer {
  neutralize(content: string): string
  unneutralize(content: string): string
}
