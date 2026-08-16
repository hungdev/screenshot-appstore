import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCanvasStore } from '../../store/useCanvasStore'
import { devices } from '../../lib/devices'
import Button from '../ui/Button'

export default function SourcePanel() {
  const navigate = useNavigate()
  const { screenshot, screenshotMime, boxes, devices: mockupDevices, activeBoxId, activeDeviceId, panelGap, setActiveBox, setActiveDevice, setPanelGap, addBox, addDevice, removeBox, removeDevice } = useCanvasStore()
  const [showDevicePicker, setShowDevicePicker] = useState(false)
  const activePanelDevices = mockupDevices.filter((device) => device.panelId === activeBoxId)
  const deviceCategories = ['phone', 'tablet', 'laptop', 'display', 'browser'] as const

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-primary">Mockup panels</div>
          <div className="text-[10px] text-text-tertiary">{boxes.length} panel{boxes.length === 1 ? '' : 's'} on canvas</div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={addBox}>+ Panel</Button>
          <Button size="sm" onClick={() => setShowDevicePicker((open) => !open)}>+ Device</Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {boxes.map((box, index) => (
          <div key={box.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${box.id === activeBoxId ? 'border-primary bg-primary/5' : 'border-border'}`}>
            <button onClick={() => setActiveBox(box.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface text-[10px] text-text-secondary">{index + 1}</span>
              <span className="truncate text-xs text-primary">{mockupDevices.some((device) => device.panelId === box.id && device.screenshot) ? 'Screenshot ready' : 'Empty panel'}</span>
            </button>
            {boxes.length > 1 && (
              <button onClick={() => removeBox(box.id)} className="text-xs text-text-tertiary hover:text-danger" title="Remove box">×</button>
            )}
          </div>
        ))}
      </div>

      {showDevicePicker && (
        <div className="rounded-lg border border-border bg-surface p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">Choose device</span>
            <button onClick={() => setShowDevicePicker(false)} className="text-xs text-text-tertiary">×</button>
          </div>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {deviceCategories.map((category) => {
              const categoryDevices = devices.filter((device) => device.category === category && !device.noCutoutOf).slice(0, 8)
              if (categoryDevices.length === 0) return null
              return (
                <div key={category}>
                  <div className="mb-1 text-[10px] capitalize text-text-tertiary">{category}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {categoryDevices.map((device) => (
                      <button
                        key={device.id}
                        onClick={() => { addDevice(device.id); setShowDevicePicker(false) }}
                        className="truncate rounded border border-border bg-white px-2 py-1.5 text-left text-[10px] text-primary hover:border-primary hover:bg-primary/5"
                        title={device.name}
                      >
                        {device.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {activePanelDevices.map((device, index) => {
          const frame = devices.find((item) => item.id === device.deviceId)
          return (
            <div key={device.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${device.id === activeDeviceId ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <button onClick={() => setActiveDevice(device.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface text-[10px] text-text-secondary">{index + 1}</span>
                <span className="truncate text-[10px] text-primary">{frame?.name ?? 'Device'}{device.screenshot ? ' · preview' : ''}</span>
              </button>
              {mockupDevices.length > 1 && <button onClick={() => removeDevice(device.id)} className="text-xs text-text-tertiary hover:text-danger">×</button>}
            </div>
          )
        })}
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-text-secondary">
        <span>Gap between panels</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            max="1000"
            value={panelGap}
            onChange={(event) => setPanelGap(Number(event.target.value) || 0)}
            className="w-16 rounded-md border border-border bg-white px-2 py-1 text-right text-xs text-primary outline-none focus:border-primary"
          />
          <span className="text-[10px] text-text-tertiary">px</span>
        </span>
      </label>

      {screenshot ? (
        <>
          <div className="rounded-lg border border-border bg-surface p-2">
            <img
              src={`data:${screenshotMime};base64,${screenshot}`}
              alt="Current capture"
              className="w-full rounded object-contain"
              style={{ maxHeight: '120px' }}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigate('/library')}>
              Browse captures
            </Button>
            <Button variant="ghost" size="sm" onClick={() => useCanvasStore.getState().clearScreenshot()}>
              Clear
            </Button>
          </div>
        </>
      ) : (
        <div className="text-center">
          <p className="mb-3 text-xs text-text-secondary">No screenshot captured yet</p>
          <Button size="sm" onClick={() => navigate('/capture')} className="w-full">
            Capture screenshot
          </Button>
        </div>
      )}
    </div>
  )
}
