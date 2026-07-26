/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface contract for string escaping and neutralization logic.
 */
export interface INeutralizer {
  neutralize(content: string): string
  unneutralize(content: string): string
}
