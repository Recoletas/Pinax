export function clamp(val, min, max) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (!Number.isFinite(val)) return hi
  return Math.max(lo, Math.min(hi, val))
}

export function screenToCanvas(clientX, clientY, boardRect, scrollLeft, scrollTop, zoom, panX, panY) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const px = Number.isFinite(panX) ? panX : 0
  const py = Number.isFinite(panY) ? panY : 0
  const sl = Number.isFinite(scrollLeft) ? scrollLeft : 0
  const st = Number.isFinite(scrollTop) ? scrollTop : 0
  const bl = boardRect ? boardRect.left : 0
  const bt = boardRect ? boardRect.top : 0
  return {
    x: (clientX - bl + sl - px) / z,
    y: (clientY - bt + st - py) / z
  }
}

export function canvasToScreen(x, y, boardRect, zoom, panX, panY, scrollLeft, scrollTop) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const px = Number.isFinite(panX) ? panX : 0
  const py = Number.isFinite(panY) ? panY : 0
  const sl = Number.isFinite(scrollLeft) ? scrollLeft : 0
  const st = Number.isFinite(scrollTop) ? scrollTop : 0
  const bl = boardRect ? boardRect.left : 0
  const bt = boardRect ? boardRect.top : 0
  return {
    x: x * z + px + bl - sl,
    y: y * z + py + bt - st
  }
}

export function rectToLocalRect(rect, wallRect, scrollLeft, scrollTop) {
  if (!rect || !wallRect) return null
  const sl = Number.isFinite(scrollLeft) ? scrollLeft : 0
  const st = Number.isFinite(scrollTop) ? scrollTop : 0
  const left = rect.left - wallRect.left + sl
  const top = rect.top - wallRect.top + st
  const width = rect.width || 0
  const height = rect.height || 0
  const right = left + width
  const bottom = top + height
  const centerX = left + width / 2
  const centerY = top + height / 2
  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    right: Number.isFinite(right) ? right : 0,
    bottom: Number.isFinite(bottom) ? bottom : 0,
    centerX: Number.isFinite(centerX) ? centerX : 0,
    centerY: Number.isFinite(centerY) ? centerY : 0,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  }
}

export function getConnectorPoint(rect, targetX, targetY) {
  if (!rect) return { x: 0, y: 0 }
  const dx = targetX - rect.centerX
  const dy = targetY - rect.centerY
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? rect.right : rect.left,
      y: rect.centerY
    }
  }
  return {
    x: rect.centerX,
    y: dy >= 0 ? rect.bottom : rect.top
  }
}

export function makeEdgePath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1)
  const bend = Math.min(120, Math.max(40, dx * 0.4))
  const c1x = x1 + bend
  const c2x = x2 - bend
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`
}

export function clampNodePosition(x, y, nodeW, nodeH, canvasW, canvasH) {
  const margin = 40
  const maxX = Math.max(0, (Number.isFinite(canvasW) ? canvasW : 0) - (Number.isFinite(nodeW) ? nodeW : 200) - margin)
  const maxY = Math.max(0, (Number.isFinite(canvasH) ? canvasH : 0) - (Number.isFinite(nodeH) ? nodeH : 120) - margin)
  return {
    x: clamp(x, margin, maxX || margin),
    y: clamp(y, margin, maxY || margin)
  }
}

export function getNodeBounds(card, cardWallEl, wallRect, scrollLeft, scrollTop) {
  if (!card || !cardWallEl) return null
  const el = cardWallEl.querySelector(`[data-card-id="${card.id}"]`)
  if (!el) return null
  const nodeRect = el.getBoundingClientRect()
  return rectToLocalRect(nodeRect, wallRect, scrollLeft, scrollTop)
}

export function isNodeVisible(nodeBounds, viewportLeft, viewportTop, viewportW, viewportH) {
  if (!nodeBounds) return false
  const right = viewportLeft + (viewportW || 0)
  const bottom = viewportTop + (viewportH || 0)
  return !(nodeBounds.right < viewportLeft || nodeBounds.left > right || nodeBounds.bottom < viewportTop || nodeBounds.top > bottom)
}

export function getCardWallPoint(event, cardWallEl) {
  if (!cardWallEl || !event) return { x: 0, y: 0 }
  const rect = cardWallEl.getBoundingClientRect()
  const sl = cardWallEl.scrollLeft || 0
  const st = cardWallEl.scrollTop || 0
  return {
    x: event.clientX - rect.left + sl,
    y: event.clientY - rect.top + st
  }
}
