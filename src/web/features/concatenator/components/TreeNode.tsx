/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { ChevronRight, ChevronDown, Folder } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '../../../../lib/utils'
import { TreeItem } from '../../../../core/types'
import { getFileIcon } from '../../../../lib/fileIcons'

interface TreeNodeProps {
  node: TreeItem
  depth?: number
  expandedPaths: Set<string>
  setExpandedPaths: (paths: Set<string>) => void
}

/**
 * A recursive component that renders a file tree structure.
 */
export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth = 0,
  expandedPaths,
  setExpandedPaths,
}) => {
  const isExpanded = expandedPaths.has(node.path)
  const hasChildren = node.children && node.children.length > 0

  const toggleExpand = () => {
    const next = new Set(expandedPaths)
    if (isExpanded) next.delete(node.path)
    else next.add(node.path)
    setExpandedPaths(next)
  }

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors',
          depth === 0 && 'font-semibold text-slate-500'
        )}
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        onClick={hasChildren ? toggleExpand : undefined}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 mr-1" />
          ) : (
            <ChevronRight className="w-4 h-4 mr-1" />
          )
        ) : (
          <div className="w-4 h-4 mr-1" />
        )}
        {node.kind === 'directory' ? (
          <Folder className="w-4 h-4 mr-2 text-brand-500" />
        ) : (
          <div className="w-4 h-4 mr-2 flex items-center justify-center">
            {getFileIcon(node.name, 'file')}
          </div>
        )}
        <span className="text-sm truncate ph-no-capture">
          {node.name}
          {node.kind === 'directory' && node.name !== 'Root' ? '/' : ''}
        </span>
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
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
