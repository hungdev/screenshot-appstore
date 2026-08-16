import type { DeviceAngle, DeviceFrame, DeviceRotation } from '../types'

export type { DeviceAngle } from '../types'

const DEG = Math.PI / 180
const MAX_YAW = 78
const MAX_PITCH = 62

/**
 * Body depth as a fraction of the frame width. A modern phone is roughly
 * 8.5mm thick over a 72mm body, which is what sells the side wall when the
 * device is turned away from the camera. Families we only tilt slightly, or
 * that are not a simple slab (laptops), keep a flat body.
 */
const THICKNESS_RATIO: Record<DeviceFrame['category'], number> = {
  phone: 0.1,
  tablet: 0.032,
  laptop: 0,
  display: 0,
  browser: 0
}

export interface DeviceProjection {
  /** Konva/CSS affine decomposition of the orthographic projection. */
  rotation: number
  scaleX: number
  scaleY: number
  skewX: number
  skewY: number
  /** Screen-space offset from the front face to the back of the body. */
  depthX: number
  depthY: number
  /** Body depth in frame units, before projection. */
  thickness: number
}

export interface DeviceAnglePreset extends DeviceProjection {
  id: DeviceAngle
  name: string
  description: string
  orientation: DeviceRotation
}

interface AnglePresetSpec {
  id: DeviceAngle
  name: string
  description: string
  orientation: DeviceRotation
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function getDeviceThickness(device: DeviceFrame | undefined): number {
  if (!device) return 0
  return device.width * (THICKNESS_RATIO[device.category] ?? 0)
}

/**
 * Orthographic projection of the device plane after `rotateX(pitch)
 * rotateY(yaw) rotateZ(roll)`, decomposed into the affine attributes Konva
 * accepts. Because the projection is affine the result is exact, so the frame,
 * the screenshot and the extruded side wall all stay in register.
 */
export function projectDevice(device: DeviceFrame | undefined, orientation: DeviceRotation): DeviceProjection {
  const pitch = clamp(orientation.pitch, -MAX_PITCH, MAX_PITCH) * DEG
  const yaw = clamp(orientation.yaw, -MAX_YAW, MAX_YAW) * DEG
  const roll = orientation.roll * DEG

  const ca = Math.cos(pitch)
  const sa = Math.sin(pitch)
  const cb = Math.cos(yaw)
  const sb = Math.sin(yaw)
  const cc = Math.cos(roll)
  const sc = Math.sin(roll)

  // First two rows of Rx·Ry·Rz — the x/y image of the device's own axes.
  const m00 = cb * cc
  const m01 = -cb * sc
  const m10 = ca * sc + sa * sb * cc
  const m11 = ca * cc - sa * sb * sc

  const rotation = Math.atan2(m10, m00)
  const cr = Math.cos(rotation)
  const sr = Math.sin(rotation)
  const scaleX = Math.max(Math.hypot(m00, m10), 1e-3)
  const shearedY = m01 * cr + m11 * sr
  const rawScaleY = m11 * cr - m01 * sr
  const scaleY = Math.abs(rawScaleY) < 1e-3 ? 1e-3 : rawScaleY

  const thickness = getDeviceThickness(device)
  // Third column of the same matrix is the face normal; the body sits behind it.
  return {
    rotation: rotation / DEG,
    scaleX,
    scaleY,
    skewX: shearedY / scaleY,
    skewY: 0,
    depthX: -thickness * sb,
    depthY: thickness * sa * cb,
    thickness
  }
}

/** The 2x2 matrix a projection applies to device-local coordinates. */
export function getProjectionMatrix(projection: DeviceProjection) {
  const r = projection.rotation * DEG
  const cr = Math.cos(r)
  const sr = Math.sin(r)
  const sheared = projection.skewX * projection.scaleY
  return {
    m00: cr * projection.scaleX,
    m10: sr * projection.scaleX,
    m01: cr * sheared - sr * projection.scaleY,
    m11: sr * sheared + cr * projection.scaleY
  }
}

/** Depth vector expressed in device-local units instead of screen units. */
export function getLocalDepth(projection: DeviceProjection) {
  const { m00, m01, m10, m11 } = getProjectionMatrix(projection)
  const det = m00 * m11 - m01 * m10
  const safeDet = Math.abs(det) < 1e-4 ? (det < 0 ? -1e-4 : 1e-4) : det
  return {
    x: (m11 * projection.depthX - m01 * projection.depthY) / safeDet,
    y: (m00 * projection.depthY - m10 * projection.depthX) / safeDet
  }
}

const front: AnglePresetSpec = {
  id: 'front', name: 'Front', description: 'Straight on', orientation: { yaw: 0, pitch: 0, roll: 0 }
}

/**
 * Deliberately small, device-aware set of views. These are the practical
 * angles for the silhouette of each device family rather than one long list
 * that makes, for example, a laptop look like a phone lying on a table.
 */
const phoneSpecs: AnglePresetSpec[] = [
  front,
  { id: 'tilt-left', name: 'Floor left', description: 'Lying at a left angle', orientation: { yaw: 22, pitch: 9, roll: -13 } },
  { id: 'tilt-right', name: 'Floor right', description: 'Lying at a right angle', orientation: { yaw: -22, pitch: 9, roll: 13 } },
  { id: 'flat-left', name: 'Edge left', description: 'Thin left-side view', orientation: { yaw: 64, pitch: 0, roll: 0 } },
  { id: 'flat-right', name: 'Edge right', description: 'Thin right-side view', orientation: { yaw: -64, pitch: 0, roll: 0 } }
]

const tabletSpecs: AnglePresetSpec[] = [
  front,
  { id: 'tilt-left', name: 'Floor left', description: 'Lying at a left angle', orientation: { yaw: 15, pitch: 6, roll: -8 } },
  { id: 'tilt-right', name: 'Floor right', description: 'Lying at a right angle', orientation: { yaw: -15, pitch: 6, roll: 8 } },
  { id: 'flat-left', name: 'Edge left', description: 'Thin left-side view', orientation: { yaw: 55, pitch: 0, roll: 0 } },
  { id: 'flat-right', name: 'Edge right', description: 'Thin right-side view', orientation: { yaw: -55, pitch: 0, roll: 0 } }
]

const desktopSpecs: AnglePresetSpec[] = [
  front,
  { id: 'tilt-left', name: 'Tilt left', description: 'Perspective view', orientation: { yaw: 14, pitch: 3, roll: -4 } },
  { id: 'tilt-right', name: 'Tilt right', description: 'Perspective view', orientation: { yaw: -14, pitch: 3, roll: 4 } }
]

function getSpecs(device: DeviceFrame | undefined): AnglePresetSpec[] {
  if (!device) return [front]
  if (device.category === 'phone') return phoneSpecs
  if (device.category === 'tablet') return tabletSpecs
  return desktopSpecs
}

function toPreset(device: DeviceFrame | undefined, spec: AnglePresetSpec): DeviceAnglePreset {
  return { ...spec, ...projectDevice(device, spec.orientation) }
}

export function getDeviceAnglePresets(device: DeviceFrame | undefined): DeviceAnglePreset[] {
  return getSpecs(device).map((spec) => toPreset(device, spec))
}

export function getDeviceAnglePreset(device: DeviceFrame | undefined, angle: DeviceAngle): DeviceAnglePreset {
  const spec = getSpecs(device).find((item) => item.id === angle) ?? front
  return toPreset(device, spec)
}

/** Translate the free rotation control into the transform used by Konva/export. */
export function getCustomDeviceAngle(device: DeviceFrame | undefined, rotation: DeviceRotation): DeviceAnglePreset {
  return {
    id: 'custom',
    name: 'Custom view',
    description: 'Captured from rotation studio',
    orientation: rotation,
    ...projectDevice(device, rotation)
  }
}

/**
 * Bounding box of the projected body, kept symmetric around the face centre
 * because that is the point the canvas centres the device on.
 */
export function getAngledDeviceBounds(device: DeviceFrame, projection: DeviceProjection) {
  const { m00, m01, m10, m11 } = getProjectionMatrix(projection)
  const hw = device.width / 2
  const hh = device.height / 2
  let halfWidth = 0
  let halfHeight = 0
  for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
    const x = m00 * lx + m01 * ly
    const y = m10 * lx + m11 * ly
    for (const [dx, dy] of [[0, 0], [projection.depthX, projection.depthY]]) {
      halfWidth = Math.max(halfWidth, Math.abs(x + dx))
      halfHeight = Math.max(halfHeight, Math.abs(y + dy))
    }
  }
  return { width: Math.ceil(halfWidth * 2), height: Math.ceil(halfHeight * 2) }
}
