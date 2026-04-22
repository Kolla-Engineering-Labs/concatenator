import React, { useState } from 'react'
import {
  Files,
  FolderTree,
  Rows3,
  FileCode,
  Download,
  Trash2,
  FolderArchive,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { useWorkbench } from '../../../hooks/useWorkbench'
import {
  AppMode as WorkbenchMode,
  ViewPreference,
} from '../../../types/workbench'
import { FileItem, TreeItem, OutputFormat } from '../../../../core/types'
import { TreeNode } from './TreeNode'
import { OutputFormatToggle } from './OutputFormatToggle'
import { FileTable } from './FileTable'
import { QuickLook } from './QuickLook'

interface FileViewProps {
  files: FileItem[]
  filteredFiles: FileItem[]
  fileTree: TreeItem
  expandedPaths: Set<string>
  setExpandedPaths: (paths: Set<string>) => void
  isProcessing: boolean
  onConcatenate: () => void
  onClearAll: () => void
  onRemoveFile: (file: FileItem) => void
  onDownloadAsZip?: () => void
  outputFormat: OutputFormat
  setOutputFormat: (format: OutputFormat) => void
}

/**
 * A component that displays the list or tree of selected files and provides actions like concatenate and clear.
 */
export const FileView: React.FC<FileViewProps> = ({
  files,
  filteredFiles,
  fileTree,
  expandedPaths,
  setExpandedPaths,
  isProcessing,
  onConcatenate,
  onClearAll,
  onRemoveFile,
  onDownloadAsZip,
  outputFormat,
  setOutputFormat,
}) => {
  const {
    mode,
    forceMode,
    view: viewMode,
    setView: setViewMode,
  } = useWorkbench()
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between h-9">
        <div className="flex items-center gap-2 text-slate-500">
          <Files className="w-4 h-4" />
          <h2 className="text-sm font-semibold uppercase tracking-wider ph-no-capture">
            Selected Files (
            {
              filteredFiles.filter((f) => f.kind === 'file' && !f.isIgnored)
                .length
            }
            )
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {files.length > 0 && (
            <button
              onClick={onClearAll}
              disabled={isProcessing}
              className="px-2 py-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all disabled:opacity-50"
              title="Clear All Files"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          )}
          
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner">
            <button
              onClick={() => setViewMode(ViewPreference.LIST)}
              aria-label="List view"
              className={cn(
                'p-1.5 rounded-md transition-all',
                viewMode === ViewPreference.LIST
                  ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-600 ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              )}
            >
              <Rows3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode(ViewPreference.TREE)}
              aria-label="Tree view"
              className={cn(
                'p-1.5 rounded-md transition-all',
                viewMode === ViewPreference.TREE
                  ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-600 ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              )}
            >
              <FolderTree className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm min-h-[400px] flex flex-col">
        {files.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
            <FileCode className="w-12 h-12 opacity-20" />
            <p>
              {mode === WorkbenchMode.DECONCATENATE
                ? 'No concatenated files were found'
                : 'No files selected'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            {viewMode === 'list' ? (
              <FileTable
                files={filteredFiles.filter((f) => f.kind === 'file')}
                onRemoveFile={onRemoveFile}
                onQuickLook={setQuickLookFile}
              />
            ) : (
              <div className="p-2 overflow-auto h-full max-h-[600px]">
                <TreeNode
                  node={fileTree}
                  expandedPaths={expandedPaths}
                  setExpandedPaths={setExpandedPaths}
                  onQuickLook={setQuickLookFile}
                  onRemoveFile={onRemoveFile}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800/50">
        {mode === WorkbenchMode.CONCATENATE ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Format Toggle */}
              <div className="flex items-center gap-4 min-w-[140px]">
                <OutputFormatToggle
                  outputFormat={outputFormat}
                  setOutputFormat={setOutputFormat}
                />
              </div>

              {/* Center: Info or spacer */}
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 text-slate-500 border border-slate-200 dark:border-slate-700">
                  <Info className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium leading-none">
                    Files will be bundled into a single{' '}
                    {outputFormat.toUpperCase()} file.
                  </span>
                </div>
              </div>

              {/* Right: Clear All */}
              <button
                onClick={onClearAll}
                disabled={files.length === 0 || isProcessing}
                className="p-2.5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Clear All"
              >
                <Trash2 className="w-5 h-5" />
                <span className="hidden sm:inline text-xs uppercase tracking-wider font-bold">
                  Clear All
                </span>
              </button>
            </div>

            {/* Bottom Center: Concatenate Button */}
            <div className="flex justify-center pb-2">
              <button
                onClick={onConcatenate}
                disabled={
                  filteredFiles.filter((f) => !f.isIgnored).length === 0 ||
                  isProcessing
                }
                className="px-12 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold shadow-lg shadow-brand-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                {isProcessing ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-6 h-6" />
                )}
                <span className="text-lg">Concatenate & Download</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Extracting info */}
              <div className="flex flex-col gap-1 min-w-[140px]">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Extracting{' '}
                    {
                      filteredFiles.filter(
                        (f) => f.kind === 'file' && !f.isIgnored
                      ).length
                    }{' '}
                    files
                  </span>
                </div>
                {filteredFiles.some((f) => f.isIgnored) && (
                  <span className="text-[10px] font-bold text-brand-500/60 uppercase tracking-widest">
                    ({filteredFiles.filter((f) => f.isIgnored).length} ignored)
                  </span>
                )}
              </div>

              {/* Center: Note */}
              <div className="flex-1 flex justify-center">
                {!forceMode && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50">
                    <Info className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium leading-none text-center">
                      Note: Extraction assumes a clean directory. Enable 'Force'
                      if merging into existing code.
                    </span>
                  </div>
                )}
                {forceMode && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium leading-none text-center">
                      Force Mode Enabled: Overwriting existing files during
                      extraction.
                    </span>
                  </div>
                )}
              </div>

              {/* Right: Clear All */}
              <button
                onClick={onClearAll}
                disabled={files.length === 0 || isProcessing}
                className="p-2.5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Clear All"
              >
                <Trash2 className="w-5 h-5" />
                <span className="hidden sm:inline text-xs uppercase tracking-wider font-bold">
                  Clear All
                </span>
              </button>
            </div>

            {/* Bottom Center: Download Button */}
            <div className="flex justify-center pb-2">
              <button
                onClick={onDownloadAsZip}
                disabled={
                  filteredFiles.filter((f) => !f.isIgnored).length === 0 ||
                  isProcessing ||
                  !onDownloadAsZip
                }
                className={cn(
                  'px-12 py-3 rounded-xl font-semibold shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95',
                  forceMode
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20 border-2 border-red-400 ring-2 ring-red-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                )}
                title={forceMode ? 'Force Download ZIP' : 'Download ZIP'}
              >
                {forceMode ? (
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                ) : (
                  <FolderArchive className="w-5 h-5" />
                )}
                <span className="text-lg">
                  {forceMode ? 'Force Extract ZIP' : 'Download ZIP'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      <QuickLook file={quickLookFile} onClose={() => setQuickLookFile(null)} />
    </div>
  )
}
