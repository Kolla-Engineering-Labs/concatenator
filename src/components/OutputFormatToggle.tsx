/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '../lib/utils';
import { OutputFormat } from '../types';

interface OutputFormatToggleProps {
  outputFormat: OutputFormat;
  setOutputFormat: (format: OutputFormat) => void;
}

/**
 * A toggle switch to choose between TEXT and PDF output formats.
 */
export const OutputFormatToggle: React.FC<OutputFormatToggleProps> = ({ 
  outputFormat, 
  setOutputFormat 
}) => {
  return (
    <div className="flex p-1 bg-slate-200 dark:bg-slate-900 rounded-lg w-fit">
      <button
        onClick={() => setOutputFormat('text')}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
          outputFormat === 'text' 
            ? "bg-white dark:bg-slate-800 shadow-sm text-brand-600 dark:text-brand-400" 
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        )}
      >
        TEXT
      </button>
      <button
        onClick={() => setOutputFormat('pdf')}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
          outputFormat === 'pdf' 
            ? "bg-white dark:bg-slate-800 shadow-sm text-brand-600 dark:text-brand-400" 
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        )}
      >
        PDF
      </button>
    </div>
  );
};
