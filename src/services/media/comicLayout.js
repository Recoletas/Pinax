import { getComicFrameBounds } from './comicCompositionService'

export const DEFAULT_COMIC_CANVAS = Object.freeze({ width: 1200, height: 1600 })

const IMAGE_SIZES = Object.freeze([
  { width: 1280, height: 720 },
  { width: 1152, height: 768 },
  { width: 1024, height: 768 },
  { width: 1024, height: 1024 },
  { width: 768, height: 1024 },
  { width: 768, height: 1152 },
  { width: 720, height: 1280 }
])

export function getComicCanvasSize(canvas = {}) {
  return {
    width: positiveNumber(canvas.width, DEFAULT_COMIC_CANVAS.width),
    height: positiveNumber(canvas.height, DEFAULT_COMIC_CANVAS.height)
  }
}

export function getComicPanelRects(layout, pageWidth, pageHeight, panelCount) {
  const width = positiveNumber(pageWidth, DEFAULT_COMIC_CANVAS.width)
  const height = positiveNumber(pageHeight, DEFAULT_COMIC_CANVAS.height)
  const count = Math.max(1, Number(panelCount) || (layout?.includes('6') ? 6 : 4))
  const unit = width / DEFAULT_COMIC_CANVAS.width
  const margin = 24 * unit
  const gap = 10 * unit
  const contentWidth = width - margin * 2
  const contentHeight = height - margin * 2
  const halfWidth = (contentWidth - gap) / 2

  if (count === 1) {
    return [{ x: margin, y: margin, width: contentWidth, height: contentHeight }]
  }

  if (layout === 'feature-4') {
    const heroHeight = contentHeight * 0.34
    const lowerY = margin + heroHeight + gap
    const lowerHeight = contentHeight - heroHeight - gap
    const rightHeight = (lowerHeight - gap) / 2
    return [
      { x: margin, y: margin, width: contentWidth, height: heroHeight },
      { x: margin, y: lowerY, width: halfWidth, height: lowerHeight },
      { x: margin + halfWidth + gap, y: lowerY, width: halfWidth, height: rightHeight },
      { x: margin + halfWidth + gap, y: lowerY + rightHeight + gap, width: halfWidth, height: rightHeight }
    ].slice(0, count)
  }

  if (layout === 'feature-6') {
    const heroHeight = contentHeight * 0.25
    const footerHeight = contentHeight * 0.18
    const middleY = margin + heroHeight + gap
    const middleHeight = contentHeight - heroHeight - footerHeight - gap * 2
    const middleRowHeight = (middleHeight - gap) / 2
    const footerY = middleY + middleHeight + gap
    return [
      { x: margin, y: margin, width: contentWidth, height: heroHeight },
      { x: margin, y: middleY, width: halfWidth, height: middleRowHeight },
      { x: margin + halfWidth + gap, y: middleY, width: halfWidth, height: middleRowHeight },
      { x: margin, y: middleY + middleRowHeight + gap, width: halfWidth, height: middleRowHeight },
      { x: margin + halfWidth + gap, y: middleY + middleRowHeight + gap, width: halfWidth, height: middleRowHeight },
      { x: margin, y: footerY, width: contentWidth, height: footerHeight }
    ].slice(0, count)
  }

  const rows = Math.ceil(count / 2)
  const rowHeight = (contentHeight - gap * (rows - 1)) / rows
  return Array.from({ length: count }, (_, index) => ({
    x: margin + (index % 2) * (halfWidth + gap),
    y: margin + Math.floor(index / 2) * (rowHeight + gap),
    width: halfWidth,
    height: rowHeight
  }))
}

export function getComicPanelRect(page = {}, order = 1) {
  const canvas = getComicCanvasSize(page.canvas)
  const panel = page.panels?.find((item) => Number(item.order) === Number(order))
  if (panel?.frame?.points?.length >= 3) {
    const bounds = getComicFrameBounds(panel.frame)
    const gutter = panel.frame.bleed
      ? 0
      : clampNumber(panel.frame.gutter, 0, 0.08, 0) * canvas.width / 2
    const insetX = Math.min(gutter, bounds.width * canvas.width * 0.45)
    const insetY = Math.min(gutter, bounds.height * canvas.height * 0.45)
    return {
      x: bounds.x * canvas.width + insetX,
      y: bounds.y * canvas.height + insetY,
      width: bounds.width * canvas.width - insetX * 2,
      height: bounds.height * canvas.height - insetY * 2
    }
  }
  const count = Math.max(1, page.panels?.length || (page.layout?.includes('6') ? 6 : 4))
  return getComicPanelRects(page.layout, canvas.width, canvas.height, count)[Math.max(0, Number(order) - 1)]
    || getComicPanelRects(page.layout, canvas.width, canvas.height, count)[0]
}

export function getComicPanelImageSize(page = {}, order = 1) {
  const rect = getComicPanelRect(page, order)
  const ratio = rect.width / rect.height
  return IMAGE_SIZES.reduce((best, candidate) => (
    Math.abs(candidate.width / candidate.height - ratio) < Math.abs(best.width / best.height - ratio)
      ? candidate
      : best
  ))
}

export function getComicImageStyle(page = {}, panel = {}, image = {}) {
  const rect = getComicPanelRect(page, panel.order)
  const stageRatio = rect.width / rect.height
  const imageRatio = positiveNumber(image.width, 0) / positiveNumber(image.height, 0)
  const safeImageRatio = Number.isFinite(imageRatio) && imageRatio > 0 ? imageRatio : stageRatio
  const containWidth = safeImageRatio >= stageRatio ? stageRatio : safeImageRatio
  const containHeight = safeImageRatio >= stageRatio ? stageRatio / safeImageRatio : 1
  const coverScale = Math.max(stageRatio / containWidth, 1 / containHeight)
  const zoom = clampNumber(panel.direction?.zoom, 0.5, 3, 1)
  const scale = coverScale * zoom
  const renderedWidth = containWidth * scale
  const renderedHeight = containHeight * scale
  const overflowX = Math.max(0, renderedWidth - stageRatio)
  const overflowY = Math.max(0, renderedHeight - 1)
  const focalX = clampNumber(panel.direction?.focalPoint?.x, 0, 1, 0.5)
  const focalY = clampNumber(panel.direction?.focalPoint?.y, 0, 1, 0.5)
  const translateX = (0.5 - focalX) * overflowX / stageRatio * 100
  const translateY = (0.5 - focalY) * overflowY * 100
  return {
    objectPosition: 'center',
    transform: `translate(${roundCss(translateX)}%, ${roundCss(translateY)}%) scale(${roundCss(scale)})`
  }
}

export function getDefaultComicPanelFrame(layout, order, panelCount) {
  const { width, height } = DEFAULT_COMIC_CANVAS
  const rect = getComicPanelRects(layout, width, height, panelCount)[Math.max(0, Number(order) - 1)]
    || { x: 0, y: 0, width, height }
  return {
    kind: 'rect',
    gutter: 10 / width,
    points: [
      { x: rect.x / width, y: rect.y / height },
      { x: (rect.x + rect.width) / width, y: rect.y / height },
      { x: (rect.x + rect.width) / width, y: (rect.y + rect.height) / height },
      { x: rect.x / width, y: (rect.y + rect.height) / height }
    ]
  }
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function roundCss(value) {
  return Math.round(Number(value) * 10000) / 10000
}
