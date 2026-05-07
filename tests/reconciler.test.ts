/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { reconcileFiles } from '../src/core/reconciler'
import type { FileItem } from '../src/core/types'

/** Minimal FileItem factory */
const f = (path: string, kind: 'file' | 'directory' = 'file'): FileItem => ({
  name: path.split('/').pop() || path,
  path,
  kind,
})

describe('reconcileFiles', () => {
  // ─── Phase 2: parent absorption (original behaviour) ──────────────────────

  describe('parent absorption (new drop is a parent of existing)', () => {
    it('absorbs an existing child root when a wider parent is dropped', () => {
      const existing = [f('src/components/Button.tsx'), f('src/components')]
      const incoming = [
        f('src'),
        f('src/App.tsx'),
        f('src/components'),
        f('src/components/Button.tsx'),
      ]

      const { files } = reconcileFiles(existing, incoming)

      // All files should now be under src/
      expect(files.every((f) => f.path.startsWith('src'))).toBe(true)
      // No duplicate paths
      const paths = files.map((f) => f.path)
      expect(paths.length).toBe(new Set(paths).size)
    })

    it('returns no absorptions when drops are unrelated', () => {
      const existing = [f('lib/utils.ts'), f('lib')]
      const incoming = [f('src'), f('src/App.tsx')]

      const { absorptions } = reconcileFiles(existing, incoming)
      expect(absorptions).toHaveLength(0)
    })
  })

  // ─── Phase 1: suffix absorption (new fix) ─────────────────────────────────

  describe('suffix absorption (isolated sub-folder dropped before parent)', () => {
    it('removes stale shallow entries when the parent drop subsumes them', () => {
      // User dropped "src/drivers" first → paths stored as "drivers/zip-driver.ts"
      const existing = [
        f('drivers'),
        f('drivers/zip-driver.ts'),
        f('drivers/tar-driver.ts'),
      ]

      // User now drops "src" → same files appear at deeper paths
      const incoming = [
        f('src'),
        f('src/App.tsx'),
        f('src/drivers'),
        f('src/drivers/zip-driver.ts'),
        f('src/drivers/tar-driver.ts'),
      ]

      const { files, absorptions } = reconcileFiles(existing, incoming)

      // Stale shallow entries must be gone
      const paths = files.map((f) => f.path)
      expect(paths).not.toContain('drivers/zip-driver.ts')
      expect(paths).not.toContain('drivers/tar-driver.ts')
      expect(paths).not.toContain('drivers')

      // Correct deep paths must be present
      expect(paths).toContain('src/drivers/zip-driver.ts')
      expect(paths).toContain('src/drivers/tar-driver.ts')
      expect(paths).toContain('src/drivers')
      expect(paths).toContain('src/App.tsx')

      // Absorptions reported for the stale entries
      expect(absorptions.length).toBeGreaterThan(0)
      const absorbedChildren = absorptions.map((a) => a.child)
      expect(absorbedChildren).toContain('drivers/zip-driver.ts')
      expect(absorbedChildren).toContain('drivers/tar-driver.ts')
    })

    it('reports the correct parent in absorptions', () => {
      const existing = [f('drivers/zip-driver.ts')]
      const incoming = [f('src/drivers/zip-driver.ts')]

      const { absorptions } = reconcileFiles(existing, incoming)

      expect(absorptions).toHaveLength(1)
      expect(absorptions[0].child).toBe('drivers/zip-driver.ts')
      expect(absorptions[0].parent).toBe('src')
    })

    it('does not absorb entries that are truly unrelated (no suffix match)', () => {
      // "utils.ts" is not a suffix of any new path
      const existing = [f('helpers/utils.ts')]
      const incoming = [f('src/App.tsx'), f('src/drivers/zip-driver.ts')]

      const { absorptions, files } = reconcileFiles(existing, incoming)

      expect(absorptions).toHaveLength(0)
      const paths = files.map((f) => f.path)
      expect(paths).toContain('helpers/utils.ts')
    })

    it('does not false-positive on shared file names without a matching root', () => {
      // "index.ts" exists in both drops but at different roots — not a suffix match
      // because the existing path "a/index.ts" is not a suffix of new "b/index.ts"
      const existing = [f('a/index.ts')]
      const incoming = [f('b/index.ts')]

      const { absorptions } = reconcileFiles(existing, incoming)
      // "b/index.ts".endsWith("/a/index.ts") → false, so no absorption
      expect(absorptions).toHaveLength(0)
    })
  })

  // ─── General invariants ───────────────────────────────────────────────────

  describe('general invariants', () => {
    it('never produces duplicate paths in output', () => {
      const existing = [f('drivers/a.ts'), f('drivers')]
      const incoming = [
        f('src'),
        f('src/drivers'),
        f('src/drivers/a.ts'),
        f('src/App.tsx'),
      ]

      const { files } = reconcileFiles(existing, incoming)
      const paths = files.map((f) => f.path)
      expect(paths.length).toBe(new Set(paths).size)
    })

    it('merges two independent drops cleanly', () => {
      const existing = [f('lib/utils.ts')]
      const incoming = [f('src/App.tsx')]

      const { files, absorptions } = reconcileFiles(existing, incoming)
      expect(absorptions).toHaveLength(0)
      expect(files).toHaveLength(2)
    })

    it('returns empty when both inputs are empty', () => {
      const { files, absorptions } = reconcileFiles([], [])
      expect(files).toHaveLength(0)
      expect(absorptions).toHaveLength(0)
    })
  })
})
