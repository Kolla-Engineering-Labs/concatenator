import { useConcatenationConfig } from '../hooks/useConcatenationConfig'
import type { VFSNode } from '../hooks/useVFS'

interface ExecutionWorkbenchProps {
  tree: VFSNode | null
  onExecute: (
    payload: ReturnType<
      ReturnType<typeof useConcatenationConfig>['getPayloadMatrix']
    >
  ) => Promise<void>
  isExecuting: boolean
}

export function ExecutionWorkbench({
  tree,
  onExecute,
  isExecuting,
}: ExecutionWorkbenchProps) {
  const config = useConcatenationConfig()

  // Handle the execution launch sequence
  const handleLaunch = async () => {
    // The payload matrix is perfectly serialized for the API
    await onExecute(config.getPayloadMatrix())
  }

  const isButtonDisabled = isExecuting || !tree || tree.tokenWeight === 0

  return (
    <div className="flex flex-col h-full bg-surface-900 text-surface-100 font-sans p-6 overflow-y-auto">
      <header className="mb-8 border-b border-surface-700 pb-4">
        <h1 className="text-2xl font-mono tracking-tight font-medium text-slate-200">
          Execution Pipeline
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure KEL Protocol parameters and synthesize the final payload.
        </p>
      </header>

      {/* Configuration Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-4xl">
        {/* Output Format */}
        <div className="flex flex-col gap-2 p-4 bg-surface-800 border border-surface-700 rounded select-none">
          <label className="text-xs font-mono tracking-widest text-slate-400 uppercase">
            Output Format
          </label>
          <div className="flex bg-surface-900 rounded p-1">
            <button
              type="button"
              onClick={() => config.setFormat('markdown')}
              className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${
                config.format === 'markdown'
                  ? 'bg-surface-700 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Markdown
            </button>
            <button
              type="button"
              onClick={() => config.setFormat('xml')}
              className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${
                config.format === 'xml'
                  ? 'bg-surface-700 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              XML / Claude
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Markdown is standard for OpenAI/Gemini. XML structure is heavily
            optimized for Anthropic's Claude models.
          </p>
        </div>

        {/* Security & Token Toggles */}
        <div className="flex flex-col gap-4 p-4 bg-surface-800 border border-surface-700 rounded select-none">
          {/* Neutralization Toggle */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={config.neutralize}
              onChange={(e) => config.setNeutralize(e.target.checked)}
              className="mt-1 accent-accent-amber bg-surface-900 border-surface-700"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-200 group-hover:text-accent-amber transition-colors">
                Safety Neutralization
              </span>
              <span className="text-xs text-slate-500">
                Escapes nested backticks and code blocks to prevent premature
                LLM termination. (Recommended)
              </span>
            </div>
          </label>

          {/* Post-Matter Manifest Toggle */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={config.manifest}
              onChange={(e) => config.setManifest(e.target.checked)}
              className="mt-1 accent-accent-amber bg-surface-900 border-surface-700"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-200 group-hover:text-accent-amber transition-colors">
                Post-Matter Manifest
              </span>
              <span className="text-xs text-slate-500">
                Appends the dense pipe-delimited VFS map at EOF.
              </span>
            </div>
          </label>

          {/* Strip Comments Toggle */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={config.stripComments}
              onChange={(e) => config.setStripComments(e.target.checked)}
              className="mt-1 accent-accent-amber bg-surface-900 border-surface-700"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-200 group-hover:text-accent-amber transition-colors">
                Strip Comments
              </span>
              <span className="text-xs text-slate-500">
                Aggressively removes code comments to reduce token weight.
              </span>
            </div>
          </label>
        </div>
      </section>

      {/* The Launch Sequence */}
      <section className="flex flex-col gap-4 max-w-4xl border-t border-surface-700 pt-8 mt-auto">
        <button
          type="button"
          onClick={handleLaunch}
          disabled={isButtonDisabled}
          className={`py-4 px-8 text-lg font-mono font-bold tracking-widest rounded transition-all flex items-center justify-center gap-3 ${
            isButtonDisabled
              ? 'bg-surface-800 text-surface-700 cursor-not-allowed border border-surface-700'
              : 'bg-accent-amber text-surface-900 hover:bg-yellow-400 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]'
          }`}
        >
          {isExecuting ? (
            <>
              <span className="animate-spin">⚙</span> SYNTHESIZING...
            </>
          ) : (
            'EXECUTE CONCATENATION'
          )}
        </button>
        <p className="text-center text-xs text-slate-500 font-mono uppercase tracking-widest">
          Payload will be copied to system clipboard
        </p>
      </section>
    </div>
  )
}
