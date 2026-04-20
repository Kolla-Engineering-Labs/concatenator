/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Maximize2, Minimize2, X, Ban, Upload } from 'lucide-react';
import { cn } from '../lib/utils';
import { AppMode } from '../types';

interface UploadZoneProps {
  isProcessing: boolean;
  isDropzoneMinimized: boolean;
  setIsDropzoneMinimized: (minimized: boolean) => void;
  importProgress: { current: number; total: number };
  cancelProcessing: () => void;
  importError: string | null;
  setImportError: (error: string | null) => void;
  appMode: AppMode;
  handleDrop: (e: React.DragEvent) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A component that provides a drag-and-drop area and file browser for uploading files.
 */
export const UploadZone: React.FC<UploadZoneProps> = ({
  isProcessing,
  isDropzoneMinimized,
  setIsDropzoneMinimized,
  importProgress,
  cancelProcessing,
  importError,
  setImportError,
  appMode,
  handleDrop,
  handleFileUpload,
}) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="relative group"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <button
        onClick={() => setIsDropzoneMinimized(!isDropzoneMinimized)}
        className="absolute -top-3 -right-3 z-20 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-brand-500"
        title={isDropzoneMinimized ? "Expand dropzone" : "Minimize dropzone"}
      >
        {isDropzoneMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
      </button>

      {isProcessing ? (
        <div className={cn(
          "border-2 border-brand-200 dark:border-brand-900/30 bg-brand-50/30 dark:bg-brand-900/5 rounded-2xl flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in duration-300",
          isDropzoneMinimized ? "p-6" : "p-12"
        )}>
          <div className="w-full max-w-md space-y-4">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-brand-600 dark:text-brand-400">
                {importProgress.total === 0 ? 'Scanning Folder...' : 'Reading Files...'}
              </span>
              <span className="text-slate-500">{importProgress.current} / {importProgress.total}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-3 flex-grow bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-brand-500"
                  initial={{ width: 0 }}
                  animate={{ width: importProgress.total > 0 ? `${(importProgress.current / importProgress.total) * 100}%` : '100%' }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                />
              </div>
              {isDropzoneMinimized && (
                <button
                  onClick={cancelProcessing}
                  className="flex items-center gap-1.5 px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors whitespace-nowrap"
                  title="Cancel Import"
                >
                  <X className="w-4 h-4" />
                  <span className="text-xs font-medium">Cancel Import</span>
                </button>
              )}
            </div>
            {!isDropzoneMinimized && (
              <div className="flex justify-center">
                <button
                  onClick={cancelProcessing}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel Import
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={cn(
            "border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all group-hover:border-brand-400 group-hover:bg-brand-50/50 dark:group-hover:bg-brand-900/10",
            isDropzoneMinimized ? "p-4 gap-2" : "p-12 gap-4",
            importError ? "border-red-300 bg-red-50/30 dark:border-red-900/50 dark:bg-red-900/10" : "border-slate-300 dark:border-slate-700"
          )}>
            {importError ? (
              <div className="flex flex-col items-center gap-2 text-center max-w-md relative z-20 ph-no-capture">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                  <Ban className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">{importError}</p>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImportError(null);
                  }}
                  className="text-xs text-slate-500 hover:text-brand-500 underline cursor-pointer p-2"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <>
                <div className={cn(
                  "bg-slate-100 dark:bg-slate-900 rounded-full group-hover:bg-brand-100 dark:group-hover:bg-brand-900/20 transition-colors",
                  isDropzoneMinimized ? "p-2" : "p-4"
                )}>
                  <Upload className={cn("text-slate-400 group-hover:text-brand-500", isDropzoneMinimized ? "w-4 h-4" : "w-8 h-8")} />
                </div>
                <div className="text-center ph-no-capture">
                  <p className={cn("font-medium", isDropzoneMinimized ? "text-sm" : "text-lg")}>
                    {isDropzoneMinimized ? 'Drop here' : (appMode === 'concatenate' ? 'Drop folder or files here' : 'Drop concatenated .txt file here')}
                  </p>
                  {!isDropzoneMinimized && <p className="text-sm text-slate-500">or click to browse</p>}
                </div>
              </>
            )}
          </div>
          {!importError && (
            <input
              // key={appMode} intentionally remounts input when mode changes to reset webkitdirectory attribute
              key={appMode}
              type="file"
              multiple
              {...(appMode === 'concatenate' ? { webkitdirectory: "" } : {})}
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 ph-no-capture"
              disabled={isProcessing}
              title=""
            />
          )}
        </>
      )}
    </div>
  );
};
