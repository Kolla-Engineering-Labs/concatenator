import { useState } from 'react'
import { WorkbenchLayout } from './components/WorkbenchLayout'
import { VFSTreeRoot } from './components/VFSTree'
import { TokenGasGauge } from './components/TokenGasGauge'
import { ExecutionWorkbench } from './components/ExecutionWorkbench'
import { useVFS } from './hooks/useVFS'
import type { ConcatenationConfig } from './hooks/useConcatenationConfig'

function App() {
  const { tree, isLoading, toggleIgnore } = useVFS()
  const [isExecuting, setIsExecuting] = useState(false)

  const handleExecution = async (payloadMatrix: ConcatenationConfig) => {
    setIsExecuting(true)
    try {
      // TODO: Wire up the POST /api/concatenate API client call
      console.log('KEL Protocol Execution:', payloadMatrix)
      // Simulate network latency for UI testing
      await new Promise((resolve) => setTimeout(resolve, 800))
    } finally {
      setIsExecuting(false)
    }
  }

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
        <ExecutionWorkbench
          tree={tree}
          onExecute={handleExecution}
          isExecuting={isExecuting}
        />
      }
    />
  )
}

export default App
