/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Menu } from 'lucide-react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { ConcatenatorLogo } from './web/features/concatenator/components/ConcatenatorLogo'
import { UploadZone } from './web/features/concatenator/components/UploadZone'
import { FileView } from './web/features/concatenator/components/FileView'

import { useFileProcessing } from './web/features/concatenator/hooks/useFileProcessing'
import { useFileTree } from './web/features/concatenator/hooks/useFileTree'
import { FileItem, TreeItem, OutputFormat, ViewMode } from './core/types'
import { useWorkbench } from './web/hooks/useWorkbench'
import { AppMode } from './web/types/workbench'

import { Sidebar } from './web/components/Sidebar'
import { ModeSwitch } from './web/components/ModeSwitch'

/**
 * The main application component that orchestrates the file concatenation and de-concatenation workflow.
 */
export default function App() {
  // --- UI State ---
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('concatenate-dark-mode')
    return saved === 'true'
  })
  const [isDropzoneMinimized, setIsDropzoneMinimized] = useState(() => {
    const saved = localStorage.getItem('concatenate-dropzone-minimized')
    return saved === 'true'
  })
  const [isIgnoreListMinimized, setIsIgnoreListMinimized] = useState(() => {
    const saved = localStorage.getItem('concatenate-ignore-minimized')
    return saved === 'true'
  })
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(() => {
    const saved = localStorage.getItem('concatenate-output-format')
    return (saved as OutputFormat) || 'text'
  })
  const [maxFileLimit, setMaxFileLimit] = useState<number>(() => {
    const saved = localStorage.getItem('concatenator-max-files')
    return saved ? parseInt(saved, 10) : 10000
  })
  const [newIgnoreItem, setNewIgnoreItem] = useState('')
  const {
    mode: appMode,
    view: viewMode,
    setView: setViewMode,
    ignoreList,
    setIgnoreList,
    isIgnored,
    isSidebarOpen,
    setSidebarOpen,
    virtualFileSystem,
    setVirtualFileSystem,
  } = useWorkbench()

  const isIgnoreListLoading = false // ModeContext is local-first

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['/', 'root'])
  )

  // --- Custom Hooks ---
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
  } = useFileProcessing({
    appMode,
    isIgnored,
    maxFileLimit,
    isIgnoreListLoading,
    setVirtualFileSystem,
  })

  // --- Derived State ---
  const displayFiles = useMemo(() => {
    let baseFiles: FileItem[] = []
    if (appMode === AppMode.DECONCATENATE) {
      baseFiles = Object.entries(virtualFileSystem).map(([path, content]) => ({
        name: path.split('/').pop() || '',
        path,
        kind: 'file' as const,
        content,
      }))
    } else {
      baseFiles = files
    }

    return baseFiles
      .map((file) => ({
        ...file,
        isIgnored: isIgnored(file.path),
      }))
      .sort((a, b) => {
        if (a.kind === 'directory' && b.kind === 'file') return -1
        if (a.kind === 'file' && b.kind === 'directory') return 1
        return a.path.localeCompare(b.path)
      })
  }, [files, virtualFileSystem, appMode, isIgnored])

  const fileTree = useFileTree(displayFiles)

  // --- Effects ---
  // View mode and Mode persistence is handled by ModeContext

  useEffect(() => {
    localStorage.setItem('concatenate-dark-mode', isDarkMode.toString())
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  useEffect(() => {
    localStorage.setItem(
      'concatenate-dropzone-minimized',
      isDropzoneMinimized.toString()
    )
  }, [isDropzoneMinimized])

  useEffect(() => {
    localStorage.setItem(
      'concatenate-ignore-minimized',
      isIgnoreListMinimized.toString()
    )
  }, [isIgnoreListMinimized])

  useEffect(() => {
    localStorage.setItem('concatenate-output-format', outputFormat)
  }, [outputFormat])

  useEffect(() => {
    localStorage.setItem('concatenator-max-files', maxFileLimit.toString())
  }, [maxFileLimit])

  useEffect(() => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      const addDirectoryPaths = (node: TreeItem) => {
        if (node.kind === 'directory') {
          next.add(node.path)
          node.children?.forEach(addDirectoryPaths)
        }
      }
      addDirectoryPaths(fileTree)
      return next
    })
  }, [fileTree])

  // Clear files and errors when switching modes
  useEffect(() => {
    setFiles([])
    setImportError(null)
  }, [appMode, setFiles, setImportError])

  // --- Handlers ---
  const handleRemoveFile = useCallback(
    (file: FileItem) => {
      if (file.kind === 'directory') {
        const prefix = file.path + '/'
        setFiles((prev) =>
          prev.filter((f) => f.path !== file.path && !f.path.startsWith(prefix))
        )
      } else {
        setFiles((prev) => prev.filter((f) => f.path !== file.path))
      }
    },
    [setFiles]
  )

  const handleClearAll = useCallback(() => {
    setFiles([])
  }, [setFiles])

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-300 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        maxFileLimit={maxFileLimit}
        setMaxFileLimit={setMaxFileLimit}
        isIgnoreListMinimized={isIgnoreListMinimized}
        setIsIgnoreListMinimized={setIsIgnoreListMinimized}
        newIgnoreItem={newIgnoreItem}
        setNewIgnoreItem={setNewIgnoreItem}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:pl-72' : ''}`}
      >
        {!isSidebarOpen && (
          <div className="fixed top-0 left-0 right-0 z-30 lg:hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-3 h-16 flex items-center gap-4 transition-all duration-300">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm text-slate-600 dark:text-slate-400"
              title="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1 flex justify-center px-4">
              <div className="w-full max-w-[240px]">
                <ModeSwitch />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ConcatenatorLogo className="h-6 w-auto" />
              <h1 className="text-sm font-bold hidden sm:block">
                Concatenator
              </h1>
            </div>
          </div>
        )}
        <main
          id="main-content"
          className={`flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 ${!isSidebarOpen ? 'pt-24 lg:pt-8' : ''}`}
        >
          <UploadZone
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
              filteredFiles={displayFiles}
              viewMode={viewMode as ViewMode}
              setViewMode={setViewMode as unknown as (mode: ViewMode) => void}
              fileTree={fileTree}
              expandedPaths={expandedPaths}
              setExpandedPaths={setExpandedPaths}
              isProcessing={isProcessing}
              onConcatenate={() =>
                handleConcatenate(
                  displayFiles.filter((f) => !f.isIgnored),
                  outputFormat
                )
              }
              onClearAll={handleClearAll}
              onIgnoreFile={(item) => {
                if (item && !ignoreList.includes(item)) {
                  setIgnoreList([...ignoreList, item])
                }
              }}
              onDownloadAsZip={() =>
                handleDownloadAsZip?.(displayFiles.filter((f) => !f.isIgnored))
              }
              onRemoveFile={handleRemoveFile}
              outputFormat={outputFormat}
              setOutputFormat={setOutputFormat}
            />
          )}
        </main>
      </div>

      <Analytics />
      <SpeedInsights />
    </div>
  )
}
