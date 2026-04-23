import React, { Suspense, lazy } from 'react'
import { PanelLeftClose } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Header } from '../features/concatenator/components/Header'
import { Footer } from '../features/concatenator/components/Footer'
import { ModeSwitch } from './ModeSwitch'
import { useWorkbench } from '../hooks/useWorkbench'
import { AppMode } from '../types/workbench'

// Lazy load IgnoreList as in App.tsx
const IgnoreList = lazy(() =>
  import('../features/concatenator/components/IgnoreList').then((m) => ({
    default: m.IgnoreList,
  }))
)

interface SidebarProps {
  isDarkMode: boolean
  setIsDarkMode: (isDark: boolean) => void
  maxFileLimit: number
  setMaxFileLimit: (limit: number) => void
  isIgnoreListMinimized: boolean
  setIsIgnoreListMinimized: (minimized: boolean) => void
  newIgnoreItem: string
  setNewIgnoreItem: (item: string) => void
  ignoredTokens?: number
  ignoredIsPrecise?: boolean
}

export const Sidebar: React.FC<SidebarProps> = ({
  isDarkMode,
  setIsDarkMode,
  maxFileLimit,
  setMaxFileLimit,
  isIgnoreListMinimized,
  setIsIgnoreListMinimized,
  newIgnoreItem,
  setNewIgnoreItem,
  ignoredTokens,
  ignoredIsPrecise,
}) => {
  const {
    mode: appMode,
    isSidebarOpen,
    setSidebarOpen,
    forceMode,
    setForceMode,
    ignoreList,
    addIgnorePattern,
    removeIgnorePattern,
  } = useWorkbench()

  return (
    <aside
      className={cn(
        'fixed lg:relative inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform flex flex-col h-screen shrink-0',
        isSidebarOpen
          ? 'translate-x-0'
          : '-translate-x-full invisible lg:visible lg:translate-x-0'
      )}
    >
      {/* Sidebar Header */}
      <div className="p-6 flex items-center justify-between shrink-0">
        <Header
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          compact={true}
        />
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title="Close menu"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      </div>

      {/* Sidebar Navigation / Scrollable Area */}
      <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
            Work Mode
          </label>
          <ModeSwitch />
        </div>

        {appMode === AppMode.CONCATENATE && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="max-file-limit"
                className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2"
              >
                Performance
              </label>
              <div className="px-2">
                <select
                  id="max-file-limit"
                  value={maxFileLimit}
                  onChange={(e) =>
                    setMaxFileLimit(parseInt(e.target.value, 10))
                  }
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="500">500 files</option>
                  <option value="1000">1,000 files</option>
                  <option value="2500">2,500 files</option>
                  <option value="5000">5,000 files</option>
                  <option value="10000">10,000 files</option>
                  <option value="20000">20,000 files</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {appMode === AppMode.DECONCATENATE && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Safety Settings
              </label>
              <div className="px-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={forceMode}
                      onChange={(e) => setForceMode(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600 rounded-full"></div>
                  </div>
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:text-slate-900 dark:group-hover:text-slate-200">
                    Force Overwrite
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <Suspense
            fallback={
              <div className="h-20 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-xl" />
            }
          >
            <IgnoreList
              ignoreList={ignoreList}
              isIgnoreListMinimized={isIgnoreListMinimized}
              setIsIgnoreListMinimized={setIsIgnoreListMinimized}
              newIgnoreItem={newIgnoreItem}
              setNewIgnoreItem={setNewIgnoreItem}
              ignoredTokens={ignoredTokens}
              ignoredIsPrecise={ignoredIsPrecise}
              addIgnoreItem={() => {
                if (newIgnoreItem) {
                  addIgnorePattern(newIgnoreItem)
                }
                setNewIgnoreItem('')
              }}
              removeIgnoreItem={(item) => {
                removeIgnorePattern(item)
              }}
            />
          </Suspense>
        </div>
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <Footer />
      </div>
    </aside>
  )
}
