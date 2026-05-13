/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react'
import { motion } from 'motion/react'
import { Maximize2, Minimize2, X, Ban, Upload } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { AppMode } from '../../../../core/types'
import { useTouchDevice } from '../../../hooks/useTouchDevice'

interface UploadZoneProps {
  isProcessing: boolean
  isDropzoneMinimized: boolean
  setIsDropzoneMinimized: (minimized: boolean) => void
  importProgress: { current: number; total: number }
  cancelProcessing: () => void
  importError: string | null
  setImportError: (error: string | null) => void
  appMode: AppMode
  handleDrop: (e: React.DragEvent) => void
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
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
  const isTouchDevice = useTouchDevice()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleContainerClick = () => {
    if (isTouchDevice && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'relative group transition-transform duration-100',
          isTouchDevice && !isProcessing && 'active:scale-95 cursor-pointer'
        )}
        data-testid="upload-zone-container"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleContainerClick}
      >
        {isProcessing ? (
          <div
            className={cn(
              'border-2 border-brand-200 dark:border-brand-900/30 bg-brand-50/30 dark:bg-brand-900/5 rounded-2xl flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in duration-300',
              isDropzoneMinimized ? 'p-6' : 'p-12'
            )}
          >
            <div className="w-full max-w-md space-y-4">
              <div className="flex items-center justify-between text-sm font-medium">
                <span
                  className="text-brand-600 dark:text-brand-400"
                  data-testid="processing-status"
                >
                  {appMode === 'deconcatenate'
                    ? 'Parsing...'
                    : importProgress.total === 0
                      ? 'Scanning Folder...'
                      : 'Reading Files...'}
                </span>
                <span className="text-slate-500">
                  {importProgress.current} / {importProgress.total}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-3 flex-grow bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-500"
                    initial={{ width: 0 }}
                    animate={{
                      width:
                        importProgress.total > 0
                          ? `${(importProgress.current / importProgress.total) * 100}%`
                          : '100%',
                    }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  />
                </div>
                {isDropzoneMinimized && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      cancelProcessing()
                    }}
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
                    onClick={(e) => {
                      e.stopPropagation()
                      cancelProcessing()
                    }}
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
            <motion.div
              layout
              className={cn(
                'border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all group-hover:border-brand-400 group-hover:bg-brand-50/50 dark:group-hover:bg-brand-900/10',
                isDropzoneMinimized
                  ? 'p-4 gap-2 min-h-[100px]'
                  : 'p-8 sm:p-12 gap-3 sm:gap-6 min-h-[220px] sm:min-h-[280px]',
                importError
                  ? 'border-red-300 bg-red-50/30 dark:border-red-900/50 dark:bg-red-900/10'
                  : 'border-slate-300 dark:border-slate-700'
              )}
            >
              {importError ? (
                <div className="flex flex-col items-center gap-2 text-center max-w-md relative z-20 ph-no-capture">
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                    <Ban className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    {importError}
                  </p>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setImportError(null)
                    }}
                    className="text-xs text-slate-500 hover:text-brand-500 underline cursor-pointer p-2"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <>
                  <motion.div
                    layout
                    className={cn(
                      'bg-slate-100 dark:bg-slate-900 rounded-full group-hover:bg-brand-100 dark:group-hover:bg-brand-900/20 transition-colors',
                      isDropzoneMinimized ? 'p-2' : 'p-3 sm:p-6'
                    )}
                  >
                    <Upload
                      className={cn(
                        'text-slate-400 group-hover:text-brand-500 transition-all',
                        isDropzoneMinimized
                          ? 'w-4 h-4'
                          : 'w-6 h-6 sm:w-10 sm:h-10'
                      )}
                    />
                  </motion.div>
                  <motion.div layout className="text-center ph-no-capture">
                    <p
                      data-testid="dropzone-label"
                      className={cn(
                        'font-bold tracking-tight transition-all',
                        isDropzoneMinimized
                          ? 'text-xs sm:text-sm text-slate-600 dark:text-slate-400'
                          : 'text-lg sm:text-2xl text-slate-800 dark:text-slate-100'
                      )}
                    >
                      {isTouchDevice
                        ? isDropzoneMinimized
                          ? 'Tap to select'
                          : appMode === 'concatenate'
                            ? 'Tap to select folder or files'
                            : 'Tap to select concatenated file'
                        : isDropzoneMinimized
                          ? 'Drop here'
                          : appMode === 'concatenate'
                            ? 'Drop folder or files here'
                            : 'Drop concatenated .txt file here'}
                    </p>
                    {!isDropzoneMinimized && (
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs sm:text-sm text-slate-500 mt-1"
                      >
                        {isTouchDevice
                          ? 'Browse local or cloud storage for your project'
                          : 'or click to browse your file system'}
                      </motion.p>
                    )}
                  </motion.div>
                </>
              )}
            </motion.div>
            {!importError && (
              <input
                ref={fileInputRef}
                // key={appMode} intentionally remounts input when mode changes to reset webkitdirectory attribute
                key={appMode}
                type="file"
                multiple
                {...(appMode === 'concatenate' ? { webkitdirectory: '' } : {})}
                onChange={handleFileUpload}
                className={cn(
                  'ph-no-capture',
                  isTouchDevice
                    ? 'hidden'
                    : 'absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10'
                )}
                disabled={isProcessing}
                title=""
              />
            )}
          </>
        )}
      </div>

      {/* Expansion Toggle Button - Subtle styling to match IgnoreList toggle */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDropzoneMinimized((prev) => !prev)
        }}
        className="absolute -top-2.5 -right-2.5 z-50 p-1.5 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-400 hover:text-brand-500 focus:outline-none"
        title={isDropzoneMinimized ? 'Expand dropzone' : 'Minimize dropzone'}
      >
        {isDropzoneMinimized ? (
          <Maximize2 className="w-4 h-4" />
        ) : (
          <Minimize2 className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}
