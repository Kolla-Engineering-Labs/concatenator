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
  const { addIgnorePattern, removeIgnorePattern } = useWorkbench()
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
    <table className="w-full text-left border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-bold bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm">
          <th
            className="px-4 py-3 cursor-pointer hover:text-brand-500 transition-colors group"
            onClick={() => toggleSort('name')}
          >
            <div className="flex items-center gap-1">
              Name <SortIcon field="name" />
            </div>
          </th>
          <th
            className="px-4 py-3 cursor-pointer hover:text-brand-500 transition-colors"
            onClick={() => toggleSort('path')}
          >
            <div className="flex items-center gap-1">
              Path <SortIcon field="path" />
            </div>
          </th>
          <th
            className="px-4 py-3 cursor-pointer hover:text-brand-500 transition-colors text-right"
            onClick={() => toggleSort('size')}
          >
            <div className="flex items-center gap-1 justify-end">
              Size <SortIcon field="size" />
            </div>
          </th>
          <th
            className="px-4 py-3 cursor-pointer hover:text-brand-500 transition-colors text-right"
            onClick={() => toggleSort('tokens')}
          >
            <div className="flex items-center gap-1 justify-end">
              Tokens <SortIcon field="tokens" />
            </div>
          </th>
          <th className="px-4 py-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {sortedFiles.map((file, idx) => (
          <tr
            key={`${file.path}-${idx}`}
            className={cn(
              'group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
              file.isIgnored && 'opacity-30 grayscale italic'
            )}
          >
            <td className="px-4 py-2.5 max-w-[200px]">
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
              </div>
            </td>
            <td className="px-4 py-2.5 max-w-[250px]">
              <div
                className="text-xs text-slate-400 truncate ph-no-capture"
                title={file.path}
              >
                {file.path}
              </div>
            </td>
            <td className="px-4 py-2.5 text-right font-mono text-[10px] text-slate-500">
              {formatFileSize(file.size)}
            </td>
            <td
              className={cn(
                'px-4 py-2.5 text-right font-mono text-[10px] transition-opacity',
                file.isPrecise ? 'text-brand-500' : 'text-brand-500/60'
              )}
            >
              {!file.isPrecise && '~'}
              {(file.tokens || 0).toLocaleString()}
            </td>
            <td className="px-4 py-2.5 text-right">
              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onQuickLook(file)}
                  className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-md transition-all"
                  title="Quick Look"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const pattern =
                      file.kind === 'directory' ? `${file.path}/**` : file.path
                    if (file.isIgnored) {
                      removeIgnorePattern(pattern)
                    } else {
                      addIgnorePattern(pattern)
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
                >
                  {file.isIgnored ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => onRemoveFile(file)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                  title={`Remove ${file.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
