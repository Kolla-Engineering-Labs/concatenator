import React from 'react'
import { useWorkbench } from '../hooks/useWorkbench'
import { AppMode } from '../types/workbench'
import { cn } from '../../lib/utils'

export const ModeSwitch: React.FC = () => {
  const { mode, setMode } = useWorkbench()

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode)
  }

  return (
    <div
      className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner w-full"
      data-testid="mode-switch"
    >
      <button
        onClick={() => handleModeChange(AppMode.CONCATENATE)}
        className={cn(
          'flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap',
          mode === AppMode.CONCATENATE
            ? 'bg-brand-600 text-white shadow-md ring-1 ring-black/5 dark:ring-white/10'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        )}
      >
        Concatenate
      </button>
      <button
        onClick={() => handleModeChange(AppMode.DECONCATENATE)}
        className={cn(
          'flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap',
          mode === AppMode.DECONCATENATE
            ? 'bg-brand-600 text-white shadow-md ring-1 ring-black/5 dark:ring-white/10'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        )}
      >
        De-concatenate
      </button>
    </div>
  )
}
