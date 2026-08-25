import { usePersistentState } from '../hooks/usePersistentState'
import { useTokenBudget } from '../hooks/useTokenBudget'
import type { VFSNode } from '../hooks/useVFS'

interface TokenGasGaugeProps {
  tree: VFSNode | null
}

export function TokenGasGauge({ tree }: TokenGasGaugeProps) {
  // Defaulting to 120k tokens (leaves room for system prompts in a 128k context window)
  const [budget, setBudget] = usePersistentState<number>(
    'kel:token_budget',
    120000
  )
  const { currentLoad, percentage, statusColor } = useTokenBudget(tree, budget)

  return (
    <div className="flex flex-col gap-2 p-4 border-b border-surface-700 bg-surface-800 shrink-0 select-none">
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
            Context Load
          </span>
          <span className="text-lg font-mono font-medium tracking-tight text-slate-200">
            {currentLoad.toLocaleString()}{' '}
            <span className="text-xs text-slate-500">tk</span>
          </span>
        </div>

        <div className="flex flex-col items-end">
          <label
            htmlFor="budget-input"
            className="text-[10px] font-mono tracking-widest text-slate-500 uppercase cursor-pointer"
          >
            Budget Ceiling
          </label>
          <div className="flex items-baseline gap-1">
            <input
              id="budget-input"
              type="number"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-20 bg-transparent text-right text-sm font-mono font-medium text-slate-300 focus:outline-none focus:text-accent-amber transition-colors appearance-none"
              step="10000"
              min="0"
            />
            <span className="text-xs font-mono text-slate-500">tk</span>
          </div>
        </div>
      </div>

      {/* The Physical Gas Gauge */}
      <div className="h-1.5 w-full bg-surface-900 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-out ${statusColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
