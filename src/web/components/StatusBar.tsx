import React, { useMemo } from 'react'
import { useWorkbench } from '../hooks/useWorkbench'
import { Zap } from 'lucide-react'

interface StatusBarProps {
  totalTokens: number
  tokensSaved: number
  isPrecise: boolean
}

const BUDGET_PRESETS = [
  { name: 'GPT-4o', value: 128000 },
  { name: 'Claude 3.5', value: 200000 },
  { name: 'Gemini 1.5', value: 1000000 },
]

export const StatusBar: React.FC<StatusBarProps> = ({
  totalTokens,
  tokensSaved,
  isPrecise,
}) => {
  const { tokenBudget, setTokenBudget } = useWorkbench()

  const saturation = useMemo(() => {
    if (tokenBudget === 0) return 0
    return (totalTokens / tokenBudget) * 100
  }, [totalTokens, tokenBudget])

  const colorClass = useMemo(() => {
    if (saturation < 70) return 'bg-emerald-500'
    if (saturation < 90) return 'bg-amber-500'
    return 'bg-rose-500'
  }, [saturation])

  const textColorClass = useMemo(() => {
    if (saturation < 70) return 'text-emerald-600 dark:text-emerald-400'
    if (saturation < 90) return 'text-amber-600 dark:text-amber-400'
    return 'text-rose-600 dark:text-rose-400'
  }, [saturation])

  const [isEditingCustom, setIsEditingCustom] = React.useState(false)

  const handleBudgetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === 'custom') {
      setIsEditingCustom(true)
      return
    }
    setIsEditingCustom(false)
    setTokenBudget(Number(val))
  }

  const showCustom =
    isEditingCustom || !BUDGET_PRESETS.some((p) => p.value === tokenBudget)

  return (
    <div className="fixed bottom-0 left-0 right-0 h-10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-40 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
      {/* Left Side: Stats */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="opacity-60">Total Tokens:</span>
          <span className="text-slate-900 dark:text-slate-100 font-bold tabular-nums">
            {totalTokens.toLocaleString()}
            {!isPrecise && <span className="ml-1 text-slate-400">~</span>}
          </span>
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
      <div className="flex-1 max-w-md px-8 flex items-center gap-4">
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
          <div
            className={`absolute top-0 left-0 h-full transition-all duration-500 ease-out ${colorClass}`}
            style={{ width: `${Math.min(saturation, 100)}%` }}
          />
        </div>
        <div
          className={`w-12 text-right font-bold tabular-nums ${textColorClass}`}
        >
          {Math.round(saturation)}%
        </div>
      </div>

      {/* Right Side: Budget Selector */}
      <div className="flex items-center gap-3">
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
