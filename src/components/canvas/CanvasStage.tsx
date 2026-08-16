import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { Stage, Layer, Rect, Image as KonvaImage, Group, Transformer } from 'react-konva'
import Konva from 'konva'
import { useCanvasStore } from '../../store/useCanvasStore'
import { getDeviceById } from '../../lib/devices'
import { getAngledDeviceBounds, getCustomDeviceAngle, getDeviceAnglePreset } from '../../lib/deviceAngles'
import { renderDeviceBody, roundedRectPath } from '../../lib/deviceBody'
import { useImageLoader } from './useImageLoader'
import OverlayLayer from './OverlayLayer'

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

export default function CanvasStage() {
  const stageRef = useRef<Konva.Stage>(null)
  const exportLayerRef = useRef<Konva.Layer>(null)
  const deviceGroupRef = useRef<Konva.Group>(null)
  const deviceTransformerRef = useRef<Konva.Transformer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasFittedArtboardRef = useRef(false)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [isDeviceSelected, setIsDeviceSelected] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
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
    deviceX,
    deviceY,
    deviceScale,
    outputWidth,
    outputHeight,
    background,
    deviceShadow,
    screenshotCornerRadius,
    zoom,
    canvasWidth,
    canvasHeight,
    stageX,
    stageY,
    setZoom,
    setStagePosition,
    setCanvasDimensions,
    setDeviceTransform
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
    const group = deviceGroupRef.current
    if (!transformer || !group) return
    transformer.nodes(isDeviceSelected ? [group] : [])
    transformer.getLayer()?.batchDraw()
  }, [isDeviceSelected, device, deviceX, deviceY, deviceScale])

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
  }, [exportWidth, exportHeight, screenshot, deviceVariant, deviceAngle, deviceRotation, selectedDeviceId, background, screenshotOffsetX, screenshotOffsetY, screenshotCornerRadius])

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
        const clickedDevice = isInside(deviceGroupRef.current)
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

  // Background image (for image type)
  const bgImageSrc = background.type === 'image' ? background.value : null
  const bgImage = useImageLoader(bgImageSrc)

  // Background colors for Konva gradient
  const bgColors = background.colors ?? ['#e0e0e0', '#bdbdbd']

  const handleDeviceTransformEnd = useCallback(() => {
    const node = deviceGroupRef.current
    if (!node) return
    // Corner handles preserve proportions, but use scaleX defensively so a
    // programmatic transform cannot ever stretch the device frame.
    const scale = Math.max(0.1, Math.min(4, node.scaleX()))
    node.scale({ x: scale, y: scale })
    setDeviceTransform(node.x(), node.y(), scale)
  }, [setDeviceTransform])

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
        onMouseLeave={handleStageMouseUp}
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
          {background.type === 'transparent' ? null : background.type === 'image' && bgImage ? (
            <KonvaImage
              x={0}
              y={0}
              width={exportWidth}
              height={exportHeight}
              image={bgImage}
              cornerRadius={16}
            />
          ) : background.type === 'solid' ? (
            <Rect
              x={0}
              y={0}
              width={exportWidth}
              height={exportHeight}
              cornerRadius={16}
              fill={background.value}
            />
          ) : (
            <Rect
              x={0}
              y={0}
              width={exportWidth}
              height={exportHeight}
              cornerRadius={16}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: exportWidth, y: exportHeight }}
              fillLinearGradientColorStops={[0, bgColors[0], 1, bgColors[1]]}
            />
          )}

          {/* Side wall of the body, drawn behind the face it is extruded from. */}
          {/* The device is an independent object on the fixed artboard. The layer clip
              is intentional: moving it past an edge crops it, never resizes the artboard. */}
          {device && (
          <Group
            ref={deviceGroupRef}
            x={deviceX}
            y={deviceY}
            scaleX={deviceScale}
            scaleY={deviceScale}
            draggable
            onClick={() => { setIsDeviceSelected(true); setSelectedOverlayId(null) }}
            onTap={() => { setIsDeviceSelected(true); setSelectedOverlayId(null) }}
            onDragEnd={handleDeviceTransformEnd}
            onTransformEnd={handleDeviceTransformEnd}
          >
            {deviceBody && (
              <KonvaImage
                image={deviceBody.canvas}
                x={deviceBody.x}
                y={deviceBody.y}
                width={deviceBody.width}
                height={deviceBody.height}
                listening={false}
              />
            )}
            <Group
              x={0}
              y={0}
              offsetX={device.width / 2}
              offsetY={device.height / 2}
              rotation={deviceAnglePreset.rotation}
              scaleX={deviceAnglePreset.scaleX}
              scaleY={deviceAnglePreset.scaleY}
              skewX={deviceAnglePreset.skewX}
              skewY={deviceAnglePreset.skewY}
            >
            {/* A transparent hit surface makes the complete device draggable.
                The visual frame and screenshot are non-listening so neither
                can steal this interaction from the outer draggable group. */}
            <Rect
              x={0}
              y={0}
              width={device.width}
              height={device.height}
              fill="rgba(0, 0, 0, 0.001)"
            />
            {deviceShadow && (
              <Rect
                x={0}
                y={0}
                width={device.width}
                height={device.height}
                cornerRadius={device.cornerRadius + 5}
                shadowColor="#000000"
                shadowBlur={40}
                shadowOffsetY={12}
                shadowOpacity={0.25}
                fill="transparent"
                listening={false}
              />
            )}
            {/* Screenshot clipped to screen bounds with rounded corners (BEHIND frame) */}
            {screenshotImage && device && (
              <Group
                clipFunc={(ctx) => {
                  const cr = screenshotCornerRadius ?? device.cornerRadius
                  roundedRectPath(
                    ctx as unknown as CanvasRenderingContext2D,
                    device.screenBounds.x,
                    device.screenBounds.y,
                    device.screenBounds.width,
                    device.screenBounds.height,
                    cr
                  )
                }}
              >
                <KonvaImage
                  image={screenshotImage}
                  x={device.screenBounds.x + screenshotOffsetX}
                  y={device.screenBounds.y + screenshotOffsetY}
                  width={ssWidth}
                  height={ssHeight}
                  listening={false}
                />
              </Group>
            )}

            {/* Device frame (ON TOP of screenshot — frame has transparent screen hole) */}
            {frameImage && device && (
              <KonvaImage
                image={frameImage}
                x={0}
                y={0}
                width={device.width}
                height={device.height}
                listening={false}
              />
            )}

            {/* Dynamic Island — rendered as a Konva shape to guarantee visibility */}
            {device?.dynamicIslandBounds && !device?.noCutoutOf && (
              <Rect
                x={device.dynamicIslandBounds.x}
                y={device.dynamicIslandBounds.y}
                width={device.dynamicIslandBounds.width}
                height={device.dynamicIslandBounds.height}
                cornerRadius={device.dynamicIslandBounds.cornerRadius}
                fill="#000000"
                listening={false}
              />
            )}

            {/* Empty state placeholder */}
            {!screenshotImage && device && (
              <Rect
                x={device.screenBounds.x}
                y={device.screenBounds.y}
                width={device.screenBounds.width}
                height={device.screenBounds.height}
                fill="#F3F4F6"
                cornerRadius={screenshotCornerRadius ?? device.cornerRadius}
              />
            )}
            </Group>
          </Group>
          )}

          {/* Overlay layer (text & badges) */}
          <OverlayLayer
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={setSelectedOverlayId}
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
      </Stage>
    </div>
  )
}
