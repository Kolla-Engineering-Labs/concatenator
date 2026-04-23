/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import {
  X,
  FileCode,
  Copy,
  Check,
  Image as ImageIcon,
  FileText,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { FileItem } from '../../../../core/types'
import { isImageFile, isPdfFile, cn } from '../../../../lib/utils'

interface QuickLookProps {
  file: FileItem | null
  onClose: () => void
}

export const QuickLook: React.FC<QuickLookProps> = ({ file, onClose }) => {
  const [copied, setCopied] = React.useState(false)

  const content = React.useMemo(() => {
    if (!file || !file.content) return ''
    if (typeof file.content === 'string') return file.content
    return 'Binary content'
  }, [file])

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <AnimatePresence>
      {file && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              'relative w-full max-h-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden',
              isPdfFile(file.name) ? 'max-w-5xl h-[90vh]' : 'max-w-4xl'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-lg">
                  {isPdfFile(file.name) ? (
                    <FileText className="w-5 h-5" />
                  ) : isImageFile(file.name) ? (
                    <ImageIcon className="w-5 h-5" />
                  ) : (
                    <FileCode className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate ph-no-capture">
                    {file.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 truncate font-mono ph-no-capture">
                    {file.path}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isImageFile(file.name) && !isPdfFile(file.name) && (
                  <button
                    onClick={handleCopy}
                    className="p-2 text-slate-400 hover:text-brand-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                    title="Copy content"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-0 bg-slate-50 dark:bg-slate-950/50 flex custom-scrollbar">
              {isPdfFile(file.name) ? (
                <div className="flex-1 h-full bg-slate-100 dark:bg-slate-900/30">
                  {typeof content === 'string' &&
                  content.startsWith('data:application/pdf') ? (
                    <iframe
                      src={content}
                      title={file.name}
                      className="w-full h-full border-none"
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-12">
                      <div className="flex flex-col items-center gap-4 p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg">
                        <FileText className="w-12 h-12 text-slate-300" />
                        <div className="text-center">
                          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                            PDF Preview Unavailable
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                            Please re-upload this PDF to enable visualization.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : isImageFile(file.name) ? (
                <div
                  className="flex-1 flex items-center justify-center p-8 min-h-[400px] dark:[--checker-color:rgba(255,255,255,0.05)]"
                  style={
                    {
                      backgroundImage: `
                      linear-gradient(45deg, var(--checker-color) 25%, transparent 25%),
                      linear-gradient(-45deg, var(--checker-color) 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, var(--checker-color) 75%),
                      linear-gradient(-45deg, transparent 75%, var(--checker-color) 75%)
                    `,
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                      '--checker-color': 'rgba(0,0,0,0.05)',
                    } as React.CSSProperties
                  }
                >
                  <div className="relative group/img w-full h-full flex items-center justify-center">
                    {(() => {
                      const isDataUrl =
                        typeof content === 'string' &&
                        content.startsWith('data:')
                      const isSvgText =
                        typeof content === 'string' &&
                        content.trim().startsWith('<svg')
                      const isSvg = file.name.toLowerCase().endsWith('.svg')

                      const displaySrc = isSvgText
                        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
                        : content

                      if (isDataUrl || isSvgText) {
                        if (isSvg) {
                          try {
                            let svgHtml = ''
                            if (isSvgText) {
                              svgHtml = content
                            } else {
                              // Use TextDecoder for robust UTF-8 base64 decoding
                              const base64Data = content.split(',')[1]
                              if (base64Data) {
                                const binaryString = atob(base64Data)
                                const bytes = new Uint8Array(
                                  binaryString.length
                                )
                                for (let i = 0; i < binaryString.length; i++) {
                                  bytes[i] = binaryString.charCodeAt(i)
                                }
                                svgHtml = new TextDecoder().decode(bytes)
                              }
                            }

                            if (svgHtml) {
                              // Strip existing class attribute from the <svg> tag to prevent it from overriding our workbench styles
                              svgHtml = svgHtml.replace(
                                /<svg([^>]*)class="[^"]*"([^>]*)>/i,
                                '<svg$1$2>'
                              )

                              return (
                                <div
                                  className="max-w-full max-h-full flex items-center justify-center ph-no-capture transition-transform duration-300 group-hover/img:scale-[1.02] [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-[70vw] [&>svg]:max-h-[60vh] [&>svg]:min-w-[64px] [&>svg]:min-h-[64px] [&>svg]:block [&>svg]:mx-auto"
                                  dangerouslySetInnerHTML={{ __html: svgHtml }}
                                />
                              )
                            }
                          } catch (err) {
                            console.error('SVG decoding failed:', err)
                            // Fallback to standard img tag if decoding fails
                          }
                        }
                        return (
                          <img
                            src={displaySrc}
                            alt={file.name}
                            className="max-w-full max-h-[70vh] rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 transition-transform duration-300 group-hover/img:scale-[1.02]"
                          />
                        )
                      }
                      return (
                        <div className="flex flex-col items-center gap-4 p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg">
                          <ImageIcon className="w-12 h-12 text-slate-300" />
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                              Preview Unavailable
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                              {isSvg
                                ? 'This SVG content appears to be invalid or incomplete.'
                                : 'Please re-upload this file to enable image visualization.'}
                            </p>
                          </div>
                        </div>
                      )
                    })()}
                    <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-black/10 dark:ring-white/10 pointer-events-none" />
                  </div>
                </div>
              ) : (
                <>
                  {/* Line Numbers */}
                  {content && (
                    <div className="py-4 px-3 text-right bg-slate-100/50 dark:bg-slate-900/30 border-r border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-400/60 select-none min-w-[3.5rem]">
                      {content.split('\n').map((_, i) => (
                        <div key={i} className="h-5">
                          {i + 1}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Code */}
                  <div className="flex-1 p-4 overflow-x-auto">
                    <pre className="text-[13px] font-mono leading-5 text-slate-700 dark:text-slate-300 ph-no-capture">
                      <code>{content || '// No content available'}</code>
                    </pre>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center px-4">
              <span className="text-[10px] text-slate-400 font-mono">
                {isPdfFile(file.name)
                  ? 'PDF Document'
                  : isImageFile(file.name)
                    ? 'Image Preview'
                    : `${content.length.toLocaleString()} characters`}
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:opacity-90 transition-all"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
