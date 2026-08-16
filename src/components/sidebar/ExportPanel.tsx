import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { toast } from '../layout/Toaster'
import { exportPacks } from '../../lib/exportPacks'
import { useCanvasStore } from '../../store/useCanvasStore'

interface RenderedExport {
  dataURL: string
  filename: string
  format: 'png' | 'webp'
}

async function saveExport(dataURL: string, filename: string, format: 'png' | 'webp') {
  const base64 = dataURL.replace(/^data:image\/\w+;base64,/, '')
  if (window.frameup?.export?.png) {
    return window.frameup.export.png({ base64, filename, format })
  }

  // The Vite/web preview does not have Electron's preload bridge. Keep export
  // useful there by downloading the exact same rendered file in the browser.
  const link = document.createElement('a')
  link.href = dataURL
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  return { success: true }
}

async function saveBatchExports(exports: RenderedExport[]) {
  if (window.frameup?.export?.batch) {
    return window.frameup.export.batch(exports.map(({ dataURL, filename, format }) => ({
      base64: dataURL.replace(/^data:image\/\w+;base64,/, ''),
      filename,
      format
    })))
  }

  // Browser fallback: use the File System Access API when available so all
  // panels land in the same folder instead of relying on browser downloads.
  const browserWindow = window as Window & {
    showDirectoryPicker?: () => Promise<{
      getFileHandle: (name: string, options: { create: boolean }) => Promise<{
        createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
      }>
    }>
  }
  if (browserWindow.showDirectoryPicker) {
    try {
      const directory = await browserWindow.showDirectoryPicker()
      for (const item of exports) {
        const file = await directory.getFileHandle(item.filename, { create: true })
        const writable = await file.createWritable()
        const blob = await (await fetch(item.dataURL)).blob()
        await writable.write(blob)
        await writable.close()
      }
      return { success: true }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, error: 'Cancelled' }
      }
      return { success: false, error: error instanceof Error ? error.message : 'Could not save exported panels' }
    }
  }

  // Last-resort fallback for browsers without a directory picker. Trigger
  // downloads sequentially; simultaneous downloads are commonly blocked.
  for (const item of exports) {
    const link = document.createElement('a')
    link.href = item.dataURL
    link.download = item.filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    await new Promise((resolve) => window.setTimeout(resolve, 150))
  }
  return { success: true }
}

export default function ExportPanel() {
  const [exporting, setExporting] = useState(false)
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  const [selectedSizes, setSelectedSizes] = useState<Set<number>>(new Set())
  const [batchExporting, setBatchExporting] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [customWidth, setCustomWidth] = useState('1242')
  const [customHeight, setCustomHeight] = useState('2688')
  const [customExporting, setCustomExporting] = useState(false)
  const { outputWidth, outputHeight, boxes, setOutputDimensions } = useCanvasStore()

  const [format, setFormat] = useState<'png' | 'webp'>('png')

  useEffect(() => {
    setCustomWidth(String(outputWidth))
    setCustomHeight(String(outputHeight))
  }, [outputWidth, outputHeight])

  const setExportMime = (fmt: 'png' | 'webp') => {
    window.__canvasExportMime = fmt === 'webp' ? 'image/webp' : 'image/png'
  }

  const getCanvasExport = () => window.__canvasExport
  const getCanvasPanelExport = () => window.__canvasExportPanels

  const applyCustomSizeToCanvas = () => {
    const width = Number.parseInt(customWidth, 10)
    const height = Number.parseInt(customHeight, 10)
    if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) {
      setOutputDimensions(width, height)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const exportFn = getCanvasExport()
      if (!exportFn) {
        toast.error('No canvas to export')
        setExporting(false)
        return
      }

      setExportMime(format)
      if (boxes.length > 1) {
        const panelExportFn = getCanvasPanelExport()
        if (!panelExportFn) throw new Error('Panel exporter is not ready')
        const panels = await panelExportFn(2)
        if (panels.length !== boxes.length || panels.some((panel) => !panel.dataURL)) {
          throw new Error('Could not render every panel')
        }
        const result = await saveBatchExports(panels.map((panel, index) => ({
          dataURL: panel.dataURL,
          filename: `frameup-panel-${String(index + 1).padStart(2, '0')}.${format}`,
          format
        })))
        if (!result.success) {
          if (result.error !== 'Cancelled') toast.error(result.error ?? 'Export failed')
        } else {
          toast.success(`Exported ${panels.length} panels`)
        }
        setExporting(false)
        return
      }
      const dataURL = exportFn(2)
      if (!dataURL) {
        toast.error('Export failed — canvas is empty')
        setExporting(false)
        return
      }

      const result = await saveExport(
        dataURL as string,
        `frameup-export-${Date.now()}.${format}`,
        format
      )

      if (!result.success) {
        if (result.error !== 'Cancelled') toast.error(result.error ?? 'Export failed')
      } else {
        toast.success('Exported successfully')
      }
    } catch (error) {
      console.error('Panel export failed', error)
      toast.error(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed')
    }
    setExporting(false)
  }

  const handleBatchExport = async () => {
    const pack = exportPacks.find((p) => p.id === selectedPack)
    if (!pack) return

    const sizes = pack.sizes.filter((_, i) => selectedSizes.has(i))
    if (sizes.length === 0) {
      toast.error('Select at least one size')
      return
    }

    setBatchExporting(true)
    setBatchProgress({ current: 0, total: sizes.length })

    try {
      const exportFn = getCanvasExport()
      if (!exportFn) {
        toast.error('No canvas to export')
        setBatchExporting(false)
        return
      }

      // Generate exports at each target size (async for device overrides)
      setExportMime(format)
      const jobs: RenderedExport[] = []
      for (let i = 0; i < sizes.length; i++) {
        const size = sizes[i]
        setBatchProgress({ current: i + 1, total: sizes.length })
        if (boxes.length > 1) {
          const panelExportFn = getCanvasPanelExport()
          if (!panelExportFn) throw new Error('Panel exporter is not ready')
          const panels = await panelExportFn(1, size.width, size.height)
          if (panels.length !== boxes.length || panels.some((panel) => !panel.dataURL)) {
            throw new Error('Could not render every panel')
          }
          panels.forEach((panel, panelIndex) => {
            jobs.push({
              dataURL: panel.dataURL,
              filename: `${size.filename}-panel-${String(panelIndex + 1).padStart(2, '0')}.${format}`,
              format
            })
          })
          continue
        }
        const result = exportFn(size.width, size.height, size.deviceId)
        const dataURL = result instanceof Promise ? await result : result
        if (!dataURL) {
          throw new Error(`Could not render ${size.label}`)
        }
        jobs.push({
          dataURL,
          filename: `${size.filename}.${format}`,
          format
        })
      }

      const result = await saveBatchExports(jobs)
      if (result.success) {
        toast.success(`Exported ${sizes.length} files`)
      } else {
        if (result.error !== 'Cancelled') toast.error(result.error ?? 'Batch export failed')
      }
    } catch (error) {
      console.error('Batch export failed', error)
      toast.error(error instanceof Error ? `Batch export failed: ${error.message}` : 'Batch export failed')
    }
    setBatchExporting(false)
  }

  const handleCustomExport = async () => {
    const width = Number.parseInt(customWidth, 10)
    const height = Number.parseInt(customHeight, 10)
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      toast.error('Enter a valid width and height')
      return
    }
    if (width > 16384 || height > 16384) {
      toast.error('Maximum export size is 16,384 px per side')
      return
    }

    setCustomExporting(true)
    try {
      const exportFn = getCanvasExport()
      if (!exportFn) {
        toast.error('No canvas to export')
        return
      }
      setExportMime(format)
      if (boxes.length > 1) {
        const panelExportFn = getCanvasPanelExport()
        if (!panelExportFn) throw new Error('Panel exporter is not ready')
        const panels = await panelExportFn(1, width, height)
        if (panels.length !== boxes.length || panels.some((panel) => !panel.dataURL)) {
          throw new Error('Could not render every panel')
        }
        const response = await saveBatchExports(panels.map((panel, index) => ({
          dataURL: panel.dataURL,
          filename: `frameup-panel-${String(index + 1).padStart(2, '0')}-${width}x${height}.${format}`,
          format
        })))
        if (!response.success && response.error !== 'Cancelled') toast.error(response.error ?? 'Export failed')
        else if (response.success) toast.success(`Exported ${panels.length} panels`)
        return
      }
      const result = exportFn(width, height)
      const dataURL = result instanceof Promise ? await result : result
      if (!dataURL) {
        toast.error('Export failed — canvas is empty')
        return
      }
      const response = await saveExport(
        dataURL,
        `frameup-${width}x${height}.${format}`,
        format
      )
      if (!response.success) {
        if (response.error !== 'Cancelled') toast.error(response.error ?? 'Export failed')
      } else {
        toast.success(`Exported ${width} × ${height}`)
      }
    } catch (error) {
      console.error('Custom export failed', error)
      toast.error(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed')
    } finally {
      setCustomExporting(false)
    }
  }

  const toggleSize = (index: number) => {
    setSelectedSizes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const clearSelectedSizes = () => {
    setSelectedSizes(new Set())
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Format selector */}
      <div>
        <div className="mb-2 text-xs text-text-secondary">Format</div>
        <div className="flex rounded-lg border border-border">
          <button
            onClick={() => setFormat('png')}
            className={`flex-1 rounded-l-lg py-1.5 text-xs font-medium transition-colors ${
              format === 'png' ? 'bg-primary text-white' : 'text-text-secondary hover:text-primary'
            }`}
          >
            PNG
          </button>
          <button
            onClick={() => setFormat('webp')}
            className={`flex-1 rounded-r-lg py-1.5 text-xs font-medium transition-colors ${
              format === 'webp' ? 'bg-primary text-white' : 'text-text-secondary hover:text-primary'
            }`}
          >
            WebP
          </button>
        </div>
      </div>

      {/* Single export button */}
      <Button onClick={handleExport} loading={exporting} className="w-full">
        {boxes.length > 1 ? `Export ${boxes.length} panels` : `Export Single ${format.toUpperCase()}`}
      </Button>

      {/* Batch export */}
      <div className="border-t border-border pt-3">
        <div className="mb-2 text-xs text-text-secondary">Batch export</div>

        {/* Custom size */}
        <div className="mb-4 rounded-lg border border-border bg-surface/40 p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-medium text-primary">Custom size</span>
            <span className="text-[10px] text-text-tertiary">pixels</span>
          </div>
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] text-text-secondary">Width</span>
              <input
                type="number"
                min="1"
                max="16384"
                inputMode="numeric"
                value={customWidth}
                onChange={(event) => setCustomWidth(event.target.value)}
                onBlur={applyCustomSizeToCanvas}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-primary outline-none focus:border-primary"
              />
            </label>
            <span className="pb-1.5 text-xs text-text-tertiary">×</span>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] text-text-secondary">Height</span>
              <input
                type="number"
                min="1"
                max="16384"
                inputMode="numeric"
                value={customHeight}
                onChange={(event) => setCustomHeight(event.target.value)}
                onBlur={applyCustomSizeToCanvas}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-primary outline-none focus:border-primary"
              />
            </label>
          </div>
          <Button
            variant="secondary"
            onClick={handleCustomExport}
            loading={customExporting}
            className="mt-2 w-full"
          >
            Export custom size
          </Button>
        </div>

        {/* Pack selector */}
        <div className="flex flex-col gap-1.5 mb-3">
          {exportPacks.map((pack) => (
            <button
              key={pack.id}
              onClick={() => {
                setSelectedPack(pack.id)
                clearSelectedSizes()
              }}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                selectedPack === pack.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-surface'
              }`}
            >
              <div className="text-xs font-medium text-primary">{pack.name}</div>
              <div className="text-[10px] text-text-tertiary">{pack.description}</div>
            </button>
          ))}
        </div>

        {/* Size checklist */}
        {selectedPack && (
          <div className="mb-3">
            {exportPacks
              .find((p) => p.id === selectedPack)
              ?.sizes.map((size, i) => (
                <label
                  key={size.filename}
                  className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSizes.has(i)}
                    onChange={(event) => {
                      toggleSize(i)
                      if (event.target.checked) setOutputDimensions(size.width, size.height)
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-xs text-primary">{size.label}</span>
                  <span className="text-[10px] text-text-tertiary ml-auto">
                    {size.width}x{size.height}
                  </span>
                </label>
              ))}
          </div>
        )}

        {/* Batch export button */}
        {selectedPack && (
          <Button
            variant="secondary"
            onClick={handleBatchExport}
            loading={batchExporting}
            className="w-full"
          >
            {batchExporting
              ? `Exporting ${batchProgress.current}/${batchProgress.total}...`
              : `Export ${selectedSizes.size} sizes`}
          </Button>
        )}
      </div>
    </div>
  )
}
