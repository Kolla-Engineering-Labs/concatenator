/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react'
import { Zap, X } from 'lucide-react'

interface SecurityStatusBadgeProps {
  degradedMode?: boolean
}

export const SecurityStatusBadge: React.FC<SecurityStatusBadgeProps> = ({
  degradedMode = false,
}) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('concatenator_dismiss_legacy_warning') === 'true'
      )
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!degradedMode) {
      setDismissed(false)
    }
  }, [degradedMode])

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissed(true)
    try {
      localStorage.setItem('concatenator_dismiss_legacy_warning', 'true')
    } catch {
      // Ignore localStorage errors
    }
  }

  if (!degradedMode || dismissed) {
    return null
  }

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-bold tracking-tight shadow-sm animate-in fade-in duration-200"
      data-testid="security-status-badge-legacy"
    >
      <div className="flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-amber-500 animate-pulse shrink-0" />
        <span>[⚡ Legacy Payload (Unverified)]</span>
      </div>
      <button
        onClick={handleDismiss}
        className="p-0.5 hover:bg-amber-500/20 rounded transition-colors text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
        title="Dismiss warning"
        aria-label="Dismiss warning"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
