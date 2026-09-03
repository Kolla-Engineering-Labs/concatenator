/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest'
import { HeaderParser } from '../../../src/core/parsers/HeaderParser.js'

// ==========================================
// Protocol Matching (canParse)
// ==========================================

test('HeaderParser.canParse: returns true for header-style format without session ID or start delimiters', () => {
  const parser = new HeaderParser()
  const content = '--- FILE: src/index.ts ---\nconsole.log("hello");'
  expect(parser.canParse(content)).toBe(true)
})

test('HeaderParser.canParse: returns false when session ID header is present', () => {
  const parser = new HeaderParser()
  const content = [
    '--- CONCATENATOR_SESSION_ID: 123456 ---',
    '--- FILE: src/index.ts ---',
    'console.log("hello");',
  ].join('\n')
  expect(parser.canParse(content)).toBe(false)
})

test('HeaderParser.canParse: returns false when FILE_START delimiter is present', () => {
  const parser = new HeaderParser()
  const content = [
    '<<<<< FILE_START: src/index.ts >>>>>',
    'console.log("hello");',
    '<<<<< FILE_END >>>>>',
    '--- FILE: src/other.ts ---',
  ].join('\n')
  expect(parser.canParse(content)).toBe(false)
})

test('HeaderParser.canParse: returns false when FILE marker is missing', () => {
  const parser = new HeaderParser()
  const content = 'Arbitrary plain text content without header markers'
  expect(parser.canParse(content)).toBe(false)
})

// ==========================================
// Extraction & Boundaries (parse)
// ==========================================

test('HeaderParser.parse: extracts single file from header format payload', () => {
  const parser = new HeaderParser()
  const content = [
    '--- FILE: src/main.ts ---',
    'export const app = "concatenator";',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(1)
  expect(result.files[0]).toEqual({
    path: 'src/main.ts',
    content: 'export const app = "concatenator";',
  })
  expect(result.skippedPaths).toHaveLength(0)
  expect(result.telemetry.pathTraversalsRejected).toBe(0)
})

test('HeaderParser.parse: extracts multiple files with correct content isolation', () => {
  const parser = new HeaderParser()
  const content = [
    '--- FILE: src/alpha.ts ---',
    'export const alpha = 1;',
    '--- FILE: src/beta.ts ---',
    'export const beta = 2;',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.foundAny).toBe(true)
  expect(result.files).toHaveLength(2)
  expect(result.files[0]).toEqual({
    path: 'src/alpha.ts',
    content: 'export const alpha = 1;',
  })
  expect(result.files[1]).toEqual({
    path: 'src/beta.ts',
    content: 'export const beta = 2;',
  })
})

test('HeaderParser.parse: strips trailing boundary delimiters and cleans file content', () => {
  const parser = new HeaderParser()
  const content = [
    '--- FILE: src/clean.ts ---',
    'const value = 42;',
    '---',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.files).toHaveLength(1)
  expect(result.files[0].content).toBe('const value = 42;')
})

test('HeaderParser.parse: handles empty content gracefully returning empty file list', () => {
  const parser = new HeaderParser()
  const result = parser.parse('')
  expect(result.foundAny).toBe(false)
  expect(result.files).toHaveLength(0)
  expect(result.skippedPaths).toHaveLength(0)
})

test('HeaderParser.parse: registers path collisions and dedupes extracted paths', () => {
  const parser = new HeaderParser()
  const content = [
    '--- FILE: config.json ---',
    '{"id": 1}',
    '--- FILE: config.json ---',
    '{"id": 2}',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.files).toHaveLength(2)
  expect(result.files[0].path).toBe('config.json')
  expect(result.files[1].path).toBe('config(1).json')
})

test('HeaderParser.parse: intercepts path traversal attempts in header paths and records telemetry', () => {
  const parser = new HeaderParser()
  const content = [
    '--- FILE: ../../../etc/shadow ---',
    'root:secret',
    '--- FILE: src/valid.ts ---',
    'export const safe = true;',
  ].join('\n')

  const result = parser.parse(content)
  expect(result.files).toHaveLength(1)
  expect(result.files[0].path).toBe('src/valid.ts')
  expect(result.skippedPaths).toContain('../../../etc/shadow')
  expect(result.telemetry.pathTraversalsRejected).toBe(1)
  expect(result.telemetry.skipped).toContainEqual({
    path: '../../../etc/shadow',
    reason: 'Path Traversal Rejected',
  })
})
