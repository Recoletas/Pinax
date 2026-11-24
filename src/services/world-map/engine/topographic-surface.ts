import type { VoronoiMapData } from './types'

// Sample the existing cell measurements onto a regular grid. Compact weights
// avoid hard edges between biomes; the shoreline mask retains small islands.
function sampleRelief(data: VoronoiMapData) {
  const { cells, width, height } = data
  const spacing = Math.max(2, Math.sqrt(width * height / cells.length) / 3)
  const cols = Math.ceil(width / spacing) + 1
  const rows = Math.ceil(height / spacing) + 1
  const heights = new Float32Array(cols * rows)
  const weights = new Float32Array(cols * rows)
  const radius = 5
  for (let i = 0; i < cells.length; i++) {
    const cx = cells.p[2 * i] / spacing, cy = cells.p[2 * i + 1] / spacing
    const altitude = cells.h[i]
    for (let y = Math.max(0, Math.ceil(cy - radius)); y <= Math.min(rows - 1, cy + radius); y++) {
      for (let x = Math.max(0, Math.ceil(cx - radius)); x <= Math.min(cols - 1, cx + radius); x++) {
        const d = 1 - ((x - cx) ** 2 + (y - cy) ** 2) / (radius * radius)
        if (d <= 0) continue
        const w = d * d * d, k = y * cols + x
        weights[k] += w
        heights[k] += altitude * w
      }
    }
  }
  for (let k = 0; k < weights.length; k++) {
    if (!weights[k]) continue
    heights[k] /= weights[k]
  }
  // Illustrate incised upland channels on the display grid. Use the strongest
  // cut at confluences so overlapping reaches cannot dig twice as deep.
  const incision = new Float32Array(heights.length)
  for (const river of data.rivers) {
    for (let i = 1; i < river.points.length; i++) {
      const cell = river.cells[i], upstream = river.cells[i - 1]
      if (!cells.c[upstream]?.includes(cell)) continue
      const [ax, ay] = river.points[i - 1].map(v => v / spacing)
      const [bx, by] = river.points[i].map(v => v / spacing)
      const vx = bx - ax, vy = by - ay
      const reachLength2 = vx * vx + vy * vy
      if (!reachLength2) continue
      const radius = 2.5 + Math.min(2.5, (river.widths[i] || 1) / 2)
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - radius)); y <= Math.min(rows - 1, Math.ceil(Math.max(ay, by) + radius)); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius)); x <= Math.min(cols - 1, Math.ceil(Math.max(ax, bx) + radius)); x++) {
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / reachLength2))
          const dist = Math.hypot(x - ax - t * vx, y - ay - t * vy)
          if (dist >= radius) continue
          const k = y * cols + x
          const depth = Math.min(8, Math.max(0, heights[k] - 24) * 0.22)
          incision[k] = Math.max(incision[k], depth * (1 - dist / radius) ** 1.5)
        }
      }
    }
  }
  for (let k = 0; k < heights.length; k++) heights[k] -= incision[k]
  const normalsX = new Float32Array(heights.length)
  const normalsY = new Float32Array(heights.length)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const k = y * cols + x
      const left = Math.max(0, x - 1), right = Math.min(cols - 1, x + 1)
      const top = Math.max(0, y - 1), bottom = Math.min(rows - 1, y + 1)
      normalsX[k] = (heights[y * cols + right] - heights[y * cols + left]) / ((right - left) * spacing)
      normalsY[k] = (heights[bottom * cols + x] - heights[top * cols + x]) / ((bottom - top) * spacing)
    }
  }
  return { cols, rows, spacing, heights, normalsX, normalsY }
}

// Two chamfer passes measure distance to the rendered coastline, including
// island masks and peninsulas smaller than the relief sampling grid.
function coastDistances(image: ImageData) {
  const { width, height, data } = image
  const distances = new Float32Array(width * height)
  for (let i = 0; i < distances.length; i++) distances[i] = data[i * 4 + 3] >= 128 ? 0 : Infinity
  for (const direction of [1, -1]) {
    for (let row = 0; row < height; row++) {
      const y = direction === 1 ? row : height - 1 - row
      for (let col = 0; col < width; col++) {
        const x = direction === 1 ? col : width - 1 - col
        const i = y * width + x
        if (distances[i] === 0) continue
        let best = distances[i]
        if (col > 0) best = Math.min(best, distances[i - direction] + 1)
        if (row > 0) {
          const above = i - direction * width
          best = Math.min(best, distances[above] + 1)
          if (x > 0) best = Math.min(best, distances[above - 1] + Math.SQRT2)
          if (x + 1 < width) best = Math.min(best, distances[above + 1] + Math.SQRT2)
        }
        distances[i] = best
      }
    }
  }
  return distances
}

// Elevation is the generator's 0–100 scale. Offshore bands express distance
// from land, not measured ocean depth.
const landStops = [
  [20, 244, 238, 213], [28, 228, 232, 202], [39, 210, 221, 189],
  [51, 203, 212, 184], [65, 216, 205, 179], [80, 215, 200, 181],
  [90, 229, 223, 211], [100, 244, 241, 229],
]
const seaStops = [[0, 214, 234, 232], [1.5, 196, 223, 228], [4, 184, 214, 222],
  [9, 179, 211, 220], [21, 175, 207, 217]]

function gradient(stops: number[][], value: number) {
  let i = 1
  while (i < stops.length - 1 && value > stops[i][0]) i++
  const a = stops[i - 1], b = stops[i]
  const t = Math.max(0, Math.min(1, (value - a[0]) / (b[0] - a[0])))
  return [1, 2, 3].map(c => a[c] + t * (b[c] - a[c]))
}

const land = Array.from({ length: 1001 }, (_, i) => gradient(landStops, i / 10))
const sea = Array.from({ length: 211 }, (_, i) => gradient(seaStops, i / 10))

export function drawTopographicSurface(ctx: CanvasRenderingContext2D, data: VoronoiMapData,
  shaded: boolean, clipLand?: (ctx: CanvasRenderingContext2D) => void) {
  const { width, height, cells, vertices } = data
  const surface = document.createElement('canvas')
  const scale = Math.min(ctx.canvas.width / width, 2, Math.sqrt(2000000 / (width * height)))
  surface.width = Math.max(1, Math.round(width * scale))
  surface.height = Math.max(1, Math.round(height * scale))
  const paint = surface.getContext('2d')!
  paint.scale(surface.width / width, surface.height / height)
  if (clipLand) { clipLand(paint); paint.clip() }
  paint.beginPath()
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < 20) continue
    const ring = cells.v[i]
    if (!ring?.length) continue
    paint.moveTo(vertices.p[2 * ring[0]], vertices.p[2 * ring[0] + 1])
    for (let j = 1; j < ring.length; j++) paint.lineTo(vertices.p[2 * ring[j]], vertices.p[2 * ring[j] + 1])
    paint.closePath()
  }
  paint.fill()
  const image = paint.getImageData(0, 0, surface.width, surface.height)
  const { heights, normalsX, normalsY, cols, rows, spacing } = sampleRelief(data)
  const coastalDistance = coastDistances(image)
  const cellPixels = 3 * spacing * surface.width / width
  const dx = width / surface.width / spacing, dy = height / surface.height / spacing
  for (let y = 0; y < surface.height; y++) {
    const gy = (y + 0.5) * dy, row = Math.min(rows - 2, Math.floor(gy)), ty = gy - row
    for (let x = 0; x < surface.width; x++) {
      const gx = (x + 0.5) * dx, col = Math.min(cols - 2, Math.floor(gx)), tx = gx - col
      const k = row * cols + col, pixel = 4 * (y * surface.width + x)
      const isLand = image.data[pixel + 3] >= 128
      const a = heights[k], b = heights[k + 1], c = heights[k + cols], d = heights[k + cols + 1]
      const z = isLand ? (a + tx * (b - a)) * (1 - ty) + (c + tx * (d - c)) * ty : Math.min(21, coastalDistance[pixel / 4] / cellPixels)
      const nw = (1 - tx) * (1 - ty), ne = tx * (1 - ty), sw = (1 - tx) * ty, se = tx * ty
      const slopeX = nw * normalsX[k] + ne * normalsX[k + 1] + sw * normalsX[k + cols] + se * normalsX[k + cols + 1]
      const slopeY = nw * normalsY[k] + ne * normalsY[k + 1] + sw * normalsY[k + cols] + se * normalsY[k + cols + 1]
      const rgb = isLand ? land[Math.min(1000, Math.round(z * 10))] : sea[Math.min(210, Math.round(z * 10))]
      // Northwest illumination on a screen where y grows southward.
      const relief = isLand && shaded ? Math.tanh((slopeX + slopeY) * 1.25) : 0
      const level = Math.round(z / 5)
      const indexContour = level % 4 === 0
      const distance = Math.abs(z - level * 5) / Math.max(0.001, Math.hypot(slopeX, slopeY))
      const ink = isLand && level > 4 ? Math.max(0, 1 - distance / (indexContour ? 1.15 : 0.65)) : 0
      // Warm lit faces and cool shadow faces separate aspects on pale ground.
      const warmth = Math.abs(relief)
      image.data[pixel] = rgb[0] + relief * 40 + warmth * 2 - ink * 28
      image.data[pixel + 1] = rgb[1] + relief * 32 - ink * 37
      image.data[pixel + 2] = rgb[2] + relief * 21 - warmth * 2 - ink * 40
      image.data[pixel + 3] = 255
    }
  }
  paint.putImageData(image, 0, 0)
  ctx.drawImage(surface, 0, 0, width, height)
}
