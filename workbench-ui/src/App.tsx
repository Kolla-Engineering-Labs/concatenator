import { WorkbenchLayout } from './components/WorkbenchLayout'
import { VFSTreeRoot } from './components/VFSTree'
import { TokenGasGauge } from './components/TokenGasGauge'
import { useVFS } from './hooks/useVFS'

function App() {
  const { tree, isLoading, toggleIgnore } = useVFS()

  return (
    <WorkbenchLayout
      sidebar={
        <>
          <TokenGasGauge tree={tree} />
          <VFSTreeRoot
            tree={tree}
            isLoading={isLoading}
            onToggleIgnore={(path) => toggleIgnore([path])}
          />
        </>
      }
      content={
        // Placeholder for the preview/configuration pane
        <div className="flex items-center justify-center h-full text-surface-700 text-2xl font-mono tracking-widest">
          [ KEL PROTOCOL :: WORKBENCH INITIALIZED ]
        </div>
      }
    />
  )
}

export default App
