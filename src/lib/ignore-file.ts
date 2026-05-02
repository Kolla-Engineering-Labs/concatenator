/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Merge a new list of patterns into existing ignore-file content, preserving
 * all comment lines (`# ...`) and blank lines in their original positions.
 *
 * Rules:
 *  - Header comments (prefix lines before the first pattern) are always kept.
 *  - Each comment block is associated with the *next* pattern line; the block
 *    is kept when that pattern is kept, dropped when the pattern is removed.
 *  - Footer comments (after the last pattern) are kept if they contain a `#`.
 *  - New patterns not present in the existing file are appended at the end.
 *  - Negation patterns (`!some/path`) are treated as regular string values
 *    and round-trip correctly through this function.
 *
 * @param existingContent - Raw file content to merge into (empty for new files)
 * @param newPatterns     - Authoritative list of active patterns (may include `!` negations)
 * @returns Merged file content with a single trailing newline
 */
export function mergeIgnoreFileWithComments(
  existingContent: string,
  newPatterns: string[]
): string {
  const lines =
    existingContent.trim() === ''
      ? []
      : existingContent.replace(/\r\n/g, '\n').split('\n')

  interface Block {
    prefix: string[] // comment / blank lines preceding the pattern
    pattern: string | null // null marks the trailing footer block
  }

  const blocks: Block[] = []
  let currentPrefix: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      currentPrefix.push(line)
    } else {
      blocks.push({ prefix: currentPrefix, pattern: trimmed })
      currentPrefix = []
    }
  }
  // Trailing comments/blanks after the last pattern
  blocks.push({ prefix: currentPrefix, pattern: null })

  const newPatternSet = new Set(newPatterns)
  const coveredPatterns = new Set<string>()
  const outputLines: string[] = []
  let pastFirstPattern = false

  for (const block of blocks) {
    const isFooter = block.pattern === null

    if (!pastFirstPattern) {
      // Everything before the first pattern is a "header" — always preserved
      outputLines.push(...block.prefix)
      if (block.pattern !== null) {
        pastFirstPattern = true
        if (newPatternSet.has(block.pattern)) {
          outputLines.push(block.pattern)
          coveredPatterns.add(block.pattern)
        }
      }
    } else if (isFooter) {
      // Footer: keep only if it contains at least one comment line
      if (block.prefix.some((l) => l.trim().startsWith('#'))) {
        outputLines.push(...block.prefix)
      }
    } else {
      // Mid-file block: keep iff its pattern is still active
      if (newPatternSet.has(block.pattern!)) {
        outputLines.push(...block.prefix)
        outputLines.push(block.pattern!)
        coveredPatterns.add(block.pattern!)
      }
      // pattern was removed → drop the whole block including its comments
    }
  }

  // Append patterns that were not present in the original file
  for (const pattern of newPatterns) {
    if (!coveredPatterns.has(pattern)) {
      outputLines.push(pattern)
    }
  }

  // Strip trailing blank lines; ensure a single trailing newline
  while (
    outputLines.length > 0 &&
    outputLines[outputLines.length - 1].trim() === ''
  ) {
    outputLines.pop()
  }

  return outputLines.length > 0 ? outputLines.join('\n') + '\n' : ''
}
