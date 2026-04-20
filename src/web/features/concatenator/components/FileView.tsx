/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import {
  Files,
  List,
  Network,
  FileCode,
  Ban,
  X,
  Download,
  Trash2,
} from 'lucide-react'
import { cn } from '../../../../lib/utils'
import {
  FileItem,
  TreeItem,
  ViewMode,
  OutputFormat,
} from '../../../../core/types'
import { getFileIcon } from '../../../../lib/fileIcons'
import { TreeNode } from './TreeNode'
import { OutputFormatToggle } from './OutputFormatToggle'

interface FileViewProps {
  files: FileItem[]
  filteredFiles: FileItem[]
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  fileTree: TreeItem
  expandedPaths: Set<string>
  setExpandedPaths: (paths: Set<string>) => void
  isProcessing: boolean
  onConcatenate: () => void
  onClearAll: () => void
  onIgnoreFile: (name: string) => void
  onRemoveFile: (file: FileItem) => void
  outputFormat: OutputFormat
  setOutputFormat: (format: OutputFormat) => void
}

/**
 * A component that displays the list or tree of selected files and provides actions like concatenate and clear.
 */
export const FileView: React.FC<FileViewProps> = ({
  files,
  filteredFiles,
  viewMode,
  setViewMode,
  fileTree,
  expandedPaths,
  setExpandedPaths,
  isProcessing,
  onConcatenate,
  onClearAll,
  onIgnoreFile,
  onRemoveFile,
  outputFormat,
  setOutputFormat,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between h-9">
        <div className="flex items-center gap-2 text-slate-500">
          <Files className="w-4 h-4" />
          <h2 className="text-sm font-semibold uppercase tracking-wider ph-no-capture">
            Selected Files
            <span className="ml-2 tabular-nums opacity-60">
              ({filteredFiles.filter((f) => f.kind === 'file').length})
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('list')}
            aria-label="List view"
            className={cn(
              'p-1.5 rounded-md transition-all',
              viewMode === 'list'
                ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-500'
                : 'text-slate-400'
            )}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('tree')}
            aria-label="Tree view"
            className={cn(
              'p-1.5 rounded-md transition-all',
              viewMode === 'tree'
                ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-500'
                : 'text-slate-400'
            )}
          >
            <Network className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm min-h-[300px]">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
            <FileCode className="w-12 h-12 opacity-20" />
            <p>No files selected</p>
          </div>
        ) : (
          <div className="p-2">
            {viewMode === 'list' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {filteredFiles
                  .filter((f) => f.kind === 'file')
                  .map((file, index) => (
                    <div
                      key={`${file.path}-${index}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all group min-w-0"
                    >
                      {getFileIcon(file.name, file.kind)}
                      <div className="flex flex-col min-w-0 flex-1 ph-no-capture">
                        <span className="text-sm font-medium truncate leading-tight">
                          {file.name}
                        </span>
                        <span
                          className="text-[10px] text-slate-400 truncate leading-tight cursor-help"
                          title={file.path}
                        >
                          {file.path.substring(
                            0,
                            file.path.lastIndexOf('/') + 1
                          ) || './'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onIgnoreFile(file.name)}
                          className="p-1 text-slate-400 hover:text-brand-500 transition-all"
                          title={`Ignore ${file.name}`}
                        >
                          <Ban className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onRemoveFile(file)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-all"
                          title={`Remove ${file.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <TreeNode
                node={fileTree}
                expandedPaths={expandedPaths}
                setExpandedPaths={setExpandedPaths}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4">
        <OutputFormatToggle
          outputFormat={outputFormat}
          setOutputFormat={setOutputFormat}
        />

        <button
          onClick={onConcatenate}
          disabled={filteredFiles.length === 0 || isProcessing}
          className="px-8 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold shadow-lg shadow-brand-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          {isProcessing ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Download className="w-5 h-5" />
          )}
          Concatenate & Download
        </button>

        <button
          onClick={onClearAll}
          disabled={files.length === 0 || isProcessing}
          className="px-4 py-2 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Clear All"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Clear All</span>
        </button>
      </div>
    </div>
  )
}
