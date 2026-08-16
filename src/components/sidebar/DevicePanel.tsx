import { useState, useMemo, useEffect } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { devices, deviceCategories, getDevicesByCategory, getDeviceById } from '../../lib/devices'
import { getDeviceAnglePresets } from '../../lib/deviceAngles'
import DeviceSlab from '../canvas/DeviceSlab'
import RotationStudio from '../canvas/RotationStudio'
import type { DeviceFrame } from '../../types'

export default function DevicePanel() {
  const { selectedDeviceId, deviceVariant, deviceAngle, screenshotCornerRadius, rotationStudioPlacement, setDevice, setDeviceVariant, setDeviceAngle, setScreenshotCornerRadius, setRotationStudioPlacement } = useCanvasStore()
  const [activeCategory, setActiveCategory] = useState<string>('phone')

  // Auto-select category tab to match the currently selected device
  const selectedDevice = getDeviceById(selectedDeviceId)
  useEffect(() => {
    if (selectedDevice) {
      setActiveCategory(selectedDevice.category)
    }
  }, [selectedDeviceId])
  const [search, setSearch] = useState('')

  const hasVariants = selectedDevice ? selectedDevice.variants.length > 1 : false
  const anglePresets = getDeviceAnglePresets(selectedDevice)

  // A device family may expose fewer usable angles (for instance laptops do
  // not have the phone-only flat views). Keep the selection valid on switch.
  useEffect(() => {
    if (deviceAngle !== 'custom' && !anglePresets.some((preset) => preset.id === deviceAngle)) {
      setDeviceAngle('front')
    }
  }, [selectedDeviceId, deviceAngle, setDeviceAngle])

  const filteredDevices = useMemo(() => {
    let list: DeviceFrame[]
    if (search.trim()) {
      // Include no-cutout variants when searching
      list = devices.filter((d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.noCutoutOf && devices.find(p => p.id === d.noCutoutOf)?.name.toLowerCase().includes(search.toLowerCase()))
      )
    } else {
      // Exclude no-cutout variants from the main list — they render inline under their parent
      list = getDevicesByCategory(activeCategory).filter((d) => !d.noCutoutOf)
    }
    return list
  }, [activeCategory, search])

  // Build a lookup: parentId → no-cutout device
  const noCutoutMap = useMemo(() => {
    const map: Record<string, DeviceFrame> = {}
    for (const d of devices) {
      if (d.noCutoutOf) map[d.noCutoutOf] = d
    }
    return map
  }, [])

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'phone': return '📱'
      case 'tablet': return '📱'
      case 'laptop': return '💻'
      case 'display': return '🖥️'
      case 'browser': return '🌐'
      default: return '📱'
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <input
        type="text"
        placeholder="Search devices..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none"
      />

      {/* Category tabs */}
      {!search && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {deviceCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                activeCategory === cat.id
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-surface'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Device grid */}
      <div className="flex max-h-[360px] flex-col gap-1 overflow-y-auto">
        {filteredDevices.map((device) => {
          const noCutout = noCutoutMap[device.id]
          return (
            <div key={device.id} className="flex flex-col gap-0.5">
              {/* Standard device row */}
              <button
                onClick={() => setDevice(device.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-120 ${
                  selectedDeviceId === device.id
                    ? 'bg-primary text-white'
                    : 'text-primary hover:bg-surface'
                }`}
              >
                <div className="flex flex-1 items-center gap-3">
                  <span className="text-lg">{getCategoryIcon(device.category)}</span>
                  <div>
                    <div className="text-sm font-medium">{device.name}</div>
                    <div className={`text-[10px] ${
                      selectedDeviceId === device.id ? 'text-white/70' : 'text-text-tertiary'
                    }`}>
                      {device.width} x {device.height}
                    </div>
                  </div>
                </div>
              </button>

              {/* No-cutout variant — shown inline under parent when available */}
              {noCutout && (
                <button
                  onClick={() => setDevice(noCutout.id)}
                  className={`ml-6 flex items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors duration-120 ${
                    selectedDeviceId === noCutout.id
                      ? 'bg-primary text-white'
                      : 'text-primary hover:bg-surface'
                  }`}
                >
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-sm">✂️</span>
                    <div className="text-xs font-medium">{noCutout.name}</div>
                  </div>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    selectedDeviceId === noCutout.id
                      ? 'bg-white/20 text-white'
                      : 'bg-surface text-text-secondary'
                  }`}>
                    No Cutout
                  </span>
                </button>
              )}
            </div>
          )
        })}
        {filteredDevices.length === 0 && (
          <div className="py-4 text-center text-xs text-text-tertiary">
            No devices found
          </div>
        )}
      </div>

      {/* Light/Dark toggle — only shown for devices with multiple variants (browsers) */}
      {hasVariants && (
        <div>
          <div className="mb-2 text-xs text-text-secondary">Variant</div>
          <div className="flex rounded-lg border border-border">
            <button
              onClick={() => setDeviceVariant('light')}
              className={`flex-1 rounded-l-lg py-1.5 text-xs font-medium transition-colors ${
                deviceVariant === 'light'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              Light
            </button>
            <button
              onClick={() => setDeviceVariant('dark')}
              className={`flex-1 rounded-r-lg py-1.5 text-xs font-medium transition-colors ${
                deviceVariant === 'dark'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              Dark
            </button>
          </div>
        </div>
      )}

      {/* Device view — a concise visual picker inspired by the view cards in Screenshots Pro. */}
      {selectedDevice && anglePresets.length > 1 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs text-text-secondary">Device view</span>
            <span className="text-[10px] text-text-tertiary">{anglePresets.length} views</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {anglePresets.map((preset) => {
              const isActive = deviceAngle === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDeviceAngle(preset.id)}
                  title={preset.description}
                  aria-pressed={isActive}
                  className={`group rounded-lg border px-1.5 pb-1.5 pt-2 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isActive
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-border bg-white text-text-secondary hover:border-primary/30 hover:bg-surface'
                  }`}
                >
                  <span className="flex h-14 items-center justify-center overflow-hidden rounded-md bg-black/[0.035]">
                    <DeviceSlab
                      device={selectedDevice}
                      variant={deviceVariant}
                      orientation={preset.orientation}
                      maxWidth={44}
                      maxHeight={42}
                    />
                  </span>
                  <span className="mt-1 block truncate text-center text-[10px] font-medium leading-none">{preset.name}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setDeviceAngle(deviceAngle === 'custom' ? 'front' : 'custom')}
            className={`mt-1.5 flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[10px] font-medium transition-colors ${
              deviceAngle === 'custom'
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-white text-text-secondary hover:border-primary/30 hover:bg-surface'
            }`}
          >
            <span>Custom 3D view</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${deviceAngle === 'custom' ? 'bg-white/20 text-white' : 'bg-surface text-text-tertiary'}`}>3D</span>
          </button>
          {deviceAngle === 'custom' && (
            <>
              <div className="mt-2 flex items-center justify-between rounded-md bg-surface px-2 py-1.5">
                <span className="text-[10px] text-text-secondary">Studio placement</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rotationStudioPlacement === 'canvas'}
                  onClick={() => setRotationStudioPlacement(rotationStudioPlacement === 'canvas' ? 'panel' : 'canvas')}
                  className={`relative h-5 w-9 rounded-full transition-colors ${rotationStudioPlacement === 'canvas' ? 'bg-primary' : 'bg-border'}`}
                  title={rotationStudioPlacement === 'canvas' ? 'Show in Device view' : 'Float on canvas'}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${rotationStudioPlacement === 'canvas' ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {rotationStudioPlacement === 'panel' && <div className="mt-2"><RotationStudio /></div>}
            </>
          )}
        </div>
      )}

      {/* Screenshot corner radius */}
      {selectedDevice && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-text-secondary">Corner Radius</span>
            <button
              onClick={() => setScreenshotCornerRadius(null)}
              className={`text-[10px] font-medium transition-colors ${
                screenshotCornerRadius === null
                  ? 'text-text-tertiary'
                  : 'text-primary hover:text-primary/80'
              }`}
              disabled={screenshotCornerRadius === null}
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={Math.round(Math.min(selectedDevice.screenBounds.width, selectedDevice.screenBounds.height) / 2)}
              value={screenshotCornerRadius ?? selectedDevice.cornerRadius}
              onChange={(e) => setScreenshotCornerRadius(parseInt(e.target.value, 10))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
            />
            <span className="w-8 text-right text-[10px] tabular-nums text-text-secondary">
              {screenshotCornerRadius ?? selectedDevice.cornerRadius}px
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
