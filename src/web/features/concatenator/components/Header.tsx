/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { Sun, Moon } from 'lucide-react'
import { ConcatenatorLogo } from './ConcatenatorLogo'

interface HeaderProps {
  isDarkMode: boolean
  setIsDarkMode: (isDark: boolean) => void
  compact?: boolean
}

/**
 * The application header containing the logo and global actions.
 */
export const Header: React.FC<HeaderProps> = ({
  isDarkMode,
  setIsDarkMode,
  compact = false,
}) => {
  return (
    <header
      className={`${compact ? '' : 'sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800'}`}
    >
      <div
        className={`${compact ? 'flex items-center justify-between' : 'max-w-4xl mx-auto px-6 py-4 flex items-center justify-between'}`}
      >
        <div className="flex items-center gap-3">
          <ConcatenatorLogo
            className={compact ? 'h-6 w-auto' : 'h-12 w-auto'}
          />
          <h1
            className={`${compact ? 'text-base' : 'text-xl'} font-display font-bold tracking-tight`}
          >
            Concatenator
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
            tabIndex={0}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
