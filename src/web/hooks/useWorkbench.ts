import { useContext } from 'react'
import { ModeContext } from '../context/ModeContextCore'

export const useWorkbench = () => {
  const context = useContext(ModeContext)
  if (!context)
    throw new Error('useWorkbench must be used within a ModeProvider')
  return context
}
