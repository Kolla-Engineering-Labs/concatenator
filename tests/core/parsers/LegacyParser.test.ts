/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest'
import { LegacyParser } from '../../../src/core/parsers/LegacyParser.js'

// ==========================================
// Protocol Matching (canParse)
// ==========================================

test('LegacyParser.canParse: returns true for legacy FILE_START payloads lacking session ID', () => {
  const parser = new LegacyParser()
  const content = [
    '<<<<< FILE_START: src/index.ts >>>>>',
    'export const ready = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')
  expect(parser.canParse(content)).toBe(true)
})

test('LegacyParser.canParse: returns false when session ID is detected', () => {
  const parser = new LegacyParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: sess123 ---',
    '<<<<< FILE_START: src/index.ts (ID: sess123) >>>>>',
    'export const ready = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')
  expect(parser.canParse(content)).toBe(false)
})

test('LegacyParser.canParse: returns false when FILE_START delimiter is absent', () => {
  const parser = new LegacyParser()
  const content = '--- FILE: src/index.ts ---\nconsole.log(1);'
  expect(parser.canParse(content)).toBe(false)
})

// ==========================================
// Extraction & Error Recovery (parse)
// ==========================================

test('LegacyParser.parse: extracts single legacy delimited file with exact boundaries', () => {
  const parser = new LegacyParser()
  const content = [
    '<<<<< FILE_START: src/app.ts >>>>>',
    'export const app = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(1)
  expect(result.files[0]).toEqual({
    path: 'src/app.ts',
    content: 'export const app = true;',
  })
  expect(result.skippedPaths).toHaveLength(0)
  expect(result.telemetry.pathTraversalsRejected).toBe(0)
})

test('LegacyParser.parse: extracts multiple legacy delimited files sequentially', () => {
  const parser = new LegacyParser()
  const content = [
    '<<<<< FILE_START: src/a.ts >>>>>',
    'const a = 1;',
    '<<<<< FILE_END >>>>>',
    '<<<<< FILE_START: src/b.ts >>>>>',
    'const b = 2;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(2)
  expect(result.files[0]).toEqual({
    path: 'src/a.ts',
    content: 'const a = 1;',
  })
  expect(result.files[1]).toEqual({
    path: 'src/b.ts',
    content: 'const b = 2;',
  })
})

test('LegacyParser.parse: flags skipped files and records telemetry when FILE_END delimiter is missing', () => {
  const parser = new LegacyParser()
  const content = [
    '<<<<< FILE_START: src/unclosed.ts >>>>>',
    'missing end delimiter content',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(false)
  expect(result.files).toHaveLength(0)
  expect(result.skippedPaths).toContain('src/unclosed.ts')
  expect(result.telemetry.skipped).toContainEqual({
    path: 'src/unclosed.ts',
    reason: 'Missing End Delimiter',
  })
})

test('LegacyParser.parse: recovers search position to extract subsequent files after an unclosed file', () => {
  const parser = new LegacyParser()
  const content = [
    '<<<<< FILE_START: src/corrupt.ts >>>>>',
    'corrupted without closing delimiter',
    '<<<<< FILE_START: src/valid.ts >>>>>',
    'const valid = true;',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(1)
  expect(result.files[0]).toEqual({
    path: 'src/valid.ts',
    content: 'const valid = true;',
  })
  expect(result.skippedPaths).toContain('src/corrupt.ts')
  expect(result.telemetry.skipped).toContainEqual({
    path: 'src/corrupt.ts',
    reason: 'Missing End Delimiter',
  })
})

test('LegacyParser.parse: returns empty result with foundAny false when content contains no markers', () => {
  const parser = new LegacyParser()
  const result = parser.parse('Arbitrary plain text without delimiters')
  expect(result.foundAny).toBe(false)
  expect(result.files).toHaveLength(0)
  expect(result.skippedPaths).toHaveLength(0)
})

test('LegacyParser.parse: intercepts path traversal and symlink violations into telemetry', () => {
  const parser = new LegacyParser()
  const content = [
    '<<<<< FILE_START: ../../outside.txt >>>>>',
    'malicious traversal content',
    '<<<<< FILE_END >>>>>',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.files).toHaveLength(0)
  expect(result.skippedPaths).toContain('../../outside.txt')
  expect(result.telemetry.pathTraversalsRejected).toBe(1)
  expect(result.telemetry.skipped).toContainEqual({
    path: '../../outside.txt',
    reason: 'Path Traversal Rejected',
  })
})
