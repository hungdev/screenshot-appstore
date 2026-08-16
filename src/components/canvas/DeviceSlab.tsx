import { useEffect, useMemo, useRef } from 'react'
import type { DeviceFrame, DeviceRotation } from '../../types'
import { getAngledDeviceBounds, getProjectionMatrix, projectDevice } from '../../lib/deviceAngles'
import { renderDeviceBody } from '../../lib/deviceBody'
import { useImageLoader } from './useImageLoader'

interface DeviceSlabProps {
  device: DeviceFrame
  variant: 'light' | 'dark'
  orientation: DeviceRotation
  maxWidth: number
  maxHeight: number
  className?: string
}

/**
 * Small preview of the device at a given orientation, drawn with the same
 * projection and side wall as the export canvas so the picker and the rotation
 * studio show exactly what the mockup will look like.
 */
export default function DeviceSlab({
  device,
  variant,
  orientation,
  maxWidth,
  maxHeight,
  className
}: DeviceSlabProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const src = device.assetPath[variant] ?? device.assetPath.light
  const frame = useImageLoader(src)
  const projection = useMemo(() => projectDevice(device, orientation), [device, orientation])

  // Scaled off the flat device so every angle of the same device matches size.
  const scale = Math.min(maxWidth / device.width, maxHeight / device.height)
  const bounds = getAngledDeviceBounds(device, projection)
  const width = bounds.width * scale
  const height = bounds.height * scale

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!frame) return
    ctx.imageSmoothingQuality = 'high'

    const body = renderDeviceBody(device, frame, projection, scale * ratio)
    if (body) {
      ctx.drawImage(
        body.canvas,
        width / 2 + body.x * scale,
        height / 2 + body.y * scale,
        body.width * scale,
        body.height * scale
      )
    }

    const { m00, m01, m10, m11 } = getProjectionMatrix(projection)
    ctx.translate(width / 2, height / 2)
    ctx.scale(scale, scale)
    ctx.transform(m00, m10, m01, m11, 0, 0)
    ctx.drawImage(frame, -device.width / 2, -device.height / 2, device.width, device.height)
  }, [device, frame, projection, scale, width, height])

  return <canvas ref={canvasRef} className={className} style={{ width, height }} />
}
