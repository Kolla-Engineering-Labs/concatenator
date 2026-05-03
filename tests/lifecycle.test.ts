import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import { join } from 'node:path'

// Mock logger
vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock node:fs
vi.mock('node:fs', async () => {
  const actual = (await vi.importActual('node:fs')) as any
  return {
    ...actual,
    existsSync: vi.fn(),
    rmSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

import { LifecycleManager } from '../src/core/LifecycleManager.js'
import { logger } from '../src/lib/logger.js'

describe('LifecycleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    LifecycleManager._resetInstance()
  })

  it('should be a singleton', () => {
    const instance1 = LifecycleManager.getInstance()
    const instance2 = LifecycleManager.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('should cleanup temp directories during prepareShutdown', async () => {
    const manager = LifecycleManager.getInstance()
    const tempDir = join(process.cwd(), 'temp_ignore_files')

    vi.mocked(fs.existsSync).mockReturnValue(true)

    await manager.prepareShutdown()

    expect(logger.info).toHaveBeenCalledWith('Lifecycle: VFS Integrity Secured')
    expect(fs.rmSync).toHaveBeenCalledWith(tempDir, {
      recursive: true,
      force: true,
    })
  })

  it('should log error if cleanup fails but still resolve', async () => {
    const manager = LifecycleManager.getInstance()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.rmSync).mockImplementation(() => {
      throw new Error('Deletion failed')
    })

    await manager.prepareShutdown()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete temp directory')
    )
    expect(logger.info).toHaveBeenCalledWith('Lifecycle: VFS Integrity Secured')
  })

  it('should update active timestamp', () => {
    const manager = LifecycleManager.getInstance()
    const initial = (manager as any).lastActiveTimestamp
    vi.useFakeTimers()
    vi.advanceTimersByTime(1000)
    manager.updateActiveTimestamp()
    expect((manager as any).lastActiveTimestamp).toBeGreaterThan(initial)
    vi.useRealTimers()
  })

  it('should prevent idle timeout when processing', async () => {
    vi.useFakeTimers()
    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    const manager = LifecycleManager.getInstance()

    manager.setProcessing(true)
    manager.startIdleMonitor()

    vi.advanceTimersByTime(1000000) // > 15 mins
    await vi.runAllTicks()

    expect(mockExit).not.toHaveBeenCalled()
    mockExit.mockRestore()
    vi.useRealTimers()
  })

  it('should unlink lock file during shutdown', async () => {
    const manager = LifecycleManager.getInstance()
    vi.mocked(fs.existsSync).mockReturnValue(true)

    await manager.prepareShutdown()

    expect(fs.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('.concatenator.lock')
    )
  })

  it('should handle signals', () => {
    const mockOn = vi.spyOn(process, 'on')
    LifecycleManager.getInstance()

    expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith(
      'uncaughtException',
      expect.any(Function)
    )
  })

  it('should handle uncaughtException', async () => {
    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    const mockOn = vi.spyOn(process, 'on')
    const manager = LifecycleManager.getInstance()
    const prepareSpy = vi.spyOn(manager, 'prepareShutdown').mockResolvedValue()

    // Find the uncaughtException handler
    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'uncaughtException'
    )?.[1] as (...args: unknown[]) => unknown
    expect(handler).toBeDefined()

    await handler(new Error('test error'))

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Uncaught Exception'),
      expect.any(Error)
    )
    expect(prepareSpy).toHaveBeenCalled()
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })

  it('should log and rethrow if prepareShutdown fails', async () => {
    const manager = LifecycleManager.getInstance()
    // Force an error in prepareShutdown by making fs.existsSync throw
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw new Error('Disk error')
    })

    await expect(manager.prepareShutdown()).rejects.toThrow('Disk error')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup failed'),
      expect.any(Error)
    )
  })

  it('should log warning if unlinking lock file fails', async () => {
    const manager = LifecycleManager.getInstance()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      throw new Error('Lock busy')
    })

    await manager.prepareShutdown()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to unlink lock file')
    )
  })

  it('should trigger shutdown on idle timeout', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T00:00:00Z'))

    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    const manager = LifecycleManager.getInstance()
    const prepareSpy = vi.spyOn(manager, 'prepareShutdown').mockResolvedValue()

    manager.startIdleMonitor()

    // Fast-forward past idle timeout (15 mins = 900000ms)
    vi.advanceTimersByTime(1000000)

    // The interval runs every 30s, so it should have triggered
    await vi.runAllTicks()

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Idle timeout reached')
    )
    expect(prepareSpy).toHaveBeenCalled()
    expect(mockExit).toHaveBeenCalledWith(0)

    mockExit.mockRestore()
    vi.useRealTimers()
  })

  it('should handle SIGINT', async () => {
    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    const mockOn = vi.spyOn(process, 'on')
    LifecycleManager.getInstance()

    const sigintHandler = mockOn.mock.calls.find(
      (call) => call[0] === 'SIGINT'
    )?.[1] as (...args: unknown[]) => unknown
    await sigintHandler()

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Received SIGINT')
    )
    expect(mockExit).toHaveBeenCalledWith(0)
    mockExit.mockRestore()
  })
})
