/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { SymlinkRejectedError, PathTraversalError } from './errors.js'

// Dynamic index access to prevent Vite/Rollup AST parser export verification warnings on externalized browser modules
const fsMod: Record<string, unknown> = fs as unknown as Record<string, unknown>
const pathMod: Record<string, unknown> = path as unknown as Record<
  string,
  unknown
>

/**
 * Safe path resolution helper working across Node.js and browser environments.
 */
function safeResolve(base: string, target?: string): string {
  let resolveFn: unknown = undefined
  try {
    if (pathMod && typeof pathMod === 'object') {
      resolveFn = pathMod['resolve']
    }
  } catch {
    /* Vitest mock proxy safety */
  }

  if (typeof resolveFn === 'function') {
    try {
      return (resolveFn as (b: string, t: string) => string)(base, target || '')
    } catch {
      /* fallthrough to browser fallback */
    }
  }
  const combined = target ? `${base}/${target}` : base
  const normalized = combined.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '..') {
      if (stack.length > 0) stack.pop()
    } else if (part !== '.' && part !== '') {
      stack.push(part)
    }
  }
  const isAbs = normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)
  return (isAbs ? '/' : '') + stack.join('/')
}

/**
 * Safe path join helper working across Node.js and browser environments.
 */
function safeJoin(base: string, part: string): string {
  let joinFn: unknown = undefined
  try {
    if (pathMod && typeof pathMod === 'object') {
      joinFn = pathMod['join']
    }
  } catch {
    /* Vitest mock proxy safety */
  }

  if (typeof joinFn === 'function') {
    try {
      return (joinFn as (b: string, p: string) => string)(base, part)
    } catch {
      /* fallthrough to browser fallback */
    }
  }
  const normBase = base.replace(/\\/g, '/').replace(/\/$/, '')
  const normPart = part.replace(/\\/g, '/').replace(/^\//, '')
  return normBase ? `${normBase}/${normPart}` : normPart
}

/**
 * Pure PathValidator utility for enforcing path jail boundaries and strict symlink rejection.
 * Works seamlessly in both Node.js environment (with fs checks) and browser environment (virtual files).
 *
 * @param targetPath - The relative or candidate file path to validate and jail.
 * @param rootDir - The root directory boundary.
 * @returns The resolved, safe absolute path within the root directory jail.
 * @throws {SymlinkRejectedError} If any existing path component evaluates to a symbolic link.
 * @throws {PathTraversalError} If the target path escapes the root directory boundary.
 */
export function resolveAndJail(targetPath: string, rootDir: string): string {
  if (!targetPath) {
    throw new PathTraversalError('Invalid target path: path cannot be empty')
  }

  let lstatFn: unknown = undefined
  let existsFn: unknown = undefined
  let realpathFn: unknown = undefined

  try {
    if (fsMod && typeof fsMod === 'object') {
      lstatFn = fsMod['lstatSync']
      existsFn = fsMod['existsSync']
      realpathFn = fsMod['realpathSync']
    }
  } catch {
    /* Vitest mock proxy safety for unmocked methods */
  }

  const hasFs = typeof lstatFn === 'function'

  // Normalize rootDir and resolve physical root if available on Node.js
  const resolvedRoot =
    hasFs &&
    typeof existsFn === 'function' &&
    (existsFn as (p: string) => boolean)(rootDir) &&
    typeof realpathFn === 'function'
      ? (realpathFn as (p: string) => string)(safeResolve(rootDir))
      : safeResolve(rootDir)

  // Remove null bytes and normalize backslashes
  const sanitized = targetPath
    .replace(new RegExp(String.fromCharCode(0), 'g'), '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')

  // Component-by-component walk for symlink checking (Node environment only)
  if (hasFs) {
    let currentPath = resolvedRoot
    const parts = sanitized.split('/').filter(Boolean)

    for (const part of parts) {
      currentPath = safeJoin(currentPath, part)
      try {
        const stats = (lstatFn as (p: string) => fs.Stats)(currentPath)
        if (
          stats &&
          typeof stats.isSymbolicLink === 'function' &&
          stats.isSymbolicLink()
        ) {
          throw new SymlinkRejectedError(
            `Security Violation: Symbolic link rejected: ${targetPath}`
          )
        }
      } catch (err: unknown) {
        if (err instanceof SymlinkRejectedError) {
          throw err
        }
        // ENOENT trap: Target component does not exist on disk yet (normal during extraction).
        // Stop walking further non-existent child segments and proceed directly to boundary check.
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: string }).code === 'ENOENT'
        ) {
          break
        }
        // Stop walking on unexpected filesystem errors
        break
      }
    }
  }

  // Calculate candidate path
  const candidatePath = safeResolve(resolvedRoot, sanitized)

  // Normalize slashes for boundary assertion
  const normalizedCandidate = candidatePath.replace(/\\/g, '/')
  const normalizedRoot = resolvedRoot.replace(/\\/g, '/')
  const rootWithSlash = normalizedRoot.endsWith('/')
    ? normalizedRoot
    : `${normalizedRoot}/`

  // Assert containment strictly within root boundary
  if (
    normalizedCandidate !== normalizedRoot &&
    !normalizedCandidate.startsWith(rootWithSlash)
  ) {
    throw new PathTraversalError(
      `Security Violation: Path traversal outside root boundary: ${targetPath}`
    )
  }

  return candidatePath
}

export const PathValidator = {
  resolveAndJail,
}
