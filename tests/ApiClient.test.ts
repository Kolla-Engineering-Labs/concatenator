import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiClient } from '../src/web/services/ApiClient'

describe('ApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  describe('getIgnoreList', () => {
    it('fetches ignore list successfully', async () => {
      const mockList = ['node_modules', '.git']
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockList,
      } as Response)

      const result = await ApiClient.getIgnoreList()
      expect(fetch).toHaveBeenCalledWith('/api/ignore-list')
      expect(result).toEqual(mockList)
    })

    it('throws error when fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
      } as Response)

      await expect(ApiClient.getIgnoreList()).rejects.toThrow(
        'Failed to fetch ignore list'
      )
    })
  })

  describe('updateIgnoreList', () => {
    it('sends POST request to update ignore list', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
      } as Response)

      const newList = ['dist', 'coverage']
      await ApiClient.updateIgnoreList(newList)

      expect(fetch).toHaveBeenCalledWith('/api/ignore-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newList),
      })
    })

    it('throws error when update fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
      } as Response)

      await expect(ApiClient.updateIgnoreList([])).rejects.toThrow(
        'Failed to update ignore list'
      )
    })
  })

  describe('getVfsState', () => {
    it('fetches VFS state successfully', async () => {
      const mockState = {
        tree: { name: 'root', kind: 'directory' },
        partial: false,
      }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockState,
      } as Response)

      const result = await ApiClient.getVfsState()
      expect(fetch).toHaveBeenCalledWith('/api/vfs')
      expect(result).toEqual(mockState)
    })

    it('throws error when VFS fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
      } as Response)

      await expect(ApiClient.getVfsState()).rejects.toThrow(
        'Failed to fetch VFS tree'
      )
    })
  })

  describe('getConfig', () => {
    it('fetches config successfully', async () => {
      const mockConfig = { maxFiles: 500 }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      } as Response)

      const result = await ApiClient.getConfig()
      expect(fetch).toHaveBeenCalledWith('/api/config')
      expect(result).toEqual(mockConfig)
    })

    it('throws error when config fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
      } as Response)

      await expect(ApiClient.getConfig()).rejects.toThrow(
        'Failed to fetch config'
      )
    })
  })

  describe('getFileBlob', () => {
    it('fetches file blob successfully', async () => {
      const mockBlob = new Blob(['content'], { type: 'text/plain' })
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      } as Response)

      const result = await ApiClient.getFileBlob('src/main.ts')
      expect(fetch).toHaveBeenCalledWith('/api/vfs/file?path=src%2Fmain.ts')
      expect(result).toBe(mockBlob)
    })

    it('throws error when file fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
      } as Response)

      await expect(ApiClient.getFileBlob('missing.ts')).rejects.toThrow(
        'Failed to fetch file: missing.ts'
      )
    })
  })
})
