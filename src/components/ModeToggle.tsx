/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '../lib/utils';
import { AppMode } from '../types';

interface ModeToggleProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  onModeChange: () => void;
}

/**
 * A toggle switch to change between Concatenate and De-concatenate modes.
 */
export const ModeToggle: React.FC<ModeToggleProps> = ({ 
  appMode, 
  setAppMode, 
  onModeChange 
}) => {
  return (
    <div className="flex p-1 bg-slate-200 dark:bg-slate-900 rounded-xl w-fit mx-auto">
      <button
        onClick={() => { setAppMode('concatenate'); onModeChange(); }}
        className={cn(
          "px-6 py-2 rounded-lg text-sm font-medium transition-all",
          appMode === 'concatenate' 
            ? "bg-white dark:bg-slate-800 shadow-sm text-brand-600 dark:text-brand-400" 
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        )}
      >
        Concatenate
      </button>
      <button
        onClick={() => { setAppMode('deconcatenate'); onModeChange(); }}
        className={cn(
          "px-6 py-2 rounded-lg text-sm font-medium transition-all",
          appMode === 'deconcatenate' 
            ? "bg-white dark:bg-slate-800 shadow-sm text-brand-600 dark:text-brand-400" 
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        )}
      >
        De-concatenate
      </button>
    </div>
  );
};
