/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs'
import { join } from 'node:path'
import { LifecycleManager } from './LifecycleManager.js'
import { logger } from '../lib/logger.js'

/**
 * Pulse schema for monitoring heavy I/O tasks
 */
export interface PulseData {
  ts: number
  op: string
  progress: number
  active: boolean
}

/**
 * PulseEmitter handles writing real-time progress data to a file.
 * This is a Node-only utility.
 */
export class PulseEmitter {
  private static readonly PULSE_DIR = join(process.cwd(), '.concatenator')
  private static readonly PULSE_FILE = join(
    PulseEmitter.PULSE_DIR,
    'pulse.json'
  )
  private interval?: NodeJS.Timeout
  private data: PulseData

  constructor(op: string) {
    this.data = {
      ts: Date.now(),
      op,
      progress: 0,
      active: true,
    }
    this.ensurePulseDir()
  }

  private ensurePulseDir(): void {
    if (!fs.existsSync(PulseEmitter.PULSE_DIR)) {
      try {
        fs.mkdirSync(PulseEmitter.PULSE_DIR, { recursive: true })
      } catch (e) {
        logger.warn(`PulseEmitter: Failed to create pulse directory: ${e}`)
      }
    }
  }

  public update(progress: number): void {
    this.data.progress = progress
    this.data.ts = Date.now()
    this.writePulse()
  }

  public start(): void {
    if (this.interval) return
    this.writePulse()
    this.interval = setInterval(() => {
      this.data.ts = Date.now()
      this.writePulse()
    }, 500)
    LifecycleManager.getInstance().setProcessing(true)
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
    this.data.active = false
    this.data.ts = Date.now()
    this.writePulse()
    LifecycleManager.getInstance().setProcessing(false)
  }

  private writePulse(): void {
    try {
      fs.writeFileSync(
        PulseEmitter.PULSE_FILE,
        JSON.stringify(this.data),
        'utf-8'
      )
    } catch {
      // Ignore errors (e.g. during shutdown)
    }
  }
}
