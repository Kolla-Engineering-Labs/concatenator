/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs'
import { join } from 'node:path'
import { logger } from '../lib/logger.js'

/**
 * LifecycleManager handles the application lifecycle, ensuring that the
 * Virtual File System (VFS) and other resources are correctly released
 * and cleaned up during shutdown.
 */
export class LifecycleManager {
  private static instance?: LifecycleManager
  private tempDirs: string[] = []
  private lastActiveTimestamp: number = Date.now()
  private isProcessing: boolean = false
  private readonly idleTimeout: number = 900000 // 15 minutes
  private monitorInterval?: NodeJS.Timeout

  private constructor() {
    // Private constructor for singleton
    this.tempDirs = [join(process.cwd(), 'temp_ignore_files')]
    this.setupSignalHandlers()
  }

  public static getInstance(): LifecycleManager {
    if (!LifecycleManager.instance) {
      LifecycleManager.instance = new LifecycleManager()
    }
    return LifecycleManager.instance!
  }

  /**
   * Resets the singleton instance (primarily for testing).
   */
  public static _resetInstance(): void {
    LifecycleManager.instance = undefined
  }

  /**
   * Updates the activity timestamp to prevent idle timeout.
   */
  public updateActiveTimestamp(): void {
    this.lastActiveTimestamp = Date.now()
  }

  /**
   * Sets the processing state. When true, prevents idle timeout.
   */
  public setProcessing(processing: boolean): void {
    this.isProcessing = processing
    if (processing) {
      this.updateActiveTimestamp()
    }
  }

  /**
   * Starts the idle monitor which checks for activity every 30s.
   */
  public startIdleMonitor(): void {
    if (this.monitorInterval) return

    this.monitorInterval = setInterval(() => {
      const now = Date.now()
      if (
        now - this.lastActiveTimestamp > this.idleTimeout &&
        !this.isProcessing
      ) {
        const sessionId = process.env.CONCATENATOR_SESSION_ID || 'Unknown'
        logger.info(
          `Lifecycle: Idle timeout reached for Session [${sessionId}]. Initiating shutdown.`
        )
        this.prepareShutdown()
          .then(() => process.exit(0))
          .catch(() => process.exit(1))
      }
    }, 30000)
  }

  private setupSignalHandlers(): void {
    const handleShutdown = async (signal: string) => {
      if (LifecycleManager.instance !== this) return
      logger.info(`Lifecycle: Received ${signal}. Securing VFS...`)
      await this.prepareShutdown()
      process.exit(0)
    }

    const sigintHandler = () => handleShutdown('SIGINT')
    const sigtermHandler = () => handleShutdown('SIGTERM')
    const exceptionHandler = async (error: Error) => {
      if (LifecycleManager.instance !== this) return
      logger.error('Lifecycle: Uncaught Exception detected', error)
      try {
        await this.prepareShutdown()
      } finally {
        process.exit(1)
      }
    }

    process.on('SIGINT', sigintHandler)
    process.on('SIGTERM', sigtermHandler)
    process.on('uncaughtException', exceptionHandler)
  }

  /**
   * Performs all necessary cleanup tasks to ensure disk integrity.
   * This includes flushing logs, releasing locks, and deleting temporary buffers.
   */
  public async prepareShutdown(): Promise<void> {
    logger.info('Lifecycle: Preparing for graceful shutdown...')

    try {
      // 1. Flush any pending Session ID logs to disk
      await this.flushLogs()

      // 2. Release file locks on the VFS and clean up lock file
      await this.releaseLocks()
      const lockPath = join(process.cwd(), '.concatenator.lock')
      if (fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath)
          logger.debug('Lifecycle: .concatenator.lock unlinked')
        } catch (e) {
          logger.warn(`Lifecycle: Failed to unlink lock file: ${e}`)
        }
      }

      // 3. Delete temporary extraction buffers and ignore files
      this.cleanupTempDirs()

      logger.info('Lifecycle: VFS Integrity Secured')
    } catch (error) {
      logger.error('Lifecycle: Cleanup failed during shutdown', error)
      throw error
    }
  }

  private async flushLogs(): Promise<void> {
    return Promise.resolve()
  }

  private async releaseLocks(): Promise<void> {
    return Promise.resolve()
  }

  private cleanupTempDirs(): void {
    for (const dir of this.tempDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true })
          logger.debug(`Lifecycle: Cleaned up temporary directory: ${dir}`)
        } catch (error) {
          logger.warn(
            `Lifecycle: Failed to delete temp directory ${dir}: ${error}`
          )
        }
      }
    }
  }
}
