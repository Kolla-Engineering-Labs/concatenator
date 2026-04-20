/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip'
import type { VirtualFile } from '../core/engine'

/**
 * Create a ZIP archive from an array of virtual files
 *
 * Environment-agnostic: works in both Node.js and browser contexts
 *
 * @param files - Array of virtual files with path and content
 * @returns Promise resolving to ZIP data as Uint8Array
 */
export async function createZipFromVirtualFiles(
  files: VirtualFile[]
): Promise<Uint8Array> {
  const zip = new JSZip()

  for (const file of files) {
    zip.file(file.path, file.content)
  }

  const result = await zip.generateAsync({ type: 'uint8array' })
  return result
}

/**
 * Parse a ZIP archive and extract virtual files
 *
 * @param zipData - ZIP file data as ArrayBuffer, Uint8Array, or Buffer
 * @returns Promise resolving to array of virtual files
 */
export async function extractVirtualFilesFromZip(
  zipData: ArrayBuffer | Uint8Array | Buffer
): Promise<VirtualFile[]> {
  const zip = await JSZip.loadAsync(zipData)
  const files: VirtualFile[] = []

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (!zipEntry.dir) {
      const content = await zipEntry.async('string')
      files.push({ path, content })
    }
  }

  return files
}
