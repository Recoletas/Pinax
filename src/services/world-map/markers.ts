/**
 * 用户标记的 Canvas 绘制与点击命中检测
 * 与 Voronoi 引擎解耦；只依赖 MapMarker / Point2D 类型。
 */

import type { MapMarker } from '../../types/world-map'
import type { StyleConfig } from './engine/style-presets'

interface LabelBounds { left: number; right: number; top: number; bottom: number }

function drawMarker(
  ctx: CanvasRenderingContext2D,
  marker: MapMarker,
  isSelected: boolean,
  isHovered: boolean,
  style: StyleConfig,
  labels: LabelBounds[],
) {
  const { x, y } = marker
  const isCapital = marker.type === 'capital'
  const isPort = marker.type === 'port'
  const projectsBurg = String(marker.mapObjectId || '').startsWith('burg:')

  ctx.save()

  if (isSelected || isHovered) {
    ctx.globalAlpha = isSelected ? 0.32 : 0.2
    ctx.fillStyle = style.river
    ctx.beginPath()
    ctx.arc(x, y, isSelected ? 12 : 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // A worldbook place bound to an existing burg uses the burg icon and label
  // already rendered in the base map. Only a quiet ownership arc is overlaid.
  if (projectsBurg) {
    ctx.strokeStyle = style.river
    ctx.lineWidth = marker.bindingStatus === 'confirmed' ? 1.4 : 1
    ctx.setLineDash(marker.bindingStatus === 'confirmed' ? [] : [2, 2])
    ctx.beginPath()
    ctx.arc(x, y, isCapital ? 8 : 5, -Math.PI * 0.8, Math.PI * 0.1)
    ctx.stroke()
    ctx.restore()
    return
  }

  const radius = isCapital ? 6 : 3.5
  ctx.fillStyle = style.scaleBarBg
  ctx.strokeStyle = isCapital ? style.capitalStroke : style.townStroke
  ctx.lineWidth = isCapital ? 2 : 1.2
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = isPort ? style.river : style.burgLabelColor
  ctx.beginPath()
  ctx.arc(x, y, isCapital ? 3.6 : 1.4, 0, Math.PI * 2)
  ctx.fill()

  const fontSize = isSelected || isCapital ? 13 : 11
  ctx.fillStyle = style.burgLabelColor
  ctx.font = `${isSelected || isCapital ? 'bold ' : ''}${fontSize}px ${style.burgLabelFont}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.strokeStyle = style.burgLabelStroke
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  const gap = radius + 4
  const halfWidth = ctx.measureText(marker.name).width / 2 + 2
  const positions = [
    [x + gap + halfWidth, y - fontSize], [x - gap - halfWidth, y - fontSize],
    [x + gap + halfWidth, y], [x - gap - halfWidth, y],
    [x, y - gap - fontSize], [x, y + gap],
  ]
  for (const [center, top] of positions) {
    const bounds = { left: center - halfWidth, right: center + halfWidth, top: top - 2, bottom: top + fontSize + 2 }
    if (labels.some(other => other.left < bounds.right && other.right > bounds.left
      && other.top < bounds.bottom && other.bottom > bounds.top)) continue
    labels.push(bounds)
    ctx.strokeText(marker.name, center, top)
    ctx.fillText(marker.name, center, top)
    break
  }

  ctx.restore()
}

export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  markers: MapMarker[],
  selectedMarkerId?: string | null,
  hoveredMarkerId?: string | null,
  style?: StyleConfig,
): void {
  if (!style) return
  const priority = (m: MapMarker) => m.id === selectedMarkerId ? 7 : m.id === hoveredMarkerId ? 6 : m.importance || 0
  const labels: LabelBounds[] = markers.map(({ x, y, type }) => {
    const r = type === 'capital' ? 6 : 3.5
    return { left: x - r, right: x + r, top: y - r, bottom: y + r }
  })
  for (const marker of [...markers].sort((a, b) => priority(b) - priority(a))) {
    const isSelected = marker.id === selectedMarkerId
    const isHovered = marker.id === hoveredMarkerId
    drawMarker(ctx, marker, isSelected, isHovered, style, labels)
  }
}

export function hitTestMarker(
  markers: MapMarker[],
  mx: number,
  my: number,
  radius = 16,
): MapMarker | null {
  let nearest: MapMarker | null = null
  let distance = radius * radius
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i]
    const dx = mx - m.x
    const dy = my - m.y
    const squared = dx * dx + dy * dy
    if (squared <= radius * radius && (!nearest || squared < distance)) {
      nearest = m
      distance = squared
    }
  }
  return nearest
}
