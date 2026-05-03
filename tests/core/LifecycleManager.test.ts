import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import { LifecycleManager } from '../../src/core/LifecycleManager'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
  }
})

describe('LifecycleManager', () => {
  let manager: LifecycleManager

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    manager = LifecycleManager.getInstance()
  })

  afterEach(() => {
    vi.useRealTimers()
    LifecycleManager._resetInstance()
  })

  it('should manage processing state', () => {
    manager.setProcessing(true)
    expect((manager as any).isProcessing).toBe(true)
    manager.setProcessing(false)
    expect((manager as any).isProcessing).toBe(false)
  })

  it('should update active timestamp', () => {
    const oldTs = (manager as any).lastActiveTimestamp
    vi.advanceTimersByTime(1000)
    manager.updateActiveTimestamp()
    expect((manager as any).lastActiveTimestamp).toBeGreaterThan(oldTs)
  })

  it('should handle idle monitor', () => {
    manager.startIdleMonitor()
    expect((manager as any).monitorInterval).toBeDefined()
    // Starting again should be a no-op
    manager.startIdleMonitor()
  })

  it('should reset instance', () => {
    LifecycleManager._resetInstance()
    const newManager = LifecycleManager.getInstance()
    expect(newManager).not.toBe(manager)
  })

  it('should prepare shutdown and clean up', async () => {
    await manager.prepareShutdown()
  })

  it('should trigger shutdown on idle timeout', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    vi.spyOn(manager, 'prepareShutdown').mockResolvedValue(undefined)
    manager.startIdleMonitor()

    // Default timeout is 15 mins (900000ms). Interval is 30s.
    vi.advanceTimersByTime(930000)

    // Flush async handlers
    await Promise.resolve()
    await Promise.resolve()

    expect(exitSpy).toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it('should handle SIGINT', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    vi.spyOn(manager, 'prepareShutdown').mockResolvedValue(undefined)

    process.emit('SIGINT' as any)

    // Flush async handlers
    await Promise.resolve()
    await Promise.resolve()

    expect(exitSpy).toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it('should handle errors during lock file cleanup', async () => {
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      throw new Error('unlink fail')
    })

    await manager.prepareShutdown()
    // Should log warning and continue
    expect(fs.unlinkSync).toHaveBeenCalled()
  })

  it('should handle errors during temp dir cleanup', async () => {
    vi.mocked(fs.rmSync).mockImplementation(() => {
      throw new Error('rm fail')
    })

    // Need to set tempDirs via any to ensure it's not empty
    ;(manager as any).tempDirs = ['/tmp/fake-dir']

    await manager.prepareShutdown()
    expect(fs.rmSync).toHaveBeenCalled()
  })

  it('should handle uncaughtException', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    vi.spyOn(manager, 'prepareShutdown').mockResolvedValue(undefined)

    process.emit('uncaughtException' as any, new Error('boom'))

    await Promise.resolve()
    await Promise.resolve()

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('should handle idle timeout failure', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any)
    vi.spyOn(manager, 'prepareShutdown').mockRejectedValue(new Error('fail'))
    manager.startIdleMonitor()

    vi.advanceTimersByTime(930000)

    await Promise.resolve()
    await Promise.resolve()

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })
})
