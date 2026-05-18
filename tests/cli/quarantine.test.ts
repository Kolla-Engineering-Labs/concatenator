import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process and other node built-ins
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  default: {
    execSync: vi.fn(),
  },
}))

// Mock logger to avoid cluttering test output
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    raw: vi.fn((msg) => console.log(msg)),
    rawError: vi.fn((msg) => console.error(msg)),
  },
}))

import { checkQuarantine } from '../../src/cli/cli-utils.js'

describe('CLI Quarantine Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env vars
    delete process.env.CONCATENATOR_MOCK_QUARANTINE
  })

  it('should print the security brief with Primary Proof of Integrity message', () => {
    process.env.CONCATENATOR_MOCK_QUARANTINE = 'true'
    const consoleSpy = vi.spyOn(console, 'log')

    checkQuarantine()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('🛡️  SECURITY BRIEF: MACOS QUARANTINE DETECTED')
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Primary Proof of Integrity')
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('overriding the OS\'s "Unsigned" warning')
    )
  })

  it('should not print if not macOS and not mocked', () => {
    // This test is tricky because process.platform is read-only in some environments
    // but vitest allows mocking it or we can check the return path.

    // If we are on windows/linux and NOT mocked, it should return early.
    if (process.platform !== 'darwin') {
      const consoleSpy = vi.spyOn(console, 'log')
      checkQuarantine()
      expect(consoleSpy).not.toHaveBeenCalled()
    }
  })
})
