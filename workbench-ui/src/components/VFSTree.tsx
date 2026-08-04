import type { VFSNode } from '../hooks/useVFS'
import { usePersistentState } from '../hooks/usePersistentState'

interface VFSTreeProps {
  tree: VFSNode | null
  isLoading: boolean
  onToggleIgnore: (path: string) => void
}

export function VFSTreeRoot({ tree, isLoading, onToggleIgnore }: VFSTreeProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-xs font-mono text-surface-700 animate-pulse">
        Scanning topological boundaries...
      </div>
    )
  }

  if (!tree) {
    return (
      <div className="p-4 text-xs font-mono text-accent-rose">
        VFS payload empty or unreachable.
      </div>
    )
  }

  return (
    <div className="flex flex-col font-sans select-none pb-8">
      {/* Skip rendering the artificial 'root' node and render its children directly */}
      {tree.children?.map((child) => (
        <VFSNodeRenderer
          key={child.path}
          node={child}
          depth={0}
          onToggleIgnore={onToggleIgnore}
        />
      ))}
    </div>
  )
}

interface VFSNodeRendererProps {
  node: VFSNode
  depth: number
  onToggleIgnore: (path: string) => void
}

function VFSNodeRenderer({
  node,
  depth,
  onToggleIgnore,
}: VFSNodeRendererProps) {
  if (node.kind === 'directory') {
    return (
      <VFSDirectoryNode
        node={node}
        depth={depth}
        onToggleIgnore={onToggleIgnore}
      />
    )
  }
  return (
    <VFSFileNode node={node} depth={depth} onToggleIgnore={onToggleIgnore} />
  )
}

/* -------------------------------------------------------------------------- */
/* DIRECTORY NODE                                                             */
/* -------------------------------------------------------------------------- */

function VFSDirectoryNode({
  node,
  depth,
  onToggleIgnore,
}: VFSNodeRendererProps) {
  // Persist expansion state per-directory path
  const [isExpanded, setIsExpanded] = usePersistentState<boolean>(
    `vfs:expanded:${node.path}`,
    false
  )

  const isIgnored = node.isIgnored
  const paddingLeft = `${depth * 12 + 8}px` // Indentation math

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center justify-between py-1 pr-2 hover:bg-surface-700 group cursor-pointer text-sm transition-colors ${
          isIgnored ? 'opacity-40' : 'text-slate-200'
        }`}
        style={{ paddingLeft }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-surface-700 text-xs w-4 text-center">
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="truncate font-medium">{node.name}/</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Token aggregate for the directory */}
          {!isIgnored && node.tokenWeight !== undefined && (
            <span className="text-[10px] font-mono text-slate-500">
              {node.tokenWeight.toLocaleString()} tk
            </span>
          )}

          {/* Direct Manipulation: Ignore Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation() // Prevent directory expansion when toggling
              onToggleIgnore(node.path)
            }}
            className="text-surface-700 hover:text-accent-amber opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"
            title={isIgnored ? 'Restore path' : 'Add to .concatenate-ignore'}
          >
            {isIgnored ? '◎' : '👁'}
          </button>
        </div>
      </div>

      {/* Recursive Children Rendering */}
      {isExpanded && node.children && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <VFSNodeRenderer
              key={child.path}
              node={child}
              depth={depth + 1}
              onToggleIgnore={onToggleIgnore}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* FILE NODE                                                                  */
/* -------------------------------------------------------------------------- */

function VFSFileNode({ node, depth, onToggleIgnore }: VFSNodeRendererProps) {
  const isIgnored = node.isIgnored
  const paddingLeft = `${depth * 12 + 24}px` // Offset to align with folder text

  return (
    <div
      className={`flex items-center justify-between py-1 pr-2 hover:bg-surface-700 group cursor-default text-sm transition-colors ${
        isIgnored
          ? 'opacity-40 line-through decoration-surface-700'
          : 'text-slate-300'
      }`}
      style={{ paddingLeft }}
    >
      <div className="flex items-center gap-2 truncate">
        <span className="text-surface-700 text-xs">📄</span>
        <span className="truncate">{node.name}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Precise Token Weight */}
        {!isIgnored && node.tokenWeight !== undefined && (
          <span
            className={`text-[10px] font-mono ${node.isPrecise ? 'text-accent-amber' : 'text-slate-500'}`}
            title={
              node.isPrecise
                ? 'Precise O200k Tokenization'
                : 'Heuristic Estimate'
            }
          >
            {node.tokenWeight.toLocaleString()} tk
          </span>
        )}

        {/* Direct Manipulation: Ignore Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleIgnore(node.path)
          }}
          className="text-surface-700 hover:text-accent-rose opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"
          title={isIgnored ? 'Restore file' : 'Add to .concatenate-ignore'}
        >
          {isIgnored ? '◎' : '👁'}
        </button>
      </div>
    </div>
  )
}
