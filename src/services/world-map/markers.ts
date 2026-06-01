/**
 * 用户标记的 Canvas 绘制与点击命中检测
 * 与 Voronoi 引擎解耦；只依赖 MapMarker / Point2D 类型。
 */

import type { MapMarker } from '../../types/world-map'

function drawMarker(
  ctx: CanvasRenderingContext2D,
  marker: MapMarker,
  isSelected: boolean,
  isHovered: boolean,
) {
  const { x, y } = marker
  const importance = marker.importance || 3
  const isCapital = marker.type === 'capital'
  const isCity = marker.type === 'city' || marker.type === 'capital'
  const isFortress = marker.type === 'fortress' || marker.type === 'sect'
  const isPort = marker.type === 'port'

  ctx.save()

  if (isSelected) {
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#3b82f6'
    ctx.beginPath()
    ctx.arc(x, y, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  if (isHovered && !isSelected) {
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#60a5fa'
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  if (isCapital) {
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#c9a84c'
    ctx.beginPath()
    ctx.arc(x, y, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#c9a84c'
    ctx.fillRect(x - 7, y - 4, 14, 10)
    for (let i = -6; i <= 4; i += 4) {
      ctx.fillRect(x + i, y - 8, 3, 4)
    }
    ctx.fillStyle = '#1a1810'
    ctx.beginPath()
    ctx.arc(x, y + 2, 2.5, Math.PI, 0)
    ctx.fillRect(x - 2.5, y + 2, 5, 4)
    ctx.fill()
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y - 8)
    ctx.lineTo(x, y - 15)
    ctx.stroke()
    ctx.fillStyle = '#c44'
    ctx.beginPath()
    ctx.moveTo(x, y - 15)
    ctx.lineTo(x + 6, y - 13)
    ctx.lineTo(x, y - 11)
    ctx.closePath()
    ctx.fill()
  } else if (isFortress) {
    ctx.strokeStyle = '#8a6a4a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y - 7)
    ctx.lineTo(x + 7, y)
    ctx.lineTo(x, y + 7)
    ctx.lineTo(x - 7, y)
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = '#5a4a38'
    ctx.fill()
    ctx.fillStyle = '#c9a84c'
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  } else if (isPort) {
    ctx.fillStyle = '#4a7a9a'
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#b0d0e0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#b0d0e0'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x, y - 5)
    ctx.lineTo(x, y + 4)
    ctx.moveTo(x - 4, y + 2)
    ctx.quadraticCurveTo(x - 4, y + 5, x, y + 4)
    ctx.quadraticCurveTo(x + 4, y + 5, x + 4, y + 2)
    ctx.stroke()
  } else if (isCity) {
    const r = 4 + Math.min(importance, 4)
    ctx.fillStyle = '#b08060'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#d0a878'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = '#1a1810'
    ctx.beginPath()
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const r = 3 + Math.min(importance, 3)
    ctx.fillStyle = '#a08060'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#c0a878'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  const nameColor = isCapital ? '#c9a84c' : '#b0a080'
  const fontSize = isCapital ? 12 : 8 + Math.min(importance, 3)
  const nameFont = isCapital ? `bold ${fontSize}px serif` : `${fontSize}px serif`
  ctx.fillStyle = nameColor
  ctx.font = nameFont
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.strokeStyle = '#1a1810'
  ctx.lineWidth = 2.5
  const nameY = y + (isCapital ? 10 : 8)
  ctx.strokeText(marker.name, x, nameY)
  ctx.fillText(marker.name, x, nameY)

  ctx.restore()
}

export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  markers: MapMarker[],
  selectedMarkerId?: string | null,
  hoveredMarkerId?: string | null,
): void {
  for (const marker of markers) {
    const isSelected = marker.id === selectedMarkerId
    const isHovered = marker.id === hoveredMarkerId
    drawMarker(ctx, marker, isSelected, isHovered)
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
