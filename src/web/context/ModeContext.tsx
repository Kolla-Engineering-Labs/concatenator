import React, { useCallback } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { AppMode, ViewPreference } from '../types/workbench'
import { ModeContext } from './ModeContextCore'
import { DEFAULT_IGNORE_LIST } from '../../core/constants'
import { IgnoreEngine } from '../../core/ignore/IgnoreEngine'
import { ApiClient } from '../services/ApiClient'
import { logger } from '../../lib/logger'

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
  const [autoSaveIgnore, setAutoSaveIgnore] = useLocalStorage<boolean>(
    'concat_auto_save_ignore',
    false
  )
  const isInitialMount = React.useRef(true)
  const [isInitialized, setIsInitialized] = React.useState(false)
  const isInitializedRef = React.useRef(false)
  const lastSyncedList = React.useRef<string[] | null>(null)
  const isSyncing = React.useRef(false)
  const pendingSync = React.useRef(false)
  const ignoreListRef = React.useRef(ignoreList)
  ignoreListRef.current = ignoreList

  // Fetch initial ignore list from server and sync with local
  React.useEffect(() => {
    let mounted = true
    const fetchFromServer = async () => {
      try {
        const serverList = await ApiClient.getIgnoreList()
        if (mounted && Array.isArray(serverList)) {
          const sorted = [...serverList].sort((a: string, b: string) =>
            a.localeCompare(b)
          )
          setIgnoreList((prev) => {
            // Merge server list with any items added locally during the fetch
            // (items that are neither in the default list nor in the server list)
            const localOnly = prev.filter(
              (item) =>
                !DEFAULT_IGNORE_LIST.includes(item) &&
                !serverList.includes(item)
            )
            const merged = Array.from(
              new Set([...serverList, ...localOnly])
            ).sort((a: string, b: string) => a.localeCompare(b))
            return merged
          })
          lastSyncedList.current = sorted
        }

        // Also fetch VFS tree if available
        try {
          const vfsData = await ApiClient.getVfsState()
          if (mounted && vfsData && vfsData.tree && vfsData.tree.children) {
            // ... to be implemented ...
          }
        } catch {
          // Ignore VFS fetch errors
        }
      } catch {
        logger.warn(
          'Failed to fetch ignore list from server, using local only.'
        )
        if (mounted) {
          lastSyncedList.current = [...ignoreList]
        }
      } finally {
        if (mounted) {
          isInitializedRef.current = true
          setIsInitialized(true)
          // If changes were made during initialization, the sync useEffect
          // would have returned early but set pendingSync.current = true.
          if (pendingSync.current) {
            // Trigger a sync attempt now that we are initialized
            const saveToServer = async () => {
              if (isSyncing.current) return
              isSyncing.current = true
              pendingSync.current = false
              const listToSync = [...ignoreListRef.current]
              try {
                await ApiClient.updateIgnoreList(listToSync)
                lastSyncedList.current = listToSync
              } catch {
                logger.error('Failed to sync ignore list to server')
              } finally {
                isSyncing.current = false
                if (pendingSync.current) saveToServer()
              }
            }
            saveToServer()
          }
        }
      }
    }
    fetchFromServer()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIgnoreList])

  // Sync back to server on changes
  React.useEffect(() => {
    // CRITICAL: Prevent auto-saving if the guard-rail is disabled
    if (!autoSaveIgnore) {
      return
    }

    // Skip if it's the very first render
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // CRITICAL: Skip if we haven't finished the initial fetch yet.
    if (!isInitializedRef.current) {
      pendingSync.current = true
      return
    }

    // Optimization: Don't sync if the list is the same as the last successful sync
    if (
      lastSyncedList.current &&
      JSON.stringify(lastSyncedList.current) === JSON.stringify(ignoreList)
    ) {
      return
    }

    const saveToServer = async () => {
      if (isSyncing.current) {
        pendingSync.current = true
        return
      }
      isSyncing.current = true
      pendingSync.current = false

      const listToSync = [...ignoreListRef.current]
      try {
        await ApiClient.updateIgnoreList(listToSync)
        lastSyncedList.current = listToSync
      } catch {
        logger.error('Failed to sync ignore list to server')
      } finally {
        isSyncing.current = false
        // If another sync was requested while we were busy, trigger it now
        if (pendingSync.current) {
          saveToServer()
        }
      }
    }
    saveToServer()
  }, [ignoreList, autoSaveIgnore])

  const [isSidebarOpen, setIsSidebarOpen] = useLocalStorage<boolean>(
    'concat_sidebar',
    false
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
        autoSaveIgnore,
        setMode: handleModeChange,
        setView,
        setIgnoreList,
        addIgnorePattern,
        removeIgnorePattern,
        setSidebarOpen: setIsSidebarOpen,
        setForceMode,
        setVirtualFileSystem,
        setTokenBudget,
        setAutoSaveIgnore,
        resetWorkbench,
        isInitialized,
      }}
    >
      {children}
    </ModeContext.Provider>
  )
}
