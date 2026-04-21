import React, { useCallback } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { AppMode, ViewPreference } from '../types/workbench'
import { ModeContext } from './ModeContextCore'
import { DEFAULT_IGNORE_LIST } from '../../core/constants'

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setMode] = useLocalStorage<AppMode>(
    'concat_mode',
    AppMode.CONCATENATE
  )
  const [view, setView] = useLocalStorage<ViewPreference>(
    'concat_view',
    ViewPreference.LIST
  )
  const [ignoreList, setIgnoreList] = useLocalStorage<string[]>(
    'concat_ignore',
    [...DEFAULT_IGNORE_LIST]
  )
  const isInitialMount = React.useRef(true)

  // Fetch initial ignore list from server and sync with local
  React.useEffect(() => {
    const fetchFromServer = async () => {
      try {
        const response = await fetch('/api/ignore-list')
        if (response.ok) {
          const serverList = await response.json()
          if (Array.isArray(serverList)) {
            // merge server list with local, but prefer local for consistency
            setIgnoreList((prev) => {
              const merged = Array.from(new Set([...prev, ...serverList]))
              return merged.sort((a, b) => a.localeCompare(b))
            })
          }
        }
      } catch {
        console.warn(
          'Failed to fetch ignore list from server, using local only.'
        )
      }
    }
    fetchFromServer()
  }, [setIgnoreList])

  // Sync back to server on changes
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const saveToServer = async () => {
      try {
        await fetch('/api/ignore-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ignoreList),
        })
      } catch {
        console.error('Failed to sync ignore list to server')
      }
    }
    saveToServer()
  }, [ignoreList])

  const [isSidebarOpen, setIsSidebarOpen] = useLocalStorage<boolean>(
    'concat_sidebar',
    true
  )

  const [forceMode, setForceMode] = useLocalStorage<boolean>(
    'concat_force_mode',
    false
  )

  const resetWorkbench = useCallback(() => {
    // Crucial for Task CONCAT-01: Clear buffers on mode switch to prevent memory leaks
    setIgnoreList([])
    setForceMode(false)
    // Trigger any additional cleanup for file streams here
  }, [setIgnoreList, setForceMode])

  const compiledIgnores = React.useMemo(() => {
    return ignoreList.map((pattern) => {
      if (pattern.startsWith('/')) {
        const lastSlash = pattern.lastIndexOf('/')
        if (lastSlash > 0) {
          const body = pattern.slice(1, lastSlash)
          const flags = pattern.slice(lastSlash + 1)
          try {
            return new RegExp(body, flags)
          } catch {
            return pattern
          }
        }
      }
      return pattern
    })
  }, [ignoreList])

  const handleModeChange = (newMode: AppMode) => {
    if (newMode !== mode) {
      resetWorkbench()
      setMode(newMode)
    }
  }

  return (
    <ModeContext.Provider
      value={{
        mode,
        view,
        ignoreList,
        compiledIgnores,
        isSidebarOpen,
        forceMode,
        setMode: handleModeChange,
        setView,
        setIgnoreList,
        setSidebarOpen: setIsSidebarOpen,
        setForceMode,
        resetWorkbench,
      }}
    >
      {children}
    </ModeContext.Provider>
  )
}
