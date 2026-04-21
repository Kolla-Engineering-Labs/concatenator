/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  lazy,
  Suspense,
} from 'react'
import { Menu, PanelLeftClose } from 'lucide-react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { ConcatenatorLogo } from './web/features/concatenator/components/ConcatenatorLogo'
import { Header } from './web/features/concatenator/components/Header'
import { Footer } from './web/features/concatenator/components/Footer'
import { UploadZone } from './web/features/concatenator/components/UploadZone'
import { FileView } from './web/features/concatenator/components/FileView'

// Lazy load components that aren't needed on initial render
const IgnoreList = lazy(() =>
  import('./web/features/concatenator/components/IgnoreList').then((m) => ({
    default: m.IgnoreList,
  }))
)
import { useFileProcessing } from './web/features/concatenator/hooks/useFileProcessing'
import { useFileTree } from './web/features/concatenator/hooks/useFileTree'
import { FileItem, TreeItem, OutputFormat, ViewMode } from './core/types'
import { useWorkbench } from './web/hooks/useWorkbench'
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
    compiledIgnores,
    isSidebarOpen,
    setSidebarOpen,
    forceMode,
    setForceMode,
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
    isIgnored,
    handleFileUpload,
    handleDrop,
    handleConcatenate,
    handleDownloadAsZip,
  } = useFileProcessing({
    appMode,
    compiledIgnores,
    maxFileLimit,
    isIgnoreListLoading,
  })

  // --- Derived State ---
  const filteredFiles = useMemo(() => {
    return files
      .filter((file) => !isIgnored(file.path))
      .sort((a, b) => {
        if (a.kind === 'directory' && b.kind === 'file') return -1
        if (a.kind === 'file' && b.kind === 'directory') return 1
        return a.path.localeCompare(b.path)
      })
  }, [files, isIgnored])

  const fileTree = useFileTree(filteredFiles)

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

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <Header
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
              compact={true}
            />
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Close menu"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Work Mode
              </label>
              <ModeSwitch />
            </div>

            {appMode === 'concatenate' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="max-file-limit"
                    className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2"
                  >
                    Performance
                  </label>
                  <div className="px-2">
                    <select
                      id="max-file-limit"
                      value={maxFileLimit}
                      onChange={(e) =>
                        setMaxFileLimit(parseInt(e.target.value, 10))
                      }
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="500">500 files</option>
                      <option value="1000">1,000 files</option>
                      <option value="2500">2,500 files</option>
                      <option value="5000">5,000 files</option>
                      <option value="10000">10,000 files</option>
                      <option value="20000">20,000 files</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {appMode === 'deconcatenate' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                    Safety Settings
                  </label>
                  <div className="px-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={forceMode}
                          onChange={(e) => setForceMode(e.target.checked)}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600 rounded-full"></div>
                      </div>
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:text-slate-900 dark:group-hover:text-slate-200">
                        Force Overwrite
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <Footer />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:pl-72' : ''}`}
      >
        {!isSidebarOpen && (
          <div className="fixed top-0 left-0 right-0 z-30 lg:hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-3 h-16 flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm text-slate-600 dark:text-slate-400"
              title="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <ConcatenatorLogo className="h-6 w-auto" />
              <h1 className="text-base font-bold" data-testid="mobile-title">
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

          {appMode === 'concatenate' && (
            <Suspense
              fallback={
                <div className="h-20 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-xl" />
              }
            >
              <IgnoreList
                ignoreList={ignoreList}
                isIgnoreListMinimized={isIgnoreListMinimized}
                setIsIgnoreListMinimized={setIsIgnoreListMinimized}
                newIgnoreItem={newIgnoreItem}
                setNewIgnoreItem={setNewIgnoreItem}
                addIgnoreItem={() => {
                  if (newIgnoreItem && !ignoreList.includes(newIgnoreItem)) {
                    setIgnoreList([...ignoreList, newIgnoreItem])
                  }
                  setNewIgnoreItem('')
                }}
                removeIgnoreItem={(item) => {
                  setIgnoreList(ignoreList.filter((i) => i !== item))
                }}
              />
            </Suspense>
          )}

          {(appMode === 'concatenate' || files.length > 0) && (
            <FileView
              files={files}
              filteredFiles={filteredFiles}
              viewMode={viewMode as ViewMode}
              setViewMode={setViewMode as unknown as (mode: ViewMode) => void}
              fileTree={fileTree}
              expandedPaths={expandedPaths}
              setExpandedPaths={setExpandedPaths}
              isProcessing={isProcessing}
              onConcatenate={() =>
                handleConcatenate(filteredFiles, outputFormat)
              }
              onClearAll={handleClearAll}
              onIgnoreFile={(item) => {
                if (item && !ignoreList.includes(item)) {
                  setIgnoreList([...ignoreList, item])
                }
              }}
              onDownloadAsZip={() => handleDownloadAsZip?.(filteredFiles)}
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
