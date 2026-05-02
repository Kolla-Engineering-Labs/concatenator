/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class ApiClient {
  static async getIgnoreList(): Promise<string[]> {
    const res = await fetch('/api/ignore-list')
    if (!res.ok) {
      throw new Error('Failed to fetch ignore list')
    }
    return res.json()
  }

  static async updateIgnoreList(list: string[]): Promise<void> {
    const res = await fetch('/api/ignore-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list),
    })
    if (!res.ok) {
      throw new Error('Failed to update ignore list')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async getVfsState(): Promise<{ tree: any; partial: boolean }> {
    const res = await fetch('/api/vfs')
    if (!res.ok) {
      throw new Error('Failed to fetch VFS tree')
    }
    return res.json()
  }

  static async getConfig(): Promise<{
    maxFiles?: number
    ignoreFile?: string
  }> {
    const res = await fetch('/api/config')
    if (!res.ok) {
      throw new Error('Failed to fetch config')
    }
    return res.json()
  }

  static async getFileBlob(path: string): Promise<Blob> {
    const res = await fetch(`/api/vfs/file?path=${encodeURIComponent(path)}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch file: ${path}`)
    }
    return res.blob()
  }
}
