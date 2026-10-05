<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ImageModelPicker from './ImageModelPicker.vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { generateImage, getImageProviderCapabilities } from '../../services/media/imageProviderService'
import { listImageProviderConfigs } from '../../services/media/imageProviderConfigStore'
import {
  addGeneratedImageToLibrary,
  listMediaAssets,
  loadGeneratedImageLibrary,
  removeGeneratedImageFromLibrary
} from '../../services/media/mediaAssetStore'
import { COMIC_IMAGE_NEGATIVE_PROMPT } from '../../services/media/comicImagePrompt'
import { draftImageDescription } from '../../services/media/imageDescriptionService.js'
import { loadImageGenerationRun, removeImageGenerationRun, saveImageGenerationRun, updateImageGenerationRunItem } from '../../services/media/imageGenerationRunStore.js'

const props = defineProps({
  storageKey: {
    type: String,
    required: true
  },
  selectedText: {
    type: String,
    default: ''
  },
  selectedPromptLabel: {
    type: String,
    default: '当前选中'
  },
  sourceTitle: {
    type: String,
    default: ''
  },
  workbenchTitle: {
    type: String,
    default: '生图'
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  allowInsertImageToEditor: {
    type: Boolean,
    default: false
  },
  mediaPurpose: {
    type: String,
    default: 'illustration'
  },
  modes: {
    type: Array,
    default: () => ['reference']
  },
  defaultMode: {
    type: String,
    default: 'reference'
  },
  projectId: {
    type: String,
    default: null
  },
  sourceRefs: {
    type: Array,
    default: () => []
  },
  referenceCandidates: {
    type: Array,
    default: () => []
  },
  layout: {
    type: String,
    default: 'stack',
    validator: (value) => ['stack', 'split'].includes(value)
  },
  initialPrompt: {
    type: String,
    default: ''
  },
  promptSupplement: {
    type: String,
    default: ''
  },
  contextKey: {
    type: String,
    default: ''
  },
  generationContext: {
    type: Object,
    default: () => ({})
  },
  librarySourceRefs: {
    type: Array,
    default: null
  },
  mobilePane: {
    type: String,
    default: 'both',
    validator: (value) => ['parameters', 'results', 'both'].includes(value)
  },
  actionGuard: {
    type: Function,
    default: null
  },
  presentation: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'authoring'].includes(value)
  }
})

const emit = defineEmits([
  'insert-image',
  'save-to-material',
  'configs-updated',
  'image-preview',
  'generation-start',
  'generation-complete',
  'generation-error',
  'generation-cancel'
])

const imagePrompt = ref('')
const imageNegativePrompt = ref('')
const imageReferencePrompt = ref('')
const imageStylePreset = ref('cinematic-anime')
const imageSelectedModel = ref('')
const imageWidth = ref(1024)
const imageHeight = ref(1024)
const imageCount = ref(1)
const imageGenerating = ref(false)
const imageLibrary = ref([])
const imagePreviewIndex = ref(-1)
const modelConfigs = ref([])
const activeMode = ref(props.defaultMode)
const selectedReferenceIds = ref([])
const storedReferenceImages = ref([])
const referenceInput = ref(null)
const referenceStrength = ref(0.65)
const referenceUploadMessage = ref('')
const generationStatus = ref({ kind: 'idle', message: '' })
const activeJob = ref(null)
const imageJobItems = ref([])
const interruptedRun = ref(null)
const imageJobStateLabels = { queued: '等待', generating: '生成中', generated: '已生成', persisting: '保存中', saved: '已保存', 'persist-failed': '待保存', failed: '失败', cancelled: '已停止' }
// Unsaved pixels stay in memory only. Retrying storage never calls the provider.
const unsavedImages = ref([])
const savingImages = ref(false)
const retryGeneration = ref(null)
const allowTextOnlyReference = ref(false)
const comparisonImageId = ref('')
const descriptionDraft = ref('')
const descriptionBusy = ref(false)
const descriptionError = ref('')
const previousDescription = ref(null)
let descriptionController = null
let descriptionSourceKey = ''
let activeGeneration = null
let libraryLoadRevision = 0
let latestGeneration = null
let pendingPromptSync = null

const sizePresets = [
  { label: '1:1 方图', width: 1024, height: 1024 },
  { label: '16:9 宽图', width: 1280, height: 720 },
  { label: '9:16 竖图', width: 720, height: 1280 },
  { label: '4:3 横图', width: 1024, height: 768 },
  { label: '3:4 竖图', width: 768, height: 1024 }
]
const authoringQualityTerms = Object.freeze([
  '超详细的', '高分辨率的', '最高质量的', '杰作', '8K 壁纸',
  '完美的', '详细的背景', '多彩的', '极度详细的', '美丽详细的脸'
])
const authoringStylePresets = Object.freeze([
  { id: 'cinematic-anime', label: '华彩二次元', prompt: '华彩二次元插画，电影级光影，精致角色设计，丰富色彩层次', position: '0% 50%' },
  { id: 'cute-anime', label: '可爱动漫', prompt: '可爱动漫风格，柔和线条，明亮配色，亲和的角色表情', position: '25% 50%' },
  { id: 'dramatic-anime', label: '光影动漫', prompt: '戏剧化动漫风格，强烈明暗关系，轮廓光，电影构图', position: '50% 50%' },
  { id: 'stylized-3d', label: '3D 写实', prompt: '风格化 3D 写实渲染，真实材质，体积光，电影镜头质感', position: '75% 50%' },
  { id: 'portrait-photo', label: '人物写真', prompt: '人物写真摄影，真实肤质，自然景深，细腻布光，高级镜头质感', position: '100% 50%' }
])

const modeLabels = {
  reference: '参考图',
  illustration: '插画'
}

const selectedTextText = computed(() => String(props.selectedText || '').trim())
const importButtonLabel = computed(() => tr('导入{source}', { source: tr(props.selectedPromptLabel || '当前选中') }))
const availableModes = computed(() => {
  const requested = props.modes.filter((mode) => modeLabels[mode])
  return requested.length ? [...new Set(requested)] : ['reference']
})
const hasSeparateReferenceWorkspace = computed(() => (
  availableModes.value.includes('reference') && availableModes.value.includes('illustration')
))
const referenceWorkspaceActive = computed(() => (
  hasSeparateReferenceWorkspace.value && activeMode.value === 'reference'
))
const showFullReferenceManager = computed(() => (
  referenceWorkspaceActive.value || !hasSeparateReferenceWorkspace.value
))
const activeMediaPurpose = computed(() => (
  activeMode.value === 'illustration' ? 'illustration' : props.mediaPurpose
))
const selectedSizeKey = computed(() => `${imageWidth.value}x${imageHeight.value}`)
const hasCustomSize = computed(() => !sizePresets.some((preset) => `${preset.width}x${preset.height}` === selectedSizeKey.value))
const selectedPreviewImage = computed(() => imageLibrary.value[imagePreviewIndex.value] || null)
const comparisonImage = computed(() => imageLibrary.value.find((image) => image.id === comparisonImageId.value && image.id !== selectedPreviewImage.value?.id) || null)
const selectedModelConfig = computed(() => modelConfigs.value.find((item) => item.id === imageSelectedModel.value) || null)
const selectedModelCapabilities = computed(() => getImageProviderCapabilities(selectedModelConfig.value || {}))
const referenceSelectionLimit = computed(() => Math.max(1, Number(selectedModelCapabilities.value.maxReferenceImages) || 1))
const characterReferenceOnly = computed(() => selectedModelCapabilities.value.referenceKind === 'character')
const referenceMaxFileSizeMb = computed(() => characterReferenceOnly.value ? 10 : 12)
const selectedModelSupportsReference = computed(() => (
  selectedModelCapabilities.value.identityReference === true
))
const selectedModelSupportsStrength = computed(() => ['sd_webui', 'stability'].includes(selectedModelConfig.value?.type)
  || (selectedModelConfig.value?.type === 'http' && String(selectedModelConfig.value?.requestTemplate || '').includes('{{reference_strength}}')))
const selectedStylePreset = computed(() => (
  authoringStylePresets.find((preset) => preset.id === imageStylePreset.value)
    || authoringStylePresets[0]
))
const allReferenceCandidates = computed(() => {
  const known = new Set()
  return [...storedReferenceImages.value, ...props.referenceCandidates]
    .filter((candidate) => {
      if (!candidate?.id || !candidate?.data || known.has(candidate.id)) return false
      known.add(candidate.id)
      return true
    })
})
const selectedReferenceImages = computed(() => selectedReferenceIds.value
  .map((id) => allReferenceCandidates.value.find((candidate) => candidate.id === id))
  .filter(Boolean)
  .slice(0, referenceSelectionLimit.value))
watch(referenceSelectionLimit, (limit) => {
  selectedReferenceIds.value = selectedReferenceIds.value.slice(-limit)
})
watch(() => [imageSelectedModel.value, selectedReferenceIds.value.join('|')], () => { allowTextOnlyReference.value = false })
const effectiveLibrarySourceRefs = computed(() => (
  Array.isArray(props.librarySourceRefs) ? props.librarySourceRefs : props.sourceRefs
))
const libraryScopeKey = computed(() => JSON.stringify({
  storageKey: props.storageKey,
  projectId: props.projectId,
  purpose: activeMediaPurpose.value,
  contextKey: props.contextKey,
  sourceRefs: effectiveLibrarySourceRefs.value.map((ref) => [ref.refType, ref.refId, ref.projectId || ''])
}))
const generationMessageRole = computed(() => (
  generationStatus.value.kind === 'error' ? 'alert' : 'status'
))
const selectedActionGuard = computed(() => {
  const entry = selectedPreviewImage.value
  if (!entry) return {}
  let supplied = {}
  try {
    if (typeof props.actionGuard === 'function') supplied = props.actionGuard(entry) || {}
  } catch {
    return { insertDisabled: true, saveDisabled: true, reason: '当前结果状态无法确认，请重新选择。' }
  }
  const currentFingerprint = String(
    props.generationContext?.fingerprint
      || props.generationContext?.authoringVisualBrief?.fingerprint
      || ''
  )
  const entryFingerprint = String(entry.contextFingerprint || entry.generationParams?.fingerprint || '')
  const contextDetached = Boolean(props.contextKey && entry.contextKey && props.contextKey !== entry.contextKey)
  const fingerprintStale = Boolean(currentFingerprint && entryFingerprint && currentFingerprint !== entryFingerprint)
  const provenanceReason = contextDetached
    ? '原写作位置已切换，不能插入正文。'
    : (fingerprintStale ? '画面来源已更新，不能插入正文。' : '')
  return {
    insertDisabled: supplied.insertDisabled === true || Boolean(provenanceReason),
    saveDisabled: supplied.saveDisabled === true,
    reason: provenanceReason || String(supplied.reason || supplied.insertReason || supplied.saveReason || '')
  }
})
const generationBusyElsewhere = computed(() => imageGenerating.value && activeJob.value?.libraryScopeKey !== libraryScopeKey.value)
const emptyResultHint = computed(() => '生成的图片会显示在这里，可选用或保存。')

onMounted(async () => {
  loadModelConfigs()
  await reloadLibraries()
  const record = loadImageGenerationRun(libraryScopeKey.value, { activeRunId: activeGeneration?.job?.runId })
  interruptedRun.value = record?.runId === activeGeneration?.job?.runId ? null : record
  if (interruptedRun.value) generationStatus.value = { kind: 'cancelled', message: tr('上次任务在刷新前未结束；已恢复 {count} 张已保存成果，未完成项不会自动重发。', { count: interruptedRun.value.items.filter((item) => item.state === 'saved').length }) }
})

watch(availableModes, (modes) => {
  if (!modes.includes(activeMode.value)) {
    activeMode.value = modes.includes(props.defaultMode) ? props.defaultMode : modes[0]
  }
}, { immediate: true })
watch(libraryScopeKey, () => {
  const live = activeGeneration?.job?.libraryScopeKey === libraryScopeKey.value ? activeGeneration : null
  imagePreviewIndex.value = -1
  imageJobItems.value = live?.items || []
  comparisonImageId.value = ''
  generationStatus.value = live
    ? { kind: 'generating', message: tr('正在生成 {count} 张候选…', { count: live.job.count }) }
    : { kind: 'idle', message: '' }
  const record = loadImageGenerationRun(libraryScopeKey.value, { activeRunId: activeGeneration?.job?.runId })
  interruptedRun.value = record?.runId === live?.job?.runId ? null : record
  if (interruptedRun.value) generationStatus.value = { kind: 'cancelled', message: tr('上次任务在刷新前未结束；已恢复 {count} 张已保存成果，未完成项不会自动重发。', { count: interruptedRun.value.items.filter((item) => item.state === 'saved').length }) }
  void reloadLibraries()
})
watch(allReferenceCandidates, (candidates) => {
  const availableIds = new Set(candidates.map((candidate) => candidate.id))
  const retained = selectedReferenceIds.value.filter((id) => availableIds.has(id))
  const automatic = candidates.filter((candidate) => candidate.autoSelected === true).map((candidate) => candidate.id)
  selectedReferenceIds.value = [...new Set([...retained, ...automatic])].slice(-referenceSelectionLimit.value)
})
watch(
  () => [props.contextKey, props.initialPrompt],
  ([contextKey, initialPrompt], [previousContextKey] = []) => {
    if (imageGenerating.value) {
      pendingPromptSync = { contextKey, initialPrompt, previousContextKey }
      return
    }
    syncInitialPrompt(contextKey, initialPrompt, previousContextKey)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (activeGeneration) cancelGeneration('unmount')
  libraryLoadRevision += 1
})

function loadModelConfigs() {
  modelConfigs.value = listImageProviderConfigs()
  if (modelConfigs.value.length && !imageSelectedModel.value) {
    imageSelectedModel.value = modelConfigs.value[0].id
  }
}

function syncInitialPrompt(contextKey, initialPrompt, previousContextKey) {
  const normalized = String(initialPrompt || '').trim()
  const contextChanged = previousContextKey !== undefined
    && String(contextKey || '') !== String(previousContextKey || '')
  if (contextChanged) {
    imagePrompt.value = normalized
    return
  }
  if (normalized && !imagePrompt.value.trim()) imagePrompt.value = normalized
}

function flushPendingPromptSync() {
  const pending = pendingPromptSync
  pendingPromptSync = null
  if (!pending) return
  syncInitialPrompt(pending.contextKey, pending.initialPrompt, pending.previousContextKey)
}

function handleConfigsUpdated(configs) {
  modelConfigs.value = Array.isArray(configs) ? configs : listImageProviderConfigs()
  if (!modelConfigs.value.some((config) => config.id === imageSelectedModel.value)) {
    imageSelectedModel.value = modelConfigs.value[0]?.id || ''
  }
  emit('configs-updated', modelConfigs.value)
}

async function reloadLibraries() {
  const revision = ++libraryLoadRevision
  const scope = {
    storageKey: props.storageKey,
    projectId: props.projectId,
    purpose: activeMediaPurpose.value,
    sourceRefs: cloneSerializable(effectiveLibrarySourceRefs.value, [])
  }
  try {
    const [nextImages, nextReferences] = await Promise.all([
      loadGeneratedImageLibrary(scope.storageKey, {
        projectId: scope.projectId,
        purpose: scope.purpose,
        sourceRefs: scope.sourceRefs
      }),
      loadGeneratedImageLibrary(scope.storageKey, {
        projectId: scope.projectId,
        purpose: 'storyboard-reference',
        sourceRefs: scope.sourceRefs
      })
    ])
    if (revision !== libraryLoadRevision) return
    const selectedId = selectedPreviewImage.value?.id || ''
    imageLibrary.value = nextImages
    storedReferenceImages.value = nextReferences
    const restoredIndex = selectedId
      ? nextImages.findIndex((entry) => entry.id === selectedId)
      : -1
    imagePreviewIndex.value = restoredIndex >= 0 ? restoredIndex : (nextImages.length ? 0 : -1)
  } catch (error) {
    if (revision !== libraryLoadRevision) return
    generationStatus.value = {
      kind: 'error',
      message: error?.message || '无法读取图片历史'
    }
  }
}

function useSelectedTextAsPrompt() {
  if (imageGenerating.value) return
  if (!selectedTextText.value) return
  imagePrompt.value = selectedTextText.value
}

function selectSizePreset(value) {
  if (imageGenerating.value) return
  const preset = sizePresets.find((item) => `${item.width}x${item.height}` === value)
  if (!preset) return
  imageWidth.value = preset.width
  imageHeight.value = preset.height
}

async function generateImages({ retry = false } = {}) {
  if (!imagePrompt.value.trim()) {
    generationStatus.value = { kind: 'error', message: '请先写下画面描述。' }
    return
  }
  if (!imageSelectedModel.value) {
    generationStatus.value = { kind: 'error', message: '请先选择或添加图片模型。' }
    return
  }

  const previous = retry ? retryGeneration.value : null
  if (previous && previous.job.libraryScopeKey !== libraryScopeKey.value) return
  const cfg = previous?.providerConfig || modelConfigs.value.find((item) => item.id === imageSelectedModel.value)
  if (!cfg) {
    generationStatus.value = { kind: 'error', message: '未找到选中的图片模型配置。' }
    return
  }

  if (activeGeneration) return
  const capabilities = getImageProviderCapabilities(cfg)
  if (capabilities.textToImage !== true) {
    generationStatus.value = { kind: 'error', message: capabilities.configurationError || '所选模型暂不可生成，请检查模型配置。' }
    return
  }
  if (!previous && selectedReferenceImages.value.length && !selectedModelSupportsReference.value && !allowTextOnlyReference.value) {
    generationStatus.value = { kind: 'error', message: '当前模型不支持图片参考。请选择其他模型，或明确选择仅用文字生成。' }
    return
  }
  const controller = new AbortController()
  const frozen = previous?.job || createFrozenGenerationJob(cfg)
  const providerConfig = deepFreeze(cloneSerializable(cfg, {}))
  const referenceImages = previous?.referenceImages || deepFreeze((frozen.referenceSubmissionSupported ? selectedReferenceImages.value : []).map((reference) => ({
    id: String(reference.mediaAssetId || reference.id || ''),
    title: referenceLabel(reference),
    data: String(reference.data || '')
  })))
  const running = {
    controller,
    job: frozen,
    providerConfig,
    referenceImages,
    discarded: false,
    cancelEmitted: false,
    archiveStarted: false
  }
  running.generatedIndices = previous?.generatedIndices || []
  running.entries = previous?.entries || []
  imageJobItems.value = previous?.items || Array.from({ length: frozen.count }, (_, index) => ({ id: `${frozen.runId}-${index + 1}`, state: 'queued' }))
  running.items = imageJobItems.value
  retryGeneration.value = null
  activeGeneration = running
  latestGeneration = running
  activeJob.value = frozen
  imageGenerating.value = true
  libraryLoadRevision += 1
  generationStatus.value = {
    kind: 'running',
    message: frozen.count > 1 ? tr('正在生成 {count} 张候选…', { count: frozen.count }) : '正在生成候选…'
  }
  emit('generation-start', { job: frozen })
  persistImageRun(running, 'running')

  const archivedEntries = running.entries
  try {
    for (let index = 0; index < frozen.count; index += 1) {
      if (running.generatedIndices.includes(index)) continue
      assertActiveGeneration(running, frozen)
      running.items[index].state = 'generating'
      const data = await generateImage(providerConfig, {
        prompt: frozen.providerPrompt,
        negativePrompt: frozen.negativePrompt,
        width: frozen.width,
        height: frozen.height,
        count: 1,
        referenceImages,
        referenceStrength: frozen.referenceStrength,
        signal: controller.signal
      })
      assertActiveGeneration(running, frozen)
      running.items[index].state = 'generated'
      persistImageRun(running, 'running')
      running.archiveStarted = true
      running.generatedIndices.push(index)
      const candidate = {
        id: running.items[index].id,
        prompt: frozen.prompt,
        negativePrompt: frozen.negativePrompt,
        modelName: frozen.model.name,
        modelId: frozen.model.defaultModel,
        modelType: frozen.model.type,
        width: frozen.width,
        height: frozen.height,
        referenceImageIds: frozen.referenceImageIds,
        referenceCount: frozen.referenceImageIds.length,
        referenceStrength: frozen.referenceStrength,
        generationParams: {
          runId: frozen.runId, itemIndex: index, itemCount: frozen.count,
          stylePreset: frozen.stylePreset,
          stylePrompt: frozen.stylePrompt,
          referencePrompt: frozen.referencePrompt,
          referenceSubmissionSupported: frozen.referenceSubmissionSupported
        },
        generationJobId: frozen.jobId,
        providerPrompt: frozen.providerPrompt,
        promptSupplement: frozen.promptSupplement,
        mode: frozen.mode,
        generationContext: frozen.generationContext,
        authoringVisualBrief: frozen.authoringVisualBrief,
        generationSessionId: frozen.sessionId,
        contextFingerprint: frozen.fingerprint,
        sourceRevisions: frozen.sourceRevisions,
        contextKey: frozen.contextKey,
        data,
        createdAt: new Date().toISOString()
      }
      const storageOptions = {
        projectId: frozen.projectId,
        purpose: frozen.mediaPurpose,
        sourceRefs: frozen.sourceRefs
      }
      let entry
      try {
        running.items[index].state = 'persisting'
        entry = await addGeneratedImageToLibrary(frozen.storageKey, candidate, storageOptions)
      } catch (saveError) {
        running.items[index].state = 'persist-failed'
        persistImageRun(running, 'partial')
        unsavedImages.value.push({ item: running.items[index], entries: archivedEntries, candidate, storageOptions, storageKey: frozen.storageKey, scopeKey: frozen.libraryScopeKey, error: saveError.message })
        continue
      }
      running.items[index].state = 'saved'
      running.items[index].mediaAssetId = entry.mediaAssetId || entry.id
      persistImageRun(running, 'running')
      archivedEntries.push(entry)
      if (libraryScopeKey.value === frozen.libraryScopeKey) {
        imageLibrary.value = [entry, ...imageLibrary.value.filter((item) => item.id !== entry.id)].slice(0, 20)
        imagePreviewIndex.value = 0
        emit('image-preview', entry)
      }
      assertActiveGeneration(running, frozen)
    }
    assertActiveGeneration(running, frozen)
    const committedEntries = [...archivedEntries].reverse()
    if (libraryScopeKey.value === frozen.libraryScopeKey) {
      const committedIds = new Set(committedEntries.map((entry) => entry.id))
      imageLibrary.value = [
        ...committedEntries,
        ...imageLibrary.value.filter((entry) => !committedIds.has(entry.id))
      ].slice(0, 20)
      const committedReferences = committedEntries.filter((entry) => entry.mediaPurpose === 'storyboard-reference')
      if (committedReferences.length) {
        const referenceIds = new Set(committedReferences.map((entry) => entry.id))
        storedReferenceImages.value = [
          ...committedReferences,
          ...storedReferenceImages.value.filter((entry) => !referenceIds.has(entry.id))
        ].slice(0, 20)
      }
      imagePreviewIndex.value = committedEntries.length ? 0 : imagePreviewIndex.value
      if (committedEntries[0]) emit('image-preview', committedEntries[0])
    }
    if (libraryScopeKey.value === frozen.libraryScopeKey) generationStatus.value = {
      kind: 'success',
      message: `${tr('已保存 {count} 张候选。', { count: archivedEntries.length })} ${unsavedImages.value.some((item) => item.scopeKey === frozen.libraryScopeKey) ? tr('有图片尚未保存，可重试保存或先下载。') : ''}`
    }
    emit('generation-complete', {
      job: frozen,
      entries: archivedEntries.map((entry) => ({ ...entry })),
      count: archivedEntries.length
    })
    const hasUnsaved = unsavedImages.value.some((item) => item.candidate?.generationParams?.runId === frozen.runId)
    if (hasUnsaved) persistImageRun(running, 'partial')
    else removeImageGenerationRun(frozen.runId)
  } catch (error) {
    for (const item of running.items) {
      if (item.state === 'generating') item.state = controller.signal.aborted ? 'cancelled' : 'failed'
      else if (item.state === 'queued' && controller.signal.aborted) item.state = 'cancelled'
    }
    const cleanupFailures = []
    const cancelled = controller.signal.aborted || running.discarded || isAbortError(error)
    if (cancelled) {
      removeImageGenerationRun(frozen.runId)
      if (latestGeneration === running && libraryScopeKey.value === frozen.libraryScopeKey) {
        generationStatus.value = cleanupFailures.length
          ? { kind: 'error', message: tr('已取消，但有 {count} 张候选未能清理，请刷新历史后重试。', { count: cleanupFailures.length }) }
          : { kind: 'cancelled', message: tr('已停止，保留 {count} 张已保存候选。', { count: archivedEntries.length }) }
      }
      if (!running.cancelEmitted) {
        running.cancelEmitted = true
        emit('generation-cancel', {
          job: frozen,
          reason: running.cancelReason || 'cancelled',
          cleanupFailed: cleanupFailures.length > 0,
          cleanupFailures
        })
      }
    } else {
      const retainedPrefix = archivedEntries.length
        ? `${tr('已保留 {count} 张候选。', { count: archivedEntries.length })} ` : ''
      const errorStatus = {
        kind: 'error',
        message: cleanupFailures.length
          ? tr('生成失败，且有 {count} 张候选未能清理。', { count: cleanupFailures.length })
          : `${retainedPrefix}${tr(error?.message || '后续生成失败。')}`
      }
      if (latestGeneration === running && libraryScopeKey.value === frozen.libraryScopeKey) generationStatus.value = errorStatus
      emit('generation-error', { job: frozen, error, message: errorStatus.message, cleanupFailures })
      persistImageRun(running, 'partial')
    }
  } finally {
    if (latestGeneration === running && running.generatedIndices.length < frozen.count) retryGeneration.value = running
    if (activeGeneration === running) {
      activeGeneration = null
      if (activeJob.value?.jobId === frozen.jobId) activeJob.value = null
      imageGenerating.value = false
      flushPendingPromptSync()
    }
  }
}

async function retryImageStorage(item) {
  if (savingImages.value) return
  savingImages.value = true
  try {
    item.item.state = 'persisting'
    const entry = await addGeneratedImageToLibrary(item.storageKey, item.candidate, item.storageOptions)
    item.item.state = 'saved'
    item.item.mediaAssetId = entry.mediaAssetId || entry.id
    updateImageGenerationRunItem(item.candidate.generationParams?.runId, item.item)
    if (!item.entries.some((image) => image.id === entry.id)) item.entries.push(entry)
    unsavedImages.value = unsavedImages.value.filter((pending) => pending !== item)
    if (item.scopeKey === libraryScopeKey.value) {
      imageLibrary.value = [entry, ...imageLibrary.value.filter((image) => image.id !== entry.id)].slice(0, 20)
      imagePreviewIndex.value = 0
      emit('image-preview', entry)
    }
  } catch (error) {
    item.item.state = 'persist-failed'
    updateImageGenerationRunItem(item.candidate.generationParams?.runId, item.item)
    item.error = error.message || '保存失败'
  } finally {
    savingImages.value = false
  }
}

function persistImageRun(running, status) {
  saveImageGenerationRun({
    runId: running.job.runId, jobId: running.job.jobId, scopeKey: running.job.libraryScopeKey,
    contextKey: running.job.contextKey, projectId: running.job.projectId, prompt: running.job.prompt,
    itemCount: running.job.count, items: running.items, status
  })
}
function dismissInterruptedRun() {
  if (interruptedRun.value) removeImageGenerationRun(interruptedRun.value.runId)
  interruptedRun.value = null
  generationStatus.value = { kind: 'idle', message: '' }
}

async function prepareImageDescription() {
  if (descriptionBusy.value) return
  const controller = new AbortController()
  descriptionController = controller
  descriptionBusy.value = true
  descriptionError.value = ''
  descriptionDraft.value = ''
  descriptionSourceKey = props.contextKey
  try {
    const draft = await draftImageDescription({ sourceText: selectedTextText.value, signal: controller.signal })
    if (!controller.signal.aborted && descriptionSourceKey === props.contextKey) descriptionDraft.value = draft
    else descriptionError.value = '来源已变化，请在当前来源重新整理。'
  } catch (error) {
    descriptionError.value = controller.signal.aborted ? '已停止整理。' : error.message
  } finally {
    descriptionBusy.value = false
    if (descriptionController === controller) descriptionController = null
  }
}
function useDescriptionDraft() {
  if (descriptionSourceKey !== props.contextKey || imageGenerating.value) return
  previousDescription.value = { text: imagePrompt.value, contextKey: props.contextKey }
  imagePrompt.value = descriptionDraft.value
  descriptionDraft.value = ''
}
watch(() => props.contextKey, () => {
  descriptionController?.abort()
  descriptionDraft.value = ''
  previousDescription.value = null
})
onBeforeUnmount(() => descriptionController?.abort())

function reuseImageParameters(image) {
  if (!image || imageGenerating.value) return
  imagePrompt.value = image.prompt || ''
  imageNegativePrompt.value = image.negativePrompt || ''
  imageStylePreset.value = image.generationParams?.stylePreset || 'none'
  imageReferencePrompt.value = image.generationParams?.referencePrompt || ''
  imageWidth.value = image.generationParams?.width || image.width || 1024
  imageHeight.value = image.generationParams?.height || image.height || 1024
  const config = modelConfigs.value.find((config) => config.type === image.modelType && config.defaultModel === image.modelId)
  imageSelectedModel.value = config?.id || ''
  const ids = new Set(image.referenceImageIds || [])
  selectedReferenceIds.value = allReferenceCandidates.value.filter((item) => ids.has(item.mediaAssetId || item.id)).map((item) => item.id)
  referenceStrength.value = image.referenceStrength || .65
  generationStatus.value = { kind: 'idle', message: config ? '已载入候选参数，请检查参考图后再生成。' : '原图片模型不可用，请重新选择；未发起生成。' }
}

function cancelGeneration(reason = 'user') {
  const running = activeGeneration
  if (!running || running.discarded) return false
  running.discarded = true
  running.cancelReason = reason
  running.controller.abort(createAbortError('图片生成已取消'))
  if (activeGeneration === running) activeGeneration = null
  if (activeJob.value?.jobId === running.job.jobId) activeJob.value = null
  imageGenerating.value = false
  flushPendingPromptSync()
  generationStatus.value = {
    kind: 'cancelled',
    message: running.job.libraryScopeKey === libraryScopeKey.value
      ? '已停止后续生成，已完成的图片会保留。'
      : '已停止上次生成，可继续当前图片创作。'
  }
  if (!running.archiveStarted) {
    running.cancelEmitted = true
    emit('generation-cancel', { job: running.job, reason, cleanupFailed: false, cleanupFailures: [] })
  }
  return true
}

function createFrozenGenerationJob(config) {
  const generationContext = cloneSerializable(props.generationContext, {})
  const sessionId = String(generationContext.sessionId || createRuntimeId('image-session'))
  const jobId = String(generationContext.jobId || createRuntimeId('image-job'))
  const authoringVisualBrief = cloneSerializable(
    generationContext.authoringVisualBrief || generationContext.visualBrief,
    null
  )
  const sourceRevisions = cloneSerializable(
    generationContext.sourceRevisions || authoringVisualBrief?.sourceRevisions,
    {}
  )
  const fingerprint = String(
    generationContext.fingerprint || authoringVisualBrief?.fingerprint || ''
  )
  const sourceRefs = cloneSerializable(props.sourceRefs, [])
  const librarySourceRefs = cloneSerializable(effectiveLibrarySourceRefs.value, [])
  const mediaPurpose = activeMediaPurpose.value
  const prompt = String(imagePrompt.value || '').trim()
  const promptSupplement = resolvePromptSupplement(generationContext, authoringVisualBrief, prompt)
  const stylePrompt = props.presentation === 'authoring'
    ? String(selectedStylePreset.value?.prompt || '').trim()
    : ''
  const referencePrompt = selectedReferenceImages.value.length
    ? String(imageReferencePrompt.value || '').trim()
    : ''
  const providerPrompt = mergePromptParts(
    mergePromptParts(prompt, promptSupplement),
    [stylePrompt, referencePrompt ? `参考图使用说明：${referencePrompt}` : ''].filter(Boolean).join('\n')
  )
  return deepFreeze({
    jobId,
    runId: createRuntimeId('image-run'),
    sessionId,
    submittedAt: new Date().toISOString(),
    contextKey: String(props.contextKey || ''),
    storageKey: String(props.storageKey || ''),
    libraryScopeKey: JSON.stringify({
      storageKey: props.storageKey,
      projectId: props.projectId,
      purpose: mediaPurpose,
      contextKey: props.contextKey,
      sourceRefs: librarySourceRefs.map((ref) => [ref.refType, ref.refId, ref.projectId || ''])
    }),
    projectId: props.projectId ?? null,
    sourceRefs,
    librarySourceRefs,
    sourceRevisions,
    fingerprint,
    authoringVisualBrief,
    generationContext,
    prompt,
    promptSupplement,
    providerPrompt,
    negativePrompt: String(imageNegativePrompt.value || ''),
    stylePreset: String(selectedStylePreset.value?.id || ''),
    stylePrompt,
    referencePrompt,
    referenceSubmissionSupported: getImageProviderCapabilities(config).identityReference === true,
    mode: String(activeMode.value),
    mediaPurpose,
    width: Number(imageWidth.value),
    height: Number(imageHeight.value),
    count: Math.min(4, Math.max(1, Math.floor(Number(imageCount.value) || 1))),
    referenceImageIds: (getImageProviderCapabilities(config).identityReference ? selectedReferenceImages.value : []).map((reference) => String(reference.mediaAssetId || reference.id || '')).filter(Boolean),
    referenceStrength: Number(referenceStrength.value),
    model: {
      configId: String(config.id || ''),
      name: String(config.name || ''),
      type: String(config.type || ''),
      defaultModel: String(config.defaultModel || '')
    }
  })
}

function assertActiveGeneration(running, job) {
  if (!running || activeGeneration !== running || running.job.jobId !== job.jobId || running.discarded || running.controller.signal.aborted) {
    throw createAbortError('图片生成已取消')
  }
}

function resolvePromptSupplement(generationContext, authoringVisualBrief, prompt) {
  const explicit = String(props.promptSupplement || '').trim()
  if (explicit) return explicit
  const scoped = String(
    generationContext?.promptSupplement
      || authoringVisualBrief?.promptSupplement
      || authoringVisualBrief?.sceneSupplement
      || ''
  ).trim()
  if (scoped) return scoped

  const generated = String(authoringVisualBrief?.generationPrompt || '').trim()
  if (!generated || generated === prompt) return ''
  if (prompt && generated.startsWith(prompt)) return generated.slice(prompt.length).trim()
  const briefPrompt = String(authoringVisualBrief?.prompt || '').trim()
  if (briefPrompt && generated.startsWith(briefPrompt)) return generated.slice(briefPrompt.length).trim()
  return generated
}

function mergePromptParts(prompt, supplement) {
  const primary = String(prompt || '').trim()
  const secondary = String(supplement || '').trim()
  if (!secondary || secondary === primary) return primary
  if (secondary.startsWith(primary)) return secondary
  return [primary, secondary].filter(Boolean).join('\n')
}

function createAbortError(message = '操作已取消') {
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError')
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 20
}

function createRuntimeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function cloneSerializable(value, fallback) {
  if (value === undefined || value === null) return fallback
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function toggleReference(candidate) {
  if (imageGenerating.value) return
  const id = candidate?.id
  if (!id) return
  if (selectedReferenceIds.value.includes(id)) {
    selectedReferenceIds.value = selectedReferenceIds.value.filter((item) => item !== id)
    return
  }
  selectedReferenceIds.value = [...selectedReferenceIds.value, id].slice(-referenceSelectionLimit.value)
  emit('image-preview', {
    ...candidate,
    prompt: referenceLabel(candidate),
    mediaPurpose: candidate.mediaPurpose || 'storyboard-reference'
  })
}

function referenceLabel(candidate) {
  return String(candidate?.title || candidate?.prompt || '参考图')
}

async function handleReferenceUpload(event) {
  if (imageGenerating.value) return
  const scope = { storageKey: props.storageKey, projectId: props.projectId, sourceRefs: cloneSerializable(props.sourceRefs, []), key: libraryScopeKey.value }
  const files = [...(event.target?.files || [])]
    .filter(isSupportedLocalImage)
    .slice(0, referenceSelectionLimit.value)
  const uploaded = []
  referenceUploadMessage.value = ''
  for (const file of files) {
    if (file.size >= referenceMaxFileSizeMb.value * 1024 * 1024) {
      referenceUploadMessage.value = tr('{name} 需小于 {size} MB，未导入', { name: file.name, size: referenceMaxFileSizeMb.value })
      continue
    }
    try {
      let data = await fileToDataUrl(file)
      const mime = await verifyReferenceImage(data, file)
      if (characterReferenceOnly.value && !['image/jpeg', 'image/png'].includes(mime)) {
        throw new Error(tr('当前模型的人物参考仅支持 JPG 或 PNG。'))
      }
      data = data.replace(/^data:[^;]*;/, `data:${mime};`)
      if (scope.key !== libraryScopeKey.value) break
      if ([...allReferenceCandidates.value, ...uploaded].some((image) => image.data === data)) continue
      const entry = await addGeneratedImageToLibrary(scope.storageKey, {
        id: `reference_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        prompt: file.name,
        modelName: '本地上传',
        modelType: 'upload',
        width: null,
        height: null,
        status: 'accepted',
        data,
        createdAt: new Date().toISOString()
      }, {
        projectId: scope.projectId,
        purpose: 'storyboard-reference',
        sourceRefs: scope.sourceRefs
      })
      uploaded.push({ ...entry, title: file.name, uploaded: true })
    } catch (error) {
      referenceUploadMessage.value = error?.message || tr('{name} 导入失败', { name: file.name })
    }
  }
  if (scope.key !== libraryScopeKey.value) return
  storedReferenceImages.value = [...uploaded, ...storedReferenceImages.value]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 20)
  selectedReferenceIds.value = [...selectedReferenceIds.value, ...uploaded.map((item) => item.id)].slice(-referenceSelectionLimit.value)
  if (uploaded[0]) {
    referenceUploadMessage.value = tr('已导入 {count} 张本地参考图', { count: uploaded.length })
    emit('image-preview', {
      ...uploaded[0],
      prompt: uploaded[0].title,
      mediaPurpose: 'storyboard-reference'
    })
  }
  if (!files.length) referenceUploadMessage.value = '未识别到支持的图片文件'
  if (event.target) event.target.value = ''
}

function isSupportedLocalImage(file) {
  if (file?.type) return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  return /\.(?:jpe?g|png|webp)$/i.test(String(file?.name || ''))
}

async function verifyReferenceImage(data, file) {
  const bytes = atob(String(data).split(',')[1] || '')
  const type = bytes.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png' : bytes.startsWith('\xff\xd8\xff') ? 'image/jpeg' : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' ? 'image/webp' : ''
  if (!type || (file.type && file.type !== type)) throw new Error(tr('{name} 的图片格式与内容不符', { name: file.name }))
  await new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => reject(new Error('图片解码超时')), 10000)
    image.onload = () => {
      clearTimeout(timer)
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 20000000) reject(new Error('参考图超过 2000 万像素，未导入'))
      else resolve()
    }
    image.onerror = () => { clearTimeout(timer); reject(new Error('图片已损坏或无法解码')) }
    image.src = data
  })
  return type
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取参考图失败'))
    reader.readAsDataURL(file)
  })
}

function copyImagePrompt(imgEntry) {
  if (!imgEntry?.prompt) return
  navigator.clipboard.writeText(imgEntry.prompt)
}

function previewImage(index) {
  imagePreviewIndex.value = index
  const entry = imageLibrary.value[index]
  if (entry) emit('image-preview', entry)
}

function saveToMaterialLib() {
  const imgEntry = imageLibrary.value[imagePreviewIndex.value]
  if (imgEntry && !selectedActionGuard.value.saveDisabled) {
    emit('save-to-material', {
      ...imgEntry,
      mediaPurpose: imgEntry.mediaPurpose || activeMediaPurpose.value,
      mode: imgEntry.mode || imgEntry.generationParams?.mode || activeMode.value
    })
  }
}

function emitInsertImage(imgEntry) {
  if (!imgEntry || selectedActionGuard.value.insertDisabled) return
  emit('insert-image', imgEntry)
}

function appendQualityTerm(term) {
  const value = String(term || '').trim()
  if (!value || imagePrompt.value.includes(value)) return
  imagePrompt.value = [imagePrompt.value.trim(), value].filter(Boolean).join('，')
}

function useComicSafetyPrompt() {
  if (imageGenerating.value) return
  imageNegativePrompt.value = COMIC_IMAGE_NEGATIVE_PROMPT
}

async function deleteSelectedImage() {
  if (imageGenerating.value) return
  const entry = selectedPreviewImage.value
  if (!entry) return
  const asset = listMediaAssets({ kind: 'image' }).find((item) => item.id === entry.mediaAssetId)
  if (asset?.status === 'accepted') {
    generationStatus.value = { kind: 'error', message: '这张图片已保存为素材或插入正文，不能从生图历史删除。' }
    return
  }
  const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
    ? true
    : window.confirm(tr('删除这张候选？此操作会同时移除生图历史和对应媒体文件。'))
  if (!confirmed) return
  const currentIndex = imagePreviewIndex.value
  try {
    await removeGeneratedImageFromLibrary(props.storageKey, entry, { projectId: props.projectId })
    imageLibrary.value = imageLibrary.value.filter((item) => item.id !== entry.id)
    imagePreviewIndex.value = imageLibrary.value.length
      ? Math.min(currentIndex, imageLibrary.value.length - 1)
      : -1
    if (selectedPreviewImage.value) emit('image-preview', selectedPreviewImage.value)
    generationStatus.value = { kind: 'success', message: '已删除这张候选。' }
  } catch (error) {
    generationStatus.value = { kind: 'error', message: error?.message || '候选删除失败，请重试。' }
  }
}

</script>

<template>
    <section
    class="media-generation-inline"
    :class="[`media-generation-inline--${layout}`, `media-generation-inline--${presentation}`]"
    :data-mobile-pane="mobilePane"
    :aria-label="tr('插画生成')"
  >
    <div class="image-generation-workbench">
      <div v-if="showHeader" class="image-gen-header">
        <span class="image-gen-title">{{ workbenchTitle }}</span>
      </div>

      <div class="image-gen-workspace">
        <section class="image-gen-controls" :aria-label="tr('插画参数')">
          <fieldset class="image-gen-control-fields" :disabled="imageGenerating">
            <div v-if="$slots.brief && presentation !== 'authoring'" class="image-gen-brief">
              <slot name="brief"></slot>
            </div>

            <div v-if="availableModes.length > 1" class="image-gen-modes" role="group" :aria-label="tr('图片用途')">
              <button
                v-for="mode in availableModes"
                :key="mode"
                class="image-gen-mode-btn"
                :class="{ active: activeMode === mode }"
                type="button"
                :aria-pressed="activeMode === mode"
                @click="activeMode = mode"
              >
                {{ tr(modeLabels[mode]) }}
              </button>
            </div>

            <template v-if="!referenceWorkspaceActive">
              <div class="image-gen-section">
                <div class="image-gen-label-row">
                  <label class="image-gen-label">{{ tr("画面描述") }}</label>
                  <button v-if="selectedTextText" class="image-gen-inline-link" type="button" @click="useSelectedTextAsPrompt">
                    {{ presentation === 'authoring' ? tr('使用原文') : importButtonLabel }}
                  </button>
                </div>
                <textarea
                  v-model="imagePrompt"
                  class="image-gen-prompt-input"
                  :placeholder="tr('描述你想生成的插画...')"
                  rows="4"
                  maxlength="600"
                ></textarea>
                <small v-if="presentation === 'authoring'" class="image-gen-prompt-count">{{ imagePrompt.length }} / 600</small>
                <div v-if="presentation === 'authoring' && selectedTextText" class="image-gen-description-actions">
                  <button v-if="!descriptionBusy" type="button" class="image-gen-inline-link" @click="prepareImageDescription">{{ tr("从原文整理画面") }}</button>
                  <button v-else type="button" class="image-gen-inline-link" @click="descriptionController?.abort()">{{ tr("停止整理") }}</button>
                  <button v-if="previousDescription?.contextKey === contextKey" type="button" class="image-gen-inline-link" @click="imagePrompt = previousDescription.text; previousDescription = null">{{ tr("恢复原描述") }}</button>
                </div>
                <p v-if="descriptionError" class="image-gen-reference-message" role="alert">{{ tr(descriptionError) }}</p>
                <section v-if="descriptionDraft" class="image-gen-description-draft" :aria-label="tr('画面描述草稿')">
                  <textarea v-model="descriptionDraft" :aria-label="tr('编辑画面描述草稿')" rows="5" maxlength="600" class="image-gen-prompt-input" />
                  <button type="button" class="image-preview-action-btn" @click="useDescriptionDraft">{{ tr("使用这份描述") }}</button>
                  <button type="button" class="image-preview-action-btn" @click="descriptionDraft = ''">{{ tr("放弃") }}</button>
                </section>
              </div>

              <div class="image-gen-section">
                <ImageModelPicker
                  v-model="imageSelectedModel"
                  :configs="modelConfigs"
                  @configs-updated="handleConfigsUpdated"
                />
                <p v-if="selectedModelCapabilities.configurationError" class="image-gen-reference-message" role="status">{{ tr(selectedModelCapabilities.configurationError) }}</p>
              </div>

              <div class="image-gen-parameter-grid">
                <label class="image-gen-compact-field">
                  <span>{{ tr("画幅") }}</span>
                  <select :value="selectedSizeKey" @change="selectSizePreset($event.target.value)">
                    <option v-if="hasCustomSize" :value="selectedSizeKey">{{ imageWidth }}×{{ imageHeight }}</option>
                    <option v-for="preset in sizePresets" :key="preset.label" :value="`${preset.width}x${preset.height}`">{{ tr(preset.label) }}</option>
                  </select>
                </label>
                <label class="image-gen-compact-field">
                  <span>{{ tr("数量") }}</span>
                  <select v-model.number="imageCount">
                    <option v-for="count in [1, 2, 3, 4]" :key="count" :value="count">{{ tr('图片数量：{count}', { count }) }}</option>
                  </select>
                </label>
              </div>

              <div v-if="presentation === 'authoring'" class="image-gen-section image-gen-style-section">
                <div class="image-gen-label-row">
                  <span class="image-gen-label">{{ tr("画面风格") }}</span>
                  <small>{{ tr("文字预设 ·") }} {{ tr(selectedStylePreset.label) }}</small>
                </div>
                <div class="image-gen-style-grid" role="radiogroup" :aria-label="tr('画面风格')">
                  <button
                    v-for="preset in authoringStylePresets"
                    :key="preset.id"
                    type="button"
                    class="image-gen-style-option"
                    :class="{ active: imageStylePreset === preset.id }"
                    role="radio"
                    :aria-checked="imageStylePreset === preset.id"
                    :title="tr(preset.prompt)"
                    @click="imageStylePreset = preset.id"
                  >
                    <strong>{{ tr(preset.label) }}</strong>
                  </button>
                </div>
              </div>

              <div v-if="$slots.brief && presentation === 'authoring'" class="image-gen-brief image-gen-brief--authoring">
                <slot name="brief"></slot>
              </div>
            </template>

            <details v-if="showFullReferenceManager" class="image-gen-section image-gen-reference-section" :open="referenceWorkspaceActive">
              <summary class="image-gen-reference-heading">
                <span>{{ characterReferenceOnly ? tr('人物参考') : (presentation === 'authoring' ? tr('参考图') : tr('参考图库')) }}</span>
                <span class="image-gen-reference-count">{{ selectedReferenceImages.length }} / {{ referenceSelectionLimit }}</span>
              </summary>
              <div class="image-gen-reference-strip">
                <button
                  v-for="candidate in allReferenceCandidates"
                  :key="candidate.id"
                  type="button"
                  class="image-gen-reference-thumb"
                  :class="{ active: selectedReferenceIds.includes(candidate.id) }"
                  :title="referenceLabel(candidate)"
                  :aria-pressed="selectedReferenceIds.includes(candidate.id)"
                  @click="toggleReference(candidate)"
                >
                  <img :src="candidate.data" :alt="referenceLabel(candidate)" />
                  <span v-if="selectedReferenceIds.includes(candidate.id)" aria-hidden="true">✓</span>
                </button>
                <button class="image-gen-reference-upload" type="button" :title="tr('上传参考图')" @click="referenceInput?.click()">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v5h14v-5"/>
                  </svg>
                  <span>{{ presentation === 'authoring' ? tr("添加图片") : tr("上传") }}</span>
                </button>
              </div>
              <input ref="referenceInput" class="image-gen-reference-input" type="file" :accept="characterReferenceOnly ? 'image/png,image/jpeg' : 'image/png,image/jpeg,image/webp'" :multiple="referenceSelectionLimit > 1" @change="handleReferenceUpload" />
              <p v-if="referenceUploadMessage" class="image-gen-reference-message" role="status">{{ tr(referenceUploadMessage) }}</p>
              <label v-if="selectedReferenceImages.length && selectedModelSupportsStrength" class="image-gen-reference-strength">
                <span>{{ tr("参考强度") }}</span>
                <input v-model.number="referenceStrength" type="range" min="0.2" max="0.9" step="0.05" :disabled="!selectedModelSupportsReference" />
                <strong>{{ Math.round(referenceStrength * 100) }}%</strong>
              </label>
              <p v-if="selectedReferenceImages.length && !selectedModelSupportsReference" class="image-gen-reference-message" role="status">
                {{ tr("当前模型不提交本地底图；参考提示仍会作为文字约束加入生成。") }}
                <label><input v-model="allowTextOnlyReference" type="checkbox" />{{ tr("仅用文字生成，不发送参考图片") }}</label>
              </p>
              <p v-else-if="selectedReferenceImages.length" class="image-gen-reference-message">{{ characterReferenceOnly ? tr('图片仅作为人物主体参考，不用于风格或构图控制。') : tr("图片将作为普通图像参考提交；不保证人物身份、风格或构图一致。") }}</p>
              <label v-if="selectedReferenceImages.length && presentation === 'authoring'" class="image-gen-reference-prompt">
                <span>{{ tr("参考提示词") }}</span>
                <textarea
                  v-model="imageReferencePrompt"
                  rows="2"
                  maxlength="240"
                  :placeholder="tr('例如：保持人物脸型和发色，只参考服装，不照搬构图')"
                ></textarea>
              </label>
              <p v-if="!selectedReferenceImages.length" class="image-gen-reference-hint">{{ characterReferenceOnly ? tr('选择一张人物正面图，作为人物主体参考。') : tr('可从已有图片选择或上传，支持数量由当前模型决定。') }}</p>
            </details>

            <template v-if="!referenceWorkspaceActive">


              <button
                v-if="hasSeparateReferenceWorkspace"
                class="image-gen-reference-summary"
                type="button"
                @click="activeMode = 'reference'"
              >
                <span class="image-gen-reference-summary__thumbs" aria-hidden="true">
                  <img v-for="reference in selectedReferenceImages" :key="reference.id" :src="reference.data" alt="" />
                  <span v-if="selectedReferenceImages.length === 0">{{ tr("无") }}</span>
                </span>
                <span>{{ selectedReferenceImages.length ? tr('已选 {count} 张参考图', { count: selectedReferenceImages.length }) : tr('未选择参考图') }}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
              </button>

              <details class="image-gen-section image-gen-advanced">
                <summary>{{ tr("高级设置") }}</summary>
              <details v-if="presentation === 'authoring'" class="image-gen-quality-terms">
                <summary>{{ tr("常用质量词") }}</summary>
                <div :aria-label="tr('常用质量词')">
                  <button v-for="term in authoringQualityTerms" :key="term" type="button" @click="appendQualityTerm(tr(term))">{{ tr(term) }}</button>
                </div>
              </details>

                <div class="image-gen-label-row">
                  <label class="image-gen-label">{{ tr("负面提示词（可选）") }}</label>
                  <button v-if="presentation === 'authoring'" class="image-gen-inline-link" type="button" @click="useComicSafetyPrompt">{{ tr("使用漫画纯画面约束") }}</button>
                </div>
                <textarea
                  v-model="imageNegativePrompt"
                  class="image-gen-prompt-input small"
                  :placeholder="tr('不想出现的内容...')"
                  rows="2"
                ></textarea>
              </details>
            </template>
          </fieldset>

          <div v-if="!referenceWorkspaceActive" class="image-gen-actions">
            <button
              v-if="!imageGenerating || generationBusyElsewhere"
              class="image-gen-generate-btn"
              type="button"
              @click="generateImages"
              :disabled="imageGenerating || !imagePrompt.trim() || !imageSelectedModel"
            >
              {{ tr("生成插画") }}
            </button>
            <button v-else class="image-gen-cancel-btn" type="button" @click="cancelGeneration('user')">
              <span class="spin-icon" aria-hidden="true"></span>
              {{ tr("取消生成") }}
            </button>
          </div>
          <p v-if="generationBusyElsewhere" class="image-gen-status" role="status">
            {{ tr('另一处正在生成图片，完成后可在这里继续。') }}
            <button type="button" class="image-gen-inline-link" @click="cancelGeneration('user')">{{ tr('停止上次生成') }}</button>
          </p>
          <p
            v-if="generationStatus.message"
            class="image-gen-status"
            :class="`is-${generationStatus.kind}`"
            :role="generationMessageRole"
          >{{ tr(generationStatus.message) }}</p>
          <button v-if="interruptedRun" type="button" class="image-preview-action-btn" @click="dismissInterruptedRun">{{ tr("清除中断记录") }}</button>
          <button v-if="retryGeneration && retryGeneration.job.libraryScopeKey === libraryScopeKey && !imageGenerating" type="button" class="image-preview-action-btn" @click="generateImages({ retry: true })">{{ tr("继续未完成图片（沿用原参数）") }}</button>
        </section>

        <section v-if="!referenceWorkspaceActive" class="image-gen-results" :aria-label="tr('插画候选')">
          <div v-if="imageJobItems.some(item => item.state !== 'saved')" class="image-gen-item-states" :aria-label="tr('本次图片进度')" aria-live="polite"><span v-for="(item, index) in imageJobItems" :key="item.id">{{ index + 1 }} · {{ tr(imageJobStateLabels[item.state]) }}</span></div>
          <section v-for="item in unsavedImages.filter(item => item.scopeKey === libraryScopeKey)" :key="item.candidate.id" class="image-gen-unsaved" :aria-label="tr('待保存图片')">
            <img :src="item.candidate.data" :alt="tr('生成成功但尚未保存的候选')" />
            <p role="alert">{{ tr("图片已生成，保存失败。关闭或刷新会丢失此图。") }}{{ tr(item.error) }}</p>
            <button type="button" :disabled="savingImages" @click="retryImageStorage(item)">{{ tr("重试保存（不重新生成）") }}</button>
            <a :href="item.candidate.data" download="pinax-candidate.png">{{ tr("下载图片") }}</a>
          </section>
          <div class="image-gen-results-title">
            <span>{{ tr("候选与历史") }}</span>
            <small v-if="imageLibrary.length">{{ tr('图片数量：{count}', { count: imageLibrary.length }) }}</small>
          </div>

          <div v-if="selectedPreviewImage" class="image-gen-current-preview" :class="{ 'is-comparing': comparisonImage }">
            <img v-if="comparisonImage" :src="comparisonImage.data" :alt="tr('对照：{prompt}', { prompt: comparisonImage.prompt || tr('已固定候选') })" />
            <img :src="selectedPreviewImage.data" :alt="selectedPreviewImage.prompt || sourceTitle || tr('当前插画候选')" />
            <div class="image-gen-current-caption">
              <strong>{{ selectedPreviewImage.prompt || sourceTitle || tr("当前插画候选") }}</strong>
              <span v-if="selectedPreviewImage.width && selectedPreviewImage.height">{{ selectedPreviewImage.width }}×{{ selectedPreviewImage.height }}</span>
            </div>
          </div>

          <div v-else class="image-gen-empty" role="status">
            <WorkbenchIcon name="image" :size="32" class="image-gen-empty__icon" />
            <strong>{{ tr("还没有候选") }}</strong>
            <span>{{ tr(emptyResultHint) }}</span>
          </div>

          <div v-if="imageLibrary.length" class="image-gen-grid" role="group" :aria-label="tr('生成历史')">
            <button
              v-for="(img, idx) in imageLibrary"
              :key="img.id"
              type="button"
              class="image-gen-thumb"
              :class="{ active: imagePreviewIndex === idx }"
              :aria-pressed="imagePreviewIndex === idx"
              :aria-label="tr('查看候选 {index}：{prompt}', { index: idx + 1, prompt: img.prompt || '' })"
              @click="previewImage(idx)"
            >
              <img :src="img.data" alt="" />
            </button>
          </div>

          <div v-if="selectedPreviewImage" class="image-gen-inline-actions">
            <button
              v-if="allowInsertImageToEditor"
              class="image-preview-action-btn image-preview-action-btn--primary"
              type="button"
              :disabled="selectedActionGuard.insertDisabled"
              @click="emitInsertImage(selectedPreviewImage)"
            >{{ tr("插入正文") }}</button>
            <button
              class="image-preview-action-btn"
              type="button"
              :disabled="selectedActionGuard.saveDisabled"
              @click="saveToMaterialLib"
            >{{ tr("保存为素材") }}</button>
            <a class="image-preview-action-btn" :href="selectedPreviewImage.data" download="pinax-image.png"><WorkbenchIcon name="download" :size="16" />{{ tr("下载图片") }}</a>
            <details class="image-gen-result-more">
              <summary>{{ tr("更多操作") }}</summary>
              <div class="image-gen-secondary-actions">
                <button class="image-preview-action-btn" type="button" :disabled="imageGenerating" @click="reuseImageParameters(selectedPreviewImage)">{{ tr("复用参数") }}</button>
                <button class="image-preview-action-btn" type="button" :aria-pressed="Boolean(comparisonImageId)" @click="comparisonImageId = comparisonImageId ? '' : selectedPreviewImage.id">{{ comparisonImageId ? tr("取消对照") : tr("固定作对照") }}</button>
                <button class="image-preview-action-btn" type="button" @click="copyImagePrompt(selectedPreviewImage)">{{ tr("复制提示词") }}</button>
                <button class="image-preview-action-btn image-preview-action-btn--danger" type="button" :disabled="imageGenerating" @click="deleteSelectedImage">{{ tr("删除候选") }}</button>
              </div>
            </details>
          </div>
          <p v-if="selectedActionGuard.reason" class="image-gen-action-reason" role="status">{{ tr(selectedActionGuard.reason) }}</p>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.media-generation-inline {
  position: relative;
  min-width: 0;
  width: 100%;
  color: var(--text-primary);
  font: 14px/1.5 var(--font-sans);
}
.image-generation-workbench, .image-gen-workspace, .image-gen-controls, .image-gen-results { min-width: 0; }
.image-gen-header, .image-gen-label-row, .image-gen-results-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.image-gen-header { margin-bottom: 16px; }
.image-gen-title, .image-gen-label { color: var(--text-primary); font-size: 14px; font-weight: 550; }
.image-gen-label { display: block; margin-bottom: 8px; }
.image-gen-label-row { min-height: 36px; margin-bottom: 6px; flex-wrap: wrap; }
.image-gen-label-row .image-gen-label { margin: 0; }
.image-gen-control-fields { min-width: 0; margin: 0; padding: 0; border: 0; }
.image-gen-control-fields:disabled { cursor: wait; }
.image-gen-section { margin-bottom: 18px; }
.image-gen-prompt-input, .image-gen-reference-prompt textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 132px;
  padding: 12px;
  border: 1px solid var(--border-subtle, var(--border));
  border-radius: 12px;
  background: var(--surface-workbench-raised);
  color: var(--text-primary);
  font: 14px/1.65 var(--font-sans);
  resize: vertical;
}
.image-gen-prompt-input::placeholder, .image-gen-reference-prompt textarea::placeholder { color: var(--text-muted); }
.image-gen-prompt-input.small, .image-gen-reference-prompt textarea { min-height: 78px; }
.image-gen-prompt-input:focus, .image-gen-reference-prompt textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent) 42%, transparent); outline-offset: 1px; }
.image-gen-prompt-count { display: block; margin-top: 5px; color: var(--text-muted); font-size: 12px; text-align: right; }
.image-gen-description-actions, .image-gen-quality-terms > div { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; }
.image-gen-inline-link { min-height: 36px; padding: 6px 0; border: 0; border-radius: 10px; background: transparent; color: var(--accent); font: 13px/1.4 var(--font-sans); cursor: pointer; text-align: start; }
.image-gen-inline-link:hover { color: var(--text-primary); }
.image-gen-description-draft { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.image-gen-description-draft textarea { flex-basis: 100%; }
.image-gen-quality-terms { margin-bottom: 16px; }
.image-gen-quality-terms button { min-height: 36px; padding: 6px 10px; border: 0; border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.image-gen-style-section { margin-bottom: 12px; }
.image-gen-style-section small { color: var(--text-muted); font-size: 12px; }
.image-gen-style-grid { display: flex; flex-wrap: wrap; gap: 7px; }
.image-gen-style-option { min-width: 0; min-height: 36px; padding: 7px 10px; border: 1px solid transparent; border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-secondary); font: 13px/1.4 var(--font-sans); text-align: start; cursor: pointer; }
.image-gen-style-option strong { font-weight: 450; }
.image-gen-style-option.active { border-color: color-mix(in srgb, var(--accent) 42%, transparent); background: color-mix(in srgb, var(--accent) 9%, var(--surface-workbench-raised)); color: var(--text-primary); }
.image-gen-style-option:hover { color: var(--text-primary); }
.image-gen-brief { margin-bottom: 18px; }
.image-gen-parameter-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; margin-bottom: 16px; }
.image-gen-compact-field { display: grid; gap: 7px; min-width: 0; }
.image-gen-compact-field > span { color: var(--text-secondary); font-size: 13px; }
.image-gen-compact-field select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 40px; padding: 8px 10px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-primary); font: 14px/1.4 var(--font-sans); }
.image-gen-advanced, .image-gen-reference-section { border-top: 1px solid var(--border-subtle, var(--border)); }
.image-gen-advanced summary, .image-gen-quality-terms summary, .image-gen-reference-heading, .image-gen-result-more summary { min-height: 40px; display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font: 13px/1.4 var(--font-sans); list-style: none; cursor: pointer; }
summary::-webkit-details-marker { display: none; }
.image-gen-advanced summary::before, .image-gen-quality-terms summary::before, .image-gen-reference-heading::before, .image-gen-result-more summary::before { content: '›'; width: 10px; flex: none; color: var(--text-muted); font-size: 18px; text-align: center; }
details[open] > summary::before { transform: rotate(90deg); }
.image-gen-reference-heading > span:first-of-type { flex: 1; }
.image-gen-reference-count { color: var(--text-muted); font-size: 12px; }
.image-gen-reference-strip { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.image-gen-reference-thumb { position: relative; width: 56px; height: 56px; padding: 0; overflow: hidden; border: 1px solid var(--border-subtle, var(--border)); border-radius: 10px; background: var(--surface-workbench-raised); cursor: pointer; }
.image-gen-reference-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.image-gen-reference-thumb.active { border-color: var(--accent); }
.image-gen-reference-thumb > span { position: absolute; right: 3px; bottom: 3px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); color: var(--accent-text); font-size: 12px; }
.image-gen-reference-upload { display: inline-flex; align-items: center; justify-content: center; align-self: center; gap: 7px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-secondary); font: 13px/1.4 var(--font-sans); cursor: pointer; }
.image-gen-reference-input { display: none; }
.image-gen-reference-message, .image-gen-reference-hint { margin: 9px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.image-gen-reference-message label { display: flex; align-items: center; gap: 8px; min-height: 40px; }
.image-gen-reference-strength { display: grid; grid-template-columns: auto minmax(0, 1fr) 36px; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--text-secondary); }
.image-gen-reference-strength input { width: 100%; accent-color: var(--accent); }
.image-gen-reference-strength strong { text-align: end; font-weight: 450; }
.image-gen-reference-prompt { display: grid; gap: 7px; margin-top: 12px; font-size: 13px; }
.image-gen-reference-summary { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; margin-bottom: 16px; padding: 9px 10px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-secondary); font: 13px/1.4 var(--font-sans); text-align: start; cursor: pointer; }
.image-gen-reference-summary > span:nth-child(2) { flex: 1; }
.image-gen-reference-summary__thumbs { display: flex; align-items: center; min-width: 24px; }
.image-gen-reference-summary__thumbs img { width: 28px; height: 28px; margin-inline-end: -6px; border: 1px solid var(--surface-workbench-raised); border-radius: 8px; object-fit: cover; }
.image-gen-modes { display: flex; gap: 4px; margin-bottom: 16px; padding: 4px; border-radius: 12px; background: var(--surface-workbench-muted); }
.image-gen-mode-btn { flex: 1; min-height: 36px; padding: 6px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.image-gen-mode-btn.active { background: var(--surface-workbench-raised); color: var(--text-primary); }
.image-gen-actions { margin-top: 18px; }
.image-gen-generate-btn, .image-gen-cancel-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 44px; padding: 10px 14px; border: 0; border-radius: 12px; background: var(--accent); color: var(--accent-text); font: 550 14px/1.4 var(--font-sans); cursor: pointer; }
.image-gen-generate-btn:hover:not(:disabled) { background: var(--accent-hover); }
.image-gen-cancel-btn { border: 1px solid var(--border-subtle, var(--border)); background: var(--surface-workbench-raised); color: var(--text-primary); }
button:disabled { opacity: .5; cursor: not-allowed; }
.spin-icon { width: 14px; height: 14px; border: 1.5px solid color-mix(in srgb, currentColor 36%, transparent); border-top-color: currentColor; border-radius: 50%; animation: image-gen-spin .8s linear infinite; }
@keyframes image-gen-spin { to { transform: rotate(360deg); } }
.image-gen-status, .image-gen-action-reason { margin: 10px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.image-gen-status.is-error, .image-gen-action-reason { color: var(--danger); }
.image-gen-status.is-success { color: var(--text-secondary); }
.image-gen-results { display: flex; flex-direction: column; gap: 14px; margin-top: 22px; }
.image-gen-results-title { flex: none; color: var(--text-secondary); font-size: 13px; }
.image-gen-results-title small { color: var(--text-muted); font-size: 12px; }
.image-gen-current-preview { min-width: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; flex: 1 0 auto; overflow: hidden; border-radius: 12px; background: var(--surface-workbench-muted); }
.image-gen-current-preview > img { display: block; width: 100%; height: min(48vh, 480px); min-height: 220px; object-fit: contain; padding: 14px; box-sizing: border-box; }
.image-gen-current-preview.is-comparing { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.image-gen-current-preview.is-comparing .image-gen-current-caption { grid-column: 1 / -1; }
.image-gen-current-caption { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; padding: 12px 14px; border-top: 1px solid var(--border-subtle, var(--border)); color: var(--text-secondary); font-size: 12px; }
.image-gen-current-caption strong { min-width: 0; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 13px; font-weight: 450; line-height: 1.5; }
.image-gen-current-caption > span { flex: none; }
.image-gen-empty { display: flex; flex: 1 0 auto; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 260px; padding: 28px; color: var(--text-secondary); text-align: center; }
.image-gen-empty__icon { margin-bottom: 6px; color: var(--text-muted); }
.image-gen-empty strong { font-size: 16px; font-weight: 500; color: var(--text-primary); }
.image-gen-empty span { max-width: 30em; color: var(--text-muted); font-size: 13px; line-height: 1.7; }
.image-gen-grid { display: flex; gap: 9px; min-width: 0; overflow-x: auto; flex: none; padding: 3px 2px 8px; overscroll-behavior: contain; }
.image-gen-thumb { flex: 0 0 72px; width: 72px; height: 72px; min-width: 0; padding: 0; overflow: hidden; border: 2px solid transparent; border-radius: 10px; background: var(--surface-workbench-muted); cursor: pointer; }
.image-gen-thumb.active { border-color: var(--accent); }
.image-gen-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.image-gen-inline-actions, .image-gen-secondary-actions { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
.image-preview-action-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-primary); font: 13px/1.4 var(--font-sans); text-decoration: none; text-align: center; cursor: pointer; }
.image-preview-action-btn:hover:not(:disabled) { background: var(--surface-hover); }
.image-preview-action-btn--primary { border-color: transparent; background: var(--accent); color: var(--accent-text); }
.image-preview-action-btn--primary:hover:not(:disabled) { background: var(--accent-hover); }
.image-preview-action-btn--danger { color: var(--danger); }
.image-gen-result-more summary { min-height: 36px; }
.image-gen-secondary-actions { padding-top: 8px; }
.image-gen-item-states { display: flex; flex-wrap: wrap; gap: 8px 14px; color: var(--text-secondary); font-size: 12px; }
.image-gen-unsaved { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 12px; font-size: 13px; }
.image-gen-unsaved img { width: 100%; max-height: 320px; object-fit: contain; }
.image-gen-unsaved p { margin: 0; color: var(--danger); }
.image-gen-unsaved button, .image-gen-unsaved a { min-height: 40px; padding: 8px 0; border: 0; border-radius: 10px; background: transparent; color: var(--accent); font: inherit; text-align: start; cursor: pointer; }
.media-generation-inline :is(button, summary, select, input, a):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.media-generation-inline--split, .media-generation-inline--split .image-generation-workbench { height: 100%; min-height: 0; }
.media-generation-inline--split .image-gen-workspace { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); height: 100%; min-height: 0; gap: 24px; }
.media-generation-inline--split .image-gen-controls, .media-generation-inline--split .image-gen-results { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.media-generation-inline--split .image-gen-results { margin-top: 0; }
.media-generation-inline--authoring .image-gen-workspace { gap: 0; }
.media-generation-inline--authoring .image-gen-controls { display: flex; flex-direction: column; padding: 20px; border-inline-end: 1px solid var(--border-subtle, var(--border)); background: var(--surface-workbench-muted); overflow: hidden; }
.media-generation-inline--authoring .image-gen-control-fields { flex: 1; min-height: 0; padding-inline-end: 3px; overflow-y: auto; overscroll-behavior: contain; }
.media-generation-inline--authoring .image-gen-results { padding: 22px; background: var(--surface-workbench); }
.media-generation-inline--authoring .image-gen-actions { flex: none; margin-top: 16px; }
.media-generation-inline--authoring .image-gen-empty { min-height: 280px; }
.media-generation-inline--stack .image-gen-current-preview > img { height: min(34vh, 320px); min-height: 180px; }
@media (max-width: 1100px) and (min-width: 721px) { .media-generation-inline--split .image-gen-workspace { grid-template-columns: minmax(280px, 36%) minmax(0, 1fr); } }
@media (max-width: 720px), (max-height: 560px) {
  .media-generation-inline--split .image-gen-workspace { display: block; overflow-y: auto; }
  .media-generation-inline--split .image-gen-controls, .media-generation-inline--split .image-gen-results { max-height: none; overflow: visible; scrollbar-gutter: auto; }
  .media-generation-inline[data-mobile-pane="parameters"] .image-gen-results, .media-generation-inline[data-mobile-pane="results"] .image-gen-controls { display: none; }
  .media-generation-inline--authoring .image-gen-controls { padding: 18px 16px; border: 0; }
  .media-generation-inline--authoring .image-gen-workspace { overflow: hidden; }
  .media-generation-inline--authoring .image-gen-controls { height: 100%; box-sizing: border-box; }
  .media-generation-inline--authoring .image-gen-control-fields { flex: 1; min-height: 0; overflow-y: auto; padding: 0; }
  .media-generation-inline--authoring .image-gen-actions { position: sticky; bottom: 0; padding-top: 12px; margin-top: 0; background: var(--surface-workbench-muted); }
  .media-generation-inline--authoring .image-gen-results { height: 100%; min-height: 0; padding: 20px 16px; box-sizing: border-box; overflow-y: auto; }
  .image-gen-current-preview { flex: 0 0 auto; }
  .image-gen-current-preview > img { height: auto; max-height: 43vh; min-height: 0; padding: 10px; }
  .image-gen-empty { padding: 24px 16px; }
  .image-gen-label-row { gap: 4px 12px; }
  .image-gen-style-option, .image-gen-quality-terms button, .image-gen-mode-btn, .image-gen-inline-link, .image-gen-reference-upload, .image-gen-compact-field select, .image-preview-action-btn, .image-gen-unsaved button, .image-gen-unsaved a { min-height: 44px; }
  .image-gen-advanced summary, .image-gen-quality-terms summary, .image-gen-reference-heading, .image-gen-result-more summary { min-height: 44px; }
  .image-gen-reference-strength input[type="range"] { min-height: 44px; }
  .image-gen-current-caption { flex-wrap: wrap; gap: 5px; padding: 10px; }
  .image-gen-parameter-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
}
@media (pointer: coarse) { .image-gen-style-option, .image-gen-inline-link, .image-gen-quality-terms button, .image-gen-mode-btn, .image-gen-reference-upload, .image-gen-compact-field select, .image-preview-action-btn { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .spin-icon { animation: none; } }
</style>
