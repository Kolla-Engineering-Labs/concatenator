/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import { PulseEmitter } from '../../src/core/PulseEmitter'

const lifecycleMock = {
  setProcessing: vi.fn(),
}

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('../../src/core/LifecycleManager', () => ({
  LifecycleManager: {
    getInstance: vi.fn(() => lifecycleMock),
  },
}))

describe('PulseEmitter', () => {
  const op = 'test-op'
  let emitter: PulseEmitter

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    emitter = new PulseEmitter(op)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should ensure pulse directory exists on creation', () => {
    expect(fs.existsSync).toHaveBeenCalled()
  })

  it('should create pulse directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    new PulseEmitter(op)
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.concatenator'),
      { recursive: true }
    )
  })

  it('should update progress and write pulse file', () => {
    emitter.update(0.5)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('pulse.json'),
      expect.stringContaining('"progress":0.5'),
      'utf-8'
    )
  })

  it('should start interval and set processing state', () => {
    emitter.start()

    expect(fs.writeFileSync).toHaveBeenCalled()
    expect(lifecycleMock.setProcessing).toHaveBeenCalledWith(true)

    vi.advanceTimersByTime(500)
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2)
  })

  it('should stop interval and update active state', () => {
    emitter.start()
    emitter.stop()
    expect(lifecycleMock.setProcessing).toHaveBeenCalledWith(false)

    expect(fs.writeFileSync).toHaveBeenLastCalledWith(
      expect.stringContaining('pulse.json'),
      expect.stringContaining('"active":false'),
      'utf-8'
    )
  })

  it('should handle mkdirSync errors gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      throw new Error('mkdir fail')
    })
    // Should not throw
    new PulseEmitter(op)
    expect(fs.mkdirSync).toHaveBeenCalled()
  })

  it('should handle writeFileSync errors gracefully', () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('write fail')
    })
    // Should not throw
    emitter.update(0.7)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  it('should handle non-Error throws in writeFileSync', () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw 'string error'
    })
    emitter.update(0.8)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })
})
