import { useRef, useState } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { getDeviceById } from '../../lib/devices'
import DeviceSlab from './DeviceSlab'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export default function RotationStudio() {
  const { selectedDeviceId, deviceVariant, deviceRotation, setDeviceAngle, setDeviceRotation } = useCanvasStore()
  const [draft, setDraft] = useState(deviceRotation)
  const dragStart = useRef<{ x: number; y: number; yaw: number; pitch: number; roll: number; angle: number; mode: 'orbit' | 'roll' } | null>(null)
  const device = getDeviceById(selectedDeviceId)
  if (!device) return null

  const commit = () => {
    setDeviceRotation(draft)
    setDeviceAngle('custom')
  }

  return (
    <aside className="absolute right-3 top-14 z-20 w-48 rounded-xl border border-white/70 bg-white/90 p-3 shadow-lg shadow-black/10 backdrop-blur-md">
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold text-primary">Rotation studio</p>
          <p className="text-[10px] text-text-tertiary">Drag the device</p>
        </div>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-medium text-text-secondary">3D</span>
      </div>

      <div
        className="relative flex h-40 touch-none cursor-grab items-center justify-center overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_50%_40%,#fff_0%,#edf0f5_68%,#e3e7ee_100%)] active:cursor-grabbing"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const rect = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - rect.left - rect.width / 2
          const y = event.clientY - rect.top - rect.height / 2
          // The outer zone behaves like the rim of a physical turntable.
          const mode = Math.hypot(x, y) > Math.min(rect.width, rect.height) * 0.31 ? 'roll' : 'orbit'
          dragStart.current = { x: event.clientX, y: event.clientY, yaw: draft.yaw, pitch: draft.pitch, roll: draft.roll, angle: Math.atan2(y, x), mode }
        }}
        onPointerMove={(event) => {
          if (!dragStart.current) return
          if (dragStart.current.mode === 'roll') {
            const rect = event.currentTarget.getBoundingClientRect()
            const x = event.clientX - rect.left - rect.width / 2
            const y = event.clientY - rect.top - rect.height / 2
            let delta = (Math.atan2(y, x) - dragStart.current.angle) * 180 / Math.PI
            if (delta > 180) delta -= 360
            if (delta < -180) delta += 360
            setDraft({ ...draft, roll: dragStart.current.roll + delta })
            return
          }
          const dx = event.clientX - dragStart.current.x
          const dy = event.clientY - dragStart.current.y
          setDraft({ ...draft, yaw: clamp(dragStart.current.yaw + dx * 0.82, -78, 78), pitch: clamp(dragStart.current.pitch - dy * 0.68, -62, 62) })
        }}
        onPointerUp={() => { dragStart.current = null }}
      >
        <div className="absolute bottom-4 h-3 w-20 rounded-full bg-black/10 blur-md" />
        <div className="relative z-10 flex items-center justify-center">
          <DeviceSlab
            device={device}
            variant={deviceVariant}
            orientation={draft}
            maxWidth={120}
            maxHeight={110}
            className="select-none"
          />
        </div>
        <div className="absolute bottom-1.5 text-[9px] text-text-tertiary">Drag center to orbit · drag edge to rotate</div>
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setDraft({ yaw: 0, pitch: 0, roll: 0 })}
          className="rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-text-secondary hover:bg-surface"
        >Reset</button>
        <button
          type="button"
          onClick={commit}
          className="flex-1 rounded-md bg-primary px-2 py-1.5 text-[10px] font-semibold text-white transition-opacity hover:opacity-85"
        >Capture view</button>
      </div>
    </aside>
  )
}
