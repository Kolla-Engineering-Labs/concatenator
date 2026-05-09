/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react'
import { GitMerge, X } from 'lucide-react'
import type { Absorption } from '../../core/reconciler'

interface AbsorptionToastProps {
  absorptions: Absorption[]
  onDismiss: () => void
  /** Auto-dismiss delay in ms. Default: 5000 */
  duration?: number
}

/**
 * Displays a brief root-pruning notification when a dropped folder absorbs
 * previously-loaded child roots.  Positioned top-right to avoid covering
 * the fixed status bar at the bottom.
 */
export const AbsorptionToast: React.FC<AbsorptionToastProps> = ({
  absorptions,
  onDismiss,
  duration = 5000,
}) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (absorptions.length === 0) {
      setVisible(false)
      return
    }

    // Small delay so the enter transition is visible
    const enterTimer = setTimeout(() => setVisible(true), 100)

    const exitTimer = setTimeout(() => {
      setVisible(false)
      // Allow exit transition to finish before unmounting
      setTimeout(onDismiss, 300)
    }, duration)

    return () => {
      clearTimeout(enterTimer)
      clearTimeout(exitTimer)
    }
  }, [absorptions, duration, onDismiss])

  if (absorptions.length === 0) return null

  // Group absorbed children by the parent that swallowed them
  const parentMap = new Map<string, string[]>()
  absorptions.forEach(({ child, parent }) => {
    const list = parentMap.get(parent) || []
    // Show only the final segment of the child path for readability
    list.push(child.split('/').pop() || child)
    parentMap.set(parent, list)
  })

  const lines: string[] = []
  parentMap.forEach((children, parent) => {
    const childrenStr =
      children.length > 3
        ? `${children.slice(0, 3).join(', ')} +${children.length - 3} more`
        : children.join(', ')
    lines.push(`Merged '${childrenStr}' into '${parent}'`)
  })

  const dismiss = () => {
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed top-4 right-4 z-50 max-w-sm',
        'transition-all duration-300 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
      ].join(' ')}
    >
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg shadow-black/10 p-4 flex items-start gap-3">
        {/* Icon */}
        <div className="p-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shrink-0">
          <GitMerge className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
            Root Pruning Applied
          </div>
          {lines.map((line, i) => (
            <p
              key={i}
              className="text-xs text-slate-500 dark:text-slate-400 leading-snug"
            >
              {line}
            </p>
          ))}
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          aria-label="Dismiss notification"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0 mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
