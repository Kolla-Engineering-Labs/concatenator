import React from 'react'

export const SessionExpiredModal: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-white">
            Session Expired
          </h2>
          <p className="mb-8 text-zinc-400 leading-relaxed">
            The server connection has been lost or the session has timed out due
            to inactivity. Any unsaved changes may be lost.
          </p>

          <div className="space-y-4">
            <div className="rounded-lg bg-zinc-800/50 p-4 border border-zinc-700/50">
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">
                Restart Instructions:
              </h3>
              <code className="text-xs text-zinc-500 font-mono">
                concatenator --ui
              </code>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-black transition-all hover:bg-zinc-200 active:scale-[0.98]"
            >
              Attempt Reconnect
            </button>
          </div>
        </div>

        <div className="bg-zinc-800/30 px-8 py-4 border-t border-zinc-800">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold text-center">
            Concatenator Workbench &bull; System Lifecycle
          </p>
        </div>
      </div>
    </div>
  )
}
