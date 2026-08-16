import type { DeviceFrame } from '../types'
import { getLocalDepth, getProjectionMatrix, type DeviceProjection } from './deviceAngles'

/** Minimal 2D path surface — matches both a canvas context and Konva's wrapper. */
export interface PathTarget {
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void
  closePath: () => void
}

export function roundedRectPath(ctx: PathTarget, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

export interface DeviceBodyRender {
  canvas: HTMLCanvasElement
  /** Placement relative to the projected centre of the device face. */
  x: number
  y: number
  width: number
  height: number
}

const SUPERSAMPLE = 2
// Each entry is a full-size RGBA canvas, so the cache only exists to keep
// re-renders of the same view free.
const CACHE_LIMIT = 3
const cache = new Map<string, DeviceBodyRender>()

const round = (value: number, digits: number) => Number(value.toFixed(digits))

/**
 * Width of the outer rail of the frame artwork. Only that strip is swept: the
 * inner part of a bezel is the black glass border, which belongs to the front
 * of the device and would turn the whole side wall dark.
 */
function getRailWidth(device: DeviceFrame): number {
  const bezel = Math.max(1, Math.min(device.screenBounds.x, device.screenBounds.y))
  return Math.max(1.5, Math.min(bezel * 0.45, Math.min(device.width, device.height) * 0.035))
}

const railCache = new Map<string, HTMLCanvasElement>()

/**
 * The outer rail of the frame, cut from the asset's own silhouette so that
 * photographed frames (which float inside their canvas, often with a baked in
 * shadow) work the same as the vector outlines.
 */
function getRailSprite(device: DeviceFrame, frame: HTMLImageElement, ss: number): HTMLCanvasElement | null {
  const key = `${device.id}|${frame.src}|${ss}`
  const cached = railCache.get(key)
  if (cached) return cached

  const width = Math.max(1, Math.round(device.width * ss))
  const height = Math.max(1, Math.round(device.height * ss))

  const sprite = document.createElement('canvas')
  sprite.width = width
  sprite.height = height
  const spriteCtx = sprite.getContext('2d')
  if (!spriteCtx) return null
  spriteCtx.drawImage(frame, 0, 0, width, height)

  // Silhouette with the screen punched back in, so only the outside contour of
  // the body counts as an edge. Traced at 1:1 to keep the pass cheap — the
  // result is a mask for a smear, not artwork.
  const maskWidth = Math.max(1, Math.round(device.width))
  const maskHeight = Math.max(1, Math.round(device.height))
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = maskWidth
  maskCanvas.height = maskHeight
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!maskCtx) return null
  maskCtx.drawImage(frame, 0, 0, maskWidth, maskHeight)
  maskCtx.fillStyle = '#000000'
  const screen = device.screenBounds
  roundedRectPath(maskCtx, screen.x, screen.y, screen.width, screen.height, device.cornerRadius)
  maskCtx.fill()

  const maskImage = maskCtx.getImageData(0, 0, maskWidth, maskHeight)
  const maskPixels = maskImage.data
  const solid = new Uint8Array(maskWidth * maskHeight)
  for (let i = 0; i < solid.length; i += 1) {
    solid[i] = maskPixels[i * 4 + 3] > 200 ? 1 : 0
  }

  // Skip the outermost pixels: on photographed frames those are the darkened
  // contour of the body, and they are the ones the sweep repeats.
  const distance = distanceToOutside(solid, maskWidth, maskHeight)
  const railWidth = getRailWidth(device)
  const near = Math.max(2, railWidth * 0.2) * ORTHOGONAL
  const far = near + railWidth * ORTHOGONAL
  for (let i = 0; i < solid.length; i += 1) {
    maskPixels[i * 4 + 3] = solid[i] && distance[i] >= near && distance[i] <= far ? 255 : 0
  }
  maskCtx.putImageData(maskImage, 0, 0)

  spriteCtx.globalCompositeOperation = 'destination-in'
  spriteCtx.drawImage(maskCanvas, 0, 0, width, height)
  spriteCtx.globalCompositeOperation = 'source-over'

  railCache.set(key, sprite)
  if (railCache.size > 3) {
    const oldest = railCache.keys().next().value
    if (oldest !== undefined) railCache.delete(oldest)
  }
  return sprite
}

// Chamfer weights: a square structuring element would leave a wider rail
// around rounded corners, so distances are measured instead.
const ORTHOGONAL = 5
const DIAGONAL = 7

/** Chamfer distance from every solid pixel to the nearest empty one. */
function distanceToOutside(mask: Uint8Array, width: number, height: number): Int32Array {
  const far = 0x3fffffff
  const dist = new Int32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (!mask[i]) dist[i] = 0
      else if (x === 0 || y === 0 || x === width - 1 || y === height - 1) dist[i] = ORTHOGONAL
      else dist[i] = far
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      if (!dist[i]) continue
      let best = dist[i]
      const up = i - width
      if (dist[i - 1] + ORTHOGONAL < best) best = dist[i - 1] + ORTHOGONAL
      if (dist[up] + ORTHOGONAL < best) best = dist[up] + ORTHOGONAL
      if (dist[up - 1] + DIAGONAL < best) best = dist[up - 1] + DIAGONAL
      if (dist[up + 1] + DIAGONAL < best) best = dist[up + 1] + DIAGONAL
      dist[i] = best
    }
  }

  for (let y = height - 2; y > 0; y -= 1) {
    for (let x = width - 2; x > 0; x -= 1) {
      const i = y * width + x
      if (!dist[i]) continue
      let best = dist[i]
      const down = i + width
      if (dist[i + 1] + ORTHOGONAL < best) best = dist[i + 1] + ORTHOGONAL
      if (dist[down] + ORTHOGONAL < best) best = dist[down] + ORTHOGONAL
      if (dist[down + 1] + DIAGONAL < best) best = dist[down + 1] + DIAGONAL
      if (dist[down - 1] + DIAGONAL < best) best = dist[down - 1] + DIAGONAL
      dist[i] = best
    }
  }
  return dist
}

/**
 * Builds the side wall of the device as an offscreen canvas.
 *
 * The wall is a sweep of the frame's own outer rail along the projected depth
 * vector, so it always matches the silhouette and the colour of whichever
 * frame asset is loaded — no per-device outline or palette to maintain.
 */
export function renderDeviceBody(
  device: DeviceFrame | undefined,
  frame: HTMLImageElement | null,
  projection: DeviceProjection,
  pixelRatio = SUPERSAMPLE
): DeviceBodyRender | null {
  if (!device || !frame || !frame.complete || !frame.naturalWidth) return null

  const depth = Math.hypot(projection.depthX, projection.depthY)
  if (depth < 0.75) return null

  const key = [
    device.id,
    frame.src,
    round(pixelRatio, 3),
    round(projection.rotation, 2),
    round(projection.scaleX, 4),
    round(projection.scaleY, 4),
    round(projection.skewX, 4),
    round(projection.depthX, 2),
    round(projection.depthY, 2)
  ].join('|')
  const cached = cache.get(key)
  if (cached) return cached

  const { m00, m01, m10, m11 } = getProjectionMatrix(projection)
  const hw = device.width / 2
  const hh = device.height / 2

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
    const px = m00 * lx + m01 * ly
    const py = m10 * lx + m11 * ly
    for (const [dx, dy] of [[0, 0], [projection.depthX, projection.depthY]]) {
      minX = Math.min(minX, px + dx)
      maxX = Math.max(maxX, px + dx)
      minY = Math.min(minY, py + dy)
      maxY = Math.max(maxY, py + dy)
    }
  }
  const pad = 2
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad

  const width = maxX - minX
  const height = maxY - minY
  const ss = pixelRatio

  // The rail is always traced at full detail and scaled here, so previews
  // never pay for it again.
  const rail = getRailSprite(device, frame, SUPERSAMPLE)
  if (!rail) return null

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width * ss))
  canvas.height = Math.max(1, Math.ceil(height * ss))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'

  ctx.setTransform(m00 * ss, m10 * ss, m01 * ss, m11 * ss, -minX * ss, -minY * ss)
  ctx.drawImage(rail, -hw, -hh, device.width, device.height)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // Smear the rail along the depth vector by repeatedly compositing the canvas
  // onto itself, which covers the whole wall in log2 steps. Each copy lands
  // *under* the previous one so the whole wall keeps the colour of the rail's
  // outer edge instead of the last stripe that happens to reach it.
  const total = depth * ss
  const ux = projection.depthX / depth
  const uy = projection.depthY / depth
  ctx.globalCompositeOperation = 'destination-over'
  let covered = 0
  let guard = 0
  while (covered < total - 0.01 && guard < 64) {
    const step = Math.min(Math.max(covered, 1), total - covered)
    ctx.drawImage(canvas, ux * step, uy * step)
    covered += step
    guard += 1
  }
  ctx.globalCompositeOperation = 'source-over'

  // Shade across the wall: a highlight where it meets the glass, falling off
  // to a dark back edge. The gradient starts where the face silhouette ends.
  const localDepth = getLocalDepth(projection)
  const exit = Math.min(
    Math.abs(localDepth.x) > 1e-6 ? hw / Math.abs(localDepth.x) : Infinity,
    Math.abs(localDepth.y) > 1e-6 ? hh / Math.abs(localDepth.y) : Infinity
  )
  const ex = Number.isFinite(exit) ? localDepth.x * exit : 0
  const ey = Number.isFinite(exit) ? localDepth.y * exit : 0
  const startX = (m00 * ex + m01 * ey - minX) * ss
  const startY = (m10 * ex + m11 * ey - minY) * ss
  const gradient = ctx.createLinearGradient(
    startX,
    startY,
    startX + projection.depthX * ss,
    startY + projection.depthY * ss
  )
  gradient.addColorStop(0, 'rgba(255,255,255,0.18)')
  gradient.addColorStop(0.14, 'rgba(0,0,0,0)')
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.3)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-over'

  const render: DeviceBodyRender = { canvas, x: minX, y: minY, width, height }
  cache.set(key, render)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return render
}
