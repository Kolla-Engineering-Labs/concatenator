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
    const workerId =
      typeof window !== 'undefined' ? sessionStorage.getItem('WORKER_ID') : null

    return {
      ...extra,
      ...(token ? { 'X-Concatenator-Token': token } : {}),
      ...(workerId ? { 'X-Worker-Id': workerId } : {}),
    }
  }

  static async triggerConcatenate(
    config: Record<string, unknown>
  ): Promise<Response> {
    const res = await fetch('/api/concatenate', {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(config),
    })

    if (!res.ok) {
      let errorMessage = `Concatenation failed: ${res.statusText}`
      try {
        const errorJson = await res.json()
        if (errorJson?.error) errorMessage = errorJson.error
        else if (errorJson?.message) errorMessage = errorJson.message
      } catch {
        // Non-JSON error response fallback
      }
      throw new Error(errorMessage)
    }

    // KEL Protocol Signature Verification
    const streamSignature = res.headers.get('X-Kolla-Stream')
    if (streamSignature !== 'active') {
      console.warn(
        '[KEL Protocol] Warning: Backend stream signature missing or invalid.'
      )
    }

    return res
  }

  static async concatenate(matrix: {
    outputFormat: 'markdown' | 'xml'
    enableNeutralization: boolean
    injectManifest: boolean
  }): Promise<Blob> {
    const res = await this.triggerConcatenate(matrix)
    return res.blob()
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

  static async addIgnorePattern(pattern: string): Promise<void> {
    const list = await this.getIgnoreList()
    if (!list.includes(pattern)) {
      await this.updateIgnoreList([...list, pattern])
    }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async fetchVFS(): Promise<{ tree: any; partial: boolean }> {
    return this.getVfsState()
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
