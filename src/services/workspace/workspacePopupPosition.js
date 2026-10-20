// Both viewport offsets and CSS zoom matter when anchoring menus in the workbench.
export function workspacePopupViewport() {
  const body = document.body
  const cssZoom = Number.parseFloat(window.getComputedStyle(body).zoom) || 1
  const transformedScale = body?.offsetWidth > 0 ? body.getBoundingClientRect().width / body.offsetWidth : 1
  const viewport = window.visualViewport
  const left = Number(viewport?.offsetLeft || 0)
  const top = Number(viewport?.offsetTop || 0)
  return {
    left, top,
    right: left + Number(viewport?.width || window.innerWidth),
    bottom: top + Number(viewport?.height || window.innerHeight),
    scale: Math.max(0.1, cssZoom !== 1 ? cssZoom : transformedScale || 1)
  }
}

export function clampWorkspaceMenuPosition(element, state) {
  if (!element || !state.show) return null
  const { left, top, right, bottom, scale } = workspacePopupViewport()
  const margin = 8
  const availableVisualHeight = Math.max(44, bottom - top - margin * 2)
  const visualWidth = Math.min(
    Math.max(Number(element.getBoundingClientRect?.().width || 0), Number(element.offsetWidth || 0) * scale),
    Math.max(0, right - left - margin * 2)
  )
  const visualHeight = Math.min(Number(element.scrollHeight || element.offsetHeight || 0) * scale, availableVisualHeight)
  const desiredVisualX = Number(state.anchorX ?? state.x * scale)
  const desiredVisualY = Number(state.anchorY ?? state.y * scale)
  return {
    maxHeight: Math.floor(availableVisualHeight / scale),
    x: Math.round(Math.max(left + margin, Math.min(desiredVisualX, right - visualWidth - margin)) / scale),
    y: Math.round(Math.max(top + margin, Math.min(desiredVisualY, bottom - visualHeight - margin)) / scale)
  }
}
