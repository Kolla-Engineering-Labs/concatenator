/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings2, Maximize2, Minimize2, X, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

interface IgnoreListProps {
  ignoreList: string[];
  isIgnoreListMinimized: boolean;
  setIsIgnoreListMinimized: (minimized: boolean) => void;
  newIgnoreItem: string;
  setNewIgnoreItem: (item: string) => void;
  addIgnoreItem: () => void;
  removeIgnoreItem: (item: string) => void;
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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between h-9">
        <div className="flex items-center gap-2 text-slate-500">
          <Settings2 className="w-4 h-4" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Ignore List</h2>
          {!isIgnoreListMinimized && (
            <span className="text-xs text-slate-400 font-normal normal-case hidden sm:inline">(files/folders matching these names will be skipped)</span>
          )}
        </div>
        <button
          onClick={() => setIsIgnoreListMinimized(!isIgnoreListMinimized)}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-brand-500"
          title={isIgnoreListMinimized ? "Expand ignore list" : "Minimize ignore list"}
        >
          {isIgnoreListMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>
      </div>
      
      <AnimatePresence>
        {!isIgnoreListMinimized && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 pb-8 shadow-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <AnimatePresence mode="popLayout">
                  {ignoreList.map((item, index) => (
                    <motion.div
                      key={`${item}-${index}`}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium group border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                    >
                      <span>{item}</span>
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
                
                <div className="relative flex-grow min-w-[150px] max-w-xs">
                  <input
                    type="text"
                    value={newIgnoreItem}
                    onChange={(e) => setNewIgnoreItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addIgnoreItem();
                      }
                    }}
                    placeholder="Add ignore pattern..."
                    className="w-full bg-transparent border-none focus:ring-0 text-sm py-1 px-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                  />
                  <div className="absolute top-full left-0 mt-1 text-[10px] text-slate-400 whitespace-nowrap">
                    {newIgnoreItem.includes('*') && !newIgnoreItem.startsWith('/') ? (
                      <span className="text-brand-500 dark:text-brand-400 font-medium">
                        Tip: For wildcards, use regex: <code className="bg-brand-50 dark:bg-brand-900/20 px-1 rounded">/{newIgnoreItem.replace(/\*/g, '.*')}/</code>
                      </span>
                    ) : (
                      <>Tip: Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/pattern/</code> for regex (e.g. <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/\.test\.ts$/</code>)</>
                    )}
                  </div>
                  {newIgnoreItem && (
                    <button
                      onClick={addIgnoreItem}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-md transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
