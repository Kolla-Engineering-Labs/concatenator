import { useMemo } from 'react'
import type { VFSNode } from './useVFS'

export function useTokenBudget(tree: VFSNode | null, budget: number) {
  return useMemo(() => {
    // The Core Engine root node holds the pre-calculated aggregate of all active files
    const currentLoad = tree?.tokenWeight || 0
    const percentage =
      budget > 0 ? Math.min((currentLoad / budget) * 100, 100) : 0

    let statusColor = 'bg-surface-700' // Baseline
    if (percentage >= 100) {
      statusColor = 'bg-accent-rose' // Breach
    } else if (percentage >= 85) {
      statusColor = 'bg-accent-amber' // Warning
    } else if (percentage > 0) {
      statusColor = 'bg-slate-400' // Active
    }

    return { currentLoad, percentage, statusColor }
  }, [tree, budget])
}
