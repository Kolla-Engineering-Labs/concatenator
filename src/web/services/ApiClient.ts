/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class ApiClient {
  private static getHeaders(
    extra: Record<string, string> = {}
  ): Record<string, string> {
    const token =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('CONCATENATOR_TOKEN')
        : null
    return {
      ...extra,
      ...(token ? { 'X-Concatenator-Token': token } : {}),
    }
  }

  static async getIgnoreList(): Promise<string[]> {
    const res = await fetch('/api/ignore-list', {
      headers: this.getHeaders(),
    })
    if (!res.ok) {
      throw new Error('Failed to fetch ignore list')
    }
    return res.json()
  }

  static async updateIgnoreList(list: string[]): Promise<void> {
    const res = await fetch('/api/ignore-list', {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(list),
    })
    if (!res.ok) {
      throw new Error('Failed to update ignore list')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async getVfsState(): Promise<{ tree: any; partial: boolean }> {
    const res = await fetch('/api/vfs', {
      headers: this.getHeaders(),
    })
    if (!res.ok) {
      throw new Error('Failed to fetch VFS tree')
    }
    return res.json()
  }

  static async getConfig(): Promise<{
    maxFiles?: number
    ignoreFile?: string
    token?: string
  }> {
    const res = await fetch('/api/config', {
      headers: this.getHeaders(),
    })
    if (!res.ok) {
      throw new Error('Failed to fetch config')
    }
    return res.json()
  }

  static async sendHeartbeat(token: string): Promise<void> {
    const res = await fetch('/api/heartbeat', {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'application/json',
        'X-Concatenator-Token': token,
      }),
      body: '{}',
    })
    if (!res.ok) {
      throw new Error('Heartbeat failed')
    }
  }

  static async getPulse(): Promise<{
    ts: number
    op: string
    progress: number
    active: boolean
  } | null> {
    const res = await fetch('/api/pulse', {
      headers: this.getHeaders(),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error('Pulse fetch failed')
    }
    return res.json()
  }

  static async getFileBlob(path: string): Promise<Blob> {
    const res = await fetch(`/api/vfs/file?path=${encodeURIComponent(path)}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) {
      throw new Error(`Failed to fetch file: ${path}`)
    }
    return res.blob()
  }

  static async getSecurityInfo(): Promise<{
    version: string
    buildHash: string
    fingerprint: string
  } | null> {
    const res = await fetch('/api/security/info', {
      headers: this.getHeaders(),
    })
    // 404 = not running via CLI binary; return null silently
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error('Failed to fetch security info')
    }
    return res.json()
  }

  static purgeToken(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('CONCATENATOR_TOKEN')
    }
  }
}
