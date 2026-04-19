/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * The application footer.
 */
export const Footer: React.FC = () => {
  return (
    <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-slate-200 dark:border-slate-800">
      <div className="flex flex-col items-center space-y-2">
        <p className="text-center text-sm text-slate-400">
          Minimalist File Concatenator &nbsp;•&nbsp; Built with React & Tailwind
        </p>
        <p>
        <span
          className="text-xs text-slate-400 cursor-help"
          title="Your data never leaves this device. Clearing your browser cache will reset the app."
        >
          Storage: Local Only
        </span>
        <span className="text-sm text-slate-400">&nbsp; • &nbsp;</span>
         <a href="https://github.com/Kolla-Engineering-Labs/concatenator#Apache-2.0-1-ov-file" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-brand-500 transition-colors">
          Apache 2.0
         </a>
        <span className="text-sm text-slate-400">&nbsp; • &nbsp;</span>
         <a href="https://posthog.com" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-brand-500 transition-colors">
          Usage Analytics: Privacy-Preserving & Anonymous via PostHog
         </a>
         </p>
        <p className="text-xs text-slate-400">
          © 2026 <a href="https://github.com/Kolla-Engineering-Labs/concatenator" target="_blank" rel="noopener noreferrer" className="hover:text-brand-500 transition-colors">Kolla Engineering Labs</a>
        </p>
      </div>
    </footer>
  );
};
