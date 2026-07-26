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
 * Safe path relative helper working across Node.js and browser environments.
 */
function safeRelative(from: string, to: string): string {
  let relativeFn: unknown = undefined
  try {
    if (pathMod && typeof pathMod === 'object') {
      relativeFn = pathMod['relative']
    }
  } catch {
    /* Vitest mock proxy safety */
  }

  if (typeof relativeFn === 'function') {
    try {
      return (relativeFn as (f: string, t: string) => string)(from, to)
    } catch {
      /* fallthrough to browser fallback */
    }
  }
  const normFrom = from.replace(/\\/g, '/').replace(/\/$/, '')
  const normTo = to.replace(/\\/g, '/').replace(/\/$/, '')
  if (normFrom === normTo) return ''
  const fromParts = normFrom.split('/').filter(Boolean)
  const toParts = normTo.split('/').filter(Boolean)
  let common = 0
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++
  }
  const upCount = fromParts.length - common
  const upParts = Array(upCount).fill('..')
  const downParts = toParts.slice(common)
  return [...upParts, ...downParts].join('/')
}

/**
 * Safe path isAbsolute helper working across Node.js and browser environments.
 */
function safeIsAbsolute(p: string): boolean {
  let isAbsFn: unknown = undefined
  try {
    if (pathMod && typeof pathMod === 'object') {
      isAbsFn = pathMod['isAbsolute']
    }
  } catch {
    /* Vitest mock proxy safety */
  }

  if (typeof isAbsFn === 'function') {
    try {
      return (isAbsFn as (path: string) => boolean)(p)
    } catch {
      /* fallthrough to browser fallback */
    }
  }
  const normalized = p.replace(/\\/g, '/')
  return normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)
}

/**
 * Pure PathValidator utility for enforcing path jail boundaries and strict symlink rejection.
 * Works seamlessly in both Node.js environment (with fs checks) and browser environment (virtual files).
 *
 * @param targetPath - The relative or candidate file path to validate and jail.
 * @param rootDir - The root directory boundary.
 * @returns The resolved, safe absolute path within the root directory jail.
 * @throws {SymlinkRejectedError} If any existing path component evaluates to a symbolic link.
 * @throws {PathTraversalError} If the target path escapes the root directory boundary or contains null bytes.
 */
export function resolveAndJail(targetPath: string, rootDir: string): string {
  if (!targetPath) {
    throw new PathTraversalError('Invalid target path: path cannot be empty')
  }

  if (targetPath.includes('\0') || (rootDir && rootDir.includes('\0'))) {
    throw new PathTraversalError('Security Violation: Path contains null bytes')
  }

  // Reject absolute path injections (POSIX leading slash, Windows drive letter, or UNC)
  if (
    safeIsAbsolute(targetPath) ||
    targetPath.startsWith('/') ||
    targetPath.startsWith('\\') ||
    /^[a-zA-Z]:/.test(targetPath)
  ) {
    throw new PathTraversalError(
      `Security Violation: Absolute path injection rejected: ${targetPath}`
    )
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

  // Normalize backslashes without mutating percent symbols
  const sanitized = targetPath.replace(/\\/g, '/')

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

  // Mathematically guarantee containment within root boundary using path.relative
  const relativePath = safeRelative(resolvedRoot, candidatePath)

  if (relativePath.startsWith('..') || safeIsAbsolute(relativePath)) {
    throw new PathTraversalError(
      `Security Violation: Path traversal outside root boundary: ${targetPath}`
    )
  }

  return candidatePath
}

export const PathValidator = {
  resolveAndJail,
}
