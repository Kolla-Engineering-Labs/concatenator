import type { ReactNode } from 'react'

interface WorkbenchLayoutProps {
  sidebar: ReactNode
  content: ReactNode
}

export function WorkbenchLayout({ sidebar, content }: WorkbenchLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-900 text-surface-100">
      <aside className="w-80 flex-shrink-0 border-r border-surface-700 bg-surface-800 overflow-y-auto">
        {sidebar}
      </aside>
      <main className="flex-1 overflow-auto bg-surface-900 flex flex-col">
        {content}
      </main>
    </div>
  )
}
