/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IgnoreEngine } from './ignore/IgnoreEngine.js'
import { IgnoreSource } from './types.js'

export interface HydratedFile {
  isIgnored: boolean
  isNegated: boolean
  reason?: string
  ignoreSource?: IgnoreSource
}

/**
 * Pure VFS hydration function — single source of truth for ignore resolution.
 * Returns a Map<string, HydratedFile> keyed by path to ensure O(1) lookup during UI reconciliation.
 */
export function hydrateVFS(
  paths: string[],
  engine: IgnoreEngine
): Map<string, HydratedFile> {
  const hydrationMap = new Map<string, HydratedFile>()

  for (const path of paths) {
    const { ignored, negated, reason, source } = engine.getIgnoreResult(path)
    hydrationMap.set(path, {
      isIgnored: ignored,
      isNegated: negated,
      reason,
      ignoreSource: source,
    })
  }

  return hydrationMap
}
