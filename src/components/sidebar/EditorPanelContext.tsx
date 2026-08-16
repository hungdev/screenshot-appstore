import { createContext, useContext, useState, type ReactNode } from 'react'
import type { PanelId } from './Sidebar'

interface EditorPanelContextValue {
  activePanel: PanelId
  setActivePanel: (panel: PanelId) => void
}

const EditorPanelContext = createContext<EditorPanelContextValue | null>(null)

export function EditorPanelProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<PanelId>('device')

  return (
    <EditorPanelContext.Provider value={{ activePanel, setActivePanel }}>
      {children}
    </EditorPanelContext.Provider>
  )
}

export function useEditorPanel() {
  const context = useContext(EditorPanelContext)
  if (!context) throw new Error('useEditorPanel must be used within EditorPanelProvider')
  return context
}
