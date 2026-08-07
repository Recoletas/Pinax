/**
 * 用户标记的 Canvas 绘制与点击命中检测
 * 与 Voronoi 引擎解耦；只依赖 MapMarker / Point2D 类型。
 */

import type { MapMarker } from '../../types/world-map'
import type { StyleConfig } from './engine/style-presets'

function drawMarker(
  ctx: CanvasRenderingContext2D,
  marker: MapMarker,
  isSelected: boolean,
  isHovered: boolean,
  style: StyleConfig,
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

  const fontSize = isCapital ? 12 : 9
  ctx.fillStyle = style.burgLabelColor
  ctx.font = `${isCapital ? 'bold ' : ''}${fontSize}px ${style.burgLabelFont}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.strokeStyle = style.burgLabelStroke
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  const nameY = y + (isCapital ? 8 : 6)
  ctx.strokeText(marker.name, x, nameY)
  ctx.fillText(marker.name, x, nameY)

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
  for (const marker of markers) {
    const isSelected = marker.id === selectedMarkerId
    const isHovered = marker.id === hoveredMarkerId
    drawMarker(ctx, marker, isSelected, isHovered, style)
  }
}

export function hitTestMarker(
  markers: MapMarker[],
  mx: number,
  my: number,
  radius = 16,
): MapMarker | null {
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i]
    const dx = mx - m.x
    const dy = my - m.y
    if (dx * dx + dy * dy <= radius * radius) return m
  }
  return null
}
