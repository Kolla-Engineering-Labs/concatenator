export enum AppMode {
  CONCATENATE = 'concatenate',
  DECONCATENATE = 'deconcatenate',
}

export enum ViewPreference {
  TREE = 'tree',
  LIST = 'list',
}

export interface WorkbenchState {
  mode: AppMode
  view: ViewPreference
  ignoreList: string[]
  isSidebarOpen: boolean
  isIgnored: (path: string) => boolean
  compiledIgnores: (string | RegExp)[]
  forceMode: boolean
  virtualFileSystem: Record<string, string>
  tokenBudget: number
  tokenModel: string
  autoSaveIgnore: boolean
  isInitialized: boolean
  showIgnored: boolean
  isExplicitlyNegated: (path: string) => boolean
  shouldRecurse: (path: string) => boolean
  getIgnoreResult: (path: string) => { ignored: boolean; reason?: string }
}
