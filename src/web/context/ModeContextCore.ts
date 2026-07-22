import { createContext, Dispatch, SetStateAction } from 'react'
import { AppMode, ViewPreference, WorkbenchState } from '../types/workbench'
import { HydratedFile } from '../../core/VFSHydrator'

export interface ModeContextType extends WorkbenchState {
  setMode: (mode: AppMode) => void
  setView: (view: ViewPreference) => void
  setIgnoreList: Dispatch<SetStateAction<string[]>>
  setSidebarOpen: Dispatch<SetStateAction<boolean>>
  setForceMode: Dispatch<SetStateAction<boolean>>
  setVirtualFileSystem: Dispatch<SetStateAction<Record<string, string>>>
  setTokenBudget: (budget: number) => void
  setTokenModel: (model: string) => void
  addIgnorePattern: (pattern: string) => void
  removeIgnorePattern: (pattern: string) => void
  resetWorkbench: () => void
  setAutoSaveIgnore: Dispatch<SetStateAction<boolean>>
  setShowIgnored: Dispatch<SetStateAction<boolean>>
  hydrateFiles: (paths: string[]) => Map<string, HydratedFile>
}

export const ModeContext = createContext<ModeContextType | undefined>(undefined)
