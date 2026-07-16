import { STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeSourceRefs } from '../narrativeAssets'
import { getMediaAssetDataUrl } from './mediaAssetStore'

export const COMIC_PAGE_SCHEMA_VERSION = 2
export const COMIC_PRODUCTION_STAGES = Object.freeze(['rough', 'line', 'flats', 'tones', 'render', 'effects'])

const VALID_LAYOUTS = new Set(['strip-4', 'feature-4', 'page-6', 'feature-6', 'free'])
const VALID_STATUSES = new Set(['draft', 'accepted'])
const VALID_GENERATION_STATUSES = new Set(['idle', 'generating', 'ready', 'error'])
const VALID_COLOR_MODES = new Set(['color', 'monochrome'])
const VALID_SHOT_SIZES = new Set(['extreme-wide', 'wide', 'medium', 'close', 'extreme-close', 'insert'])
const VALID_CAMERA_ANGLES = new Set(['eye', 'high', 'low', 'bird', 'worm', 'dutch', 'pov'])
const VALID_PERSPECTIVES = new Set(['flat', 'one-point', 'two-point', 'three-point', 'fisheye'])

export function createComicPage(input = {}) {
  const now = Date.now()
  const projectId = normalizeNullableText(input.projectId)
  const panelCount = Array.isArray(input.panels) ? input.panels.length : 0
  const layout = VALID_LAYOUTS.has(input.layout)
    ? input.layout
    : panelCount >= 6 ? 'page-6' : 'strip-4'
  const colorMode = VALID_COLOR_MODES.has(input.colorMode) ? input.colorMode : 'color'
  const panels = normalizePanels(input.panels, { projectId, layout, panelCount, colorMode })

  return {
    id: normalizeText(input.id) || createComicPageId(),
    schemaVersion: COMIC_PAGE_SCHEMA_VERSION,
    projectId,
    title: normalizeText(input.title) || '未命名漫画页',
    sourceRefs: normalizeSourceRefs(input.sourceRefs, { projectId }),
    layout,
    format: normalizeFormat(input.format),
    colorMode,
    canvas: normalizeCanvas(input.canvas),
    styleBible: String(input.styleBible || '').trim(),
    visualBible: normalizeVisualBible(input.visualBible, { projectId }),
    panels,
    status: VALID_STATUSES.has(input.status) ? input.status : 'draft',
    revision: normalizePositiveInteger(input.revision, 1),
    createdAt: normalizeTimestamp(input.createdAt, now),
    updatedAt: normalizeTimestamp(input.updatedAt, now)
  }
}

export function listComicPages(filters = {}, options = {}) {
  return readComicPages(resolveStorage(options.storage))
    .map(createComicPage)
    .filter((page) => filters.projectId === undefined || page.projectId === filters.projectId)
    .filter((page) => !filters.status || page.status === filters.status)
    .filter((page) => !filters.sourceRef || hasSourceRef(page, filters.sourceRef))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function findComicPageBySources(sourceRefs = [], filters = {}, options = {}) {
  const expected = sourceRefSignature(normalizeSourceRefs(sourceRefs, { projectId: filters.projectId }))
  if (!expected) return null
  return listComicPages(filters, options)
    .find((page) => sourceRefSignature(page.sourceRefs) === expected) || null
}

export function saveComicPage(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  const current = readComicPages(storage)
  const existing = current.find((page) => page.id === input.id)
  const page = createComicPage({
    ...existing,
    ...input,
    createdAt: existing?.createdAt || input.createdAt,
    updatedAt: Date.now()
  })
  writeComicPages(storage, [page, ...current.filter((item) => item.id !== page.id)])
  return page
}

export function buildComicPageManifest(input = {}, options = {}) {
  const page = createComicPage(input)
  return {
    format: 'pinax-comic-page',
    version: COMIC_PAGE_SCHEMA_VERSION,
    exportedAt: new Date(options.now || Date.now()).toISOString(),
    page
  }
}

export function updateComicPanel(pageId, panelId, patch = {}, options = {}) {
  const page = listComicPages({}, options).find((item) => item.id === pageId)
  if (!page) return null
  let found = false
  const panels = page.panels.map((panel) => {
    if (panel.id !== panelId) return panel
    found = true
    const panelInput = {
      ...panel,
      ...patch,
      direction: patch.direction
        ? { ...panel.direction, ...patch.direction, revision: panel.direction.revision + 1 }
        : panel.direction
    }
    const next = normalizePanel(panelInput, panel.order, {
      projectId: page.projectId,
      layout: page.layout,
      panelCount: page.panels.length,
      colorMode: page.colorMode
    })
    return hasPanelDirectionChange(patch) ? {
      ...next,
      production: markPanelStagesStale(next.production, patchStaleReason(patch))
    } : next
  })
  return found ? saveComicPage({ ...page, panels, revision: page.revision + 1 }, options) : null
}

export function updateComicPanelStage(pageId, panelId, stage, patch = {}, options = {}) {
  if (!COMIC_PRODUCTION_STAGES.includes(stage)) throw new Error('无效的漫画制作阶段')
  const page = listComicPages({}, options).find((item) => item.id === pageId)
  if (!page) return null
  const panels = page.panels.map((panel) => {
    if (panel.id !== panelId) return panel
    const current = panel.production[stage]
    const next = normalizeStageState({ ...current, ...patch })
    const production = { ...panel.production, [stage]: next }
    return {
      ...panel,
      production: patch.selectedArtifactId !== undefined || patch.status !== undefined
        ? markPanelStagesStale(production, `${stage} 已更新`, stage, false)
        : production
    }
  })
  return saveComicPage({ ...page, panels, revision: page.revision + 1 }, options)
}

export function updateComicVisualBible(pageId, patch = {}, options = {}) {
  const page = listComicPages({}, options).find((item) => item.id === pageId)
  if (!page) return null
  const nextVisualBible = normalizeVisualBible({
    ...page.visualBible,
    ...patch,
    revision: page.visualBible.revision + 1
  }, { projectId: page.projectId })
  const panels = page.panels.map((panel) => ({
    ...panel,
    production: markPanelStagesStale(panel.production, '视觉圣经已更新')
  }))
  return saveComicPage({ ...page, visualBible: nextVisualBible, panels, revision: page.revision + 1 }, options)
}

export function addComicPanelTake(pageId, panelId, mediaAssetId, options = {}) {
  const id = normalizeText(mediaAssetId)
  if (!id) throw new Error('漫画格缺少 MediaAsset ID')
  const page = listComicPages({}, options).find((item) => item.id === pageId)
  if (!page) return null
  const panel = page.panels.find((item) => item.id === panelId)
  if (!panel) return null
  const imageTakeIds = [...new Set([...panel.imageTakeIds, id])]
  return updateComicPanel(pageId, panelId, {
    imageTakeIds,
    selectedTakeId: options.select === false ? panel.selectedTakeId : id,
    generationStatus: 'ready',
    generationError: ''
  }, options)
}

export async function hydrateComicPageTakes(input = {}, options = {}) {
  const page = createComicPage(input)
  const dataById = new Map()
  const takeIds = [...new Set(page.panels.flatMap((panel) => panel.imageTakeIds))]
  await Promise.all(takeIds.map(async (takeId) => {
    try {
      const data = await getMediaAssetDataUrl(takeId, options)
      if (data) dataById.set(takeId, data)
    } catch {
      // Keep the persisted take reference; IndexedDB may become available later.
    }
  }))
  return {
    ...page,
    panels: page.panels.map((panel) => ({
      ...panel,
      imageTakes: panel.imageTakeIds
        .filter((takeId) => dataById.has(takeId))
        .map((takeId) => ({ id: takeId, data: dataById.get(takeId) }))
    }))
  }
}

function normalizePanels(panels, context) {
  if (!Array.isArray(panels)) return []
  return panels.slice(0, 12).map((panel, index) => normalizePanel(panel, index + 1, context))
}

function normalizePanel(input = {}, fallbackOrder, context) {
  const imageTakeIds = [...new Set((Array.isArray(input.imageTakeIds) ? input.imageTakeIds : [])
    .map(normalizeText)
    .filter(Boolean))]
  const selectedTakeId = imageTakeIds.includes(input.selectedTakeId) ? input.selectedTakeId : null
  return {
    id: normalizeText(input.id) || `panel_${Date.now().toString(36)}_${fallbackOrder}_${Math.random().toString(36).slice(2, 6)}`,
    order: normalizePositiveInteger(input.order, fallbackOrder),
    visual: String(input.visual || '').trim(),
    beat: normalizeBeat(input.beat),
    frame: normalizeFrame(input.frame || defaultPanelFrame(context.layout, fallbackOrder, context.panelCount)),
    direction: normalizeDirection(input.direction),
    dialogue: normalizeDialogue(input.dialogue),
    caption: String(input.caption || '').trim(),
    continuityRefs: normalizeSourceRefs(input.continuityRefs, context),
    referenceBindings: normalizeReferenceBindings(input.referenceBindings),
    imageTakeIds,
    selectedTakeId,
    production: normalizeProduction(input.production, imageTakeIds, selectedTakeId, context.colorMode),
    letteringObjects: normalizeLetteringObjects(input.letteringObjects),
    generationStatus: VALID_GENERATION_STATUSES.has(input.generationStatus)
      ? input.generationStatus
      : imageTakeIds.length ? 'ready' : 'idle',
    generationError: String(input.generationError || '').trim()
  }
}

function normalizeVisualBible(input = {}, context) {
  return {
    characterRefs: normalizeReferenceGroups(input.characterRefs, context.projectId),
    locationRefs: normalizeReferenceGroups(input.locationRefs, context.projectId),
    propRefs: normalizeReferenceGroups(input.propRefs, context.projectId),
    styleAssetIds: normalizeStringList(input.styleAssetIds),
    palette: normalizeStringList(input.palette, 16),
    lineStyle: normalizeText(input.lineStyle),
    renderingNotes: normalizeText(input.renderingNotes),
    invariantNotes: normalizeStringList(input.invariantNotes, 20),
    revision: normalizePositiveInteger(input.revision, 1)
  }
}

function normalizeReferenceGroups(groups, projectId) {
  if (!Array.isArray(groups)) return []
  return groups.slice(0, 60).map((group = {}) => ({
    entityRef: normalizeSourceRefs([group.entityRef], { projectId })[0] || null,
    assetIds: normalizeStringList(group.assetIds),
    invariantNotes: normalizeStringList(group.invariantNotes, 16)
  })).filter((group) => group.entityRef || group.assetIds.length)
}

function normalizeProduction(production, imageTakeIds, selectedTakeId, colorMode) {
  const normalized = Object.fromEntries(COMIC_PRODUCTION_STAGES.map((stage) => [
    stage,
    normalizeStageState(production?.[stage])
  ]))
  const activeStages = colorMode === 'monochrome'
    ? ['rough', 'line', 'tones', 'effects']
    : ['rough', 'line', 'flats', 'render', 'effects']
  if (imageTakeIds.length) {
    normalized.render = normalizeStageState({
      ...normalized.render,
      status: normalized.render.status === 'empty' ? 'review' : normalized.render.status,
      artifactIds: [...new Set([...normalized.render.artifactIds, ...imageTakeIds])],
      selectedArtifactId: normalized.render.selectedArtifactId || selectedTakeId,
      inputRevision: normalized.render.inputRevision || 'direct-image-take'
    })
  }
  for (const stage of COMIC_PRODUCTION_STAGES) {
    if (!activeStages.includes(stage) && !normalized[stage].artifactIds.length) normalized[stage] = createStageState()
  }
  return normalized
}

function normalizeStageState(input = {}) {
  const artifactIds = normalizeStringList(input.artifactIds, 40)
  const selectedArtifactId = artifactIds.includes(input.selectedArtifactId)
    ? input.selectedArtifactId
    : null
  return {
    status: ['empty', 'working', 'review', 'approved', 'stale', 'failed'].includes(input.status)
      ? input.status
      : artifactIds.length ? 'review' : 'empty',
    artifactIds,
    selectedArtifactId,
    inputRevision: normalizeText(input.inputRevision),
    staleReason: normalizeText(input.staleReason),
    approvedAt: normalizeTimestamp(input.approvedAt, 0) || null,
    error: input.error?.message ? {
      code: normalizeText(input.error.code) || 'unknown',
      message: normalizeText(input.error.message),
      retryable: Boolean(input.error.retryable)
    } : null
  }
}

function createStageState() {
  return normalizeStageState({})
}

function markPanelStagesStale(production, reason, fromStage = null, includeStage = true) {
  const order = ['rough', 'line', 'flats', 'tones', 'render', 'effects']
  const start = fromStage ? order.indexOf(fromStage) + (includeStage ? 0 : 1) : 0
  return Object.fromEntries(Object.entries(production).map(([stage, state]) => {
    if (start >= 0 && order.indexOf(stage) < start) return [stage, state]
    if (!state.artifactIds.length && state.status === 'empty') return [stage, state]
    return [stage, { ...state, status: 'stale', approvedAt: null, staleReason: reason }]
  }))
}

function hasPanelDirectionChange(patch) {
  return ['visual', 'beat', 'frame', 'direction', 'referenceBindings', 'continuityRefs'].some((key) => patch[key] !== undefined)
}

function patchStaleReason(patch) {
  if (patch.direction || patch.frame) return '分镜构图已更新'
  if (patch.referenceBindings || patch.continuityRefs) return '参考绑定已更新'
  return '格内容已更新'
}

function normalizeBeat(input = {}) {
  return {
    action: normalizeText(input.action),
    emotion: normalizeText(input.emotion),
    reveal: normalizeText(input.reveal),
    transition: normalizeText(input.transition)
  }
}

function normalizeFrame(input = {}) {
  const points = Array.isArray(input.points) ? input.points.map(normalizePoint).filter(Boolean).slice(0, 12) : []
  return {
    kind: input.kind === 'polygon' ? 'polygon' : 'rect',
    points: points.length >= 3 ? points : [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }
    ],
    gutter: normalizeUnitNumber(input.gutter, 0.012),
    bleed: Boolean(input.bleed)
  }
}

function normalizeDirection(input = {}) {
  return {
    revision: normalizePositiveInteger(input.revision, 1),
    notes: normalizeText(input.notes),
    shotSize: VALID_SHOT_SIZES.has(input.shotSize) ? input.shotSize : null,
    cameraAngle: VALID_CAMERA_ANGLES.has(input.cameraAngle) ? input.cameraAngle : null,
    perspective: VALID_PERSPECTIVES.has(input.perspective) ? input.perspective : null,
    focalPoint: normalizePoint(input.focalPoint),
    horizonY: input.horizonY === null || input.horizonY === undefined ? null : normalizeUnitNumber(input.horizonY, 0.5),
    blocking: Array.isArray(input.blocking) ? input.blocking.slice(0, 20) : [],
    motionVectors: Array.isArray(input.motionVectors) ? input.motionVectors.slice(0, 20) : [],
    balloonSafeZones: Array.isArray(input.balloonSafeZones) ? input.balloonSafeZones.slice(0, 20) : []
  }
}

function normalizeReferenceBindings(bindings) {
  if (!Array.isArray(bindings)) return []
  return bindings.slice(0, 40).map((binding = {}) => ({
    role: normalizeText(binding.role) || 'style',
    assetId: normalizeText(binding.assetId),
    entityRef: normalizeSourceRefs([binding.entityRef])[0] || null,
    region: Array.isArray(binding.region) ? binding.region.slice(0, 4).map((value) => normalizeUnitNumber(value, 0)) : null,
    weight: Number.isFinite(Number(binding.weight)) ? normalizeUnitNumber(binding.weight, 1) : null
  })).filter((binding) => binding.assetId)
}

function normalizeLetteringObjects(objects) {
  if (!Array.isArray(objects)) return []
  return objects.slice(0, 40).map((object = {}) => ({
    id: normalizeText(object.id) || `lettering_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: ['speech', 'thought', 'caption', 'sfx'].includes(object.type) ? object.type : 'speech',
    text: normalizeText(object.text),
    box: Array.isArray(object.box) ? object.box.slice(0, 4).map((value) => normalizeUnitNumber(value, 0)) : null,
    tailTarget: normalizePoint(object.tailTarget),
    style: object.style && typeof object.style === 'object' ? { ...object.style } : {},
    zIndex: Number.isFinite(Number(object.zIndex)) ? Number(object.zIndex) : 0
  })).filter((object) => object.text)
}

function normalizeFormat(value) {
  return ['page-ltr', 'page-rtl', 'webtoon'].includes(value) ? value : 'page-ltr'
}

function normalizeCanvas(input = {}) {
  return {
    width: normalizePositiveInteger(input.width, 1200),
    height: normalizePositiveInteger(input.height, 1600),
    bleed: normalizeFiniteNumber(input.bleed, 36),
    safeInset: normalizeFiniteNumber(input.safeInset, 48)
  }
}

function defaultPanelFrame(layout, order, panelCount) {
  const margin = 0.028
  const gap = 0.012
  const width = 1 - margin * 2
  const height = 1 - margin * 2
  const halfWidth = (width - gap) / 2
  let rect

  if (layout === 'feature-4' && order === 1) {
    rect = [margin, margin, width, height * 0.34]
  } else if (layout === 'feature-4' && order > 1) {
    const heroHeight = height * 0.34
    const lowerY = margin + heroHeight + gap
    const lowerHeight = height - heroHeight - gap
    const rightHeight = (lowerHeight - gap) / 2
    rect = order === 2
      ? [margin, lowerY, halfWidth, lowerHeight]
      : [margin + halfWidth + gap, lowerY + (order - 3) * (rightHeight + gap), halfWidth, rightHeight]
  } else {
    const rows = panelCount >= 6 ? 3 : 2
    const rowHeight = (height - gap * (rows - 1)) / rows
    const index = Math.max(0, order - 1)
    rect = [
      margin + (index % 2) * (halfWidth + gap),
      margin + Math.floor(index / 2) * (rowHeight + gap),
      halfWidth,
      rowHeight
    ]
  }

  const [x, y, rectWidth, rectHeight] = rect || [margin, margin, width, height]
  return {
    kind: 'rect',
    gutter: gap,
    points: [
      { x, y }, { x: x + rectWidth, y },
      { x: x + rectWidth, y: y + rectHeight }, { x, y: y + rectHeight }
    ]
  }
}

function normalizePoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return null
  return { x: normalizeUnitNumber(value.x, 0), y: normalizeUnitNumber(value.y, 0) }
}

function normalizeUnitNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback
}

function normalizeFiniteNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeStringList(values, limit = 40) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(normalizeText).filter(Boolean))].slice(0, limit)
}

function normalizeDialogue(dialogue) {
  if (!Array.isArray(dialogue)) return []
  return dialogue.slice(0, 6).map((line) => ({
    speaker: String(line?.speaker || '').trim(),
    text: String(line?.text || '').trim()
  })).filter((line) => line.speaker || line.text)
}

function hasSourceRef(page, sourceRef) {
  return page.sourceRefs.some((ref) => (
    ref.refType === sourceRef.refType
    && ref.refId === sourceRef.refId
    && (sourceRef.projectId === undefined || ref.projectId === sourceRef.projectId)
  ))
}

function sourceRefSignature(sourceRefs) {
  return sourceRefs
    .map((ref) => `${ref.refType}:${ref.refId}:${ref.projectId || ''}`)
    .sort()
    .join('|')
}

function readComicPages(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.COMIC_PAGES) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeComicPages(storage, pages) {
  storage.setItem(STORAGE_KEYS.COMIC_PAGES, JSON.stringify(pages))
}

function resolveStorage(storage) {
  const resolved = storage || globalThis.localStorage
  if (!resolved?.getItem || !resolved?.setItem) throw new Error('当前环境不支持漫画页存储')
  return resolved
}

function createComicPageId() {
  return `comic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function normalizeTimestamp(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}
