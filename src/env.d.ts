/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Canvas export functions attached to window by CanvasStage.tsx
type CanvasExportFn = (
  widthOrRatio?: number,
  targetHeight?: number,
  deviceId?: string
) => string | null | Promise<string | null>

type CanvasPanelExportFn = (
  pixelRatio?: number,
  targetWidth?: number,
  targetHeight?: number
) => Array<{ id: string; dataURL: string }> | Promise<Array<{ id: string; dataURL: string }>>

interface Window {
  __canvasExport?: CanvasExportFn
  __canvasExportPanels?: CanvasPanelExportFn
  __canvasExportMime?: string
  __canvasStage?: unknown
}
