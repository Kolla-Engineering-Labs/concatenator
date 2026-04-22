import React from 'react'
import { useWorkbench } from '../hooks/useWorkbench'
import { AppMode } from '../types/workbench'

export const ModeSwitch: React.FC = () => {
  const { mode, setMode } = useWorkbench()

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode)
  }

  return (
    <div
      className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 w-full"
      data-testid="mode-switch"
    >
      <button
        onClick={() => handleModeChange(AppMode.CONCATENATE)}
        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          mode === AppMode.CONCATENATE
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Concatenate
      </button>
      <button
        onClick={() => handleModeChange(AppMode.DECONCATENATE)}
        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          mode === AppMode.DECONCATENATE
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        De-concatenate
      </button>
    </div>
  )
}
