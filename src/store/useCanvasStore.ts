import { create } from 'zustand'
import type { Background, CanvasConfig, DeviceRotation, MockupBox, MockupDevice, Overlay } from '../types'
import { backgroundPresets } from '../lib/presets'
import type { DeviceAngle } from '../lib/deviceAngles'

interface CanvasState {
  // Screenshot data (base64)
  screenshot: string | null
  screenshotWidth: number
  screenshotHeight: number
  screenshotMime: string
  boxes: MockupBox[]
  activeBoxId: string
  devices: MockupDevice[]
  activeDeviceId: string
  panelGap: number
  rotationStudioPlacement: 'panel' | 'canvas'

  // Screenshot position offset within the device screen (for panning)
  screenshotOffsetX: number
  screenshotOffsetY: number

  // Device
  selectedDeviceId: string
  deviceVariant: 'light' | 'dark'
  deviceAngle: DeviceAngle
  deviceRotation: DeviceRotation
  // Device transform inside the fixed-size export artboard.
  deviceX: number
  deviceY: number
  deviceScale: number

  // Export artboard pixels (independent of the editor viewport size).
  outputWidth: number
  outputHeight: number

  // Background
  background: Background

  // Overlays
  overlays: Overlay[]

  // Effects
  deviceShadow: boolean
  screenshotCornerRadius: number | null // null = use device default

  // Canvas viewport
  canvasWidth: number
  canvasHeight: number
  zoom: number
  stageX: number
  stageY: number

  // Unsaved changes tracking
  hasUnsavedChanges: boolean

  // Actions
  setScreenshot: (base64: string, width?: number, height?: number, mime?: string) => void
  clearScreenshot: () => void
  setActiveBox: (id: string) => void
  setActiveDevice: (id: string) => void
  setDevices: (devices: MockupDevice[]) => void
  addDevice: (deviceId: string) => void
  removeDevice: (id: string) => void
  setBoxes: (boxes: MockupBox[]) => void
  setPanelGap: (gap: number) => void
  setRotationStudioPlacement: (placement: 'panel' | 'canvas') => void
  addBox: () => void
  removeBox: (id: string) => void
  setBoxTransform: (id: string, x: number, y: number, scale: number) => void
  setScreenshotOffset: (x: number, y: number) => void
  setDevice: (deviceId: string) => void
  setDeviceVariant: (variant: 'light' | 'dark') => void
  setDeviceAngle: (angle: DeviceAngle) => void
  setDeviceRotation: (rotation: DeviceRotation) => void
  setDeviceTransform: (x: number, y: number, scale: number) => void
  setOutputDimensions: (width: number, height: number) => void
  setBackground: (background: Background) => void
  setZoom: (zoom: number) => void
  setStagePosition: (x: number, y: number) => void
  setCanvasDimensions: (width: number, height: number) => void
  addOverlay: (overlay: Overlay) => void
  updateOverlay: (id: string, updates: Partial<Overlay>) => void
  removeOverlay: (id: string) => void
  setDeviceShadow: (enabled: boolean) => void
  setScreenshotCornerRadius: (radius: number | null) => void
  markSaved: () => void
  getCanvasConfig: () => CanvasConfig
}

export const useCanvasStore = create<CanvasState>((set): CanvasState => ({
  screenshot: null,
  screenshotWidth: 0,
  screenshotHeight: 0,
  screenshotMime: 'image/png',
  boxes: [{
    id: 'box-1', x: 0, y: 0, width: 1242, height: 2688, deviceX: 621, deviceY: 1344, deviceId: 'iphone-17-pro-max', deviceAngle: 'front', deviceRotation: { yaw: 0, pitch: 0, roll: 0 }, scale: 0.75,
    screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png'
  }],
  activeBoxId: 'box-1',
  panelGap: 50,
  rotationStudioPlacement: 'panel',
  devices: [{
    id: 'device-1', panelId: 'box-1', x: 621, y: 1344, scale: 0.75,
    deviceId: 'iphone-17-pro-max', deviceAngle: 'front', deviceRotation: { yaw: 0, pitch: 0, roll: 0 },
    screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png'
  }],
  activeDeviceId: 'device-1',
  screenshotOffsetX: 0,
  screenshotOffsetY: 0,

  selectedDeviceId: 'iphone-17-pro-max',
  deviceVariant: 'light',
  deviceAngle: 'front',
  deviceRotation: { yaw: 0, pitch: 0, roll: 0 },
  deviceX: 621,
  deviceY: 1344,
  deviceScale: 0.75,
  outputWidth: 1242,
  outputHeight: 2688,

  background: backgroundPresets[0],

  overlays: [],

  deviceShadow: true,
  screenshotCornerRadius: null,

  canvasWidth: 1920,
  canvasHeight: 1080,
  zoom: 1,
  stageX: 0,
  stageY: 0,

  hasUnsavedChanges: false,

  setScreenshot: (base64, width = 0, height = 0, mime = 'image/png') =>
    set((state) => ({
      screenshot: base64, screenshotWidth: width, screenshotHeight: height, screenshotMime: mime,
      boxes: state.boxes,
      devices: state.devices.map((device) => device.id === state.activeDeviceId
        ? { ...device, screenshot: base64, screenshotWidth: width, screenshotHeight: height, screenshotMime: mime }
        : device),
      screenshotOffsetX: 0, screenshotOffsetY: 0, hasUnsavedChanges: true
    })),

  clearScreenshot: () => set((state) => ({
    screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png',
    boxes: state.boxes,
    devices: state.devices.map((device) => device.id === state.activeDeviceId
      ? { ...device, screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png' }
      : device),
    screenshotOffsetX: 0, screenshotOffsetY: 0, hasUnsavedChanges: true
  })),

  setActiveBox: (id) => set((state) => {
    const box = state.boxes.find((item) => item.id === id)
    if (!box) return state
    const device = state.devices.find((item) => item.panelId === id) ?? state.devices[0]
    return {
      activeBoxId: id,
      activeDeviceId: device.id,
      screenshot: device.screenshot,
      screenshotWidth: device.screenshotWidth,
      screenshotHeight: device.screenshotHeight,
      screenshotMime: device.screenshotMime,
      deviceX: device.x,
      deviceY: device.y,
      selectedDeviceId: device.deviceId,
      deviceAngle: device.deviceAngle,
      deviceRotation: device.deviceRotation,
      deviceScale: device.scale,
      screenshotOffsetX: 0,
      screenshotOffsetY: 0
    }
  }),

  setActiveDevice: (id) => set((state) => {
    const device = state.devices.find((item) => item.id === id)
    if (!device) return state
    return {
      activeDeviceId: id,
      activeBoxId: device.panelId,
      screenshot: device.screenshot,
      screenshotWidth: device.screenshotWidth,
      screenshotHeight: device.screenshotHeight,
      screenshotMime: device.screenshotMime,
      deviceX: device.x,
      deviceY: device.y,
      deviceScale: device.scale,
      selectedDeviceId: device.deviceId,
      deviceAngle: device.deviceAngle,
      deviceRotation: device.deviceRotation,
      screenshotOffsetX: 0,
      screenshotOffsetY: 0
    }
  }),

  setDevices: (devices) => set((state) => {
    if (devices.length === 0) return state
    const active = devices[0]
    return {
      devices,
      activeDeviceId: active.id,
      activeBoxId: active.panelId,
      screenshot: active.screenshot,
      screenshotWidth: active.screenshotWidth,
      screenshotHeight: active.screenshotHeight,
      screenshotMime: active.screenshotMime,
      selectedDeviceId: active.deviceId,
      deviceX: active.x,
      deviceY: active.y,
      deviceScale: active.scale,
      deviceAngle: active.deviceAngle,
      deviceRotation: active.deviceRotation
    }
  }),

  addDevice: (deviceId) => set((state) => {
    const panel = state.boxes.find((item) => item.id === state.activeBoxId) ?? state.boxes[0]
    const siblings = state.devices.filter((item) => item.panelId === panel.id)
    const last = siblings[siblings.length - 1]
    const id = `device-${Date.now()}`
    const device: MockupDevice = {
      id,
      panelId: panel.id,
      x: last ? last.x + 260 : panel.x + panel.width / 2,
      y: last?.y ?? panel.y + panel.height / 2,
      scale: last?.scale ?? state.deviceScale,
      deviceId,
      deviceAngle: 'front',
      deviceRotation: { yaw: 0, pitch: 0, roll: 0 },
      screenshot: null,
      screenshotWidth: 0,
      screenshotHeight: 0,
      screenshotMime: 'image/png'
    }
    return { devices: [...state.devices, device], activeDeviceId: id, selectedDeviceId: deviceId, deviceX: device.x, deviceY: device.y, deviceScale: device.scale, deviceAngle: device.deviceAngle, deviceRotation: device.deviceRotation, screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png', hasUnsavedChanges: true }
  }),

  removeDevice: (id) => set((state) => {
    if (state.devices.length <= 1) return state
    const devices = state.devices.filter((item) => item.id !== id)
    const active = devices.find((item) => item.id === state.activeDeviceId) ?? devices[0]
    return { devices, activeDeviceId: active.id, activeBoxId: active.panelId, screenshot: active.screenshot, screenshotWidth: active.screenshotWidth, screenshotHeight: active.screenshotHeight, screenshotMime: active.screenshotMime, selectedDeviceId: active.deviceId, deviceX: active.x, deviceY: active.y, deviceScale: active.scale, deviceAngle: active.deviceAngle, deviceRotation: active.deviceRotation, hasUnsavedChanges: true }
  }),

  setBoxes: (boxes) => set((state) => {
    if (boxes.length === 0) return state
    const normalized = boxes.map((box, index) => {
      const width = box.width ?? state.outputWidth
      const height = box.height ?? state.outputHeight
      const x = box.width ? box.x : index * (width + state.panelGap)
      const y = box.width ? box.y : 0
      return {
        ...box,
        x, y, width, height,
        deviceX: box.deviceX ?? box.x,
        deviceY: box.deviceY ?? box.y,
        deviceId: box.deviceId ?? state.selectedDeviceId,
        deviceAngle: box.deviceAngle ?? state.deviceAngle,
        deviceRotation: box.deviceRotation ?? state.deviceRotation
      }
    })
    const active = normalized[0]
    return {
      boxes: normalized,
      activeBoxId: active.id,
      screenshot: active.screenshot,
      screenshotWidth: active.screenshotWidth,
      screenshotHeight: active.screenshotHeight,
      screenshotMime: active.screenshotMime,
      deviceX: active.deviceX ?? active.x + active.width / 2,
      deviceY: active.deviceY ?? active.y + active.height / 2,
      deviceScale: active.scale,
      selectedDeviceId: active.deviceId ?? state.selectedDeviceId
      ,deviceAngle: active.deviceAngle ?? state.deviceAngle
      ,deviceRotation: active.deviceRotation ?? state.deviceRotation
    }
  }),

  setPanelGap: (gap) => set((state) => {
    const panelGap = Math.max(0, Math.round(gap))
    const boxes = state.boxes.map((box, index) => ({
      ...box,
      x: index === 0 ? 0 : index * (box.width + panelGap)
    }))
    const outputWidth = boxes.reduce((max, box) => Math.max(max, box.x + box.width), 0)
    return { panelGap, boxes, outputWidth, hasUnsavedChanges: true }
  }),

  setRotationStudioPlacement: (rotationStudioPlacement) => set({ rotationStudioPlacement }),

  addBox: () => set((state) => {
    const id = `box-${Date.now()}`
    const spacing = state.panelGap
    const panelWidth = state.boxes[0]?.width ?? state.outputWidth
    const panelHeight = state.boxes[0]?.height ?? state.outputHeight
    const lastBox = state.boxes[state.boxes.length - 1]
    const x = lastBox.x + panelWidth + spacing
    const outputWidth = Math.max(state.outputWidth, Math.ceil(x + panelWidth))
    const box: MockupBox = {
      id, x, y: 0, width: panelWidth, height: panelHeight,
      deviceX: x + panelWidth / 2, deviceY: panelHeight / 2, deviceId: state.selectedDeviceId, deviceAngle: state.deviceAngle, deviceRotation: state.deviceRotation, scale: state.deviceScale,
      screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png'
    }
    const device: MockupDevice = {
      id: `device-${Date.now()}`, panelId: id, x: x + panelWidth / 2, y: panelHeight / 2, scale: state.deviceScale,
      deviceId: state.selectedDeviceId, deviceAngle: state.deviceAngle, deviceRotation: state.deviceRotation,
      screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png'
    }
    return { boxes: [...state.boxes, box], devices: [...state.devices, device], outputWidth, activeBoxId: id, activeDeviceId: device.id, screenshot: null, screenshotWidth: 0, screenshotHeight: 0, screenshotMime: 'image/png', hasUnsavedChanges: true }
  }),

  removeBox: (id) => set((state) => {
    if (state.boxes.length <= 1) return state
    const boxes = state.boxes.filter((box) => box.id !== id)
    const devices = state.devices.filter((device) => device.panelId !== id)
    const active = boxes.find((box) => box.id === state.activeBoxId) ?? boxes[0]
    const activeDevice = devices.find((device) => device.panelId === active.id) ?? devices[0]
    return { boxes, devices, activeBoxId: active.id, activeDeviceId: activeDevice.id, screenshot: activeDevice.screenshot, screenshotWidth: activeDevice.screenshotWidth, screenshotHeight: activeDevice.screenshotHeight, screenshotMime: activeDevice.screenshotMime, hasUnsavedChanges: true }
  }),

  setBoxTransform: (id, x, y, scale) => set((state) => ({
    devices: state.devices.map((device) => device.id === id ? { ...device, x, y, scale } : device),
    ...(id === state.activeDeviceId ? { deviceX: x, deviceY: y, deviceScale: scale } : {}),
    hasUnsavedChanges: true
  })),

  setScreenshotOffset: (x, y) => set({ screenshotOffsetX: x, screenshotOffsetY: y, hasUnsavedChanges: true }),

  setDevice: (deviceId) => set((state) => ({
    selectedDeviceId: deviceId,
    devices: state.devices.map((device) => device.id === state.activeDeviceId ? { ...device, deviceId } : device),
    hasUnsavedChanges: true
  })),

  setDeviceVariant: (variant) => set({ deviceVariant: variant, hasUnsavedChanges: true }),

  setDeviceAngle: (angle) => set((state) => ({
    deviceAngle: angle,
    devices: state.devices.map((device) => device.id === state.activeDeviceId ? { ...device, deviceAngle: angle } : device),
    hasUnsavedChanges: true
  })),
  setDeviceRotation: (deviceRotation) => set((state) => ({
    deviceRotation,
    devices: state.devices.map((device) => device.id === state.activeDeviceId ? { ...device, deviceRotation } : device),
    hasUnsavedChanges: true
  })),
  setDeviceTransform: (deviceX, deviceY, deviceScale) => set((state) => {
    const scale = Math.max(0.1, Math.min(4, deviceScale))
    return {
      deviceX, deviceY, deviceScale: scale,
      devices: state.devices.map((device) => device.id === state.activeDeviceId ? { ...device, x: deviceX, y: deviceY, scale } : device),
      hasUnsavedChanges: true
    }
  }),
  setOutputDimensions: (outputWidth, outputHeight) => set((state) => {
    const width = Math.max(1, Math.round(outputWidth))
    const height = Math.max(1, Math.round(outputHeight))
    const heightScale = height / state.outputHeight
    const spacing = state.panelGap
    const boxes = state.boxes.map((box, index) => {
      const relativeX = (box.deviceX ?? box.x + box.width / 2) - box.x
      const relativeY = (box.deviceY ?? box.y + box.height / 2) - box.y
      return {
        ...box,
        x: index * (width + spacing),
        y: 0,
        width,
        height,
        deviceX: index * (width + spacing) + (relativeX / box.width) * width,
        deviceY: (relativeY / box.height) * height
      }
    })
    const scaledDeviceScale = Math.max(0.1, Math.min(4, state.deviceScale * heightScale))
    const resizedBoxes = boxes.map((box) => ({ ...box, scale: scaledDeviceScale }))
    const active = resizedBoxes.find((box) => box.id === state.activeBoxId) ?? resizedBoxes[0]
    return {
      outputWidth: Math.max(width, boxes.length * width + Math.max(0, boxes.length - 1) * spacing),
      outputHeight: height,
      boxes: resizedBoxes,
      deviceX: active.deviceX,
      deviceY: active.deviceY,
      deviceScale: scaledDeviceScale,
      hasUnsavedChanges: true
    }
  }),

  setBackground: (background) => set({ background, hasUnsavedChanges: true }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),

  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  setCanvasDimensions: (width, height) => set({ canvasWidth: width, canvasHeight: height }),

  addOverlay: (overlay) => set((state) => ({ overlays: [...state.overlays, overlay], hasUnsavedChanges: true })),

  updateOverlay: (id, updates) =>
    set((state) => ({
      overlays: state.overlays.map((o) => (o.id === id ? { ...o, ...updates } : o)),
      hasUnsavedChanges: true
    })),

  removeOverlay: (id) =>
    set((state) => ({ overlays: state.overlays.filter((o) => o.id !== id), hasUnsavedChanges: true })),

  setDeviceShadow: (enabled) => set({ deviceShadow: enabled, hasUnsavedChanges: true }),

  setScreenshotCornerRadius: (radius) => set({ screenshotCornerRadius: radius, hasUnsavedChanges: true }),

  markSaved: () => set({ hasUnsavedChanges: false }),

  getCanvasConfig: (): CanvasConfig => {
    const state: CanvasState = useCanvasStore.getState()
    return {
      deviceId: state.selectedDeviceId,
      deviceVariant: state.deviceVariant,
      deviceAngle: state.deviceAngle,
      deviceRotation: state.deviceRotation,
      deviceX: state.deviceX,
      deviceY: state.deviceY,
      deviceScale: state.deviceScale,
      outputWidth: state.outputWidth,
      outputHeight: state.outputHeight,
      background: state.background,
      overlays: state.overlays,
      zoom: state.zoom,
      deviceShadow: state.deviceShadow,
      screenshotCornerRadius: state.screenshotCornerRadius,
      boxes: state.boxes,
      panelGap: state.panelGap,
      devices: state.devices
    }
  }
}))
