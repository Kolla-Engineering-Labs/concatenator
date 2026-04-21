/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Settings2,
  Maximize2,
  Minimize2,
  X,
  Plus,
  ChevronUp,
} from 'lucide-react'
import { useLocalStorage } from '../../../hooks/useLocalStorage'

interface IgnoreListProps {
  ignoreList: string[]
  isIgnoreListMinimized: boolean
  setIsIgnoreListMinimized: (minimized: boolean) => void
  newIgnoreItem: string
  setNewIgnoreItem: (item: string) => void
  addIgnoreItem: () => void
  removeIgnoreItem: (item: string) => void
}

/**
 * A component for managing the list of files and folders to ignore during concatenation.
 */
export const IgnoreList: React.FC<IgnoreListProps> = ({
  ignoreList,
  isIgnoreListMinimized,
  setIsIgnoreListMinimized,
  newIgnoreItem,
  setNewIgnoreItem,
  addIgnoreItem,
  removeIgnoreItem,
}) => {
  const [isIgnoreListExpanded, setIsIgnoreListExpanded] = useLocalStorage(
    'concat_ignore_expanded',
    false
  )

  const TRUNCATE_LIMIT = 8
  const hasMore = ignoreList.length > TRUNCATE_LIMIT
  const displayedItems = isIgnoreListExpanded
    ? ignoreList
    : ignoreList.slice(0, TRUNCATE_LIMIT)
  const remainder = ignoreList.length - TRUNCATE_LIMIT

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between h-9 shrink-0">
        <div className="flex items-center gap-2 text-slate-500">
          <Settings2 className="w-4 h-4" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Ignore List
          </h2>
          {!isIgnoreListMinimized && (
            <span className="text-xs text-slate-400 font-normal normal-case hidden sm:inline">
              ({ignoreList.length} items)
            </span>
          )}
        </div>
        <button
          onClick={() => setIsIgnoreListMinimized(!isIgnoreListMinimized)}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-brand-500"
          title={
            isIgnoreListMinimized
              ? 'Expand ignore list'
              : 'Minimize ignore list'
          }
        >
          {isIgnoreListMinimized ? (
            <Maximize2 className="w-4 h-4" />
          ) : (
            <Minimize2 className="w-4 h-4" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {!isIgnoreListMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm"
          >
            {/* Pinned Input */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={newIgnoreItem}
                  onChange={(e) => setNewIgnoreItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addIgnoreItem()
                    }
                  }}
                  placeholder="Add ignore pattern..."
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-lg text-sm py-1.5 pl-3 pr-9 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all"
                />
                <button
                  onClick={addIgnoreItem}
                  disabled={!newIgnoreItem}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:text-slate-300 dark:disabled:text-slate-600 rounded-md transition-colors"
                  title="Add ignore pattern"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Tag List */}
            <div
              className="p-3 overflow-y-auto max-h-64 custom-scrollbar"
              style={{
                scrollbarWidth: 'thin',
              }}
            >
              <div className="flex flex-wrap gap-2">
                <AnimatePresence mode="popLayout">
                  {displayedItems.map((item, index) => (
                    <motion.div
                      key={`${item}-${index}`}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium group border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                      data-testid={`ignore-item-${item}`}
                    >
                      <span className="truncate max-w-[120px]">{item}</span>
                      <button
                        onClick={() => removeIgnoreItem(item)}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-red-500 transition-colors"
                        title={`Remove ${item}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {hasMore && !isIgnoreListExpanded && (
                  <button
                    onClick={() => setIsIgnoreListExpanded(true)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-lg text-[11px] font-bold border border-brand-100 dark:border-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
                  >
                    +{remainder} more
                  </button>
                )}
              </div>

              {isIgnoreListExpanded && hasMore && (
                <button
                  onClick={() => setIsIgnoreListExpanded(false)}
                  className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-brand-500 transition-colors"
                >
                  <ChevronUp className="w-3 h-3" />
                  Show less
                </button>
              )}
            </div>

            {/* Help text */}
            {!isIgnoreListExpanded && (
              <div className="px-3 py-2 bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-400">
                  Tip: Use{' '}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                    /regex/
                  </code>{' '}
                  for advanced matching
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
