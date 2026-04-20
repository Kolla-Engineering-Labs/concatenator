/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  lazy,
  Suspense,
} from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import posthog from 'posthog-js'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ModeToggle } from './components/ModeToggle'
import { UploadZone } from './components/UploadZone'
import { FileView } from './components/FileView'

// Lazy load components that aren't needed on initial render
const IgnoreList = lazy(() =>
  import('./components/IgnoreList').then((m) => ({ default: m.IgnoreList }))
)
import { useIgnoreList } from './hooks/useIgnoreList'
import { useFileProcessing } from './hooks/useFileProcessing'
import { useFileTree } from './hooks/useFileTree'
import { ViewMode, AppMode, FileItem, TreeItem, OutputFormat } from './types'

/**
 * The main application component that orchestrates the file concatenation and de-concatenation workflow.
 */
export default function App() {
  // --- UI State ---
  const [appMode, setAppMode] = useState<AppMode>('concatenate')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('concatenate-view-mode')
    return (saved as ViewMode) || 'list'
  })
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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['/', 'root'])
  )

  // --- Custom Hooks ---
  const {
    ignoreList,
    compiledIgnores,
    isLoading: isIgnoreListLoading,
    addIgnoreItem,
    removeIgnoreItem,
  } = useIgnoreList()

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
  useEffect(() => {
    localStorage.setItem('concatenate-view-mode', viewMode)
  }, [viewMode])

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
    <div className="min-h-screen font-sans transition-colors duration-300 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>
      <Header isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <main id="main-content" className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          {appMode === 'concatenate' && <div className="flex-1"></div>}

          <ModeToggle
            appMode={appMode}
            setAppMode={(newMode) => {
              posthog.capture('mode_switched', {
                target_mode: newMode,
                previous_mode: appMode,
              })
              setAppMode(newMode)
            }}
            onModeChange={() => {
              setFiles([])
              setImportError(null)
            }}
          />

          {appMode === 'concatenate' && (
            <div className="flex-1 flex items-center justify-end gap-2">
              <label
                htmlFor="max-file-limit"
                className="text-sm text-slate-600 dark:text-slate-400"
              >
                Max Files:
              </label>
              <select
                id="max-file-limit"
                value={maxFileLimit}
                onChange={(e) => setMaxFileLimit(parseInt(e.target.value, 10))}
                className="text-sm px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="500">500</option>
                <option value="1000">1,000</option>
                <option value="2500">2,500</option>
                <option value="5000">5,000</option>
                <option value="10000">10,000</option>
                <option value="20000">20,000</option>
              </select>
            </div>
          )}
        </div>

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
          <>
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
                  addIgnoreItem(newIgnoreItem)
                  setNewIgnoreItem('')
                }}
                removeIgnoreItem={removeIgnoreItem}
              />
            </Suspense>

            <FileView
              files={files}
              filteredFiles={filteredFiles}
              viewMode={viewMode}
              setViewMode={setViewMode}
              fileTree={fileTree}
              expandedPaths={expandedPaths}
              setExpandedPaths={setExpandedPaths}
              isProcessing={isProcessing}
              onConcatenate={() =>
                handleConcatenate(filteredFiles, outputFormat)
              }
              onClearAll={handleClearAll}
              onIgnoreFile={addIgnoreItem}
              onRemoveFile={handleRemoveFile}
              outputFormat={outputFormat}
              setOutputFormat={setOutputFormat}
            />
          </>
        )}
      </main>

      <Footer />
      <Analytics />
      <SpeedInsights />
    </div>
  )
}
