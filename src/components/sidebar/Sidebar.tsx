import SourcePanel from './SourcePanel'
import DevicePanel from './DevicePanel'
import BackgroundPanel from './BackgroundPanel'
import OverlayPanel from './OverlayPanel'
import ExportPanel from './ExportPanel'

export type PanelId = 'source' | 'device' | 'background' | 'overlay' | 'export'

interface SidebarProps {
  activePanel: PanelId
}

const panelComponents: Record<PanelId, () => JSX.Element> = {
  source: SourcePanel,
  device: DevicePanel,
  background: BackgroundPanel,
  overlay: OverlayPanel,
  export: ExportPanel
}

export default function Sidebar({ activePanel }: SidebarProps) {
  const ActivePanel = panelComponents[activePanel]

  return (
    <aside
      id="editor-panel"
      role="tabpanel"
      aria-labelledby={`tab-${activePanel}`}
      className="min-h-0 w-[280px] shrink-0 overflow-y-auto border-r border-border bg-white px-4 py-4"
    >
      <ActivePanel />
    </aside>
  )
}
