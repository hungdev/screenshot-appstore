import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { Stage, Layer, Rect, Image as KonvaImage, Group, Line, Transformer } from 'react-konva'
import Konva from 'konva'
import { useCanvasStore } from '../../store/useCanvasStore'
import { getDeviceById } from '../../lib/devices'
import { getAngledDeviceBounds, getCustomDeviceAngle, getDeviceAnglePreset } from '../../lib/deviceAngles'
import { renderDeviceBody, roundedRectPath } from '../../lib/deviceBody'
import { useImageLoader } from './useImageLoader'
import OverlayLayer from './OverlayLayer'
import type { DeviceAngle, DeviceFrame, DeviceRotation, MockupBox } from '../../types'

// Used only by the legacy per-device batch override renderer.
const EXPORT_PADDING = 80

/** Load an image and return a promise that resolves to the HTMLImageElement */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

interface DeviceBoxNodeProps {
  box: MockupBox
  device: DeviceFrame
  deviceVariant: 'light' | 'dark'
  deviceAngle: DeviceAngle
  deviceRotation: DeviceRotation
  deviceShadow: boolean
  screenshotCornerRadius: number | null
  selected: boolean
  onSelect: () => void
  onRef: (node: Konva.Group | null) => void
  onDragMove: (node: Konva.Group) => void
  onTransformEnd: (node: Konva.Group) => void
}

function DeviceBoxNode({ box, device, deviceVariant, deviceAngle, deviceRotation, deviceShadow, screenshotCornerRadius, selected, onSelect, onRef, onDragMove, onTransformEnd }: DeviceBoxNodeProps) {
  const screenshotImage = useImageLoader(box.screenshot ? `data:${box.screenshotMime};base64,${box.screenshot}` : null)
  const frameImage = useImageLoader(device.assetPath[deviceVariant])
  const anglePreset = useMemo(
    () => (deviceAngle === 'custom' ? getCustomDeviceAngle(device, deviceRotation) : getDeviceAnglePreset(device, deviceAngle)),
    [device, deviceAngle, deviceRotation]
  )
  const deviceBody = useMemo(
    () => renderDeviceBody(device, frameImage, anglePreset),
    [device, frameImage, anglePreset]
  )
  const screenshotWidth = device.screenBounds.width
  const screenshotHeight = screenshotImage?.naturalHeight
    ? (device.screenBounds.width / screenshotImage.naturalWidth) * screenshotImage.naturalHeight
    : device.screenBounds.height

  return (
    <Group
      ref={onRef}
      x={box.deviceX ?? box.x + box.width / 2}
      y={box.deviceY ?? box.y + box.height / 2}
      scaleX={box.scale}
      scaleY={box.scale}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(event) => onDragMove(event.target as Konva.Group)}
      onDragEnd={(event) => onTransformEnd(event.target as Konva.Group)}
      onTransformEnd={(event) => onTransformEnd(event.target as Konva.Group)}
      name={selected ? 'active-device-box' : 'device-box'}
    >
      {deviceBody && <KonvaImage image={deviceBody.canvas} x={deviceBody.x} y={deviceBody.y} width={deviceBody.width} height={deviceBody.height} listening={false} />}
      <Group x={0} y={0} offsetX={device.width / 2} offsetY={device.height / 2} rotation={anglePreset.rotation} scaleX={anglePreset.scaleX} scaleY={anglePreset.scaleY} skewX={anglePreset.skewX} skewY={anglePreset.skewY}>
        <Rect x={0} y={0} width={device.width} height={device.height} fill="rgba(0, 0, 0, 0.001)" />
        {deviceShadow && <Rect x={0} y={0} width={device.width} height={device.height} cornerRadius={device.cornerRadius + 5} shadowColor="#000000" shadowBlur={40} shadowOffsetY={12} shadowOpacity={0.25} fill="transparent" listening={false} />}
        {screenshotImage && (
          <Group clipFunc={(ctx) => roundedRectPath(ctx as unknown as CanvasRenderingContext2D, device.screenBounds.x, device.screenBounds.y, device.screenBounds.width, device.screenBounds.height, screenshotCornerRadius ?? device.cornerRadius)}>
            <KonvaImage image={screenshotImage} x={device.screenBounds.x} y={device.screenBounds.y} width={screenshotWidth} height={screenshotHeight} listening={false} />
          </Group>
        )}
        {frameImage && <KonvaImage image={frameImage} x={0} y={0} width={device.width} height={device.height} listening={false} />}
        {device.dynamicIslandBounds && !device.noCutoutOf && <Rect x={device.dynamicIslandBounds.x} y={device.dynamicIslandBounds.y} width={device.dynamicIslandBounds.width} height={device.dynamicIslandBounds.height} cornerRadius={device.dynamicIslandBounds.cornerRadius} fill="#000000" listening={false} />}
        {!screenshotImage && <Rect x={device.screenBounds.x} y={device.screenBounds.y} width={device.screenBounds.width} height={device.screenBounds.height} fill="#F3F4F6" cornerRadius={screenshotCornerRadius ?? device.cornerRadius} />}
      </Group>
    </Group>
  )
}

export default function CanvasStage() {
  const stageRef = useRef<Konva.Stage>(null)
  const exportLayerRef = useRef<Konva.Layer>(null)
  const deviceGroupRefs = useRef<Record<string, Konva.Group | null>>({})
  const deviceTransformerRef = useRef<Konva.Transformer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasFittedArtboardRef = useRef(false)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [isDeviceSelected, setIsDeviceSelected] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [alignmentGuides, setAlignmentGuides] = useState<{ panelId: string; vertical: boolean; horizontal: boolean } | null>(null)
  const panStartRef = useRef<{ x: number; y: number; stageX: number; stageY: number } | null>(null)
  const {
    screenshot,
    screenshotMime,
    screenshotOffsetX,
    screenshotOffsetY,
    selectedDeviceId,
    deviceVariant,
    deviceAngle,
    deviceRotation,
    outputWidth,
    outputHeight,
    background,
    deviceShadow,
    screenshotCornerRadius,
    boxes,
    devices,
    activeDeviceId,
    activeBoxId,
    zoom,
    canvasWidth,
    canvasHeight,
    stageX,
    stageY,
    setZoom,
    setStagePosition,
    setCanvasDimensions,
    setBoxTransform,
    setActiveDevice,
    setActiveBox
  } = useCanvasStore()

  const device = getDeviceById(selectedDeviceId)

  // Export area dimensions (the actual mockup, not the workspace)
  const deviceAnglePreset = useMemo(
    () => (deviceAngle === 'custom'
      ? getCustomDeviceAngle(device, deviceRotation)
      : getDeviceAnglePreset(device, deviceAngle)),
    [device, deviceAngle, deviceRotation]
  )
  const exportWidth = outputWidth
  const exportHeight = outputHeight

  // Load screenshot image
  const screenshotImage = useImageLoader(
    screenshot ? `data:${screenshotMime};base64,${screenshot}` : null
  )

  // Load device frame image
  const framePath = device?.assetPath[deviceVariant]
  const frameImage = useImageLoader(framePath ?? null)

  // Extruded side wall — only has pixels once the device is turned away.
  const deviceBody = useMemo(
    () => renderDeviceBody(device, frameImage, deviceAnglePreset),
    [device, frameImage, deviceAnglePreset]
  )

  useEffect(() => {
    const transformer = deviceTransformerRef.current
    const group = activeDeviceId ? deviceGroupRefs.current[activeDeviceId] : null
    if (!transformer || !group) return
    transformer.nodes(isDeviceSelected ? [group] : [])
    transformer.getLayer()?.batchDraw()
  }, [isDeviceSelected, activeDeviceId, device, devices])

  // Switching a preset or applying a custom size changes the real artboard,
  // so fit it back into view for immediate composition feedback.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    setZoom(Math.min(width / exportWidth, height / exportHeight) * 0.82)
    setStagePosition(0, 0)
  }, [exportWidth, exportHeight, setStagePosition, setZoom])

  // Compute screenshot dimensions (fit to screen width)
  const ssWidth = device ? device.screenBounds.width : 0
  const ssHeight =
    screenshotImage && device
      ? screenshotImage.naturalHeight
        ? (device.screenBounds.width / screenshotImage.naturalWidth) * screenshotImage.naturalHeight
        : device.screenBounds.height
      : 0

  // Expose export function globally
  useEffect(() => {
    const exportFn = (
      widthOrRatio = 2,
      targetHeight?: number,
      overrideDeviceId?: string
    ): string | null | Promise<string | null> => {
      const layer = exportLayerRef.current
      if (!layer) return null

      // Selection controls are editor-only. Hide them while taking a snapshot
      // of the export layer; destroying cloned Transformer nodes can detach
      // listeners from the live nodes they reference.
      const cloneExportLayer = () => {
        const transformers = layer.find('Transformer')
        const visibility = transformers.map((node) => node.visible())
        transformers.forEach((node) => node.visible(false))
        const clone = layer.clone()
        transformers.forEach((node, index) => node.visible(visibility[index]))
        return clone
      }

      // Device-override batch export: build a fresh offscreen render with the target device
      if (targetHeight !== undefined && overrideDeviceId) {
        return (async () => {
          const targetWidth = widthOrRatio
          const overrideDevice = getDeviceById(overrideDeviceId)
          if (!overrideDevice) return null

          const store = useCanvasStore.getState()
          const overrideAngle = store.deviceAngle
          const overrideAnglePreset = overrideAngle === 'custom'
            ? getCustomDeviceAngle(overrideDevice, store.deviceRotation)
            : getDeviceAnglePreset(overrideDevice, overrideAngle)
          const overrideBounds = getAngledDeviceBounds(overrideDevice, overrideAnglePreset)
          const ovExportW = overrideBounds.width + EXPORT_PADDING * 2
          const ovExportH = overrideBounds.height + EXPORT_PADDING * 2

          // Load the device frame image for the override device
          const frameSrc = overrideDevice.assetPath[deviceVariant] ?? overrideDevice.assetPath.light
          let frameImg: HTMLImageElement | null = null
          try {
            frameImg = await loadImage(frameSrc)
          } catch {
            // If frame fails to load, continue without it
          }

          // Load the screenshot image
          let ssImg: HTMLImageElement | null = null
          if (store.screenshot) {
            try {
              ssImg = await loadImage(`data:${store.screenshotMime};base64,${store.screenshot}`)
            } catch {
              // Continue without screenshot
            }
          }

          // Load background image if needed
          const bg = store.background
          let bgImg: HTMLImageElement | null = null
          if (bg.type === 'image' && bg.value) {
            try {
              bgImg = await loadImage(bg.value)
            } catch {
              // Continue without bg image
            }
          }

          // Build offscreen stage at the override device's native export size
          const offscreen = new Konva.Stage({
            container: document.createElement('div'),
            width: ovExportW,
            height: ovExportH
          })
          const offLayer = new Konva.Layer()
          offscreen.add(offLayer)

          // Background
          const bgColors = bg.colors ?? ['#e0e0e0', '#bdbdbd']
          if (bg.type === 'image' && bgImg) {
            offLayer.add(
              new Konva.Image({ x: 0, y: 0, width: ovExportW, height: ovExportH, image: bgImg, cornerRadius: 16 })
            )
          } else if (bg.type === 'solid') {
            offLayer.add(
              new Konva.Rect({ x: 0, y: 0, width: ovExportW, height: ovExportH, cornerRadius: 16, fill: bg.value })
            )
          } else if (bg.type === 'gradient') {
            offLayer.add(
              new Konva.Rect({
                x: 0, y: 0, width: ovExportW, height: ovExportH, cornerRadius: 16,
                fillLinearGradientStartPoint: { x: 0, y: 0 },
                fillLinearGradientEndPoint: { x: ovExportW, y: ovExportH },
                fillLinearGradientColorStops: [0, bgColors[0], 1, bgColors[1]]
              })
            )
          }

          const overrideBody = renderDeviceBody(overrideDevice, frameImg, overrideAnglePreset)
          if (overrideBody) {
            offLayer.add(new Konva.Image({
              image: overrideBody.canvas,
              x: ovExportW / 2 + overrideBody.x,
              y: ovExportH / 2 + overrideBody.y,
              width: overrideBody.width,
              height: overrideBody.height,
              listening: false
            }))
          }

          const deviceGroup = new Konva.Group({
            x: ovExportW / 2,
            y: ovExportH / 2,
            offsetX: overrideDevice.width / 2,
            offsetY: overrideDevice.height / 2,
            rotation: overrideAnglePreset.rotation,
            scaleX: overrideAnglePreset.scaleX,
            scaleY: overrideAnglePreset.scaleY,
            skewX: overrideAnglePreset.skewX,
            skewY: overrideAnglePreset.skewY
          })

          if (store.deviceShadow) {
            deviceGroup.add(new Konva.Rect({
              x: 0, y: 0,
              width: overrideDevice.width, height: overrideDevice.height,
              cornerRadius: overrideDevice.cornerRadius + 5,
              shadowColor: '#000000', shadowBlur: 40, shadowOffsetY: 12, shadowOpacity: 0.25,
              fill: 'transparent', listening: false
            }))
          }

          // Screenshot clipped to screen bounds (BEHIND device frame)
          if (ssImg) {
            const sb = overrideDevice.screenBounds
            const cr = store.screenshotCornerRadius ?? overrideDevice.cornerRadius
            const group = new Konva.Group({
              x: 0, y: 0,
              clipFunc: (ctx) => { roundedRectPath(ctx as unknown as CanvasRenderingContext2D, sb.x, sb.y, sb.width, sb.height, cr) }
            })
            const batchSsH = ssImg.naturalHeight
              ? (sb.width / ssImg.naturalWidth) * ssImg.naturalHeight
              : sb.height
            group.add(
              new Konva.Image({
                image: ssImg,
                x: sb.x + store.screenshotOffsetX,
                y: sb.y + store.screenshotOffsetY,
                width: sb.width,
                height: batchSsH
              })
            )
            deviceGroup.add(group)
          }

          // Device frame (ON TOP of screenshot)
          if (frameImg) {
            deviceGroup.add(
              new Konva.Image({
                image: frameImg, x: 0, y: 0,
                width: overrideDevice.width, height: overrideDevice.height
              })
            )
          }

          // Dynamic Island overlay for batch export
          if (overrideDevice.dynamicIslandBounds && !overrideDevice.noCutoutOf) {
            const di = overrideDevice.dynamicIslandBounds
            deviceGroup.add(
              new Konva.Rect({
                x: di.x, y: di.y,
                width: di.width, height: di.height,
                cornerRadius: di.cornerRadius,
                fill: '#000000'
              })
            )
          }

          offLayer.add(deviceGroup)

          // Clone overlays from the current export layer
          const currentOverlays = layer.find('.overlay')
          currentOverlays.forEach((node) => {
            offLayer.add(node.clone())
          })

          offLayer.draw()

          // Now scale the rendered content to the target dimensions
          const scaleX = targetWidth / ovExportW
          const scaleY = targetHeight / ovExportH
          const scale = Math.min(scaleX, scaleY)

          const finalStage = new Konva.Stage({
            container: document.createElement('div'),
            width: targetWidth,
            height: targetHeight
          })
          const finalLayer = offLayer.clone()
          const scaledW = ovExportW * scale
          const scaledH = ovExportH * scale
          finalLayer.position({ x: (targetWidth - scaledW) / 2, y: (targetHeight - scaledH) / 2 })
          finalLayer.scale({ x: scale, y: scale })
          finalStage.add(finalLayer)

          const mime = window.__canvasExportMime
          const dataURL = finalStage.toDataURL({ pixelRatio: 1, mimeType: mime || 'image/png' })
          finalStage.destroy()
          offscreen.destroy()
          return dataURL
        })()
      }

      if (targetHeight !== undefined) {
        // Render the fixed artboard at its native size first, then composite it
        // into the requested output canvas. Rendering directly from a cloned,
        // transformed Konva layer can fail when an active Transformer is present.
        const targetWidth = widthOrRatio
        const scaleX = targetWidth / exportWidth
        const scaleY = targetHeight / exportHeight
        const scale = Math.min(scaleX, scaleY)

        const sourceStage = new Konva.Stage({
          container: document.createElement('div'),
          width: exportWidth,
          height: exportHeight
        })

        const clone = cloneExportLayer()
        clone.position({ x: 0, y: 0 })
        clone.scale({ x: 1, y: 1 })
        sourceStage.add(clone)

        const sourceCanvas = sourceStage.toCanvas({ pixelRatio: 1 })
        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = targetWidth
        outputCanvas.height = targetHeight
        const context = outputCanvas.getContext('2d')
        if (!context) {
          sourceStage.destroy()
          return null
        }
        const scaledWidth = exportWidth * scale
        const scaledHeight = exportHeight * scale
        context.drawImage(
          sourceCanvas,
          (targetWidth - scaledWidth) / 2,
          (targetHeight - scaledHeight) / 2,
          scaledWidth,
          scaledHeight
        )

        const mime = window.__canvasExportMime
        const dataURL = outputCanvas.toDataURL(mime || 'image/png')
        sourceStage.destroy()
        return dataURL
      }

      // Single export mode: use pixelRatio
      const pixelRatio = widthOrRatio
      const offscreen = new Konva.Stage({
        container: document.createElement('div'),
        width: exportWidth,
        height: exportHeight
      })

      const clone = cloneExportLayer()
      clone.position({ x: 0, y: 0 })
      clone.scale({ x: 1, y: 1 })
      offscreen.add(clone)

      const mime = window.__canvasExportMime
      const dataURL = offscreen.toDataURL({ pixelRatio, mimeType: mime || 'image/png' })
      offscreen.destroy()
      return dataURL
    }

    window.__canvasExport = exportFn
    window.__canvasExportPanels = async (pixelRatio = 1, targetWidth, targetHeight) => {
      const composition = exportFn(1)
      const dataURL = composition instanceof Promise ? await composition : composition
      if (!dataURL) throw new Error('Could not render the composition')

      const sourceImage = await loadImage(dataURL)
      const mime = window.__canvasExportMime || 'image/png'
      return boxes.map((box) => {
        const sourceWidth = box.width || exportWidth
        const sourceHeight = box.height || exportHeight
        const panelWidth = targetWidth ?? sourceWidth
        const panelHeight = targetHeight ?? sourceHeight
        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = Math.max(1, Math.round(panelWidth * pixelRatio))
        outputCanvas.height = Math.max(1, Math.round(panelHeight * pixelRatio))
        const context = outputCanvas.getContext('2d')
        if (!context) throw new Error('Could not create an export canvas')
        context.drawImage(
          sourceImage,
          box.x || 0,
          box.y || 0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          outputCanvas.width,
          outputCanvas.height
        )
        const dataURL = outputCanvas.toDataURL(mime)
        return { id: box.id, dataURL }
      })
    }
  }, [exportWidth, exportHeight, screenshot, deviceVariant, deviceAngle, deviceRotation, selectedDeviceId, background, screenshotOffsetX, screenshotOffsetY, screenshotCornerRadius, boxes, devices])

  // Also keep the stage ref for backward compat
  useEffect(() => {
    if (stageRef.current) {
      window.__canvasStage = stageRef.current
    }
  }, [])

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setCanvasDimensions(Math.round(width), Math.round(height))
        if (!hasFittedArtboardRef.current && width > 0 && height > 0) {
          hasFittedArtboardRef.current = true
          setZoom(Math.min(width / exportWidth, height / exportHeight) * 0.82)
          setStagePosition(0, 0)
        }
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [exportWidth, exportHeight, setCanvasDimensions, setStagePosition, setZoom])

  // Zoom toward cursor with Cmd+scroll
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      if (e.evt.metaKey || e.evt.ctrlKey) {
        e.evt.preventDefault()
        const stage = stageRef.current
        if (!stage) return

        const oldZoom = zoom
        const delta = e.evt.deltaY > 0 ? -0.05 : 0.05
        const newZoom = Math.max(0.1, Math.min(5, oldZoom + delta))

        // Get cursor position relative to stage container
        const pointer = stage.getPointerPosition()
        if (!pointer) {
          setZoom(newZoom)
          return
        }

        // Calculate the position under the cursor in export-space before zoom
        const oldOffsetX = (canvasWidth - exportWidth * oldZoom) / 2 + stageX
        const oldOffsetY = (canvasHeight - exportHeight * oldZoom) / 2 + stageY
        const mouseExportX = (pointer.x - oldOffsetX) / oldZoom
        const mouseExportY = (pointer.y - oldOffsetY) / oldZoom

        // Calculate new offset so the same export-space point stays under cursor
        const newOffsetX = (canvasWidth - exportWidth * newZoom) / 2
        const newStageX = pointer.x - mouseExportX * newZoom - newOffsetX
        const newOffsetY = (canvasHeight - exportHeight * newZoom) / 2
        const newStageY = pointer.y - mouseExportY * newZoom - newOffsetY

        setZoom(newZoom)
        setStagePosition(newStageX, newStageY)
      }
    },
    [zoom, stageX, stageY, canvasWidth, canvasHeight, exportWidth, exportHeight, setZoom, setStagePosition]
  )

  // Cmd+drag to pan the canvas
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.metaKey || e.evt.ctrlKey) {
        e.evt.preventDefault()
        setIsPanning(true)
        const stage = stageRef.current
        if (stage) {
          panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY, stageX, stageY }
          stage.container().style.cursor = 'grabbing'
        }
      } else {
        // A background click targets the artboard Rect, not the Stage itself.
        // Walk up the Konva tree so only clicks outside the device and its
        // resize controls clear the selected state.
        const isInside = (root: Konva.Node | null) => {
          let current: Konva.Node | null = e.target
          while (current) {
            if (current === root) return true
            current = current.getParent()
          }
          return false
        }
        const clickedDevice = Object.values(deviceGroupRefs.current).some((group) => isInside(group))
        const clickedDeviceControl = isInside(deviceTransformerRef.current)
        const clickedOverlay = (() => {
          let current: Konva.Node | null = e.target
          while (current) {
            if (current.hasName('overlay-node') || current.hasName('overlay-control')) return true
            current = current.getParent()
          }
          return false
        })()
        if (!clickedDevice && !clickedDeviceControl) {
          setIsDeviceSelected(false)
        }
        if (!clickedOverlay) {
          setSelectedOverlayId(null)
        }
      }
    },
    [stageX, stageY]
  )

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isPanning || !panStartRef.current) return
      const dx = e.evt.clientX - panStartRef.current.x
      const dy = e.evt.clientY - panStartRef.current.y
      setStagePosition(panStartRef.current.stageX + dx, panStartRef.current.stageY + dy)
    },
    [isPanning, setStagePosition]
  )

  const handleStageMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false)
      panStartRef.current = null
      const stage = stageRef.current
      if (stage) {
        stage.container().style.cursor = 'default'
      }
    }
  }, [isPanning])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        setStagePosition(0, 0)
        if (containerRef.current) {
          const { width, height } = containerRef.current.getBoundingClientRect()
          const fitZoom = Math.min(width / exportWidth, height / exportHeight) * 0.85
          setZoom(fitZoom)
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault()
        setStagePosition(0, 0)
        setZoom(1)
      }
      // Delete selected overlay
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlayId) {
        e.preventDefault()
        useCanvasStore.getState().removeOverlay(selectedOverlayId)
        setSelectedOverlayId(null)
      }
      // Escape deselects
      if (e.key === 'Escape') {
        setSelectedOverlayId(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [exportWidth, exportHeight, setZoom, setStagePosition, selectedOverlayId])

  // Center the export area in the viewport, adjusted by pan offset
  const offsetX = (canvasWidth - exportWidth * zoom) / 2 + stageX
  const offsetY = (canvasHeight - exportHeight * zoom) / 2 + stageY

  // Positions are stored in export-space, so snapping stays stable at every
  // viewport zoom. Guides are editor-only and never enter the export layer.
  const handleDeviceDragMove = useCallback((deviceItem: typeof devices[number], node: Konva.Group) => {
    const panel = boxes.find((box) => box.id === deviceItem.panelId)
    if (!panel) return

    const snapDistance = 18
    const panelCenterX = panel.x + panel.width / 2
    const panelCenterY = panel.y + panel.height / 2
    const vertical = Math.abs(node.x() - panelCenterX) <= snapDistance
    const horizontal = Math.abs(node.y() - panelCenterY) <= snapDistance

    if (vertical || horizontal) {
      node.position({
        x: vertical ? panelCenterX : node.x(),
        y: horizontal ? panelCenterY : node.y()
      })
    }
    setAlignmentGuides(vertical || horizontal ? { panelId: panel.id, vertical, horizontal } : null)
  }, [boxes])

  const clearAlignmentGuides = useCallback(() => setAlignmentGuides(null), [])

  const handleOverlayDragMove = useCallback((node: Konva.Node) => {
    const panel = boxes.find((box) => box.id === activeBoxId)
    if (!panel) return

    // Text and badges use a top-left origin, so align their visual center.
    const nodeX = node.x()
    const nodeY = node.y()
    const nodeWidth = node.width() * node.scaleX()
    const nodeHeight = node.height() * node.scaleY()
    const panelCenterX = panel.x + panel.width / 2
    const panelCenterY = panel.y + panel.height / 2
    const snapDistance = 18
    const vertical = Math.abs(nodeX + nodeWidth / 2 - panelCenterX) <= snapDistance
    const horizontal = Math.abs(nodeY + nodeHeight / 2 - panelCenterY) <= snapDistance

    if (vertical || horizontal) {
      node.position({
        x: vertical ? panelCenterX - nodeWidth / 2 : nodeX,
        y: horizontal ? panelCenterY - nodeHeight / 2 : nodeY
      })
    }
    setAlignmentGuides(vertical || horizontal ? { panelId: panel.id, vertical, horizontal } : null)
  }, [activeBoxId, boxes])

  // Background image (for image type)
  const bgImageSrc = background.type === 'image' ? background.value : null
  const bgImage = useImageLoader(bgImageSrc)

  // Background colors for Konva gradient
  const bgColors = background.colors ?? ['#e0e0e0', '#bdbdbd']

  const isMac = navigator.platform?.includes('Mac') ?? true
  const modKey = isMac ? '\u2318' : 'Ctrl'

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Keybind tooltip */}
      <div className="absolute bottom-3 right-3 z-10 flex gap-3 rounded-lg bg-black/60 px-3 py-1.5 text-[10px] text-white/70 backdrop-blur-sm pointer-events-none select-none">
        <span>Click device: resize · Drag device: move</span>
        <span>Device clips at frame edge</span>
        <span>{modKey}+Scroll: Zoom</span>
        <span>{modKey}+Drag: Pan</span>
        <span>{modKey}+0: Fit</span>
        <span>{modKey}+1: 100%</span>
      </div>
      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={() => { handleStageMouseUp(); clearAlignmentGuides() }}
      >
        {/* Workspace background (not exported) */}
        <Layer>
          <Rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="#E5E7EB" />
          <Rect
            x={offsetX - 1}
            y={offsetY - 1}
            width={exportWidth * zoom + 2}
            height={exportHeight * zoom + 2}
            fill="#FFFFFF"
            stroke="#CBD5E1"
            strokeWidth={1}
            shadowColor="#64748B"
            shadowBlur={18}
            shadowOpacity={0.16}
            shadowOffsetY={5}
            listening={false}
          />
        </Layer>

        {/* Export layer — this is what gets exported */}
        <Layer
          ref={exportLayerRef}
          x={offsetX}
          y={offsetY}
          scaleX={zoom}
          scaleY={zoom}
          clipX={0}
          clipY={0}
          clipWidth={exportWidth}
          clipHeight={exportHeight}
        >
          {/* Mockup background */}
          {/* Composition background. Individual panel backgrounds are rendered below,
              leaving this neutral surface visible in the gaps between panels. */}
          <Rect
            x={0}
            y={0}
            width={exportWidth}
            height={exportHeight}
            fill="#E5E7EB"
          />

          {/* Each panel is a complete artboard: background first, then its device. */}
          {boxes.map((box) => (
            background.type === 'image' && bgImage ? (
              <KonvaImage key={`panel-${box.id}`} x={box.x} y={box.y} width={box.width} height={box.height} image={bgImage} cornerRadius={16} listening={false} />
            ) : background.type === 'solid' ? (
              <Rect key={`panel-${box.id}`} x={box.x} y={box.y} width={box.width} height={box.height} cornerRadius={16} fill={background.value} listening={false} />
            ) : background.type === 'transparent' ? (
              <Rect key={`panel-${box.id}`} x={box.x} y={box.y} width={box.width} height={box.height} cornerRadius={16} stroke="#CBD5E1" strokeWidth={1} listening={false} />
            ) : (
              <Rect key={`panel-${box.id}`} x={box.x} y={box.y} width={box.width} height={box.height} cornerRadius={16} fillLinearGradientStartPoint={{ x: box.x, y: box.y }} fillLinearGradientEndPoint={{ x: box.x + box.width, y: box.y + box.height }} fillLinearGradientColorStops={[0, bgColors[0], 1, bgColors[1]]} listening={false} />
            )
          ))}
          {boxes.map((box) => box.id === activeBoxId && (
            <Rect
              key={`active-panel-${box.id}`}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              cornerRadius={16}
              stroke="#2563EB"
              strokeWidth={3}
              dash={[10, 8]}
              listening={false}
            />
          ))}

          {/* Each device belongs to one complete panel and can still be moved/resized. */}
          {devices.map((deviceItem) => {
            const panel = boxes.find((box) => box.id === deviceItem.panelId)
            if (!panel) return null
            const boxDevice = getDeviceById(deviceItem.deviceId)
            if (!boxDevice) return null
            const deviceBox = {
              ...panel,
              id: deviceItem.id,
              deviceX: deviceItem.x,
              deviceY: deviceItem.y,
              scale: deviceItem.scale,
              screenshot: deviceItem.screenshot,
              screenshotWidth: deviceItem.screenshotWidth,
              screenshotHeight: deviceItem.screenshotHeight,
              screenshotMime: deviceItem.screenshotMime
            }
            return (
              <DeviceBoxNode
                key={deviceItem.id}
                box={deviceBox}
                device={boxDevice}
                deviceVariant={deviceVariant}
                deviceAngle={deviceItem.deviceAngle}
                deviceRotation={deviceItem.deviceRotation}
                deviceShadow={deviceShadow}
                screenshotCornerRadius={screenshotCornerRadius}
                selected={deviceItem.id === activeDeviceId && isDeviceSelected}
                onSelect={() => { setActiveDevice(deviceItem.id); setIsDeviceSelected(true); setSelectedOverlayId(null) }}
                onRef={(node) => { deviceGroupRefs.current[deviceItem.id] = node }}
                onDragMove={(node) => handleDeviceDragMove(deviceItem, node)}
                onTransformEnd={(node) => {
                  const scale = Math.max(0.1, Math.min(4, node.scaleX()))
                  node.scale({ x: scale, y: scale })
                  setBoxTransform(deviceItem.id, node.x(), node.y(), scale)
                  clearAlignmentGuides()
                }}
              />
            )
          })}

          {/* Hide only the gaps, while allowing a device to continue into the
              neighboring panel. */}
          {boxes.map((box, index) => {
            const next = boxes[index + 1]
            if (!next) return null
            const gapX = box.x + box.width
            const gapWidth = Math.max(0, next.x - gapX)
            return gapWidth > 0 ? (
              <Rect
                key={`gap-mask-${box.id}`}
                x={gapX}
                y={0}
                width={gapWidth}
                height={exportHeight}
                fill="#E5E7EB"
                listening={false}
              />
            ) : null
          })}

          {/* Overlay layer (text & badges) */}
          <OverlayLayer
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={setSelectedOverlayId}
            onDragMove={handleOverlayDragMove}
            onDragEnd={clearAlignmentGuides}
          />
          {device && (
            <Transformer
              ref={deviceTransformerRef}
              rotateEnabled={false}
              keepRatio
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              boundBoxFunc={(oldBox, newBox) => {
                const minSize = 48
                return Math.abs(newBox.width) < minSize || Math.abs(newBox.height) < minSize ? oldBox : newBox
              }}
              borderStroke="#2563EB"
              borderDash={[5, 4]}
              anchorFill="#FFFFFF"
              anchorStroke="#2563EB"
              anchorSize={9}
              visible={isDeviceSelected}
            />
          )}
        </Layer>

        {/* Smart guides live above the artboard but outside the export layer. */}
        <Layer x={offsetX} y={offsetY} scaleX={zoom} scaleY={zoom} listening={false}>
          {alignmentGuides && (() => {
            const panel = boxes.find((box) => box.id === alignmentGuides.panelId)
            if (!panel) return null
            const guideProps = {
              stroke: '#2563EB',
              strokeWidth: 1.5 / zoom,
              dash: [8 / zoom, 6 / zoom],
              opacity: 0.9,
              listening: false
            }
            return (
              <>
                {alignmentGuides.vertical && (
                  <Line points={[panel.x + panel.width / 2, panel.y, panel.x + panel.width / 2, panel.y + panel.height]} {...guideProps} />
                )}
                {alignmentGuides.horizontal && (
                  <Line points={[panel.x, panel.y + panel.height / 2, panel.x + panel.width, panel.y + panel.height / 2]} {...guideProps} />
                )}
              </>
            )
          })()}
        </Layer>
      </Stage>
    </div>
  )
}
