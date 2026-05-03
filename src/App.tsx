/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { logger } from './lib/logger'
import { Sun, Moon } from 'lucide-react'
import { Sidebar } from './web/components/Sidebar'
import { StatusBar } from './web/components/StatusBar'
import { UploadZone as Dropzone } from './web/features/concatenator/components/UploadZone'
import { FileView } from './web/features/concatenator/components/FileView'
import { ConcatenatorLogo } from './web/features/concatenator/components/ConcatenatorLogo'
import { ApiClient } from './web/services/ApiClient'
import { useFileProcessing } from './web/features/concatenator/hooks/useFileProcessing'
import { useFileTree } from './web/features/concatenator/hooks/useFileTree'
import { useWorkbench } from './web/hooks/useWorkbench'
import { useLocalStorage } from './web/hooks/useLocalStorage'
import { useTokenAggregation } from './web/hooks/useTokenAggregation'
import { AppMode, ViewPreference } from './web/types/workbench'
import { FileItem, TreeItem, OutputFormat } from './core/types'
import { useHeartbeat } from './web/hooks/useHeartbeat'
import { usePulseMonitor } from './web/hooks/usePulseMonitor'
import { SessionExpiredModal } from './web/components/SessionExpiredModal'

export default function App() {
  const { isExpired } = useHeartbeat()
  const { isHeavyProcessing, progress: pulseProgress } =
    usePulseMonitor(isExpired)

  const [isDarkMode, setIsDarkMode] = useLocalStorage<boolean>(
    'concatenate-dark-mode',
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )

  const [maxFileLimit, setMaxFileLimit] = useLocalStorage<number>(
    'concatenator-max-files',
    10000
  )
  const [isIgnoreListMinimized, setIsIgnoreListMinimized] =
    useLocalStorage<boolean>('concatenator-ignore-minimized', false)
  const [isDropzoneMinimized, setIsDropzoneMinimized] =
    useLocalStorage<boolean>('concatenator-dropzone-minimized', false)

  const [newIgnoreItem, setNewIgnoreItem] = useState('')
  const [outputFormat, setOutputFormat] = useLocalStorage<OutputFormat>(
    'concatenate-output-format',
    'text'
  )
  const [filterText, setFilterText] = useState('')

  const {
    mode: appMode,
    view: viewMode,
    isIgnored,
    setSidebarOpen,
    virtualFileSystem,
    setVirtualFileSystem,
    tokenBudget,
    isInitialized,
  } = useWorkbench()

  const {
    files,
    setFiles,
    isProcessing,
    importProgress,
    importError,
    setImportError,
    cancelProcessing,
    handleFileUpload,
    handleDrop,
    handleConcatenate,
    handleDownloadAsZip,
    loadVfsFiles,
    validationResult,
    clearValidation,
  } = useFileProcessing({
    appMode,
    isIgnored,
    maxFileLimit,
    isIgnoreListLoading: !isInitialized,
    setVirtualFileSystem,
  })

  const handleClearAll = useCallback(() => {
    setFiles([])
    setVirtualFileSystem({})
  }, [setFiles, setVirtualFileSystem])

  const handleRemoveFile = useCallback(
    (fileToRemove: FileItem) => {
      const isDir = fileToRemove.kind === 'directory'
      const pathWithSlash = fileToRemove.path.endsWith('/')
        ? fileToRemove.path
        : `${fileToRemove.path}/`

      const filterFn = (f: { path: string }) => {
        if (isDir) {
          return (
            f.path !== fileToRemove.path && !f.path.startsWith(pathWithSlash)
          )
        }
        return f.path !== fileToRemove.path
      }

      setFiles((prev) => prev.filter(filterFn))

      if (appMode === AppMode.DECONCATENATE) {
        setVirtualFileSystem((prev) => {
          const next = { ...prev }
          if (isDir) {
            Object.keys(next).forEach((path) => {
              if (
                path === fileToRemove.path ||
                path.startsWith(pathWithSlash)
              ) {
                delete next[path]
              }
            })
          } else {
            delete next[fileToRemove.path]
          }
          return next
        })
      }
    },
    [setFiles, appMode, setVirtualFileSystem]
  )

  // Sync virtual file system to files when in deconcatenate mode
  const baseFiles = useMemo(() => {
    if (appMode === AppMode.DECONCATENATE) {
      return Object.entries(virtualFileSystem).map(([path, content]) => ({
        name: path.split('/').pop() || '',
        path,
        content,
        kind: 'file' as const,
      }))
    }
    return files
  }, [appMode, virtualFileSystem, files])

  const { tokenMap } = useTokenAggregation(baseFiles)

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']))

  const displayFiles = useMemo(() => {
    return baseFiles.map((f) => {
      const meta = tokenMap[f.path] || {
        tokens: f.tokens || 0,
        isPrecise: f.isPrecise || false,
      }
      return {
        ...f,
        tokens: meta.tokens,
        isPrecise: meta.isPrecise,
        isIgnored: isIgnored(f.path),
      }
    })
  }, [baseFiles, isIgnored, tokenMap])

  const { totalTokens, tokensSaved, isPrecise } = useMemo(() => {
    return displayFiles.reduce(
      (acc, f) => {
        if (f.isIgnored) {
          acc.tokensSaved += f.tokens || 0
        } else {
          acc.totalTokens += f.tokens || 0
        }
        if (!f.isPrecise) acc.isPrecise = false
        return acc
      },
      { totalTokens: 0, tokensSaved: 0, isPrecise: true }
    )
  }, [displayFiles])

  const fileTree = useFileTree(displayFiles, isIgnored, tokenMap)

  // Clear files and VFS when switching modes to avoid state bleed
  useEffect(() => {
    setFiles([])
    setVirtualFileSystem({})
    setImportError(null)
    clearValidation()
  }, [appMode, setFiles, setVirtualFileSystem, setImportError, clearValidation])

  // Fetch VFS tree and Config from backend on mount
  useEffect(() => {
    let mounted = true
    const initWorkspace = async () => {
      try {
        const config = await ApiClient.getConfig()
        if (mounted && config.maxFiles) {
          setMaxFileLimit(config.maxFiles)
        }
      } catch {
        // Not running via CLI or config unavailable
      }

      try {
        const { tree, partial } = await ApiClient.getVfsState()
        // tree is null if no path was specified (Blank Slate)
        if (mounted && tree && tree.children && tree.children.length > 0) {
          const flatFiles: FileItem[] = []
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const flatten = (node: any) => {
            if (node.path === '.') {
              if (node.children) node.children.forEach(flatten)
              return
            }
            flatFiles.push({
              name: node.name,
              path: node.path,
              kind: node.kind,
              size: node.size || 0,
              content: '', // content isn't loaded yet
              isIgnored: node.isIgnored,
              isNegated: node.isNegated,
            })
            if (node.children) node.children.forEach(flatten)
          }
          flatten(tree)

          if (partial) {
            logger.warn('VFS scan hit the file limit, tree is partial.')
          }

          loadVfsFiles(flatFiles)
        }
      } catch (err) {
        logger.warn(`Failed to fetch VFS tree: ${err}`)
      }
    }
    initWorkspace()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track previously seen paths to only auto-expand new ones
  const seenPathsRef = useRef<Set<string>>(new Set(['']))

  useEffect(() => {
    if (files.length === 0 && Object.keys(virtualFileSystem).length === 0) {
      seenPathsRef.current = new Set([''])
      setExpandedPaths(new Set(['']))
    }
  }, [files.length, virtualFileSystem])

  // Auto-expand all directories when in Tree mode and files change
  useEffect(() => {
    if (!fileTree || viewMode !== ViewPreference.TREE) return

    setExpandedPaths((prev) => {
      const next = new Set(prev)
      let changed = false

      const allPaths: string[] = []
      const collect = (node: TreeItem) => {
        if (node.kind === 'directory') {
          allPaths.push(node.path)
          node.children?.forEach(collect)
        }
      }
      collect(fileTree)

      allPaths.forEach((p) => {
        if (!next.has(p)) {
          next.add(p)
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [fileTree, viewMode])

  useEffect(() => {
    const isDark = isDarkMode === true || String(isDarkMode) === 'true'
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans flex-col">
      <div className="flex flex-1 overflow-hidden h-[calc(100vh-2.5rem)]">
        {/* Sidebar - Persistent on desktop, drawer on mobile */}
        <Sidebar
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          maxFileLimit={maxFileLimit}
          setMaxFileLimit={setMaxFileLimit}
          isIgnoreListMinimized={isIgnoreListMinimized}
          setIsIgnoreListMinimized={setIsIgnoreListMinimized}
          newIgnoreItem={newIgnoreItem}
          setNewIgnoreItem={setNewIgnoreItem}
          ignoredTokens={displayFiles
            .filter((f) => f.isIgnored)
            .reduce((acc, f) => acc + (f.tokens || 0), 0)}
          ignoredIsPrecise={displayFiles
            .filter((f) => f.isIgnored)
            .every((f) => f.isPrecise)}
          filterText={filterText}
          setFilterText={setFilterText}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header Toggle - Using div to avoid locator ambiguity in accessibility tests */}
          <nav
            className="lg:hidden h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between shrink-0"
            data-testid="mobile-header"
          >
            <div className="flex items-center gap-3">
              <ConcatenatorLogo className="h-7 w-auto" />
              <span className="font-display font-bold text-slate-800 dark:text-slate-100">
                Concatenator
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none transition-colors text-slate-500"
                title={
                  isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'
                }
                data-testid="theme-toggle-mobile"
              >
                {isDarkMode ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-slate-500"
                data-testid="sidebar-toggle"
                title="Open menu"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </nav>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
            <div className="max-w-7xl mx-auto w-full space-y-8">
              <Dropzone
                isProcessing={isProcessing}
                isDropzoneMinimized={isDropzoneMinimized}
                setIsDropzoneMinimized={setIsDropzoneMinimized}
                importProgress={importProgress}
                cancelProcessing={cancelProcessing}
                importError={importError}
                setImportError={setImportError}
                appMode={appMode}
                handleDrop={handleDrop}
                handleFileUpload={handleFileUpload}
              />

              {(appMode === AppMode.CONCATENATE || files.length > 0) && (
                <FileView
                  files={files}
                  filteredFiles={displayFiles.filter(
                    (f) =>
                      !filterText ||
                      f.path.toLowerCase().includes(filterText.toLowerCase())
                  )}
                  fileTree={fileTree}
                  expandedPaths={expandedPaths}
                  setExpandedPaths={setExpandedPaths}
                  isProcessing={isProcessing}
                  onConcatenate={() =>
                    handleConcatenate(
                      displayFiles.filter(
                        (f) =>
                          !f.isIgnored &&
                          (!filterText ||
                            f.path
                              .toLowerCase()
                              .includes(filterText.toLowerCase()))
                      ),
                      outputFormat
                    )
                  }
                  onClearAll={handleClearAll}
                  onDownloadAsZip={() =>
                    handleDownloadAsZip?.(
                      displayFiles.filter((f) => !f.isIgnored)
                    )
                  }
                  onRemoveFile={handleRemoveFile}
                  outputFormat={outputFormat}
                  setOutputFormat={setOutputFormat}
                  validationResult={validationResult}
                  tokenBudget={tokenBudget}
                  totalTokens={totalTokens}
                  importError={importError}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      <StatusBar
        totalTokens={totalTokens}
        tokensSaved={tokensSaved}
        isPrecise={isPrecise}
      />

      {isExpired && !isHeavyProcessing && <SessionExpiredModal />}

      {isHeavyProcessing && (
        <div className="fixed bottom-16 right-6 z-50 flex items-center gap-4 rounded-2xl bg-zinc-900 border border-zinc-800 p-4 shadow-2xl animate-in slide-in-from-bottom-10">
          <div className="relative h-10 w-10">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
              <circle
                className="stroke-zinc-800 fill-none"
                strokeWidth="3"
                cx="18"
                cy="18"
                r="16"
              />
              <circle
                className="stroke-white fill-none transition-all duration-500 ease-out"
                strokeWidth="3"
                strokeDasharray="100"
                strokeDashoffset={100 - pulseProgress}
                strokeLinecap="round"
                cx="18"
                cy="18"
                r="16"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
              {pulseProgress}%
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-white">Heavy Processing</div>
            <div className="text-[10px] text-zinc-500">
              System under load...
            </div>
          </div>
        </div>
      )}

      <Analytics />
      <SpeedInsights />
    </div>
  )
}
