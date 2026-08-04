import { useState, useEffect, useCallback } from 'react'

// Token injection: In a production SEA environment, this might be injected into window.__KEL_CONFIG__
// by the UI Server, or requested via a secure handshake. For now, we assume it's available or fetched.
const API_BASE = 'http://127.0.0.1:4000/api' // Defaulting to 4000, adjust to your dynamic port
const getSecurityToken = () => localStorage.getItem('kel:shutdown_token') || ''

export interface VFSNode {
  path: string
  name: string
  kind: 'file' | 'directory'
  size?: number
  isIgnored: boolean
  isNegated: boolean
  reason?: string
  children?: VFSNode[]
  // Token weight calculated by the Core Engine's precision strategy
  tokenWeight?: number
  isPrecise?: boolean
}

export function useVFS() {
  const [tree, setTree] = useState<VFSNode | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true) // Initial state covers the mount
  const [error, setError] = useState<string | null>(null)

  // 1. Pure API payload logic, entirely stripped of React state mutations
  const fetchPayload = async () => {
    const response = await fetch(`${API_BASE}/vfs`, {
      headers: {
        'X-Concatenator-Token': getSecurityToken(),
        Accept: 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error(`VFS API Error: ${response.status}`)
    }
    const data = await response.json()
    return data.tree
  }

  // 2. Mount lifecycle: Strictly asynchronous state updates
  useEffect(() => {
    let active = true

    // The Promise chain executes on the microtask queue, bypassing the synchronous linter rule
    fetchPayload()
      .then((data) => {
        if (active) {
          setTree(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (active) setError((err as Error).message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false // Prevent state mutations if the component unmounts early
    }
  }, [])

  // 3. Manual UI trigger lifecycle: Synchronous loading state is safely permitted here
  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchPayload()
      setTree(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const toggleIgnore = async (nodePaths: string | string[]) => {
    // TODO: Wire up the POST /api/ignore-list logic here
    void nodePaths
    // await refetch(); // Re-sync the tree after mutation
  }

  return { tree, isLoading, error, toggleIgnore, refetch }
}
