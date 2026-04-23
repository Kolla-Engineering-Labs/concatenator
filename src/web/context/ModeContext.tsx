import React, { useCallback } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { AppMode, ViewPreference } from '../types/workbench'
import { ModeContext } from './ModeContextCore'
import { DEFAULT_IGNORE_LIST } from '../../core/constants'
import { IgnoreEngine } from '../../core/ignore/IgnoreEngine'

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
  const isInitialized = React.useRef(false)

  // Fetch initial ignore list from server and sync with local
  React.useEffect(() => {
    const fetchFromServer = async () => {
      try {
        const response = await fetch('/api/ignore-list')
        if (response.ok) {
          const serverList = await response.json()
          if (Array.isArray(serverList)) {
            // sync with server list
            setIgnoreList(
              serverList.sort((a: string, b: string) => a.localeCompare(b))
            )
          }
        }
      } catch {
        console.warn(
          'Failed to fetch ignore list from server, using local only.'
        )
      } finally {
        isInitialized.current = true
      }
    }
    fetchFromServer()
  }, [setIgnoreList])

  // Sync back to server on changes
  React.useEffect(() => {
    // Skip if it's the very first render
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // CRITICAL: Skip if we haven't finished the initial fetch yet.
    // This prevents overwriting the server's .concatenate-ignore file
    // with the hardcoded DEFAULT_IGNORE_LIST on application startup.
    if (!isInitialized.current) {
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

  const [virtualFileSystem, setVirtualFileSystem] = React.useState<
    Record<string, string>
  >({})

  const resetWorkbench = useCallback(() => {
    setForceMode(false)
    setVirtualFileSystem({})
    // Trigger any additional cleanup for file streams here
  }, [setForceMode, setVirtualFileSystem])

  const addIgnorePattern = useCallback(
    (pattern: string) => {
      setIgnoreList((prev) => {
        if (prev.includes(pattern)) return prev
        const next = [...prev, pattern].sort((a, b) => a.localeCompare(b))
        return next
      })
    },
    [setIgnoreList]
  )

  const removeIgnorePattern = useCallback(
    (pattern: string) => {
      setIgnoreList((prev) => prev.filter((p) => p !== pattern))
    },
    [setIgnoreList]
  )

  const ignoreEngine = React.useMemo(() => {
    return new IgnoreEngine(ignoreList)
  }, [ignoreList])

  const isIgnored = useCallback(
    (path: string) => ignoreEngine.isIgnored(path),
    [ignoreEngine]
  )

  const [tokenBudget, setTokenBudget] = useLocalStorage<number>(
    'concat_token_budget',
    128000
  )

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
        isIgnored,
        isSidebarOpen,
        compiledIgnores: ignoreEngine.patterns,
        forceMode,
        virtualFileSystem,
        tokenBudget,
        setMode: handleModeChange,
        setView,
        setIgnoreList,
        addIgnorePattern,
        removeIgnorePattern,
        setSidebarOpen: setIsSidebarOpen,
        setForceMode,
        setVirtualFileSystem,
        setTokenBudget,
        resetWorkbench,
      }}
    >
      {children}
    </ModeContext.Provider>
  )
}
