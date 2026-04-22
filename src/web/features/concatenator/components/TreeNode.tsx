/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Eye,
  EyeOff,
  ExternalLink,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { cn, formatFileSize, estimateTokenCount } from '../../../../lib/utils'
import { TreeItem, FileItem } from '../../../../core/types'
import { getFileIcon } from '../../../../lib/fileIcons'
import { useWorkbench } from '../../../hooks/useWorkbench'

interface TreeNodeProps {
  node: TreeItem
  depth?: number
  expandedPaths: Set<string>
  setExpandedPaths: (paths: Set<string>) => void
  onQuickLook: (file: FileItem) => void
  onRemoveFile: (file: FileItem) => void
  inheritedIgnored?: boolean
}

/**
 * A recursive component that renders a file tree structure.
 */
export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth = 0,
  expandedPaths,
  setExpandedPaths,
  onQuickLook,
  onRemoveFile,
  inheritedIgnored = false,
}) => {
  const { addIgnorePattern, removeIgnorePattern } = useWorkbench()
  const isExpanded = expandedPaths.has(node.path)
  const hasChildren = node.children && node.children.length > 0
  const effectivelyIgnored = node.isIgnored || inheritedIgnored

  const toggleExpand = () => {
    const next = new Set(expandedPaths)
    if (isExpanded) next.delete(node.path)
    else next.add(node.path)
    setExpandedPaths(next)
  }

  const handleIgnoreToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const pattern = node.kind === 'directory' ? `${node.path}/**` : node.path
    if (node.isIgnored) {
      removeIgnorePattern(pattern)
    } else {
      addIgnorePattern(pattern)
    }
  }

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors group/node',
          depth === 0 && 'font-semibold text-slate-500',
          effectivelyIgnored && 'opacity-30 grayscale italic select-none'
        )}
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        onClick={hasChildren ? toggleExpand : undefined}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 mr-1 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 mr-1 text-slate-400" />
          )
        ) : (
          <div className="w-4 h-4 mr-1" />
        )}
        {node.kind === 'directory' ? (
          <Folder className={cn("w-4 h-4 mr-2", effectivelyIgnored ? "text-slate-400" : "text-brand-500")} />
        ) : (
          <div className="w-4 h-4 mr-2 flex items-center justify-center">
            {getFileIcon(node.name, 'file')}
          </div>
        )}
        <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
          <div
            className={cn(
              'flex-1 min-w-0 text-sm ph-no-capture',
              effectivelyIgnored && 'line-through decoration-slate-400/50'
            )}
          >
            <div className="truncate">
              {node.name}
              {node.kind === 'directory' && node.name !== 'Root' ? '/' : ''}
              {node.isIgnored && (
                <span className="ml-2 text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded uppercase tracking-tighter font-bold opacity-60 inline-block align-middle">
                  Ignored
                </span>
              )}
              {!node.isIgnored && inheritedIgnored && (
                <span className="ml-2 text-[10px] bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded uppercase tracking-tighter font-bold opacity-40 inline-block align-middle">
                  Inherited
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover/node:opacity-100 transition-opacity">
            {node.kind === 'file' && node.file && (
              <div className="flex items-center gap-2 mr-2 text-[10px] font-mono whitespace-nowrap border-r border-slate-200 dark:border-slate-700 pr-2 h-4 flex-shrink-0">
                <span className="text-slate-400">{formatFileSize(node.file.size)}</span>
                <span className="text-brand-500/70">{estimateTokenCount(node.file.content, node.file.size).toLocaleString()}</span>
              </div>
            )}
            {node.kind === 'file' && node.file && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onQuickLook(node.file!)
                }}
                className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-md transition-all"
                title="Quick Look"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}

            {node.name !== 'Root' && (
              <button
                onClick={handleIgnoreToggle}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  node.isIgnored
                    ? 'text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                    : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                )}
                title={
                  node.isIgnored
                    ? `Un-ignore ${node.name}`
                    : `Ignore ${node.name}`
                }
              >
                {node.isIgnored ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {node.name !== 'Root' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const fileToDelete = node.file || {
                    name: node.name,
                    path: node.path,
                    kind: node.kind,
                  }
                  onRemoveFile(fileToDelete as FileItem)
                }}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                title={`Remove ${node.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {node.children?.map((child, index) => (
              <TreeNode
                key={`${depth + 1}-${child.path}-${index}`}
                node={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                setExpandedPaths={setExpandedPaths}
                onQuickLook={onQuickLook}
                onRemoveFile={onRemoveFile}
                inheritedIgnored={effectivelyIgnored}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
