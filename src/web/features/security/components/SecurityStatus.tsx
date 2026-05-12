import React, { useState, useEffect } from 'react'
import {
  Shield,
  ChevronDown,
  ChevronUp,
  Terminal,
  Copy,
  Check,
} from 'lucide-react'
import { ApiClient } from '../../../services/ApiClient'

export const SecurityStatus: React.FC = () => {
  const [info, setInfo] = useState<{
    version: string
    buildHash: string
    fingerprint: string
  } | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    ApiClient.getSecurityInfo()
      .then(setInfo)
      .catch(() => {})
  }, [])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!info) return null

  return (
    <div className="mt-4 px-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-brand-500 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Security Center
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              Verified Build
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Build Integrity Hash (SHA-256)
              </label>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                <code className="text-[10px] text-slate-600 dark:text-slate-300 break-all font-mono flex-1">
                  {info.buildHash}
                </code>
                <button
                  onClick={() => copyToClipboard(info.buildHash, 'hash')}
                  className="p-1 hover:text-brand-500 text-slate-400"
                >
                  {copied === 'hash' ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Architect PGP Fingerprint
              </label>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                <code className="text-[10px] text-slate-600 dark:text-slate-300 font-mono flex-1">
                  {info.fingerprint}
                </code>
                <button
                  onClick={() => copyToClipboard(info.fingerprint, 'pgp')}
                  className="p-1 hover:text-brand-500 text-slate-400"
                >
                  {copied === 'pgp' ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400 mb-2">
              <Terminal className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                How to Verify
              </span>
            </div>
            <div className="space-y-2">
              <div className="bg-slate-950 p-3 rounded-lg overflow-x-auto">
                <pre className="text-[9px] text-emerald-400 font-mono leading-relaxed">
                  {`# 1. Verify GPG Signature\ngpg --verify SHA256SUMS.asc\n\n# 2. Check Binary Hash\nshasum -a 256 /path/to/concatenator\n\n# 3. Match against manifest\ngrep "$(shasum -a 256 /path/to/concatenator)" SHA256SUMS`}
                </pre>
              </div>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-normal">
                Compare the build hash above with the signed manifest from our
                official repository to ensure your local binary has not been
                tampered with.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
