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
    <footer className="text-center space-y-1.5 opacity-60">
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Minimalist File Concatenator &nbsp;•&nbsp; Built with React & Tailwind
      </p>
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[9px] text-slate-400">
        <span
          className="cursor-help"
          title="Your data never leaves this device. Clearing your browser cache will reset the app."
        >
          Storage: Local Only
        </span>
        <span>•</span>
        <a
          href="https://github.com/Kolla-Engineering-Labs/concatenator#Apache-2.0-1-ov-file"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand-500 transition-colors"
        >
          Apache 2.0
        </a>
        <span>•</span>
        <a
          href="https://posthog.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand-500 transition-colors"
        >
          Usage Analytics via PostHog
        </a>
      </div>
      <p className="text-[9px] text-slate-400">
        © 2026{' '}
        <a
          href="https://github.com/Kolla-Engineering-Labs/concatenator"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand-500 transition-colors"
        >
          Kolla Engineering Labs
        </a>
      </p>
    </footer>
  )
}
