/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest'
import {
  extractSessionId,
  buildFileStartRegex,
  sanitizePath,
  dedupePath,
  processExtractedFile,
  extractPreMatterManifest,
  extractPostMatterManifest,
} from '../../../src/core/parsers/ParserUtils.js'
import type { VirtualFile, TelemetryPayload } from '../../../src/core/engine.js'

// ==========================================
// extractSessionId Contract Tests
// ==========================================

test('extractSessionId: extracts standard alphanumeric session ID from manifest header', () => {
  const content = '--- CONCATENATOR_SESSION_ID: 123456 ---\nSome payload'
  expect(extractSessionId(content)).toBe('123456')
})

test('extractSessionId: extracts session ID with surrounding whitespace inside delimiter', () => {
  const contentWithSpaces = '---   CONCATENATOR_SESSION_ID:   abcXYZ789   ---'
  expect(extractSessionId(contentWithSpaces)).toBe('abcXYZ789')

  const contentWithTabsAndNewlines =
    '\n\t--- \t CONCATENATOR_SESSION_ID:\t mySessionID \t--- \t\n'
  expect(extractSessionId(contentWithTabsAndNewlines)).toBe('mySessionID')
})

test('extractSessionId: case-insensitive match for CONCATENATOR_SESSION_ID marker', () => {
  const lowerCase = '--- concatenator_session_id: sesslowercase ---'
  expect(extractSessionId(lowerCase)).toBe('sesslowercase')

  const mixedCase = '--- ConCatenator_Session_Id: MixedCase123 ---'
  expect(extractSessionId(mixedCase)).toBe('MixedCase123')
})

test('extractSessionId: returns null when header is absent', () => {
  const content = 'Just plain content without manifest header'
  expect(extractSessionId(content)).toBeNull()
})

test('extractSessionId: returns null when session ID value is empty', () => {
  const emptyVal = '--- CONCATENATOR_SESSION_ID: ---'
  expect(extractSessionId(emptyVal)).toBeNull()

  const whitespaceOnlyVal = '--- CONCATENATOR_SESSION_ID:    ---'
  expect(extractSessionId(whitespaceOnlyVal)).toBeNull()
})

test('extractSessionId: returns null for invalid non-alphanumeric characters', () => {
  const withHyphens = '--- CONCATENATOR_SESSION_ID: sess-with-hyphens ---'
  expect(extractSessionId(withHyphens)).toBeNull()

  const withUnderscores =
    '--- CONCATENATOR_SESSION_ID: sess_with_underscores ---'
  expect(extractSessionId(withUnderscores)).toBeNull()

  const withSpecialChars = '--- CONCATENATOR_SESSION_ID: sess@123! ---'
  expect(extractSessionId(withSpecialChars)).toBeNull()
})

// ==========================================
// buildFileStartRegex Contract Tests
// ==========================================

test('buildFileStartRegex: generates RegExp matching standard session start delimiter', () => {
  const regex = buildFileStartRegex('session123')
  const sample = '<<<<< FILE_START: src/core/index.ts (ID: session123) >>>>>'
  expect(regex.test(sample)).toBe(true)
})

test('buildFileStartRegex: captures relative file paths correctly', () => {
  const regex = buildFileStartRegex('abc777')
  const content =
    '<<<<< FILE_START: packages/core/src/utils.ts (ID: abc777) >>>>>'
  const match = regex.exec(content)
  expect(match).not.toBeNull()
  expect(match?.[1]).toBe('packages/core/src/utils.ts')
})

test('buildFileStartRegex: isolates files by session ID and ignores mismatched session markers', () => {
  const regex = buildFileStartRegex('targetSession')
  const foreignContent =
    '<<<<< FILE_START: src/alien.ts (ID: foreignSession) >>>>>'
  expect(regex.test(foreignContent)).toBe(false)
})

// ==========================================
// sanitizePath Contract Tests
// ==========================================

test('sanitizePath: strips null byte characters to prevent poisoning', () => {
  const poisoned = 'src/\0secret/\0module.ts'
  expect(sanitizePath(poisoned)).toBe('src/secret/module.ts')
})

test('sanitizePath: normalizes backslashes to forward slashes', () => {
  const windowsPath = 'src\\core\\parsers\\ParserUtils.ts'
  expect(sanitizePath(windowsPath)).toBe('src/core/parsers/ParserUtils.ts')
})

test('sanitizePath: removes leading slashes and Windows drive letters', () => {
  expect(sanitizePath('///usr/local/bin/run.sh')).toBe('usr/local/bin/run.sh')
  expect(sanitizePath('C:/Projects/repo/file.ts')).toBe('Projects/repo/file.ts')
  expect(sanitizePath('d:\\data\\nested\\app.js')).toBe('data/nested/app.js')
})

test('sanitizePath: resolves parent directory traversal sequences', () => {
  expect(sanitizePath('a/b/c/../../d/file.ts')).toBe('a/d/file.ts')
  expect(sanitizePath('../../escaped.txt')).toBe('escaped.txt')
  expect(sanitizePath('foo/bar/../..')).toBe('')
})

test('sanitizePath: ignores dot and redundant empty path segments', () => {
  expect(sanitizePath('./a/./b//c.ts')).toBe('a/b/c.ts')
  expect(sanitizePath('folder/././/sub/')).toBe('folder/sub')
})

// ==========================================
// dedupePath Contract Tests
// ==========================================

test('dedupePath: preserves unique paths not present in existing path set', () => {
  const existing = new Set<string>(['src/index.ts', 'src/types.ts'])
  expect(dedupePath('src/utils.ts', existing)).toBe('src/utils.ts')
})

test('dedupePath: appends incremental counter suffix on first collision', () => {
  const existing = new Set<string>(['src/utils.ts'])
  expect(dedupePath('src/utils.ts', existing)).toBe('src/utils(1).ts')
})

test('dedupePath: cascades counter suffix on multiple collisions', () => {
  const existing = new Set<string>([
    'src/utils.ts',
    'src/utils(1).ts',
    'src/utils(2).ts',
  ])
  expect(dedupePath('src/utils.ts', existing)).toBe('src/utils(3).ts')
})

test('dedupePath: handles extensionless files cleanly', () => {
  const existing = new Set<string>(['Dockerfile', 'Dockerfile(1)'])
  expect(dedupePath('Dockerfile', existing)).toBe('Dockerfile(2)')
})

test('dedupePath: preserves directories containing dots without treating them as extensions', () => {
  const existing = new Set<string>(['v1.0.0/build'])
  expect(dedupePath('v1.0.0/build', existing)).toBe('v1.0.0/build(1)')

  const existingDottedFile = new Set<string>(['src.v1/app.test.ts'])
  expect(dedupePath('src.v1/app.test.ts', existingDottedFile)).toBe(
    'src.v1/app.test(1).ts'
  )
})

// ==========================================
// processExtractedFile Contract Tests
// ==========================================

test('processExtractedFile: adds valid file to result collection and registers deduplicated path', () => {
  const files: VirtualFile[] = []
  const skippedPaths: string[] = []
  const addedPaths = new Set<string>()
  const telemetry: TelemetryPayload = {
    skipped: [],
    symlinksRejected: 0,
    pathTraversalsRejected: 0,
  }

  const result = processExtractedFile(
    'src/index.ts',
    'export const version = "1.0.0";',
    '.',
    files,
    skippedPaths,
    addedPaths,
    telemetry
  )

  expect(result).toBe(true)
  expect(files).toHaveLength(1)
  expect(files[0]).toEqual({
    path: 'src/index.ts',
    content: 'export const version = "1.0.0";',
  })
  expect(addedPaths.has('src/index.ts')).toBe(true)
  expect(skippedPaths).toHaveLength(0)
  expect(telemetry.pathTraversalsRejected).toBe(0)
})

test('processExtractedFile: dedupes colliding path and updates addedPaths', () => {
  const files: VirtualFile[] = []
  const skippedPaths: string[] = []
  const addedPaths = new Set<string>(['src/file.ts'])
  const telemetry: TelemetryPayload = {
    skipped: [],
    symlinksRejected: 0,
    pathTraversalsRejected: 0,
  }

  const result = processExtractedFile(
    'src/file.ts',
    'duplicate content',
    '.',
    files,
    skippedPaths,
    addedPaths,
    telemetry
  )

  expect(result).toBe(true)
  expect(files[0].path).toBe('src/file(1).ts')
  expect(addedPaths.has('src/file(1).ts')).toBe(true)
})

test('processExtractedFile: intercepts PathTraversalError and updates telemetry skipped counters', () => {
  const files: VirtualFile[] = []
  const skippedPaths: string[] = []
  const addedPaths = new Set<string>()
  const telemetry: TelemetryPayload = {
    skipped: [],
    symlinksRejected: 0,
    pathTraversalsRejected: 0,
  }

  // Passing a traversal escaping path
  const result = processExtractedFile(
    '../../../../etc/shadow',
    'malicious payload',
    '.',
    files,
    skippedPaths,
    addedPaths,
    telemetry
  )

  expect(result).toBe(false)
  expect(files).toHaveLength(0)
  expect(skippedPaths).toContain('../../../../etc/shadow')
  expect(telemetry.pathTraversalsRejected).toBe(1)
  expect(telemetry.skipped[0]).toEqual({
    path: '../../../../etc/shadow',
    reason: 'Path Traversal Rejected',
  })
})

test('processExtractedFile: intercepts empty or null byte path as PathTraversalError', () => {
  const files: VirtualFile[] = []
  const skippedPaths: string[] = []
  const addedPaths = new Set<string>()
  const telemetry: TelemetryPayload = {
    skipped: [],
    symlinksRejected: 0,
    pathTraversalsRejected: 0,
  }

  const result = processExtractedFile(
    '',
    'content',
    '.',
    files,
    skippedPaths,
    addedPaths,
    telemetry
  )

  expect(result).toBe(false)
  expect(telemetry.pathTraversalsRejected).toBe(1)
})

// ==========================================
// extractPreMatterManifest Boundary & Extraction Tests
// ==========================================

test('extractPreMatterManifest: extracts manifest with session ID and valid pipe-delimited entries', () => {
  const payload = [
    '<<<<< KEL_MANIFEST_START (ID: session999) >>>>>',
    'packages/core/src/index.ts|0644|hashIndex123',
    'packages/core/src/utils.ts|0755|hashUtils456',
    '<<<<< KEL_MANIFEST_END >>>>>',
    'File body content following manifest...',
  ].join('\n')

  const manifest = extractPreMatterManifest(payload)
  expect(manifest).not.toBeNull()
  expect(manifest?.sessionId).toBe('session999')
  expect(manifest?.entries).toEqual([
    {
      path: 'packages/core/src/index.ts',
      mode: '0644',
      hash: 'hashIndex123',
    },
    {
      path: 'packages/core/src/utils.ts',
      mode: '0755',
      hash: 'hashUtils456',
    },
  ])
})

test('extractPreMatterManifest: extracts manifest without session ID', () => {
  const payload = [
    '<<<<< KEL_MANIFEST_START >>>>>',
    'src/standalone.ts|0644|standaloneHash',
    '<<<<< KEL_MANIFEST_END >>>>>',
  ].join('\n')

  const manifest = extractPreMatterManifest(payload)
  expect(manifest).not.toBeNull()
  expect(manifest?.sessionId).toBeNull()
  expect(manifest?.entries).toEqual([
    {
      path: 'src/standalone.ts',
      mode: '0644',
      hash: 'standaloneHash',
    },
  ])
})

test('extractPreMatterManifest: returns empty entries when manifest body is blank', () => {
  const payload = [
    '<<<<< KEL_MANIFEST_START (ID: sessEmpty) >>>>>',
    '   ',
    '',
    '<<<<< KEL_MANIFEST_END >>>>>',
  ].join('\n')

  const manifest = extractPreMatterManifest(payload)
  expect(manifest).not.toBeNull()
  expect(manifest?.sessionId).toBe('sessEmpty')
  expect(manifest?.entries).toEqual([])
})

test('extractPreMatterManifest: skips corrupted lines missing pipe delimiters or hash tokens', () => {
  const payload = [
    '<<<<< KEL_MANIFEST_START (ID: sessCorrupt) >>>>>',
    'file_without_hash.txt|0644',
    'corrupted_line_without_pipes',
    'valid/file.ts|0644|validhash123',
    'extra/tokens/file.ts|0755|validhash456|extraToken',
    '<<<<< KEL_MANIFEST_END >>>>>',
  ].join('\n')

  const manifest = extractPreMatterManifest(payload)
  expect(manifest).not.toBeNull()
  expect(manifest?.entries).toEqual([
    {
      path: 'valid/file.ts',
      mode: '0644',
      hash: 'validhash123',
    },
    {
      path: 'extra/tokens/file.ts',
      mode: '0755',
      hash: 'validhash456',
    },
  ])
})

test('extractPreMatterManifest: returns null when KEL_MANIFEST_START delimiter is missing', () => {
  const payload = [
    'packages/core/src/index.ts|0644|hash123',
    '<<<<< KEL_MANIFEST_END >>>>>',
  ].join('\n')

  expect(extractPreMatterManifest(payload)).toBeNull()
})

test('extractPreMatterManifest: returns null when KEL_MANIFEST_END delimiter is missing', () => {
  const payload = [
    '<<<<< KEL_MANIFEST_START (ID: unclosed) >>>>>',
    'packages/core/src/index.ts|0644|hash123',
    'trailing unclosed payload...',
  ].join('\n')

  expect(extractPreMatterManifest(payload)).toBeNull()
})

test('extractPreMatterManifest: strictly isolates header boundary without leaking trailing payload text', () => {
  const payload = [
    '<<<<< KEL_MANIFEST_START (ID: sBoundary) >>>>>',
    'valid.ts|0644|hashValid',
    '<<<<< KEL_MANIFEST_END >>>>>',
    'leaked/file.ts|0644|leakedHash',
    'more random text|0644|hash',
  ].join('\n')

  const manifest = extractPreMatterManifest(payload)
  expect(manifest?.entries).toHaveLength(1)
  expect(manifest?.entries[0].path).toBe('valid.ts')
})

// ==========================================
// extractPostMatterManifest Compatibility Tests
// ==========================================

test('extractPostMatterManifest: extracts legacy EOF manifest and logs deprecation warning', () => {
  const payload = [
    'Some arbitrary file payload...',
    '<<<<< POST_MATTER_MANIFEST_START (ID: legacySession) >>>>>',
    'src/legacy.ts|0644|legacyHash',
    'src/config.json|0600|configHash',
    '<<<<< POST_MATTER_MANIFEST_END >>>>>',
  ].join('\n')

  const manifest = extractPostMatterManifest(payload)
  expect(manifest).not.toBeNull()
  expect(manifest?.sessionId).toBe('legacySession')
  expect(manifest?.entries).toEqual([
    {
      path: 'src/legacy.ts',
      mode: '0644',
      hash: 'legacyHash',
    },
    {
      path: 'src/config.json',
      mode: '0600',
      hash: 'configHash',
    },
  ])
})

test('extractPostMatterManifest: retains backward compatibility in null-logger context without throwing TypeError', () => {
  const payload = [
    '<<<<< POST_MATTER_MANIFEST_START >>>>>',
    'src/compat.ts|0644|compatHash',
    '<<<<< POST_MATTER_MANIFEST_END >>>>>',
  ].join('\n')

  // Execution must not throw under any circumstances
  expect(() => {
    const result = extractPostMatterManifest(payload)
    expect(result?.sessionId).toBeNull()
    expect(result?.entries).toHaveLength(1)
    expect(result?.entries[0].path).toBe('src/compat.ts')
  }).not.toThrow()
})

test('extractPostMatterManifest: returns null on missing start or end delimiters', () => {
  const missingStart =
    'src/app.ts|0644|h1\n<<<<< POST_MATTER_MANIFEST_END >>>>>'
  expect(extractPostMatterManifest(missingStart)).toBeNull()

  const missingEnd =
    '<<<<< POST_MATTER_MANIFEST_START >>>>>\nsrc/app.ts|0644|h1'
  expect(extractPostMatterManifest(missingEnd)).toBeNull()
})

test('extractPostMatterManifest: filters malformed entries with fewer than three tokens', () => {
  const payload = [
    '<<<<< POST_MATTER_MANIFEST_START (ID: legacyCorrupt) >>>>>',
    'bad_line_2_tokens.ts|0644',
    'good_line.ts|0644|hashGood',
    '<<<<< POST_MATTER_MANIFEST_END >>>>>',
  ].join('\n')

  const manifest = extractPostMatterManifest(payload)
  expect(manifest?.entries).toEqual([
    {
      path: 'good_line.ts',
      mode: '0644',
      hash: 'hashGood',
    },
  ])
})
