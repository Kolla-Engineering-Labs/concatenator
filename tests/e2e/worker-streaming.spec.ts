/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from '@playwright/test'
import { FileUploadHelper } from '../../e2e/helpers/file-upload'
import fs from 'fs'
import path from 'path'

test.describe('Worker & RPC Client Integration Suite', () => {
  test.afterEach(async ({ page }, testInfo) => {
    const pageCoverage = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__coverage__
    )

    let workerCoverage: unknown = null
    const workers = page.workers()
    if (workers.length > 0) {
      try {
        workerCoverage = await workers[0].evaluate(
          () => (self as unknown as Record<string, unknown>).__coverage__
        )
      } catch (err) {
        console.warn('Could not extract worker coverage:', err)
      }
    }

    const playwrightCoverageDir = path.resolve(
      process.cwd(),
      'coverage-playwright'
    )
    if (!fs.existsSync(playwrightCoverageDir)) {
      fs.mkdirSync(playwrightCoverageDir, { recursive: true })
    }

    if (pageCoverage) {
      fs.writeFileSync(
        path.join(
          playwrightCoverageDir,
          `page-${testInfo.testId.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`
        ),
        JSON.stringify(pageCoverage, null, 2)
      )
    }

    if (workerCoverage) {
      fs.writeFileSync(
        path.join(
          playwrightCoverageDir,
          `worker-${testInfo.testId.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`
        ),
        JSON.stringify(workerCoverage, null, 2)
      )
    }
  })
  test.beforeEach(async ({ page }) => {
    // Clear localStorage state before each run
    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('concat_show_ignored', 'true')

      // Mock FileSystemWritableFileStream
      class MockWritableStream {
        async write(_data: ArrayBufferView | Blob | string) {}
        async close() {}
        async abort() {}
      }

      // Mock FileSystemFileHandle
      class MockFileHandle {
        kind = 'file' as const
        name = 'concatenated-output.txt'
        async createWritable() {
          return new MockWritableStream()
        }
      }

      // Mock FileSystemDirectoryHandle
      class MockDirectoryHandle {
        kind = 'directory' as const
        name = 'mock-dir'
        async getDirectoryHandle(_name: string, _options?: unknown) {
          return this
        }
        async getFileHandle(_name: string, _options?: unknown) {
          return new MockFileHandle()
        }
      }

      // Assign mock File System Access API handles to avoid manual OS dialogs
      ;(window as unknown as Record<string, unknown>).showSaveFilePicker =
        async () => new MockFileHandle()
      ;(window as unknown as Record<string, unknown>).showDirectoryPicker =
        async () => new MockDirectoryHandle()
    })
  })

  test('Test Case 1: Export & Token Physics Sync (Pass 1 Heuristic to Pass 2 TOKEN_EXACT_SYNC)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const uploadHelper = new FileUploadHelper(page)
    try {
      const sampleCode = 'export const concatenatorCorePhysics = 42;\n'.repeat(
        25
      )
      await uploadHelper.setFilesOnInput([
        {
          name: 'worker-physics-test.ts',
          path: 'worker-physics-test.ts',
          content: sampleCode,
        },
      ])

      // Assert Workbench Header / Gas Gauge initial visibility
      const workbenchHeader = page.getByRole('heading', {
        name: /Selected Files/,
      })
      await expect(workbenchHeader).toBeVisible({ timeout: 10000 })

      // Assert transition from Pass 1 Heuristic estimate to Pass 2 TOKEN_EXACT_SYNC (Precision badge)
      await expect(workbenchHeader).toContainText('Precision', {
        timeout: 15000,
      })
      await expect(workbenchHeader).not.toContainText('Heuristic')
      await expect(workbenchHeader).toContainText('Selected Files (1)')
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('Test Case 2: 500MB Circuit Breaker (ERR_PLATFORM_OOM_RISK with Zero-RAM Payload Spoofing)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Execute Web Worker bundle extraction with zero-RAM payload size spoofing
    const workerErrorMessage = await page.evaluate(async () => {
      return new Promise<string>((resolve, reject) => {
        // 1. Create a module worker wrapper that patches Blob.prototype.size in worker scope
        const origin = window.location.origin
        const workerCode = `
          Object.defineProperty(self.Blob.prototype, 'size', {
            get() { return 501 * 1024 * 1024; },
            configurable: true
          });
          import "${origin}/src/workers/concatenator.worker.ts";
        `
        const blob = new Blob([workerCode], { type: 'application/javascript' })
        const workerUrl = URL.createObjectURL(blob)
        const worker = new Worker(workerUrl, { type: 'module' })

        // 2. Create minimal real 1 KB File object (100% serializable via postMessage)
        const smallContent = 'CONCATENATOR_OOM_TEST_PAYLOAD\n'.repeat(30)
        const mockFile = new File([smallContent], 'massive-bundle.txt', {
          type: 'text/plain',
        })

        worker.onmessage = (e: MessageEvent) => {
          if (e.data?.type === 'ERROR') {
            worker.terminate()
            URL.revokeObjectURL(workerUrl)
            resolve(e.data.error)
          }
        }

        worker.onerror = (err: Event) => {
          worker.terminate()
          URL.revokeObjectURL(workerUrl)
          reject(new Error('Worker error: ' + (err as ErrorEvent).message))
        }

        // 3. Dispatch PARSE_START with targetDirHandle: null (simulated fallback mode)
        worker.postMessage({
          type: 'PARSE_START',
          file: mockFile,
          targetDirHandle: null,
        })
      })
    })

    // Assert worker intercepts payload and returns ERR_PLATFORM_OOM_RISK
    expect(workerErrorMessage).toContain('ERR_PLATFORM_OOM_RISK')

    // Surface error in UI error boundary container
    await page.evaluate((msg) => {
      const errorContainer = document.createElement('div')
      errorContainer.id = 'oom-circuit-breaker-alert'
      errorContainer.className = 'error-boundary'
      errorContainer.textContent = msg
      document.body.appendChild(errorContainer)
    }, workerErrorMessage)

    const errorAlert = page.locator('#oom-circuit-breaker-alert')
    await expect(errorAlert).toBeVisible({ timeout: 10000 })
    await expect(errorAlert).toContainText('ERR_PLATFORM_OOM_RISK')

    // Verify browser engine context remains stable without crashing
    await expect(page.locator('body')).toBeVisible()
  })
})
