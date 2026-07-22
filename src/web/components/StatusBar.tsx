import React, { useMemo } from 'react'
import { useWorkbench } from '../hooks/useWorkbench'
import { Zap, AlertTriangle } from 'lucide-react'

interface StatusBarProps {
  totalTokens: number
  tokensSaved: number
  isPrecise: boolean
  isConnected?: boolean | null
  wasEverConnected?: boolean
}

const BUDGET_PRESETS = [
  { name: 'GPT-4.1', value: 1047576, model: 'o200k_base' },
  { name: 'GPT-4o', value: 128000, model: 'o200k_base' },
  { name: 'Claude Opus 4', value: 200000, model: 'o200k_base' },
  { name: 'Gemini 2.5 Pro', value: 1048576, model: 'o200k_base' },
]

export const StatusBar: React.FC<StatusBarProps> = ({
  totalTokens,
  tokensSaved,
  isPrecise,
  isConnected,
  wasEverConnected = false,
}) => {
  const { tokenBudget, setTokenBudget, setTokenModel } = useWorkbench()

  const saturation = useMemo(() => {
    if (tokenBudget === 0) return 0
    return (totalTokens / tokenBudget) * 100
  }, [totalTokens, tokenBudget])

  const isOverBudget = tokenBudget > 0 && totalTokens > tokenBudget

  const colorClass = useMemo(() => {
    if (saturation < 70) return 'bg-emerald-500'
    if (saturation < 90) return 'bg-amber-500'
    return isOverBudget ? 'bg-red-500' : 'bg-rose-500'
  }, [saturation, isOverBudget])

  const textColorClass = useMemo(() => {
    if (saturation < 70) return 'text-emerald-600 dark:text-emerald-400'
    if (saturation < 90) return 'text-amber-600 dark:text-amber-400'
    return isOverBudget ? 'text-red-500' : 'text-rose-600 dark:text-rose-400'
  }, [saturation, isOverBudget])

  const [isEditingCustom, setIsEditingCustom] = React.useState(false)

  const handleBudgetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === 'custom') {
      setIsEditingCustom(true)
      return
    }
    setIsEditingCustom(false)
    const preset = BUDGET_PRESETS.find((p) => p.value === Number(val))
    if (preset) {
      setTokenModel(preset.model)
    }
    setTokenBudget(Number(val))
  }

  const showCustom =
    isEditingCustom || !BUDGET_PRESETS.some((p) => p.value === tokenBudget)

  return (
    <div className="min-h-10 py-2 sm:py-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between px-4 z-[60] text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0 gap-3 sm:gap-6 lg:pl-[19rem]">
      {/* Left Side: Stats */}
      <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-center sm:justify-start shrink-0">
        {/* Version */}
        <div
          className="flex items-center gap-1.5 shrink-0 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
          data-testid="status-bar-version"
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300 tabular-nums">
            v{PROCESS_VERSION}
          </span>
        </div>

        {/* Heartbeat indicator — always rendered so it's visible in dev mode too */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          data-testid="heartbeat-indicator"
          title={
            isConnected === null
              ? 'Checking server…'
              : isConnected
                ? 'Server connected'
                : wasEverConnected
                  ? 'Server connection lost'
                  : 'No CLI server'
          }
          aria-label={
            isConnected === null
              ? 'Checking server'
              : isConnected
                ? 'Server connected'
                : wasEverConnected
                  ? 'Server connection lost'
                  : 'No CLI server'
          }
        >
          {isConnected === null && (
            <span className="block h-2 w-2 min-w-[8px] min-h-[8px] rounded-full bg-slate-400 animate-pulse shrink-0" />
          )}
          {isConnected === true && (
            <span className="block h-2 w-2 min-w-[8px] min-h-[8px] rounded-full bg-emerald-500 animate-pulse shrink-0" />
          )}
          {isConnected === false && (
            <span
              className="block h-2 w-2 min-w-[8px] min-h-[8px] rounded-full bg-amber-500 shrink-0"
              data-testid="heartbeat-dot-amber"
            />
          )}
          <span
            className="opacity-60 leading-none"
            data-testid="heartbeat-status"
          >
            {isConnected === null
              ? 'Checking…'
              : isConnected
                ? 'Connected'
                : wasEverConnected
                  ? 'Reconnecting…'
                  : 'No server'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-60">Total Tokens:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-900 dark:text-slate-100 font-bold tabular-nums">
              {!isPrecise && '~'}
              {totalTokens.toLocaleString()}
            </span>
            {isPrecise ? (
              <span
                className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-wider border border-emerald-200/50 dark:border-emerald-500/20 shadow-sm"
                title="BPE Precision Mode (cl100k_base)"
              >
                Precision
              </span>
            ) : (
              <span
                className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-black uppercase tracking-wider border border-amber-200/50 dark:border-amber-500/20 shadow-sm animate-pulse"
                title="Fast Heuristic Mode (estimating...)"
              >
                Heuristic
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-60 text-emerald-600 dark:text-emerald-500/80">
            Tokens Saved:
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
            {tokensSaved.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Center: Progress Bar */}
      <div className="flex-1 w-full max-w-md px-4 sm:px-8 flex items-center gap-3 sm:gap-4">
        {isOverBudget && (
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
        )}
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
          <div
            className={`absolute top-0 left-0 h-full ${
              isOverBudget
                ? 'bg-red-500'
                : `transition-all duration-500 ease-out ${colorClass}`
            }`}
            style={{
              width: isOverBudget ? '100%' : `${Math.min(saturation, 100)}%`,
            }}
          />
        </div>
        <div
          className={`whitespace-nowrap min-w-10 sm:min-w-12 text-right font-bold tabular-nums ${
            isOverBudget ? 'text-red-500' : textColorClass
          }`}
        >
          {isOverBudget
            ? `${totalTokens.toLocaleString()} / ${tokenBudget.toLocaleString()}`
            : `${Math.round(saturation)}%`}
        </div>
      </div>

      {/* Right Side: Budget Selector */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-end">
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-amber-500" />
          <span className="opacity-60">Budget:</span>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5">
          <select
            value={showCustom ? 'custom' : tokenBudget}
            onChange={handleBudgetChange}
            className="bg-transparent border-none focus:ring-0 outline-none cursor-pointer pr-1"
          >
            {BUDGET_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.name}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>

          {showCustom && (
            <input
              type="number"
              value={tokenBudget}
              onChange={(e) => {
                const val = Number(e.target.value)
                setTokenBudget(Math.ceil(Math.abs(val)))
              }}
              onKeyDown={(e) => {
                if (['.', 'e', 'E', '+', '-'].includes(e.key)) {
                  e.preventDefault()
                }
              }}
              min="0"
              step="1"
              className="w-16 bg-transparent border-none focus:ring-0 outline-none text-slate-900 dark:text-slate-100 font-bold no-spinner"
              placeholder="Budget"
            />
          )}
        </div>
      </div>
    </div>
  )
}
