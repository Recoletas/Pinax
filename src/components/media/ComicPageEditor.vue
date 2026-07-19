<script setup>
import { computed, ref, watch } from 'vue'
import ComicPagePreview from './ComicPagePreview.vue'
import ImageModelPicker from './ImageModelPicker.vue'
import { generateImage } from '../../services/media/imageProviderService'
import { buildComicPanelImageRequest } from '../../services/media/comicImagePrompt'
import { addGeneratedImageToLibrary } from '../../services/media/mediaAssetStore'
import {
  addComicPanelTake,
  buildComicPageManifest,
  createComicPage,
  findComicPageBySources,
  hydrateComicPageTakes,
  listComicPages,
  saveComicPage,
  updateComicPanel
} from '../../services/media/comicPageStore'
import { generateComicPageScript } from '../../services/media/comicScriptService'

const props = defineProps({
  pageId: { type: String, default: '' },
  standalone: { type: Boolean, default: false },
  sourceCandidates: { type: Array, default: () => [] },
  sourceText: { type: String, default: '' },
  sourceTitle: { type: String, default: '' },
  projectId: { type: String, default: null },
  sourceRefs: { type: Array, default: () => [] },
  preferredSourceId: { type: String, default: '' },
  storageKey: { type: String, required: true },
  modelConfigs: { type: Array, default: () => [] },
  selectedModelId: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})

const emit = defineEmits(['update:selectedModelId', 'save-to-material', 'configs-updated', 'page-preview', 'page-saved', 'active-panel-source-change'])
const comicPage = ref(null)
const panelCount = ref(4)
const draftFormat = ref('page-ltr')
const draftLayout = ref('strip-4')
const draftColorMode = ref('color')
const draftStyleBible = ref('')
const scriptGenerating = ref(false)
const batchGenerating = ref(false)
const scriptError = ref('')
const activePanelId = ref('')
const compactWorkspace = ref('panels')
let loadRevision = 0
const activePanel = computed(() => comicPage.value?.panels.find((panel) => panel.id === activePanelId.value) || null)
const activePanelSourceId = computed(() => panelSourceId(activePanel.value))
const visiblePanels = computed(() => {
  const panels = comicPage.value?.panels || []
  if (!props.compact) return panels
  return panels.filter((panel) => panel.id === activePanelId.value).slice(0, 1)
})
const layoutOptions = computed(() => {
  const count = comicPage.value?.panels.length || panelCount.value
  return count >= 6
    ? [
        { value: 'page-6', label: '六格均分' },
        { value: 'feature-6', label: '首尾强调' }
      ]
    : [
        { value: 'strip-4', label: '四格均分' },
        { value: 'feature-4', label: '首格强调' }
      ]
})
const draftLayoutOptions = computed(() => panelCount.value >= 6
  ? [
      { value: 'page-6', label: '六格均分' },
      { value: 'feature-6', label: '首尾强调' }
    ]
  : [
      { value: 'strip-4', label: '四格均分' },
      { value: 'feature-4', label: '首格强调' }
    ])
const unfinishedPanels = computed(() => comicPage.value?.panels.filter((panel) => !panel.selectedTakeId) || [])
const unconfiguredPanels = computed(() => props.standalone
  ? unfinishedPanels.value.filter((panel) => !panelSourceId(panel) || !panel.visual.trim())
  : [])
const completedPanelCount = computed(() => comicPage.value?.panels.filter((panel) => panel.selectedTakeId).length || 0)
const stageOptions = computed(() => comicPage.value?.colorMode === 'monochrome'
  ? [
      { value: 'rough', label: '草稿' },
      { value: 'line', label: '线稿' },
      { value: 'tones', label: '网点' },
      { value: 'effects', label: '效果' }
    ]
  : [
      { value: 'rough', label: '草稿' },
      { value: 'line', label: '线稿' },
      { value: 'flats', label: '平涂' },
      { value: 'render', label: '上色' },
      { value: 'effects', label: '效果' }
    ])

watch([() => props.pageId, () => props.standalone ? '' : sourceSignature(props.sourceRefs)], () => {
  void loadStoredPage()
}, { immediate: true })
watch(comicPage, (page) => {
  emit('page-preview', page)
}, { deep: true })
watch(activePanelSourceId, (sourceId) => {
  emit('active-panel-source-change', sourceId)
}, { immediate: true })
watch(() => props.preferredSourceId, (sourceId) => {
  if (!sourceId || !activePanel.value || panelSourceId(activePanel.value) === sourceId) return
  setPanelSource(activePanel.value, sourceId)
})

async function loadStoredPage() {
  const revision = ++loadRevision
  const stored = props.pageId
    ? listComicPages({ projectId: props.projectId }).find((page) => page.id === props.pageId) || null
    : props.standalone
      ? null
      : findComicPageBySources(props.sourceRefs, { projectId: props.projectId })
        || (!props.sourceRefs.length ? listComicPages({ projectId: props.projectId })[0] : null)
  if (!stored) {
    comicPage.value = null
    return
  }
  panelCount.value = stored.panels.length >= 6 ? 6 : 4
  const hydrated = await hydrateComicPageTakes(stored)
  if (revision === loadRevision) {
    comicPage.value = hydrated
    activePanelId.value = hydrated.panels.some((panel) => panel.id === activePanelId.value)
      ? activePanelId.value
      : hydrated.panels[0]?.id || ''
  }
}

function createDraftPage() {
  const page = createComicPage({
    projectId: props.projectId,
    sourceRefs: props.standalone ? [] : props.sourceRefs,
    title: props.sourceTitle || '未命名漫画页',
    format: draftFormat.value,
    layout: draftLayout.value,
    colorMode: draftColorMode.value,
    styleBible: draftStyleBible.value,
    panels: Array.from({ length: panelCount.value }, (_, index) => ({ order: index + 1, visual: '' }))
  })
  comicPage.value = saveComicPage(page)
  activePanelId.value = comicPage.value.panels[0]?.id || ''
  if (props.standalone && props.preferredSourceId && activePanel.value) {
    setPanelSource(activePanel.value, props.preferredSourceId)
  }
  compactWorkspace.value = 'panels'
  emit('page-saved', comicPage.value)
}

async function generateScript() {
  const requestedSourceSignature = sourceSignature(props.sourceRefs)
  scriptGenerating.value = true
  scriptError.value = ''
  try {
    const result = await generateComicPageScript({
      sourceText: props.sourceText,
      sourceTitle: props.sourceTitle,
      sourceRefs: props.sourceRefs,
      projectId: props.projectId,
      panelCount: panelCount.value
    })
    const generatedPage = props.standalone && props.sourceRefs.length
      ? {
          ...result.page,
          panels: result.page.panels.map((panel) => ({
            ...panel,
            continuityRefs: [...props.sourceRefs]
          }))
        }
      : result.page
    const saved = saveComicPage({
      ...generatedPage,
      format: draftFormat.value,
      layout: draftLayout.value,
      colorMode: draftColorMode.value,
      styleBible: draftStyleBible.value || result.page.styleBible
    })
    if (requestedSourceSignature === sourceSignature(props.sourceRefs)) {
      comicPage.value = saved
      activePanelId.value = saved.panels[0]?.id || ''
      compactWorkspace.value = 'panels'
      emit('page-saved', saved)
    }
  } catch (error) {
    scriptError.value = error?.message || '漫画脚本生成失败'
  } finally {
    scriptGenerating.value = false
  }
}

function persistPage() {
  if (!comicPage.value) return
  if (props.standalone) comicPage.value.sourceRefs = collectPanelSourceRefs(comicPage.value.panels)
  const runtimeTakes = new Map(comicPage.value.panels.map((panel) => [panel.id, panel.imageTakes || []]))
  const saved = saveComicPage(comicPage.value)
  comicPage.value = {
    ...saved,
    panels: saved.panels.map((panel) => ({ ...panel, imageTakes: runtimeTakes.get(panel.id) || [] }))
  }
  emit('page-saved', saved)
}

async function generatePanel(panel) {
  const config = props.modelConfigs.find((item) => item.id === props.selectedModelId)
  if (!config || (props.standalone && !panelSourceId(panel))) return
  const pageId = comicPage.value.id
  const layout = comicPage.value.layout
  const pageSourceRefs = [...comicPage.value.sourceRefs]
  const projectId = props.projectId
  const panelId = panel.id
  const orderedPanels = [...comicPage.value.panels].sort((a, b) => a.order - b.order)
  const panelIndex = orderedPanels.findIndex((item) => item.id === panelId)
  const previousPanel = panelIndex > 0 ? orderedPanels[panelIndex - 1] : null
  const previousImageData = previousPanel ? selectedTake(previousPanel)?.data || '' : ''
  const source = panelSourceContext(panel)
  const imageRequest = buildComicPanelImageRequest({
    page: comicPage.value,
    panel,
    previousPanel,
    sourceTitle: source.title || props.sourceTitle,
    sourceText: source.content || props.sourceText,
    providerType: config.type,
    previousImageData
  })
  const imageSize = panelImageSize(layout, panel.order)
  patchRuntimePanel(panel.id, { generationStatus: 'generating', generationError: '' })
  updateComicPanel(pageId, panelId, { generationStatus: 'generating', generationError: '' })
  try {
    const data = await generateImage(config, {
      ...imageRequest,
      width: imageSize.width,
      height: imageSize.height,
      count: 1
    })
    const entry = await addGeneratedImageToLibrary(props.storageKey, {
      prompt: imageRequest.prompt,
      negativePrompt: imageRequest.negativePrompt,
      modelName: config.name,
      modelId: config.defaultModel,
      modelType: config.type,
      width: imageSize.width,
      height: imageSize.height,
      data,
      createdAt: new Date().toISOString()
    }, {
      projectId,
      purpose: 'comic-panel',
      sourceRefs: [
        ...pageSourceRefs,
        ...(panel.continuityRefs || []),
        { refType: 'comic-page', refId: pageId, projectId },
        { refType: 'comic-panel', refId: panelId, projectId }
      ]
    })
    const saved = addComicPanelTake(pageId, panelId, entry.mediaAssetId, { select: true })
    if (saved && comicPage.value?.id === pageId) {
      comicPage.value = await hydrateComicPageTakes(saved)
      emit('page-saved', comicPage.value)
    }
  } catch (error) {
    const message = error?.message || '本格图片生成失败'
    updateComicPanel(pageId, panelId, { generationStatus: 'error', generationError: message })
    if (comicPage.value?.id === pageId) {
      patchRuntimePanel(panelId, { generationStatus: 'error', generationError: message })
    }
  }
}

async function generateUnfinishedPanels() {
  if (batchGenerating.value || !unfinishedPanels.value.length || unconfiguredPanels.value.length || !props.selectedModelId) return
  batchGenerating.value = true
  const panelIds = unfinishedPanels.value.map((panel) => panel.id)
  try {
    for (const panelId of panelIds) {
      const panel = comicPage.value?.panels.find((item) => item.id === panelId)
      if (panel && !panel.selectedTakeId) await generatePanel(panel)
    }
  } finally {
    batchGenerating.value = false
  }
}

function selectPanelTake(panel, takeId) {
  const saved = updateComicPanel(comicPage.value.id, panel.id, { selectedTakeId: takeId })
  if (!saved) return
  patchRuntimePanel(panel.id, { selectedTakeId: takeId })
}

function panelSourceId(panel) {
  return panel?.continuityRefs?.find((ref) => ref.refType === 'narrative-asset')?.refId || ''
}

function panelSourceContext(panel) {
  const ref = panel?.continuityRefs?.find((item) => item.refType === 'narrative-asset')
  const candidate = props.sourceCandidates.find((asset) => asset.id === ref?.refId)
  return {
    title: candidate?.title || '',
    content: candidate?.content || ref?.excerpt || ''
  }
}

function setPanelSource(panel, assetId) {
  const asset = props.sourceCandidates.find((candidate) => candidate.id === assetId)
  panel.continuityRefs = asset ? [{
    refType: 'narrative-asset',
    refId: asset.id,
    projectId: asset.projectId ?? props.projectId,
    excerpt: String(asset.content || '').slice(0, 240)
  }] : []
  persistPage()
}

function collectPanelSourceRefs(panels = []) {
  const seen = new Set()
  return panels.flatMap((panel) => panel.continuityRefs || []).filter((ref) => {
    if (ref.refType !== 'narrative-asset' || !ref.refId) return false
    const key = `${ref.refType}:${ref.refId}:${ref.projectId || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function canGeneratePanel(panel) {
  if (!panel.visual.trim() || !props.selectedModelId) return false
  return !props.standalone || Boolean(panelSourceId(panel))
}

function addDialogue(panel) {
  panel.dialogue.push({ speaker: '', text: '' })
}

function removeDialogue(panel, index) {
  panel.dialogue.splice(index, 1)
  persistPage()
}

function addLetteringObject(panel, type = 'speech', text = '') {
  const objects = Array.isArray(panel.letteringObjects) ? panel.letteringObjects : []
  const index = objects.length
  const defaults = defaultLetteringBox(type, index)
  panel.letteringObjects = [
    ...objects,
    {
      id: `lettering_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      text: String(text || '').trim() || (type === 'caption' ? '输入旁白' : '输入对白'),
      box: defaults,
      tailTarget: null,
      style: {},
      zIndex: index
    }
  ]
  persistPage()
}

function importPanelScriptLettering(panel) {
  const source = [
    panel.caption ? { type: 'caption', text: panel.caption } : null,
    ...(panel.dialogue || []).map((line) => ({
      type: 'speech',
      text: [line.speaker, line.text].filter(Boolean).join('：')
    }))
  ].filter((item) => item?.text)
  const next = [...(panel.letteringObjects || [])]
  const existing = new Set(next.map((item) => `${item.type}:${item.text}`))
  source.forEach((item) => {
    if (existing.has(`${item.type}:${item.text}`)) return
    const index = next.length
    next.push({
      id: `lettering_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      type: item.type,
      text: item.text,
      box: defaultLetteringBox(item.type, index),
      tailTarget: null,
      style: {},
      zIndex: index
    })
    existing.add(`${item.type}:${item.text}`)
  })
  panel.letteringObjects = next
  persistPage()
}

function removeLetteringObject(panel, objectId) {
  panel.letteringObjects = (panel.letteringObjects || []).filter((item) => item.id !== objectId)
  persistPage()
}

function letteringTypeLabel(type) {
  return { speech: '对白', thought: '心声', caption: '旁白', sfx: '拟声' }[type] || '对白'
}

function letteringObjectStyle(object) {
  const [x, y, width, height] = normalizeLetteringBox(object.box)
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${width * 100}%`,
    minHeight: `${height * 100}%`,
    zIndex: 10 + (Number(object.zIndex) || 0)
  }
}

let letteringDrag = null

function startLetteringDrag(event, panel, object) {
  if (event.button !== 0) return
  const element = event.currentTarget
  const stage = element.closest('.comic-panel__image')
  if (!stage) return
  event.preventDefault()
  event.stopPropagation()
  const box = normalizeLetteringBox(object.box)
  letteringDrag = {
    pointerId: event.pointerId,
    element,
    stage,
    panel,
    object,
    originalBox: [...box],
    startBox: [...box],
    startX: event.clientX,
    startY: event.clientY,
    mode: event.target.closest('[data-lettering-resize]') ? 'resize' : 'move'
  }
  element.setPointerCapture?.(event.pointerId)
}

function moveLetteringDrag(event) {
  if (!letteringDrag || letteringDrag.pointerId !== event.pointerId) return
  const rect = letteringDrag.stage.getBoundingClientRect()
  const dx = (event.clientX - letteringDrag.startX) / Math.max(1, rect.width)
  const dy = (event.clientY - letteringDrag.startY) / Math.max(1, rect.height)
  const [x, y, width, height] = letteringDrag.startBox
  if (letteringDrag.mode === 'resize') {
    letteringDrag.object.box = [
      x,
      y,
      clampUnit(Math.max(0.18, Math.min(1 - x, width + dx))),
      clampUnit(Math.max(0.1, Math.min(1 - y, height + dy)))
    ]
    return
  }
  letteringDrag.object.box = [
    clampUnit(Math.min(1 - width, Math.max(0, x + dx))),
    clampUnit(Math.min(1 - height, Math.max(0, y + dy))),
    width,
    height
  ]
}

function finishLetteringDrag(event) {
  if (!letteringDrag || letteringDrag.pointerId !== event.pointerId) return
  letteringDrag.element.releasePointerCapture?.(event.pointerId)
  letteringDrag = null
  persistPage()
}

function cancelLetteringDrag(event) {
  if (!letteringDrag || letteringDrag.pointerId !== event.pointerId) return
  letteringDrag.object.box = letteringDrag.originalBox
  letteringDrag = null
}

function defaultLetteringBox(type, index) {
  if (type === 'caption') return [0.05, 0.05 + (index % 2) * 0.13, 0.68, 0.11]
  if (type === 'sfx') return [0.08, 0.48, 0.38, 0.16]
  const right = index % 2 === 0
  return [right ? 0.52 : 0.06, 0.1 + (index % 3) * 0.22, 0.42, 0.16]
}

function normalizeLetteringBox(box) {
  const source = Array.isArray(box) && box.length >= 4 ? box : [0.52, 0.1, 0.42, 0.16]
  const width = Math.max(0.18, Math.min(1, Number(source[2]) || 0.42))
  const height = Math.max(0.1, Math.min(1, Number(source[3]) || 0.16))
  return [
    Math.min(1 - width, Math.max(0, Number(source[0]) || 0)),
    Math.min(1 - height, Math.max(0, Number(source[1]) || 0)),
    width,
    height
  ]
}

function clampUnit(value) {
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000
}

function movePanel(panel, delta) {
  if (!comicPage.value) return
  const fromIndex = comicPage.value.panels.findIndex((item) => item.id === panel.id)
  const toIndex = fromIndex + delta
  if (fromIndex < 0 || toIndex < 0 || toIndex >= comicPage.value.panels.length) return
  const panels = [...comicPage.value.panels]
  const [moved] = panels.splice(fromIndex, 1)
  panels.splice(toIndex, 0, moved)
  panels.forEach((item, index) => { item.order = index + 1 })
  comicPage.value.panels = panels
  persistPage()
}

function moveActivePanel(delta) {
  if (activePanel.value) movePanel(activePanel.value, delta)
}

function navigatePanel(delta) {
  const panels = comicPage.value?.panels || []
  const index = panels.findIndex((panel) => panel.id === activePanelId.value)
  if (index < 0) return
  activePanelId.value = panels[Math.max(0, Math.min(panels.length - 1, index + delta))].id
}

function setPageLayout(layout) {
  if (!comicPage.value || !layoutOptions.value.some((option) => option.value === layout)) return
  comicPage.value.layout = layout
  persistPage()
}

function setPageFormat(format) {
  if (!comicPage.value || !['page-ltr', 'page-rtl', 'webtoon'].includes(format)) return
  comicPage.value.format = format
  persistPage()
}

function setDraftPanelCount(count) {
  panelCount.value = Number(count) >= 6 ? 6 : 4
  draftLayout.value = panelCount.value >= 6 ? 'page-6' : 'strip-4'
}

function setColorMode(colorMode) {
  if (!comicPage.value) return
  comicPage.value.colorMode = colorMode === 'monochrome' ? 'monochrome' : 'color'
  persistPage()
}

function stageStatusLabel(panel, stage) {
  const status = panel.production?.[stage]?.status || 'empty'
  return {
    empty: '未开始',
    working: '处理中',
    review: '待审阅',
    approved: '已确认',
    stale: '需重做',
    failed: '失败'
  }[status] || status
}

// R2-D.5: secondary status detail so the production stage tile doesn't
// pretend that empty / working / stale stages are real finishes. Returns
// a short secondary label (artifact count or stale reason) shown under
// the primary status.
function stageDetailLabel(panel, stage) {
  const entry = panel?.production?.[stage]
  if (!entry) return ''
  const state = entry.status || 'empty'
  const ids = Array.isArray(entry.artifactIds) ? entry.artifactIds.length : 0
  const selected = entry.selectedArtifactId ? 1 : 0
  if (state === 'empty') return ids ? `${ids} 个旧稿` : '无草图'
  if (state === 'working') return '生成中…'
  if (state === 'failed') return entry.error?.message ? `失败：${entry.error.message}` : '失败'
  if (state === 'stale') return entry.staleReason ? `失效：${entry.staleReason}` : '需重做'
  if (state === 'review') return selected ? `选 ${selected}/${ids}` : `${ids} 个候选`
  if (state === 'approved') return entry.approvedAt ? `已确认 ${new Date(entry.approvedAt).toLocaleDateString()}` : '已确认'
  return ''
}

// R2-D.5: full status title (hover + a11y) for the production tile.
function stageTitle(panel, stage) {
  const primary = stageStatusLabel(panel, stage)
  const detail = stageDetailLabel(panel, stage)
  const entry = panel?.production?.[stage]
  if (!entry) return primary
  const status = entry.status || 'empty'
  const ids = Array.isArray(entry.artifactIds) ? entry.artifactIds.length : 0
  const selected = entry.selectedArtifactId ? 1 : 0
  return [primary, detail, `状态 ${status}`, `${ids} 候选 / 选 ${selected}`]
    .filter(Boolean).join(' · ')
}

// R2-D.5: text-area bridge for continuityNotes (textarea is newline-
// separated, store is string[]). Two-way binding via getter/setter on the
// reactive page object.
const continuityNotesText = computed({
  get() {
    return Array.isArray(comicPage.value?.continuityNotes)
      ? comicPage.value.continuityNotes.join('\n')
      : ''
  },
  set(text) {
    if (!comicPage.value) return
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20)
    comicPage.value.continuityNotes = lines
  }
})

function addVisualBibleRef() {
  if (!comicPage.value) return
  const refs = Array.isArray(comicPage.value.visualBibleRefs)
    ? [...comicPage.value.visualBibleRefs]
    : []
  if (refs.length >= 40) return
  refs.push({ kind: 'character', refId: '', note: '', revision: 1 })
  comicPage.value.visualBibleRefs = refs
}

function removeVisualBibleRef(index) {
  if (!comicPage.value?.visualBibleRefs) return
  const removed = comicPage.value.visualBibleRefs[index]
  const refs = comicPage.value.visualBibleRefs.filter((_, i) => i !== index)
  comicPage.value.visualBibleRefs = refs
  if (String(removed?.refId || '').trim()) persistPage()
}

function updateVisualBibleRef(index, key, value) {
  if (!comicPage.value?.visualBibleRefs?.[index]) return
  const previous = comicPage.value.visualBibleRefs[index]
  const refs = comicPage.value.visualBibleRefs.map((entry, i) =>
    i === index ? { ...entry, [key]: value } : entry)
  comicPage.value.visualBibleRefs = refs
  const hadRefId = String(previous?.refId || '').trim()
  const hasRefId = String(refs[index]?.refId || '').trim()
  if (hadRefId || hasRefId) persistPage()
}

function acceptPage() {
  comicPage.value.status = 'accepted'
  persistPage()
}

function exportManifest() {
  if (!comicPage.value || typeof document === 'undefined') return
  const manifest = buildComicPageManifest(comicPage.value)
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeFilename(comicPage.value.title)}.comic.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportPageImage() {
  if (!comicPage.value || typeof document === 'undefined') return
  const width = 1200
  const height = 1600
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return

  context.fillStyle = '#f7f4ed'
  context.fillRect(0, 0, width, height)
  const rects = comicPanelRects(comicPage.value.layout, width, height)
  for (let index = 0; index < comicPage.value.panels.length; index += 1) {
    const panel = comicPage.value.panels[index]
    const rect = rects[index]
    if (!rect) continue
    const take = selectedTake(panel)
    context.save()
    context.beginPath()
    context.rect(rect.x, rect.y, rect.width, rect.height)
    context.clip()
    context.fillStyle = '#e9e5dc'
    context.fillRect(rect.x, rect.y, rect.width, rect.height)
    if (take?.data) {
      try {
        const image = await loadCanvasImage(take.data)
        drawCoverImage(context, image, rect)
      } catch {
        drawPanelPlaceholder(context, panel, rect)
      }
    } else {
      drawPanelPlaceholder(context, panel, rect)
    }
    drawPanelLettering(context, panel, rect)
    context.restore()
    context.strokeStyle = '#1f2630'
    context.lineWidth = 4
    context.strokeRect(rect.x, rect.y, rect.width, rect.height)
  }

  const url = canvas.toDataURL('image/png')
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeFilename(comicPage.value.title)}.png`
  anchor.click()
}

function savePanelToMaterial(panel) {
  const take = selectedTake(panel)
  if (!take) return
  emit('save-to-material', {
    id: take.id,
    mediaAssetId: take.id,
    data: take.data,
    prompt: panel.visual,
    mediaPurpose: 'comic-panel',
    mode: 'comic',
    sourceRefs: [
      ...comicPage.value.sourceRefs,
      { refType: 'comic-page', refId: comicPage.value.id, projectId: props.projectId },
      { refType: 'comic-panel', refId: panel.id, projectId: props.projectId }
    ]
  })
}

function selectedTake(panel) {
  return panel.imageTakes?.find((take) => take.id === panel.selectedTakeId) || null
}

function patchRuntimePanel(panelId, patch) {
  const panel = comicPage.value?.panels.find((item) => item.id === panelId)
  if (panel) Object.assign(panel, patch)
}

function panelStateLabel(panel) {
  if (panel.generationStatus === 'generating') return '生成中'
  if (panel.generationStatus === 'error') return '失败'
  if (panel.selectedTakeId) return `${panel.imageTakeIds.length} 个候选`
  return '待生成'
}

function panelImageSize(layout, order) {
  if (layout === 'feature-4') {
    if (order === 1) return { width: 1280, height: 720 }
    if (order === 2) return { width: 768, height: 1152 }
  }
  if (layout === 'feature-6' && (order === 1 || order === 6)) {
    return { width: 1280, height: 720 }
  }
  return layout === 'strip-4'
    ? { width: 1024, height: 768 }
    : { width: 896, height: 896 }
}

function comicPanelRects(layout, pageWidth, pageHeight) {
  const margin = 34
  const gap = 14
  const x = margin
  const y = margin
  const width = pageWidth - margin * 2
  const height = pageHeight - margin * 2
  const halfWidth = (width - gap) / 2
  if (layout === 'feature-4') {
    const heroHeight = height * 0.34
    const lowerY = y + heroHeight + gap
    const lowerHeight = height - heroHeight - gap
    const rightHeight = (lowerHeight - gap) / 2
    return [
      { x, y, width, height: heroHeight },
      { x, y: lowerY, width: halfWidth, height: lowerHeight },
      { x: x + halfWidth + gap, y: lowerY, width: halfWidth, height: rightHeight },
      { x: x + halfWidth + gap, y: lowerY + rightHeight + gap, width: halfWidth, height: rightHeight }
    ]
  }
  if (layout === 'feature-6') {
    const heroHeight = height * 0.25
    const footerHeight = height * 0.18
    const middleY = y + heroHeight + gap
    const middleHeight = height - heroHeight - footerHeight - gap * 2
    const middleRowHeight = (middleHeight - gap) / 2
    const footerY = middleY + middleHeight + gap
    return [
      { x, y, width, height: heroHeight },
      { x, y: middleY, width: halfWidth, height: middleRowHeight },
      { x: x + halfWidth + gap, y: middleY, width: halfWidth, height: middleRowHeight },
      { x, y: middleY + middleRowHeight + gap, width: halfWidth, height: middleRowHeight },
      { x: x + halfWidth + gap, y: middleY + middleRowHeight + gap, width: halfWidth, height: middleRowHeight },
      { x, y: footerY, width, height: footerHeight }
    ]
  }
  const rows = layout === 'page-6' ? 3 : 2
  const rowHeight = (height - gap * (rows - 1)) / rows
  return Array.from({ length: rows * 2 }, (_, index) => ({
    x: x + (index % 2) * (halfWidth + gap),
    y: y + Math.floor(index / 2) * (rowHeight + gap),
    width: halfWidth,
    height: rowHeight
  }))
}

function loadCanvasImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('漫画格图片加载失败'))
    image.src = source
  })
}

function drawCoverImage(context, image, rect) {
  const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height)
}

function drawPanelPlaceholder(context, panel, rect) {
  context.fillStyle = '#5d6470'
  context.font = '600 30px sans-serif'
  context.textAlign = 'center'
  context.fillText(`第 ${panel.order} 格`, rect.x + rect.width / 2, rect.y + rect.height / 2)
}

function drawPanelLettering(context, panel, rect) {
  const objects = Array.isArray(panel.letteringObjects) ? panel.letteringObjects : []
  objects.forEach((object) => {
    const [unitX, unitY, unitWidth, unitHeight] = normalizeLetteringBox(object.box)
    const box = {
      x: rect.x + unitX * rect.width,
      y: rect.y + unitY * rect.height,
      width: unitWidth * rect.width,
      height: unitHeight * rect.height
    }
    const isSfx = object.type === 'sfx'
    const isCaption = object.type === 'caption'
    const padding = Math.max(8, Math.min(18, box.width * 0.07))
    const fontSize = Math.max(16, Math.min(isSfx ? 38 : 28, box.height * (isSfx ? 0.36 : 0.22)))
    const lineHeight = fontSize * 1.3
    const lines = wrapCanvasText(
      context,
      object.text,
      Math.max(20, box.width - padding * 2),
      Math.max(1, Math.floor((box.height - padding * 2) / lineHeight)),
      `${isSfx ? 800 : 600} ${fontSize}px sans-serif`
    )
    if (!lines.length) return

    context.save()
    if (!isSfx) {
      context.beginPath()
      if (object.type === 'thought') {
        context.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2, 0, 0, Math.PI * 2)
      } else {
        roundedRectPath(context, box.x, box.y, box.width, box.height, isCaption ? 4 : Math.min(box.height / 2, 34))
      }
      context.fillStyle = 'rgba(255,255,255,0.94)'
      context.fill()
      context.strokeStyle = 'rgba(32,36,42,0.86)'
      context.lineWidth = Math.max(2, rect.width / 280)
      if (object.type === 'thought') context.setLineDash([8, 6])
      context.stroke()
    }

    context.font = `${isSfx ? 800 : 600} ${fontSize}px sans-serif`
    context.textAlign = isCaption ? 'left' : 'center'
    context.textBaseline = 'middle'
    const textX = isCaption ? box.x + padding : box.x + box.width / 2
    const totalHeight = lines.length * lineHeight
    const firstY = box.y + (box.height - totalHeight) / 2 + lineHeight / 2
    lines.forEach((line, index) => {
      const textY = firstY + index * lineHeight
      if (isSfx) {
        context.lineWidth = Math.max(3, fontSize * 0.16)
        context.lineJoin = 'round'
        context.strokeStyle = '#20242a'
        context.strokeText(line, textX, textY, box.width)
        context.fillStyle = '#ffffff'
      } else {
        context.fillStyle = '#20242a'
      }
      context.fillText(line, textX, textY, Math.max(20, box.width - padding * 2))
    })
    context.restore()
  })
}

function wrapCanvasText(context, value, maxWidth, maxLines, font) {
  const text = String(value || '').trim()
  if (!text) return []
  context.save()
  context.font = font
  const lines = []
  const paragraphs = text.split(/\n/)
  let truncated = false
  outer: for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const characters = Array.from(paragraphs[paragraphIndex])
    let line = ''
    for (let characterIndex = 0; characterIndex < characters.length; characterIndex += 1) {
      const character = characters[characterIndex]
      const candidate = `${line}${character}`
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = character
        if (lines.length >= maxLines) {
          truncated = true
          break outer
        }
      } else {
        line = candidate
      }
    }
    if (line) {
      lines.push(line)
      if (lines.length >= maxLines && paragraphIndex < paragraphs.length - 1) truncated = true
    }
    if (lines.length >= maxLines) break
  }
  context.restore()
  if (truncated && lines.length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`
  }
  return lines.slice(0, maxLines)
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function sourceSignature(sourceRefs) {
  return sourceRefs
    .map((ref) => `${ref.refType}:${ref.refId}:${ref.projectId || ''}`)
    .sort()
    .join('|')
}

// R2-D.5: small UI helpers for the page-level chip strip.
function formatLabel(format) {
  if (format === 'page-rtl') return '右到左'
  if (format === 'webtoon') return '竖向条漫'
  return '左到右'
}

function safeFilename(value) {
  return String(value || 'comic-page').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'comic-page'
}
</script>

<template>
  <section class="comic-editor" :class="{ 'is-compact': compact, 'is-standalone': standalone }" aria-label="漫画页编辑器">
    <template v-if="!comicPage">
      <header class="comic-editor__draft-heading">
        <span>{{ standalone ? '新建独立漫画页' : '新建漫画页' }}</span>
        <strong>{{ standalone ? '先建立页面，再为每格选择素材' : sourceTitle || '当前素材' }}</strong>
      </header>
      <div class="comic-editor__draft">
        <div class="comic-editor__draft-options">
          <label>
            <span>页格</span>
            <select :value="panelCount" @change="setDraftPanelCount($event.target.value)">
              <option :value="4">4 格</option>
              <option :value="6">6 格</option>
            </select>
          </label>
          <label>
            <span>阅读方向</span>
            <select v-model="draftFormat">
              <option value="page-ltr">左到右页漫</option>
              <option value="page-rtl">右到左页漫</option>
              <option value="webtoon">竖向条漫</option>
            </select>
          </label>
          <label>
            <span>页面版式</span>
            <select v-model="draftLayout">
              <option v-for="option in draftLayoutOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>色制</span>
            <select v-model="draftColorMode">
              <option value="color">彩色</option>
              <option value="monochrome">黑白 / 网点</option>
            </select>
          </label>
        </div>
        <div class="comic-editor__draft-actions">
          <button
            v-if="!standalone"
            class="comic-action comic-action--primary"
            type="button"
            :disabled="scriptGenerating || !sourceText.trim()"
            @click="generateScript"
          >
            {{ scriptGenerating ? '生成脚本中...' : '从素材生成脚本' }}
          </button>
          <button class="comic-action" :class="{ 'comic-action--primary': standalone }" type="button" @click="createDraftPage">建立空白页</button>
        </div>
        <label class="comic-editor__draft-style">
          <span>画风基调</span>
          <textarea v-model="draftStyleBible" rows="3" placeholder="角色、线条、光影与色彩基调"></textarea>
        </label>
      </div>
      <p v-if="scriptError" class="comic-editor__error" role="alert">{{ scriptError }}</p>
    </template>

    <template v-else>
      <header class="comic-editor__setup">
        <div class="comic-editor__setup-current">
          <div>
            <span>漫画制作页 · {{ formatLabel(comicPage.format) }} · {{ comicPage.panels.length }} 格</span>
            <strong>{{ comicPage.title || '未命名漫画页' }}</strong>
          </div>
          <button
            v-if="!standalone"
            class="comic-action comic-editor__rewrite"
            type="button"
            :disabled="scriptGenerating || batchGenerating || !sourceText.trim()"
            title="根据当前素材重写漫画脚本"
            @click="generateScript"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
              <path d="M13 5.5A5.5 5.5 0 1 0 13.1 10M13 2v3.5H9.5" />
            </svg>
            {{ scriptGenerating ? '重写中' : '重写' }}
          </button>
        </div>
      </header>

      <nav v-if="compact" class="comic-editor__workspace-tabs" aria-label="漫画制作工作区">
        <button type="button" :class="{ active: compactWorkspace === 'page' }" @click="compactWorkspace = 'page'">
          页面规划
        </button>
        <button type="button" :class="{ active: compactWorkspace === 'panels' }" @click="compactWorkspace = 'panels'">
          分格制作
          <span>{{ completedPanelCount }}/{{ comicPage.panels.length }}</span>
        </button>
      </nav>

      <p v-if="scriptError" class="comic-editor__error" role="alert">{{ scriptError }}</p>

      <template v-if="!compact || compactWorkspace === 'page'">
        <div class="comic-editor__page-bar">
          <label class="comic-editor__layout-select">
            <span>版式</span>
            <select :value="comicPage.layout" @change="setPageLayout($event.target.value)">
              <option v-for="option in layoutOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="comic-editor__layout-select">
            <span>阅读</span>
            <select :value="comicPage.format" @change="setPageFormat($event.target.value)">
              <option value="page-ltr">左到右</option>
              <option value="page-rtl">右到左</option>
              <option value="webtoon">竖向条漫</option>
            </select>
          </label>
          <label class="comic-editor__layout-select">
            <span>色制</span>
            <select :value="comicPage.colorMode" @change="setColorMode($event.target.value)">
              <option value="color">彩色</option>
              <option value="monochrome">黑白 / 网点</option>
            </select>
          </label>
        </div>

        <details class="comic-editor__page-settings" open>
          <summary>
            <span>视觉连续性</span>
            <small>角色、场景、线条与色彩</small>
          </summary>
          <div class="comic-editor__page-meta">
            <label class="comic-editor__field">
              <span>页面标题</span>
              <input v-model="comicPage.title" aria-label="漫画页标题" @change="persistPage" />
            </label>
            <label class="comic-editor__field">
              <span>统一画风</span>
              <textarea v-model="comicPage.styleBible" rows="3" aria-label="统一画风" placeholder="角色、地点、服装与色彩连续性" @change="persistPage"></textarea>
            </label>
            <label class="comic-editor__field">
              <span>线条规则</span>
              <input v-model="comicPage.visualBible.lineStyle" aria-label="线条规则" placeholder="人物线稿清晰，背景线条减弱" @change="persistPage" />
            </label>
            <label class="comic-editor__field">
              <span>上色与网点</span>
              <textarea v-model="comicPage.visualBible.renderingNotes" rows="2" aria-label="上色与网点规则" placeholder="上色、黑块、网点和效果规则" @change="persistPage"></textarea>
            </label>
          </div>
        </details>

        <details class="comic-editor__page-settings comic-editor__page-beat">
          <summary>
            <span>页级节拍与连续性</span>
            <small>{{ comicPage.continuityNotes?.length || 0 }} 条连续要点</small>
          </summary>
          <div class="comic-editor__page-meta">
            <label class="comic-editor__field">
              <span>页面目的</span>
              <input v-model="comicPage.pagePurpose" aria-label="页面节拍与目的" placeholder="这一页要完成的情绪或剧情转折" @change="persistPage" />
            </label>
            <label class="comic-editor__field">
              <span>翻页钩子</span>
              <input v-model="comicPage.pageTurnHook" aria-label="翻页钩子" placeholder="下一页前留下的视觉或悬念钩" @change="persistPage" />
            </label>
            <label class="comic-editor__field">
              <span>前后页连续要点</span>
              <textarea v-model="continuityNotesText" rows="3" aria-label="前后页连续要点（每行一条）" placeholder="每行一条，例如：上一场的钟塔仍在远景" @change="persistPage"></textarea>
              <small class="comic-editor__hint">{{ comicPage.continuityNotes?.length || 0 }} / 20</small>
            </label>
            <label class="comic-editor__field">
              <span>视觉圣经引用</span>
              <div class="comic-editor__ref-list">
                <span v-for="(entry, refIndex) in comicPage.visualBibleRefs" :key="`${entry.kind}:${entry.refId}:${refIndex}`" class="comic-editor__ref-chip">
                  <select :value="entry.kind" aria-label="视觉圣经引用类型" @change="updateVisualBibleRef(refIndex, 'kind', $event.target.value)">
                    <option value="character">角色</option>
                    <option value="location">地点</option>
                    <option value="prop">道具</option>
                    <option value="palette">色板</option>
                    <option value="lineStyle">线稿</option>
                  </select>
                  <input :value="entry.refId" aria-label="视觉圣经引用 ID" placeholder="实体 ID" @change="updateVisualBibleRef(refIndex, 'refId', $event.target.value)" />
                  <input :value="entry.note" aria-label="视觉圣经引用说明" placeholder="本页要点" @change="updateVisualBibleRef(refIndex, 'note', $event.target.value)" />
                  <button type="button" class="comic-action" :aria-label="`删除视觉圣经引用 ${refIndex + 1}`" @click="removeVisualBibleRef(refIndex)">×</button>
                </span>
                <button v-if="(comicPage.visualBibleRefs?.length || 0) < 40" type="button" class="comic-action comic-editor__ref-add" @click="addVisualBibleRef">
                  添加引用
                </button>
              </div>
            </label>
          </div>
        </details>
      </template>

      <template v-if="!compact || compactWorkspace === 'panels'">
        <section class="comic-editor__preview-block" aria-label="分格导航">
          <div class="comic-editor__section-heading">
            <strong>分格导航</strong>
            <span>{{ completedPanelCount }} / {{ comicPage.panels.length }} 格已有画面</span>
          </div>
          <ComicPagePreview
            v-if="compact"
            :page="comicPage"
            :active-panel-id="activePanelId"
            compact
            interactive
            @select-panel="activePanelId = $event"
          />
        </section>

        <div v-if="compact && activePanel" class="comic-editor__panel-nav">
        <button type="button" title="上一格" aria-label="上一格" :disabled="activePanel.order <= 1" @click="navigatePanel(-1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button type="button" title="当前格前移" aria-label="当前格前移" :disabled="activePanel.order <= 1" @click="moveActivePanel(-1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 19V5m0 0-5 5m5-5 5 5" /></svg>
        </button>
        <span><strong>第 {{ activePanel.order }} 格</strong> · {{ panelStateLabel(activePanel) }}</span>
        <button type="button" title="当前格后移" aria-label="当前格后移" :disabled="activePanel.order >= comicPage.panels.length" @click="moveActivePanel(1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 5v14m0 0 5-5m-5 5-5-5" /></svg>
        </button>
        <button type="button" title="下一格" aria-label="下一格" :disabled="activePanel.order >= comicPage.panels.length" @click="navigatePanel(1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        </div>

        <div class="comic-editor__generation-tools">
          <div class="comic-editor__model">
            <ImageModelPicker
              :model-value="selectedModelId"
              :configs="modelConfigs"
              @update:model-value="$emit('update:selectedModelId', $event)"
              @configs-updated="$emit('configs-updated', $event)"
            />
          </div>
          <button
            class="comic-action"
            type="button"
            :disabled="batchGenerating || scriptGenerating || unfinishedPanels.length === 0 || unconfiguredPanels.length > 0 || !selectedModelId"
            @click="generateUnfinishedPanels"
          >
            {{ batchGenerating
              ? '正在补齐...'
              : unconfiguredPanels.length
                ? `还有 ${unconfiguredPanels.length} 格未配置`
                : unfinishedPanels.length
                  ? `补齐其余 ${unfinishedPanels.length} 格`
                  : '画面已齐' }}
          </button>
        </div>

        <div class="comic-editor__panels">
          <section v-for="panel in visiblePanels" :key="panel.id" class="comic-panel">
          <label v-if="standalone" class="comic-panel__source-select">
            <span>本格素材</span>
            <select :value="panelSourceId(panel)" @change="setPanelSource(panel, $event.target.value)">
              <option value="">选择一条素材</option>
              <option v-for="asset in sourceCandidates" :key="asset.id" :value="asset.id">
                {{ asset.title || '无标题素材' }}
              </option>
            </select>
          </label>
          <header class="comic-panel__header">
            <span>第 {{ panel.order }} 格 <small>{{ panelStateLabel(panel) }}</small></span>
            <button
              class="comic-action comic-action--primary comic-panel__generate-btn"
              type="button"
              :disabled="batchGenerating || panel.generationStatus === 'generating' || !canGeneratePanel(panel)"
              @click="generatePanel(panel)"
            >
              {{ panel.imageTakeIds.length ? '重生成' : '生成画面' }}
            </button>
          </header>

          <div v-if="selectedTake(panel) || panel.letteringObjects?.length" class="comic-panel__image">
            <img v-if="selectedTake(panel)" :src="selectedTake(panel).data" :alt="`第 ${panel.order} 格`" />
            <span v-else class="comic-panel__image-placeholder">生成画面后可在图上拖动文字框</span>
            <button
              v-for="object in panel.letteringObjects || []"
              :key="object.id"
              type="button"
              class="comic-lettering-overlay"
              :class="`is-${object.type}`"
              :style="letteringObjectStyle(object)"
              :title="`${letteringTypeLabel(object.type)}：拖动定位，右下角缩放`"
              @pointerdown="startLetteringDrag($event, panel, object)"
              @pointermove="moveLetteringDrag"
              @pointerup="finishLetteringDrag"
              @pointercancel="cancelLetteringDrag"
            >
              <span>{{ object.text }}</span>
              <i data-lettering-resize aria-hidden="true"></i>
            </button>
          </div>
          <div v-if="panel.imageTakes?.length > 1" class="comic-panel__takes" aria-label="图片候选">
            <button
              v-for="(take, index) in panel.imageTakes"
              :key="take.id"
              type="button"
              :class="{ active: panel.selectedTakeId === take.id }"
              :title="`选择候选 ${index + 1}`"
              @click="selectPanelTake(panel, take.id)"
            >
              <img :src="take.data" alt="" />
            </button>
          </div>

          <label class="comic-editor__field">
            <span>画面</span>
            <textarea v-model="panel.visual" rows="4" placeholder="主体、动作、环境、光线与构图" @change="persistPage"></textarea>
          </label>

          <details class="comic-panel__beat">
            <summary>剧情节拍</summary>
            <div class="comic-panel__beat-grid">
              <label><span>动作</span><input v-model="panel.beat.action" placeholder="这一格发生什么" @change="persistPage" /></label>
              <label><span>情绪</span><input v-model="panel.beat.emotion" placeholder="人物与读者感受" @change="persistPage" /></label>
              <label><span>揭示</span><input v-model="panel.beat.reveal" placeholder="新信息或变化" @change="persistPage" /></label>
              <label><span>衔接</span><input v-model="panel.beat.transition" placeholder="与下一格如何连接" @change="persistPage" /></label>
            </div>
          </details>

          <details class="comic-panel__direction" open>
            <summary>镜头与制作阶段</summary>
            <div class="comic-panel__direction-grid">
              <label>
                <span>景别</span>
                <select v-model="panel.direction.shotSize" @change="persistPage">
                  <option :value="null">未设定</option>
                  <option value="extreme-wide">大远景</option>
                  <option value="wide">远景</option>
                  <option value="medium">中景</option>
                  <option value="close">近景</option>
                  <option value="extreme-close">特写</option>
                  <option value="insert">插入特写</option>
                </select>
              </label>
              <label>
                <span>机位</span>
                <select v-model="panel.direction.cameraAngle" @change="persistPage">
                  <option :value="null">未设定</option>
                  <option value="eye">平视</option>
                  <option value="high">高机位</option>
                  <option value="low">低机位</option>
                  <option value="bird">俯视</option>
                  <option value="worm">仰视</option>
                  <option value="dutch">倾斜</option>
                  <option value="pov">主观</option>
                </select>
              </label>
              <label>
                <span>透视</span>
                <select v-model="panel.direction.perspective" @change="persistPage">
                  <option :value="null">未设定</option>
                  <option value="flat">平面</option>
                  <option value="one-point">一点透视</option>
                  <option value="two-point">两点透视</option>
                  <option value="three-point">三点透视</option>
                  <option value="fisheye">鱼眼</option>
                </select>
              </label>
            </div>
            <label class="comic-panel__direction-notes">
              <span>构图与调度</span>
              <input v-model="panel.direction.notes" placeholder="视线、站位、运动方向、气泡安全区" @change="persistPage" />
            </label>
            <div class="comic-panel__stage-list" aria-label="制作阶段">
              <span
                v-for="stage in stageOptions"
                :key="stage.value"
                class="comic-panel__stage"
                :class="`is-${panel.production?.[stage.value]?.status || 'empty'}`"
                :title="stageTitle(panel, stage.value)"
              >
                <strong>{{ stage.label }}</strong>
                <small>
                  {{ stageStatusLabel(panel, stage.value) }}
                  <span v-if="stageDetailLabel(panel, stage.value)" class="comic-panel__stage-detail">
                    · {{ stageDetailLabel(panel, stage.value) }}
                  </span>
                </small>
              </span>
            </div>
          </details>

          <div class="comic-panel__text-layer">
            <div class="comic-panel__text-heading">
              <span>脚本文字 <small>不参与生图</small></span>
              <button type="button" @click="addDialogue(panel)">添加</button>
              <button
                type="button"
                :disabled="!panel.caption && !panel.dialogue?.some((line) => line.text)"
                @click="importPanelScriptLettering(panel)"
              >排入画面</button>
            </div>
            <div v-for="(line, lineIndex) in panel.dialogue" :key="lineIndex" class="comic-panel__dialogue">
              <input v-model="line.speaker" aria-label="说话人" placeholder="角色" @change="persistPage" />
              <input v-model="line.text" aria-label="对白" placeholder="对白内容" @change="persistPage" />
              <button type="button" title="删除对白" aria-label="删除对白" @click="removeDialogue(panel, lineIndex)">×</button>
            </div>
            <label class="comic-editor__field comic-editor__field--caption">
              <span>旁白</span>
              <input v-model="panel.caption" placeholder="可选" @change="persistPage" />
            </label>
          </div>

          <div class="comic-panel__lettering-tool">
            <div class="comic-panel__text-heading">
              <span>画面文字层 <small>{{ panel.letteringObjects?.length || 0 }} 个</small></span>
              <button type="button" @click="addLetteringObject(panel, 'speech')">添加对话框</button>
            </div>
            <p v-if="!panel.letteringObjects?.length" class="comic-panel__lettering-empty">暂无文字框。可从脚本排入，或手动添加。</p>
            <div v-for="object in panel.letteringObjects || []" :key="object.id" class="comic-panel__lettering-item">
              <select v-model="object.type" aria-label="文字框类型" @change="persistPage">
                <option value="speech">对白</option>
                <option value="thought">心声</option>
                <option value="caption">旁白</option>
                <option value="sfx">拟声</option>
              </select>
              <input v-model="object.text" :aria-label="`${letteringTypeLabel(object.type)}内容`" @change="persistPage" />
              <button type="button" title="删除文字框" aria-label="删除文字框" @click="removeLetteringObject(panel, object.id)">×</button>
            </div>
            <small v-if="panel.letteringObjects?.length" class="comic-editor__hint">直接拖动画面上的文字框定位，拖右下角调整大小。</small>
          </div>

          <p v-if="panel.generationError" class="comic-editor__error" role="alert">{{ panel.generationError }}</p>
          <button
            v-if="selectedTake(panel)"
            class="comic-action comic-panel__material-btn"
            type="button"
            @click="savePanelToMaterial(panel)"
          >
            存为素材
          </button>
          </section>
        </div>

        <footer class="comic-editor__footer">
          <span>{{ completedPanelCount }} / {{ comicPage.panels.length }} 格完成</span>
          <div class="comic-editor__footer-actions">
            <button class="comic-action" type="button" @click="exportManifest">JSON</button>
            <button class="comic-action" type="button" @click="exportPageImage">PNG</button>
            <button class="comic-action comic-action--primary" type="button" :disabled="comicPage.status === 'accepted'" @click="acceptPage">
              {{ comicPage.status === 'accepted' ? '已采纳' : '采纳本页' }}
            </button>
          </div>
        </footer>
      </template>
    </template>
  </section>
</template>

<style scoped>
.comic-editor {
  display: grid;
  min-width: 0;
  gap: 10px;
  align-content: start;
  color: var(--archive-ink, var(--text-primary));
}

.comic-editor *,
.comic-editor *::before,
.comic-editor *::after {
  box-sizing: border-box;
}

.comic-editor__setup,
.comic-editor__page-bar,
.comic-editor__footer,
.comic-editor__footer-actions,
.comic-panel__header,
.comic-panel__text-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.comic-editor__setup,
.comic-editor__page-bar,
.comic-editor__footer {
  justify-content: space-between;
}

.comic-editor__setup {
  min-height: 42px;
  padding: 2px 0 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-editor__draft {
  display: grid;
  gap: 12px;
  padding: 2px 0 0;
}

.comic-editor__draft-heading {
  display: grid;
  gap: 3px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-editor__draft-heading span {
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.comic-editor__draft-heading strong {
  overflow: hidden;
  color: var(--archive-ink, var(--text-primary));
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comic-editor__model {
  display: grid;
  gap: 6px;
}

.comic-editor__setup-current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.comic-editor__setup-current > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.comic-editor__setup-current strong {
  order: 2;
  overflow: hidden;
  color: var(--archive-ink, var(--text-primary));
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comic-editor__setup-current span {
  order: 1;
  overflow: hidden;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comic-editor__model > span,
.comic-editor__section-heading span {
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.comic-editor__draft-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  width: 100%;
}

.comic-editor__draft-options label {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.comic-editor__draft-options select {
  width: 100%;
  min-height: 32px;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 22%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
}

.comic-editor__draft-style {
  display: grid;
  gap: 4px;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.comic-editor__draft-style textarea {
  width: 100%;
  min-height: 54px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 56%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  font-size: 12px;
  line-height: 1.45;
  resize: vertical;
}

.comic-editor__draft-actions {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.9fr);
  gap: 7px;
}

.comic-editor.is-standalone .comic-editor__draft-actions {
  grid-template-columns: 1fr;
}

.comic-editor__draft-actions .comic-action {
  height: 40px;
  min-height: 40px;
  padding-inline: 6px;
  white-space: nowrap;
}

.comic-editor__layout {
  display: flex;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 52%, transparent);
}

.comic-editor button,
.comic-editor input,
.comic-editor textarea,
.comic-editor select {
  font: inherit;
}

.comic-editor__layout button,
.comic-panel__text-heading button,
.comic-editor__panel-nav button {
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
}

.comic-editor__layout button {
  min-height: 28px;
  padding: 3px 10px;
  border-bottom: 2px solid transparent;
}

.comic-editor__layout button.active {
  border-bottom-color: var(--archive-olive, var(--accent));
  color: var(--archive-olive-strong, var(--accent));
  font-weight: 600;
}

.comic-action {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 22%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, transparent);
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
  font-size: 11px;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.comic-action:hover:not(:disabled) {
  border-color: var(--archive-olive, var(--accent));
  background: color-mix(in srgb, var(--archive-olive) 7%, var(--archive-paper-soft));
  color: var(--archive-olive-strong, var(--text-primary));
}

.comic-action--primary {
  min-height: 34px;
  padding-inline: 12px;
  border-style: solid;
  border-color: color-mix(in srgb, var(--archive-olive) 72%, var(--border));
  background: color-mix(in srgb, var(--archive-olive) 88%, var(--archive-olive-strong));
  color: var(--archive-paper-soft, var(--accent-text));
  font-weight: 600;
}

.comic-editor__rewrite {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 4px 8px;
}

.comic-editor button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.comic-editor button:focus-visible,
.comic-editor input:focus-visible,
.comic-editor textarea:focus-visible,
.comic-editor select:focus-visible,
.comic-editor summary:focus-visible {
  outline: 2px solid var(--archive-gold, var(--accent));
  outline-offset: 2px;
}

.comic-editor__page-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  padding: 2px 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-editor__workspace-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 36px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent);
}

.comic-editor__workspace-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
  font-size: 11px;
}

.comic-editor__workspace-tabs button.active {
  border-bottom-color: var(--archive-olive, var(--accent));
  color: var(--archive-ink, var(--text-primary));
  font-weight: 650;
}

.comic-editor__workspace-tabs button span {
  min-width: 28px;
  padding: 1px 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-olive) 12%, transparent);
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 9px;
}

.comic-editor__layout-select {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.comic-editor__layout-select select {
  width: 100%;
  min-width: 0;
  min-height: 28px;
  padding: 3px 18px 3px 6px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 22%, var(--border));
  border-radius: 4px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
}

.comic-editor__page-settings {
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 11px;
}

.comic-editor__page-settings summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
  padding: 4px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 13%, transparent);
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.comic-editor__page-settings summary small {
  overflow: hidden;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 9px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comic-editor__field {
  display: grid;
  gap: 5px;
}

.comic-editor__field > span,
.comic-panel__text-heading,
.comic-editor__footer {
  font-size: 11px;
  color: var(--archive-ink-soft, var(--text-secondary));
}

.comic-editor__field input,
.comic-editor__field textarea,
.comic-editor__field select,
.comic-editor__page-meta input,
.comic-editor__page-meta textarea,
.comic-panel__dialogue input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  min-height: 32px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.45;
}

.comic-editor__page-meta {
  display: grid;
  gap: 7px;
  padding: 9px 0 3px;
}

.comic-editor__page-row {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 8px;
}

.comic-editor__inline-field {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 11px;
}

.comic-editor__page-meta input {
  font-weight: 600;
}

.comic-editor__preview-block {
  display: grid;
  gap: 6px;
}

.comic-editor__section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}

.comic-editor__section-heading strong {
  color: var(--archive-ink, var(--text-primary));
  font-size: 12px;
  font-weight: 600;
}

.comic-editor.is-compact :deep(.comic-page-preview.is-compact) {
  height: 168px;
  aspect-ratio: auto;
  border-color: color-mix(in srgb, var(--archive-ink) 28%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, transparent);
}

.comic-editor.is-compact :deep(.comic-page-preview__panel.active) {
  outline-width: 2px;
}

.comic-editor textarea {
  resize: vertical;
}

.comic-editor__panels {
  display: grid;
}

.comic-editor__panel-nav {
  display: grid;
  grid-template-columns: 28px 28px minmax(0, 1fr) 28px 28px;
  align-items: center;
  min-height: 34px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-editor__panel-nav button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
}

.comic-editor__panel-nav button:hover:not(:disabled) { color: var(--archive-olive-strong, var(--accent)); }
.comic-editor__panel-nav > span { min-width: 0; overflow: hidden; text-align: center; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.comic-editor__panel-nav strong { color: var(--archive-ink, var(--text-primary)); font-size: 11px; }

/* R2-D.5: page-level chip strip on the preview heading — keeps the
   beat / turn-hook visible without blocking the preview, and shows
   reading direction + active panel inline. All radii ≤ 8px per R2-D
   archive-folio token spec. */
.comic-editor__page-meta-line {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.comic-editor__chip,
.comic-editor__direction-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--archive-gold) 12%, transparent);
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
  letter-spacing: 0;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.comic-editor__direction-chip {
  background: color-mix(in srgb, var(--archive-olive) 14%, transparent);
  color: var(--archive-ink, var(--text-primary));
  font-weight: 600;
}
.comic-editor__chip.is-meta {
  background: color-mix(in srgb, var(--archive-paper-soft) 78%, transparent);
}
.comic-editor__chip.is-active {
  background: color-mix(in srgb, var(--archive-ink) 88%, transparent);
  color: var(--archive-paper-soft, #fff);
  font-weight: 600;
}

/* R2-D.5: page-beat hint + reference chip styles. */
.comic-editor__hint {
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}
.comic-editor__ref-list {
  display: grid;
  gap: 6px;
}
.comic-editor__ref-chip {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr) 28px;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--archive-paper-soft) 86%, transparent);
  border: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-editor__ref-chip input[aria-label="视觉圣经引用说明"] {
  grid-column: 1 / -1;
  grid-row: 2;
}
.comic-editor__ref-chip select,
.comic-editor__ref-chip input {
  min-height: 28px;
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 56%, var(--border));
  background: var(--archive-paper, var(--bg-primary));
}
.comic-editor__ref-chip button {
  grid-column: 3;
  grid-row: 1;
  border-radius: 4px;
}
.comic-editor__ref-add {
  align-self: flex-start;
}

/* R2-D.5: stage detail line — secondary info under the primary status. */
.comic-panel__stage-detail {
  color: var(--archive-ink-soft, var(--text-secondary));
  font-style: italic;
  margin-left: 2px;
}

.comic-panel {
  display: grid;
  gap: 9px;
  padding: 3px 0 10px;
}

.comic-panel__source-select {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 28%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-olive) 6%, var(--archive-paper-soft));
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.comic-panel__source-select select {
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 4px 24px 4px 7px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  border-radius: 4px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
}

.comic-panel__header > span:first-child {
  font-size: 12px;
  font-weight: 650;
}

.comic-panel__header > span:first-child small {
  margin-left: 5px;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 9px;
  font-weight: 400;
}

.comic-panel__generate-btn { flex: 0 0 auto; margin-left: auto; }

.comic-panel__state {
  color: var(--archive-ink-soft, var(--text-muted));
  font-size: 10px;
}

.comic-panel__state.is-error,
.comic-editor__error {
  color: var(--danger);
}

.comic-panel__image {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 42%, var(--border));
  border-radius: 3px;
  background: var(--archive-paper, var(--bg-primary));
}

.comic-panel__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.comic-panel__image-placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 18px;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
  text-align: center;
}

.comic-lettering-overlay {
  position: absolute;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 5px 8px;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 76%, transparent);
  border-radius: 50%;
  background: rgb(255 255 255 / 0.94);
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.18);
  color: #20242a;
  cursor: grab;
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  touch-action: none;
}

.comic-lettering-overlay:active {
  cursor: grabbing;
}

.comic-lettering-overlay.is-thought {
  border-style: dashed;
  border-radius: 46%;
}

.comic-lettering-overlay.is-caption {
  border-radius: 2px;
  text-align: left;
}

.comic-lettering-overlay.is-sfx {
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  text-shadow: -1px -1px 0 #20242a, 1px -1px 0 #20242a, -1px 1px 0 #20242a, 1px 1px 0 #20242a;
  transform: rotate(-7deg);
}

.comic-lettering-overlay > span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.comic-lettering-overlay > i {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 9px;
  height: 9px;
  border-right: 2px solid color-mix(in srgb, currentColor 68%, transparent);
  border-bottom: 2px solid color-mix(in srgb, currentColor 68%, transparent);
  cursor: nwse-resize;
}

.comic-panel__takes {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.comic-panel__takes button {
  width: 48px;
  height: 36px;
  flex: 0 0 auto;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 2px;
  opacity: 0.65;
}

.comic-panel__takes button.active {
  border-color: var(--archive-olive, var(--accent));
  opacity: 1;
}

.comic-panel__takes img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.comic-panel__text-layer {
  display: grid;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-panel__text-heading span small {
  margin-left: 4px;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 9px;
  font-weight: 400;
}

.comic-panel__lettering-tool {
  display: grid;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-panel__lettering-empty {
  margin: 0;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
  line-height: 1.45;
}

.comic-panel__lettering-item {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 24px;
  gap: 5px;
  align-items: center;
}

.comic-panel__lettering-item select,
.comic-panel__lettering-item input {
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
}

.comic-panel__lettering-item button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
}

.comic-panel__direction,
.comic-panel__beat {
  padding-top: 7px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 11px;
}

.comic-panel__direction summary,
.comic-panel__beat summary {
  display: flex;
  align-items: center;
  min-height: 26px;
  color: var(--archive-ink, var(--text-primary));
  font-weight: 600;
  cursor: pointer;
}

.comic-panel__beat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  padding-top: 7px;
}

.comic-panel__beat-grid label,
.comic-panel__direction-notes {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.comic-panel__beat-grid input,
.comic-panel__direction-notes input {
  width: 100%;
  min-width: 0;
  min-height: 31px;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
}

.comic-panel__direction-notes {
  padding-top: 7px;
}

.comic-panel__direction-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding-top: 7px;
}

.comic-panel__direction-grid label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.comic-panel__direction-grid select {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  min-height: 32px;
  padding: 5px 6px;
  font-size: 11px;
}

.comic-panel__stage-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
  gap: 4px;
  padding-top: 8px;
}

.comic-panel__stage {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 5px 3px;
  border-bottom: 2px solid color-mix(in srgb, var(--archive-gold) 34%, transparent);
  color: var(--archive-ink-soft, var(--text-secondary));
  white-space: nowrap;
  overflow: hidden;
}

.comic-panel__stage strong { font-size: 10px; color: var(--archive-ink, var(--text-primary)); }
.comic-panel__stage small { font-size: 9px; }
.comic-panel__stage.is-review { border-bottom-color: var(--archive-olive, var(--accent)); }
.comic-panel__stage.is-approved { border-bottom-color: var(--archive-olive-strong, var(--accent)); }
.comic-panel__stage.is-stale { border-bottom-color: var(--danger); }

.comic-panel__text-heading button {
  margin-left: auto;
  color: var(--archive-olive-strong, var(--accent));
}

.comic-panel__dialogue {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 24px;
  gap: 5px;
}

.comic-panel__dialogue button {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.comic-editor__field--caption {
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
}

.comic-editor__field--caption input {
  min-height: 30px;
}

.comic-editor__error {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
}

.comic-panel__material-btn {
  justify-self: end;
}

.comic-editor__footer {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent);
  align-items: flex-end;
  flex-wrap: wrap;
}

.comic-editor__generation-tools {
  display: grid;
  gap: 7px;
  padding-bottom: 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
}

.comic-editor__generation-tools > .comic-action {
  justify-self: stretch;
}

.comic-editor__footer-actions {
  margin-left: auto;
}

@media (max-width: 560px) {
  .comic-editor__setup { align-items: stretch; }
  .comic-editor__draft-options { grid-template-columns: 1fr; }
  .comic-editor__draft-actions .comic-action { flex: 1 1 140px; }
  .comic-editor__page-row { grid-template-columns: 1fr; }
  .comic-panel__direction-grid { grid-template-columns: 1fr; }
  .comic-editor__footer-actions { width: 100%; margin-left: 0; }
}
</style>
