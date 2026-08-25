/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { cn } from '../../../../lib/utils'
import type { OutputFormat } from '../../../../core/types'

interface OutputFormatToggleProps {
  outputFormat: OutputFormat
  setOutputFormat: (format: OutputFormat) => void
}

/**
 * A toggle switch to choose between TEXT and PDF output formats.
 */
export const OutputFormatToggle: React.FC<OutputFormatToggleProps> = ({
  outputFormat,
  setOutputFormat,
}) => {
  return (
    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner">
      <button
        onClick={() => setOutputFormat('text')}
        className={cn(
          'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all',
          outputFormat === 'text'
            ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-600 ring-1 ring-black/5 dark:ring-white/10'
            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        )}
      >
        Text
      </button>
      <button
        onClick={() => setOutputFormat('pdf')}
        className={cn(
          'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all',
          outputFormat === 'pdf'
            ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-600 ring-1 ring-black/5 dark:ring-white/10'
            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        )}
      >
        PDF
      </button>
    </div>
  )
}
