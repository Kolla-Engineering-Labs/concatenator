/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'

/**
 * The application footer.
 */
export const Footer: React.FC = () => {
  return (
    <footer className="text-center space-y-4 px-4">
      <div className="space-y-1">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold tracking-wide uppercase opacity-80">
          Built with React & Tailwind
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[9px]">
        {/* Storage Tile */}
        <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800/50 shadow-sm transition-all duration-300">
          <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter text-[7px] mb-0.5">
            Storage
          </span>
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            Local Only
          </span>
        </div>

        {/* License Tile */}
        <a
          href="https://github.com/Kolla-Engineering-Labs/concatenator#Apache-2.0-1-ov-file"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800/50 shadow-sm hover:border-brand-500/50 hover:shadow-md transition-all duration-300 group"
        >
          <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter text-[7px] mb-0.5 group-hover:text-brand-500 transition-colors">
            License
          </span>
          <span className="text-slate-600 dark:text-slate-300 font-medium group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
            Apache 2.0
          </span>
        </a>

        {/* Analytics Tile */}
        <a
          href="https://posthog.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800/50 shadow-sm hover:border-brand-500/50 hover:shadow-md transition-all duration-300 group"
        >
          <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter text-[7px] mb-0.5 group-hover:text-brand-500 transition-colors">
            Analytics
          </span>
          <span className="text-slate-600 dark:text-slate-300 font-medium group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
            PostHog
          </span>
        </a>

        {/* Source Tile */}
        <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800/50 shadow-sm transition-all duration-300">
          <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter text-[7px] mb-0.5">
            Source
          </span>
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            Open Repo
          </span>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800/50 mt-4">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
          © 2026{' '}
          <a
            href="https://github.com/Kolla-Engineering-Labs/concatenator"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
          >
            Kolla Engineering Labs
          </a>
        </p>
      </div>
    </footer>
  )
}
