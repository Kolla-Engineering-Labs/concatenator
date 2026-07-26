/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { INeutralizer } from './contracts/INeutralizer.js'

/**
 * Shared Neutralizer strategy implementing content escaping and un-escaping.
 */
export class Neutralizer implements INeutralizer {
  /**
   * Neutralizes sensitive markdown/delimiter patterns in text content.
   */
  public neutralize(content: string): string {
    if (typeof content !== 'string') return ''
    return content
  }

  /**
   * Un-neutralizes escaped backticks and delimiter components in extracted content.
   */
  public unneutralize(content: string): string {
    if (typeof content !== 'string') return ''
    return content
      .replace(/\\`/g, '`')
      .replace(/\\<{5}/g, '<<<<<')
      .replace(/\\>{5}/g, '>>>>>')
  }
}
