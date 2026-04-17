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
          Built with React & Tailwind • Minimalist File Concatenator
        </p>
        <p
          className="text-xs text-slate-400 cursor-help"
          title="Your data never leaves this device. Clearing your browser cache will reset the app."
        >
          ● Storage: Local Only
        </p>
      </div>
    </footer>
  );
};
