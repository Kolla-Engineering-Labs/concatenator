import { createContext } from 'react'
import { AppMode, ViewPreference, WorkbenchState } from '../types/workbench'

export interface ModeContextType extends WorkbenchState {
  setMode: (mode: AppMode) => void
  setView: (view: ViewPreference) => void
  setIgnoreList: (tags: string[]) => void
  setSidebarOpen: (isOpen: boolean) => void
  setForceMode: (force: boolean) => void
  resetWorkbench: () => void
}

export const ModeContext = createContext<ModeContextType | undefined>(undefined)
