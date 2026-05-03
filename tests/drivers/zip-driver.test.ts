/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import {
  createZipFromVirtualFiles,
  extractVirtualFilesFromZip,
} from '../../src/drivers/zip-driver'

describe('zip-driver', () => {
  it('should round-trip files through ZIP creation and extraction', async () => {
    const originalFiles = [
      { path: 'file1.txt', content: 'hello world' },
      { path: 'folder/file2.js', content: 'console.log(1);' },
    ]

    const zipData = await createZipFromVirtualFiles(originalFiles)
    expect(zipData).toBeInstanceOf(Uint8Array)
    expect(zipData.length).toBeGreaterThan(0)

    const extractedFiles = await extractVirtualFilesFromZip(zipData)

    expect(extractedFiles).toHaveLength(2)
    expect(extractedFiles).toEqual(expect.arrayContaining(originalFiles))
  })

  it('should handle empty file list', async () => {
    const zipData = await createZipFromVirtualFiles([])
    const extractedFiles = await extractVirtualFilesFromZip(zipData)
    expect(extractedFiles).toHaveLength(0)
  })
})
