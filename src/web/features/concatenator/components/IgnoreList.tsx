/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Maximize2,
  Minimize2,
  X,
  Plus,
  ChevronUp,
  RotateCcw,
} from 'lucide-react'
import { useLocalStorage } from '../../../hooks/useLocalStorage'
import { useWorkbench } from '../../../hooks/useWorkbench'
import { cn } from '../../../../lib/utils'

interface IgnoreListProps {
  ignoreList: string[]
  isIgnoreListMinimized: boolean
  setIsIgnoreListMinimized: (minimized: boolean) => void
  newIgnoreItem: string
  setNewIgnoreItem: (item: string) => void
  addIgnoreItem: () => void
  removeIgnoreItem: (item: string) => void
  ignoredTokens?: number
  ignoredIsPrecise?: boolean
  autoSaveIgnore: boolean
  setAutoSaveIgnore: (autoSave: boolean) => void
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
  ignoredTokens,
  ignoredIsPrecise,
  autoSaveIgnore,
  setAutoSaveIgnore,
}) => {
  const { suspendedRules = [], unsuspendRule } = useWorkbench()
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
    <div className="flex flex-col h-full space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
            Ignore Files
          </h2>
          {!isIgnoreListMinimized && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400/60 font-bold uppercase tracking-tight hidden sm:inline">
                ({ignoreList.length})
              </span>
              {ignoredTokens !== undefined && ignoredTokens > 0 && (
                <span
                  className={cn(
                    'text-[10px] font-bold transition-opacity',
                    ignoredIsPrecise ? 'text-brand-500/80' : 'text-brand-500/40'
                  )}
                >
                  {!ignoredIsPrecise && '~'}
                  {ignoredTokens.toLocaleString()}
                </span>
              )}
            </div>
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
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    addIgnoreItem()
                  }}
                  disabled={!newIgnoreItem}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:text-slate-300 dark:disabled:text-slate-600 rounded-md transition-colors"
                  title="Add ignore pattern"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[10px] text-slate-400 px-1">
                  Tip: Use{' '}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">
                    /regex/
                  </code>{' '}
                  for advanced matching
                </p>
                <label
                  className="flex items-center gap-2 cursor-pointer group"
                  title="When enabled, any changes you make will be saved back to the ignore file on disk."
                >
                  <span className="text-[10px] text-slate-400 font-medium group-hover:text-slate-600 dark:group-hover:text-slate-300">
                    Auto-save
                  </span>
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={autoSaveIgnore}
                      onChange={(e) => setAutoSaveIgnore(e.target.checked)}
                    />
                    <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600 rounded-full"></div>
                  </div>
                </label>
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
                  {displayedItems.map((item) => {
                    const isSuspended = suspendedRules.includes(item)
                    return (
                      <motion.div
                        key={item}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium group border transition-colors',
                          isSuspended
                            ? 'bg-slate-100/50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-slate-200/50 dark:border-slate-800/50 opacity-60'
                            : item.startsWith('!')
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:border-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700'
                        )}
                        data-testid={`ignore-item-${item}`}
                        data-suspended={isSuspended}
                      >
                        <span
                          className={cn(
                            'truncate max-w-[120px]',
                            isSuspended &&
                              'line-through decoration-slate-400/50'
                          )}
                          title={isSuspended ? `${item} (Suspended)` : item}
                        >
                          {item}
                        </span>
                        {isSuspended && unsuspendRule && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              unsuspendRule(item)
                            }}
                            className="p-0.5 hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-md text-brand-500 hover:text-brand-600 transition-colors"
                            title={`Re-enable ${item}`}
                            data-testid={`unsuspend-item-${item}`}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            removeIgnoreItem(item)
                          }}
                          className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-red-500 transition-colors"
                          title={`Remove ${item}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.div>
                    )
                  })}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
