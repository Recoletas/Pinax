const MIN_PANEL_SIZE = 0.08
const MAX_PANELS = 12

export function getComicFrameBounds(frame = {}) {
  const points = Array.isArray(frame.points) ? frame.points : []
  const xs = points.map((point) => clampUnit(point?.x)).filter(Number.isFinite)
  const ys = points.map((point) => clampUnit(point?.y)).filter(Number.isFinite)
  if (xs.length < 3 || ys.length < 3) return { x: 0, y: 0, width: 1, height: 1 }
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return {
    x: left,
    y: top,
    width: Math.max(MIN_PANEL_SIZE, right - left),
    height: Math.max(MIN_PANEL_SIZE, bottom - top)
  }
}

export function boundsToComicFrame(bounds = {}, source = {}) {
  const width = clamp(Number(bounds.width), MIN_PANEL_SIZE, 1, 1)
  const height = clamp(Number(bounds.height), MIN_PANEL_SIZE, 1, 1)
  const x = clamp(Number(bounds.x), 0, 1 - width, 0)
  const y = clamp(Number(bounds.y), 0, 1 - height, 0)
  return {
    ...source,
    kind: 'rect',
    gutter: clamp(Number(source.gutter), 0, 0.08, 0.012),
    points: [
      { x, y },
      { x: roundUnit(x + width), y },
      { x: roundUnit(x + width), y: roundUnit(y + height) },
      { x, y: roundUnit(y + height) }
    ]
  }
}

export function resizeComicPanelFrame(frame, handle, delta = {}) {
  const bounds = getComicFrameBounds(frame)
  let left = bounds.x
  let top = bounds.y
  let right = bounds.x + bounds.width
  let bottom = bounds.y + bounds.height
  const dx = Number(delta.x) || 0
  const dy = Number(delta.y) || 0
  if (String(handle).includes('w')) left = clamp(left + dx, 0, right - MIN_PANEL_SIZE, left)
  if (String(handle).includes('e')) right = clamp(right + dx, left + MIN_PANEL_SIZE, 1, right)
  if (String(handle).includes('n')) top = clamp(top + dy, 0, bottom - MIN_PANEL_SIZE, top)
  if (String(handle).includes('s')) bottom = clamp(bottom + dy, top + MIN_PANEL_SIZE, 1, bottom)
  return boundsToComicFrame({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  }, frame)
}

export function splitComicPanel(page = {}, panelId, axis = 'vertical') {
  if (!Array.isArray(page.panels) || page.panels.length >= MAX_PANELS) return page
  const index = page.panels.findIndex((panel) => panel.id === panelId)
  if (index < 0) return page
  const current = page.panels[index]
  const bounds = getComicFrameBounds(current.frame)
  const vertical = axis !== 'horizontal'
  const firstBounds = vertical
    ? { ...bounds, width: bounds.width / 2 }
    : { ...bounds, height: bounds.height / 2 }
  const secondBounds = vertical
    ? { ...bounds, x: bounds.x + bounds.width / 2, width: bounds.width / 2 }
    : { ...bounds, y: bounds.y + bounds.height / 2, height: bounds.height / 2 }
  const nextPanel = createSplitPanel(current, secondBounds)
  const panels = [
    ...page.panels.slice(0, index),
    { ...current, frame: boundsToComicFrame(firstBounds, current.frame) },
    nextPanel,
    ...page.panels.slice(index + 1)
  ].map((panel, panelIndex) => ({ ...panel, order: panelIndex + 1 }))
  return { ...page, layout: 'free', panels }
}

export function mergeComicPanelWithNext(page = {}, panelId) {
  if (!canMergeComicPanelWithNext(page, panelId)) return page
  if (!Array.isArray(page.panels) || page.panels.length <= 1) return page
  const ordered = [...page.panels].sort((left, right) => left.order - right.order)
  const index = ordered.findIndex((panel) => panel.id === panelId)
  if (index < 0 || index >= ordered.length - 1) return page
  const current = ordered[index]
  const next = ordered[index + 1]
  const left = Math.min(getComicFrameBounds(current.frame).x, getComicFrameBounds(next.frame).x)
  const top = Math.min(getComicFrameBounds(current.frame).y, getComicFrameBounds(next.frame).y)
  const right = Math.max(
    getComicFrameBounds(current.frame).x + getComicFrameBounds(current.frame).width,
    getComicFrameBounds(next.frame).x + getComicFrameBounds(next.frame).width
  )
  const bottom = Math.max(
    getComicFrameBounds(current.frame).y + getComicFrameBounds(current.frame).height,
    getComicFrameBounds(next.frame).y + getComicFrameBounds(next.frame).height
  )
  const merged = {
    ...current,
    frame: boundsToComicFrame({ x: left, y: top, width: right - left, height: bottom - top }, current.frame),
    visual: [current.visual, next.visual].filter(Boolean).join('；'),
    beat: {
      action: [current.beat?.action, next.beat?.action].filter(Boolean).join('；'),
      emotion: [current.beat?.emotion, next.beat?.emotion].filter(Boolean).join('；'),
      reveal: [current.beat?.reveal, next.beat?.reveal].filter(Boolean).join('；'),
      transition: next.beat?.transition || current.beat?.transition || ''
    },
    dialogue: [...(current.dialogue || []), ...(next.dialogue || [])].slice(0, 6),
    caption: [current.caption, next.caption].filter(Boolean).join('；'),
    continuityRefs: mergeBySignature(current.continuityRefs, next.continuityRefs, sourceRefSignature),
    referenceBindings: mergeBySignature(current.referenceBindings, next.referenceBindings, referenceBindingSignature),
    continuityNotes: mergeText(current.continuityNotes, next.continuityNotes)
  }
  const panels = ordered
    .filter((panel) => panel.id !== next.id)
    .map((panel) => panel.id === current.id ? merged : panel)
    .map((panel, panelIndex) => ({ ...panel, order: panelIndex + 1 }))
  return { ...page, layout: 'free', panels }
}

export function canMergeComicPanelWithNext(page = {}, panelId) {
  const ordered = Array.isArray(page.panels)
    ? [...page.panels].sort((left, right) => left.order - right.order)
    : []
  const index = ordered.findIndex((panel) => panel.id === panelId)
  const next = ordered[index + 1]
  if (!next) return false
  const hasArtifact = Object.values(next.production || {})
    .some((stage) => stage?.selectedArtifactId || stage?.artifactIds?.length)
  return !next.selectedTakeId
    && !(next.imageTakeIds || []).length
    && !(next.letteringObjects || []).length
    && !hasArtifact
}

export function reorderComicPanel(page = {}, panelId, delta = 0) {
  const panels = Array.isArray(page.panels) ? [...page.panels].sort((a, b) => a.order - b.order) : []
  const fromIndex = panels.findIndex((panel) => panel.id === panelId)
  const toIndex = fromIndex + Number(delta)
  if (fromIndex < 0 || toIndex < 0 || toIndex >= panels.length) return page
  const [moved] = panels.splice(fromIndex, 1)
  panels.splice(toIndex, 0, moved)
  return {
    ...page,
    panels: panels.map((panel, index) => ({ ...panel, order: index + 1 }))
  }
}

export function setComicPanelGutter(page = {}, panelId, gutter) {
  return updatePanel(page, panelId, (panel) => ({
    ...panel,
    frame: { ...panel.frame, gutter: clamp(Number(gutter), 0, 0.08, 0.012) }
  }))
}

export function addComicDirectionControl(page = {}, panelId, kind) {
  return updatePanel(page, panelId, (panel) => {
    const direction = { ...panel.direction }
    if (kind === 'blocking') {
      direction.blocking = [...(direction.blocking || []), {
        id: createControlId('blocking'),
        label: `人物 ${(direction.blocking || []).length + 1}`,
        entityRef: null,
        box: [0.32, 0.2, 0.36, 0.66],
        facing: ''
      }].slice(0, 20)
    } else if (kind === 'motion') {
      direction.motionVectors = [...(direction.motionVectors || []), {
        id: createControlId('motion'),
        label: `动线 ${(direction.motionVectors || []).length + 1}`,
        from: [0.22, 0.7],
        to: [0.76, 0.34]
      }].slice(0, 20)
    } else if (kind === 'balloon') {
      direction.balloonSafeZones = [...(direction.balloonSafeZones || []), {
        id: createControlId('balloon'),
        label: `留白 ${(direction.balloonSafeZones || []).length + 1}`,
        box: [0.52, 0.08, 0.4, 0.2]
      }].slice(0, 20)
    }
    return { ...panel, direction }
  })
}

export function updateComicDirectionControl(page = {}, panelId, kind, controlId, patch = {}) {
  const field = directionField(kind)
  if (!field) return page
  return updatePanel(page, panelId, (panel) => ({
    ...panel,
    direction: {
      ...panel.direction,
      [field]: (panel.direction?.[field] || []).map((control) => (
        control.id === controlId ? { ...control, ...patch } : control
      ))
    }
  }))
}

export function updateComicPanelDirection(page = {}, panelId, patch = {}) {
  return updatePanel(page, panelId, (panel) => ({
    ...panel,
    direction: { ...panel.direction, ...patch }
  }))
}

export function removeComicDirectionControl(page = {}, panelId, kind, controlId) {
  const field = directionField(kind)
  if (!field) return page
  return updatePanel(page, panelId, (panel) => ({
    ...panel,
    direction: {
      ...panel.direction,
      [field]: (panel.direction?.[field] || []).filter((control) => control.id !== controlId)
    }
  }))
}

export function setComicCompositionFormat(page = {}, format) {
  const nextFormat = ['page-ltr', 'page-rtl', 'webtoon'].includes(format) ? format : 'page-ltr'
  const width = Number(page.canvas?.width) || 1200
  const currentHeight = Number(page.canvas?.height) || 1600
  const targetHeight = nextFormat === 'webtoon'
    ? Math.max(currentHeight, Math.round(width * Math.max(2.6, (page.panels?.length || 1) * 0.72)))
    : Math.min(currentHeight, Math.round(width * 1.5))
  return {
    ...page,
    format: nextFormat,
    canvas: { ...page.canvas, width, height: targetHeight }
  }
}

function createSplitPanel(source, bounds) {
  return {
    ...source,
    id: `panel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    visual: '',
    beat: { action: '', emotion: '', reveal: '', transition: '' },
    dialogue: [],
    caption: '',
    frame: boundsToComicFrame(bounds, source.frame),
    imageTakeIds: [],
    imageTakes: [],
    selectedTakeId: null,
    letteringObjects: [],
    generationStatus: 'idle',
    generationError: '',
    production: undefined
  }
}

function updatePanel(page, panelId, updater) {
  if (!Array.isArray(page.panels)) return page
  return {
    ...page,
    panels: page.panels.map((panel) => panel.id === panelId ? updater(panel) : panel)
  }
}

function directionField(kind) {
  if (kind === 'blocking') return 'blocking'
  if (kind === 'motion') return 'motionVectors'
  if (kind === 'balloon') return 'balloonSafeZones'
  return ''
}

function mergeBySignature(left, right, signature) {
  const values = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]
  return [...new Map(values.map((value) => [signature(value), value])).values()].filter(Boolean)
}

function mergeText(left, right) {
  return [...new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])])].filter(Boolean)
}

function sourceRefSignature(ref = {}) {
  return `${ref.refType || ''}:${ref.refId || ''}:${ref.projectId || ''}`
}

function referenceBindingSignature(binding = {}) {
  return `${binding.role || ''}:${binding.assetId || ''}:${sourceRefSignature(binding.entityRef)}`
}

function createControlId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function clampUnit(value) {
  const number = Number(value)
  return Number.isFinite(number) ? roundUnit(Math.min(1, Math.max(0, number))) : NaN
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function roundUnit(value) {
  return Math.round(Number(value) * 10000) / 10000
}

export default {
  addComicDirectionControl,
  boundsToComicFrame,
  canMergeComicPanelWithNext,
  getComicFrameBounds,
  mergeComicPanelWithNext,
  removeComicDirectionControl,
  reorderComicPanel,
  resizeComicPanelFrame,
  setComicCompositionFormat,
  setComicPanelGutter,
  splitComicPanel,
  updateComicDirectionControl,
  updateComicPanelDirection
}
