/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react'
import {
  ChevronUp,
  ChevronDown,
  X,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react'
import { FileItem } from '../../../../core/types'
import { cn, formatFileSize } from '../../../../lib/utils'
import { getFileIcon } from '../../../../lib/fileIcons'
import { useWorkbench } from '../../../hooks/useWorkbench'

interface FileTableProps {
  files: FileItem[]
  onRemoveFile: (file: FileItem) => void
  onQuickLook: (file: FileItem) => void
}

type SortField = 'name' | 'path' | 'size' | 'tokens'
type SortOrder = 'asc' | 'desc'

export const FileTable: React.FC<FileTableProps> = ({
  files,
  onRemoveFile,
  onQuickLook,
}) => {
  const { addIgnorePattern, removeIgnorePattern, isIgnored, ignoreList } =
    useWorkbench()
  const [sortField, setSortField] = useState<SortField>('path')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const valA = a[sortField as keyof FileItem] ?? 0
      const valB = b[sortField as keyof FileItem] ?? 0

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [files, sortField, sortOrder])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    )
  }

  return (
    <div className="w-full" data-testid="file-table">
      {/* Desktop Table View */}
      <div className="hidden sm:block">
        <table className="w-full text-left border-separate border-spacing-0 min-w-[600px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              <th
                className="sticky top-0 z-10 px-4 py-3 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:text-brand-500 transition-colors group"
                onClick={() => toggleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Name <SortIcon field="name" />
                </div>
              </th>
              <th
                className="sticky top-0 z-10 px-4 py-3 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:text-brand-500 transition-colors"
                onClick={() => toggleSort('path')}
              >
                <div className="flex items-center gap-1">
                  Path <SortIcon field="path" />
                </div>
              </th>
              <th
                className="sticky top-0 z-10 px-4 py-3 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:text-brand-500 transition-colors text-right"
                onClick={() => toggleSort('size')}
              >
                <div className="flex items-center gap-1 justify-end">
                  Size <SortIcon field="size" />
                </div>
              </th>
              <th
                className="sticky top-0 z-10 px-4 py-3 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:text-brand-500 transition-colors text-right"
                onClick={() => toggleSort('tokens')}
              >
                <div className="flex items-center gap-1 justify-end">
                  Tokens <SortIcon field="tokens" />
                </div>
              </th>
              <th className="sticky top-0 z-10 px-4 py-3 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedFiles.map((file, idx) => (
              <tr
                key={`${file.path}-${idx}`}
                data-testid="file-row"
                data-path={file.path}
                data-ignored={file.isIgnored}
                className={cn(
                  'group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                  file.isIgnored && 'opacity-40 grayscale italic'
                )}
                title={
                  file.isIgnored
                    ? `Ignored: ${file.reason || 'Matches ignore pattern'}`
                    : undefined
                }
              >
                <td className="px-4 py-2.5 max-w-[200px] border-b border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(file.name, file.kind)}
                    <span
                      className={cn(
                        'text-sm font-medium truncate ph-no-capture',
                        file.isIgnored && 'line-through decoration-slate-400/50'
                      )}
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    {file.isIgnored && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[8px] font-bold uppercase tracking-wider border border-slate-200 dark:border-slate-700 ml-2">
                        Ignored
                      </span>
                    )}
                    {file.isNegated && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded uppercase tracking-tighter font-bold inline-block align-middle ml-2">
                        Negated
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 max-w-[250px] border-b border-slate-100 dark:border-slate-800/50">
                  <div
                    className="text-xs text-slate-400 truncate ph-no-capture"
                    title={file.path}
                  >
                    {file.path}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[10px] text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
                  {formatFileSize(file.size)}
                </td>
                <td
                  className={cn(
                    'px-4 py-2.5 text-right font-mono text-[10px] transition-opacity border-b border-slate-100 dark:border-slate-800/50',
                    file.isPrecise ? 'text-brand-500' : 'text-brand-500/60'
                  )}
                >
                  {!file.isPrecise && '~'}
                  {(file.tokens || 0).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right border-b border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onQuickLook(file)}
                      className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-md transition-all"
                      title="Quick Look"
                      data-testid="quick-look-button"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const path = file.path
                        const variants = [path, `${path}/`, `${path}/**`]
                        const negationPattern = `!${path}`
                        const list = ignoreList || []

                        if (isIgnored(path)) {
                          // Try to find if any variant is explicitly in the list
                          const existingPattern = variants.find((v) =>
                            list.includes(v)
                          )
                          if (existingPattern) {
                            removeIgnorePattern(existingPattern)
                          } else {
                            addIgnorePattern(negationPattern)
                          }
                        } else {
                          // If not ignored, check if it was because of a negation
                          const existingNegation = list.find(
                            (v) =>
                              v === negationPattern ||
                              v === `!${path}/` ||
                              v === `!${path}/**`
                          )
                          if (existingNegation) {
                            removeIgnorePattern(existingNegation)
                          } else {
                            addIgnorePattern(path)
                          }
                        }
                      }}
                      className={cn(
                        'p-1.5 rounded-md transition-all',
                        file.isIgnored
                          ? 'text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                          : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                      )}
                      title={
                        file.isIgnored
                          ? `Un-ignore ${file.name}`
                          : `Ignore ${file.name}`
                      }
                      data-testid="ignore-file-button"
                    >
                      {file.isIgnored ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => onRemoveFile(file)}
                      disabled={file.isIgnored}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all disabled:opacity-20"
                      title={
                        file.isIgnored
                          ? 'Ignored files cannot be removed manually'
                          : `Remove ${file.name}`
                      }
                      data-testid="remove-file-button"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked View */}
      <div className="sm:hidden space-y-3">
        {sortedFiles.map((file, idx) => (
          <div
            key={`${file.path}-${idx}`}
            data-testid="file-row"
            data-path={file.path}
            data-ignored={file.isIgnored}
            className={cn(
              'p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3 transition-all',
              file.isIgnored && 'opacity-50 grayscale italic'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0">
                  {getFileIcon(file.name, file.kind)}
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm font-bold truncate ph-no-capture',
                      file.isIgnored && 'line-through decoration-slate-400/50'
                    )}
                  >
                    {file.name}
                  </p>
                  <p
                    className="text-[10px] text-slate-400 truncate ph-no-capture"
                    title={file.path}
                  >
                    {file.path}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onQuickLook(file)}
                  className="p-2 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all"
                  title="Quick Look"
                  data-testid="quick-look-button"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onRemoveFile(file)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  title={`Remove ${file.name}`}
                  data-testid="remove-file-button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-slate-800/50">
              <div className="flex items-center gap-4">
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    Size
                  </p>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    Tokens
                  </p>
                  <p
                    className={cn(
                      'text-xs font-mono font-bold',
                      file.isPrecise ? 'text-brand-500' : 'text-brand-500/60'
                    )}
                  >
                    {!file.isPrecise && '~'}
                    {(file.tokens || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  const pattern = file.path
                  const negationPattern = `!${pattern}`
                  if (isIgnored(file.path)) {
                    if (!(ignoreList || []).includes(pattern)) {
                      addIgnorePattern(negationPattern)
                    } else {
                      removeIgnorePattern(pattern)
                    }
                  } else {
                    if ((ignoreList || []).includes(negationPattern)) {
                      removeIgnorePattern(negationPattern)
                    } else {
                      addIgnorePattern(pattern)
                    }
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
                  file.isIgnored
                    ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400'
                    : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                )}
                data-testid="ignore-file-button"
              >
                {file.isIgnored ? (
                  <>
                    <Eye className="w-3 h-3" />
                    Un-ignore
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3" />
                    Ignore
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
