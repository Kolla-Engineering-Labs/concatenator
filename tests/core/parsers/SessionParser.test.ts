/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest'
import { SessionParser } from '../../../src/core/parsers/SessionParser.js'

// ==========================================
// Protocol Matching (canParse)
// ==========================================

test('SessionParser.canParse: returns true when session ID header is present in manifest', () => {
  const parser = new SessionParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: abc123XYZ ---',
    '<<<<< FILE_START: src/index.ts (ID: abc123XYZ) >>>>>',
    'export const active = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')
  expect(parser.canParse(content)).toBe(true)
})

test('SessionParser.canParse: returns false when session ID header is absent', () => {
  const parser = new SessionParser()
  const content = [
    '<<<<< FILE_START: src/index.ts >>>>>',
    'export const active = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')
  expect(parser.canParse(content)).toBe(false)
})

// ==========================================
// Session Isolation & Extraction (parse)
// ==========================================

test('SessionParser.parse: returns empty result with foundAny false when session ID cannot be extracted', () => {
  const parser = new SessionParser()
  const content = 'Plain content with no session ID header'
  const result = parser.parse(content)
  expect(result.foundAny).toBe(false)
  expect(result.files).toHaveLength(0)
  expect(result.skippedPaths).toHaveLength(0)
})

test('SessionParser.parse: extracts single file matching the active session ID token', () => {
  const parser = new SessionParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: sessionAlpha ---',
    '<<<<< FILE_START: src/index.ts (ID: sessionAlpha) >>>>>',
    'console.log("Session Alpha active");',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(1)
  expect(result.files[0]).toEqual({
    path: 'src/index.ts',
    content: 'console.log("Session Alpha active");',
  })
  expect(result.skippedPaths).toHaveLength(0)
  expect(result.telemetry.pathTraversalsRejected).toBe(0)
})

test('SessionParser.parse: extracts multiple files matching the active session ID token', () => {
  const parser = new SessionParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: sessionBeta ---',
    '<<<<< FILE_START: src/first.ts (ID: sessionBeta) >>>>>',
    'export const first = 1;',
    '<<<<< FILE_END >>>>>',
    '<<<<< FILE_START: src/second.ts (ID: sessionBeta) >>>>>',
    'export const second = 2;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(2)
  expect(result.files[0]).toEqual({
    path: 'src/first.ts',
    content: 'export const first = 1;',
  })
  expect(result.files[1]).toEqual({
    path: 'src/second.ts',
    content: 'export const second = 2;',
  })
})

test('SessionParser.parse: ignores file start markers tagged with mismatched session IDs', () => {
  const parser = new SessionParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: activeSess ---',
    '<<<<< FILE_START: src/foreign.ts (ID: foreignSess) >>>>>',
    'export const foreign = true;',
    '<<<<< FILE_END >>>>>',
    '<<<<< FILE_START: src/valid.ts (ID: activeSess) >>>>>',
    'export const valid = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(1)
  expect(result.files[0]).toEqual({
    path: 'src/valid.ts',
    content: 'export const valid = true;',
  })
})

test('SessionParser.parse: flags skipped file when FILE_END delimiter is missing or out of order', () => {
  const parser = new SessionParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: sessBroken ---',
    '<<<<< FILE_START: src/broken.ts (ID: sessBroken) >>>>>',
    'unclosed content without end tag',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(false)
  expect(result.files).toHaveLength(0)
  expect(result.skippedPaths).toContain('src/broken.ts')
  expect(result.telemetry.skipped).toContainEqual({
    path: 'src/broken.ts',
    reason: 'Missing End Delimiter',
  })
})

test('SessionParser.parse: correctly recovers and processes subsequent files after a corrupted entry', () => {
  const parser = new SessionParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: sessRecovery ---',
    '<<<<< FILE_START: src/unclosed.ts (ID: sessRecovery) >>>>>',
    'corrupted file',
    '<<<<< FILE_START: src/healthy.ts (ID: sessRecovery) >>>>>',
    'export const healthy = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(1)
  expect(result.files[0]).toEqual({
    path: 'src/healthy.ts',
    content: 'export const healthy = true;',
  })
  expect(result.skippedPaths).toContain('src/unclosed.ts')
  expect(result.telemetry.skipped).toContainEqual({
    path: 'src/unclosed.ts',
    reason: 'Missing End Delimiter',
  })
})

test('SessionParser.parse: sanitizes, dedupes, and populates telemetry for extracted session files', () => {
  const parser = new SessionParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: sessDedupe ---',
    '<<<<< FILE_START: src/duplicate.ts (ID: sessDedupe) >>>>>',
    'const v1 = 1;',
    '<<<<< FILE_END >>>>>',
    '<<<<< FILE_START: src/duplicate.ts (ID: sessDedupe) >>>>>',
    'const v2 = 2;',
    '<<<<< FILE_END >>>>>',
    '<<<<< FILE_START: ../../escaped.ts (ID: sessDedupe) >>>>>',
    'const exploit = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(2)
  expect(result.files[0].path).toBe('src/duplicate.ts')
  expect(result.files[1].path).toBe('src/duplicate(1).ts')
  expect(result.skippedPaths).toContain('../../escaped.ts')
  expect(result.telemetry.pathTraversalsRejected).toBe(1)
})
