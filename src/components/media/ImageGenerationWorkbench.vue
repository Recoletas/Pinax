<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ImageModelPicker from './ImageModelPicker.vue'
import { generateImage, getImageProviderCapabilities } from '../../services/media/imageProviderService'
import { listImageProviderConfigs } from '../../services/media/imageProviderConfigStore'
import {
  addGeneratedImageToLibrary,
  listMediaAssets,
  loadGeneratedImageLibrary,
  removeGeneratedImageFromLibrary
} from '../../services/media/mediaAssetStore'
import { COMIC_IMAGE_NEGATIVE_PROMPT } from '../../services/media/comicImagePrompt'

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
const importButtonLabel = computed(() => `导入${props.selectedPromptLabel || '当前选中'}`)
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
const selectedPreviewImage = computed(() => imageLibrary.value[imagePreviewIndex.value] || null)
const selectedModelConfig = computed(() => modelConfigs.value.find((item) => item.id === imageSelectedModel.value) || null)
const selectedModelSupportsReference = computed(() => (
  getImageProviderCapabilities(selectedModelConfig.value || {}).identityReference === true
))
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
  .slice(0, 3))
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
const emptyResultHint = computed(() => {
  const prompt = String(imagePrompt.value || props.initialPrompt || selectedTextText.value).trim()
  if (prompt) return `准备生成：${prompt.slice(0, 72)}${prompt.length > 72 ? '…' : ''}`
  return '写下画面描述后，生成的候选会在这里并排比较。'
})

onMounted(async () => {
  loadModelConfigs()
  await reloadLibraries()
})

watch(availableModes, (modes) => {
  if (!modes.includes(activeMode.value)) {
    activeMode.value = modes.includes(props.defaultMode) ? props.defaultMode : modes[0]
  }
}, { immediate: true })
watch(libraryScopeKey, () => {
  imagePreviewIndex.value = -1
  void reloadLibraries()
})
watch(allReferenceCandidates, (candidates) => {
  const availableIds = new Set(candidates.map((candidate) => candidate.id))
  const retained = selectedReferenceIds.value.filter((id) => availableIds.has(id))
  const automatic = candidates.filter((candidate) => candidate.autoSelected === true).map((candidate) => candidate.id)
  selectedReferenceIds.value = [...new Set([...retained, ...automatic])].slice(-3)
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

async function generateImages() {
  if (!imagePrompt.value.trim()) {
    generationStatus.value = { kind: 'error', message: '请先写下画面描述。' }
    return
  }
  if (!imageSelectedModel.value) {
    generationStatus.value = { kind: 'error', message: '请先选择或添加图片模型。' }
    return
  }

  const cfg = modelConfigs.value.find((item) => item.id === imageSelectedModel.value)
  if (!cfg) {
    generationStatus.value = { kind: 'error', message: '未找到选中的图片模型配置。' }
    return
  }

  if (activeGeneration) return
  const controller = new AbortController()
  const frozen = createFrozenGenerationJob(cfg)
  const providerConfig = deepFreeze(cloneSerializable(cfg, {}))
  const referenceImages = deepFreeze((frozen.referenceSubmissionSupported ? selectedReferenceImages.value : []).map((reference) => ({
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
  activeGeneration = running
  latestGeneration = running
  activeJob.value = frozen
  imageGenerating.value = true
  generationStatus.value = {
    kind: 'running',
    message: frozen.count > 1 ? `正在生成 ${frozen.count} 张候选…` : '正在生成候选…'
  }
  emit('generation-start', { job: frozen })

  const archivedEntries = []
  try {
    const results = []
    for (let index = 0; index < frozen.count; index += 1) {
      assertActiveGeneration(running, frozen)
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
      results.push(data)
    }

    running.archiveStarted = true
    for (const data of results) {
      assertActiveGeneration(running, frozen)
      const entry = await addGeneratedImageToLibrary(frozen.storageKey, {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
      }, {
        projectId: frozen.projectId,
        purpose: frozen.mediaPurpose,
        sourceRefs: frozen.sourceRefs,
        signal: controller.signal
      })
      archivedEntries.push(entry)
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
    generationStatus.value = {
      kind: 'success',
      message: `已生成 ${archivedEntries.length} 张候选。`
    }
    emit('generation-complete', {
      job: frozen,
      entries: archivedEntries.map((entry) => ({ ...entry })),
      count: archivedEntries.length
    })
  } catch (error) {
    const cleanupFailures = []
    if (archivedEntries.length) {
      for (const entry of [...archivedEntries].reverse()) {
        try {
          await removeGeneratedImageFromLibrary(frozen.storageKey, entry, { projectId: frozen.projectId })
        } catch (cleanupError) {
          cleanupFailures.push({ entryId: entry.id, error: cleanupError })
        }
      }
      if (libraryScopeKey.value === frozen.libraryScopeKey) {
        const archivedIds = new Set(archivedEntries.map((entry) => entry.id))
        imageLibrary.value = imageLibrary.value.filter((entry) => !archivedIds.has(entry.id))
        imagePreviewIndex.value = imageLibrary.value.length ? 0 : -1
      }
    }
    const cancelled = controller.signal.aborted || running.discarded || isAbortError(error)
    if (cancelled) {
      if (latestGeneration === running) {
        generationStatus.value = cleanupFailures.length
          ? { kind: 'error', message: `已取消，但有 ${cleanupFailures.length} 张候选未能清理，请刷新历史后重试。` }
          : { kind: 'cancelled', message: '已取消，本次结果未归档。' }
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
      const errorStatus = {
        kind: 'error',
        message: cleanupFailures.length
          ? `生成失败，且有 ${cleanupFailures.length} 张候选未能清理。`
          : (error?.message ? `生成失败：${error.message}` : '生成失败，请稍后重试。')
      }
      if (latestGeneration === running) generationStatus.value = errorStatus
      emit('generation-error', { job: frozen, error, message: errorStatus.message, cleanupFailures })
    }
  } finally {
    if (activeGeneration === running) {
      activeGeneration = null
      if (activeJob.value?.jobId === frozen.jobId) activeJob.value = null
      imageGenerating.value = false
      flushPendingPromptSync()
    }
  }
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
  generationStatus.value = { kind: 'cancelled', message: '正在取消，本次结果不会归档…' }
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
    count: Math.min(4, Math.max(1, Number(imageCount.value) || 1)),
    referenceImageIds: selectedReferenceImages.value.map((reference) => String(reference.mediaAssetId || reference.id || '')).filter(Boolean),
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
  selectedReferenceIds.value = [...selectedReferenceIds.value, id].slice(-3)
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
  const files = [...(event.target?.files || [])]
    .filter(isSupportedLocalImage)
    .slice(0, 3)
  const uploaded = []
  referenceUploadMessage.value = ''
  for (const file of files) {
    if (file.size > 12 * 1024 * 1024) {
      referenceUploadMessage.value = `${file.name} 超过 12 MB，未导入`
      continue
    }
    try {
      const data = await fileToDataUrl(file)
      const entry = await addGeneratedImageToLibrary(props.storageKey, {
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
        projectId: props.projectId,
        purpose: 'storyboard-reference',
        sourceRefs: props.sourceRefs
      })
      uploaded.push({ ...entry, title: file.name, uploaded: true })
    } catch (error) {
      referenceUploadMessage.value = error?.message || `${file.name} 导入失败`
    }
  }
  storedReferenceImages.value = [...uploaded, ...storedReferenceImages.value]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 20)
  selectedReferenceIds.value = [...selectedReferenceIds.value, ...uploaded.map((item) => item.id)].slice(-3)
  if (uploaded[0]) {
    referenceUploadMessage.value = `已导入 ${uploaded.length} 张本地参考图`
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
  if (String(file?.type || '').startsWith('image/')) return true
  return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(String(file?.name || ''))
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
    : window.confirm('删除这张候选？此操作会同时移除生图历史和对应媒体文件。')
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
    aria-label="插画生成"
  >
    <div class="image-generation-workbench">
      <div v-if="showHeader" class="image-gen-header">
        <span class="image-gen-title">{{ workbenchTitle }}</span>
      </div>

      <div class="image-gen-workspace">
        <section class="image-gen-controls" aria-label="插画参数">
          <fieldset class="image-gen-control-fields" :disabled="imageGenerating">
            <div v-if="$slots.brief && presentation !== 'authoring'" class="image-gen-brief">
              <slot name="brief"></slot>
            </div>

            <div v-if="availableModes.length > 1" class="image-gen-modes" role="group" aria-label="图片用途">
              <button
                v-for="mode in availableModes"
                :key="mode"
                class="image-gen-mode-btn"
                :class="{ active: activeMode === mode }"
                type="button"
                :aria-pressed="activeMode === mode"
                @click="activeMode = mode"
              >
                {{ modeLabels[mode] }}
              </button>
            </div>

            <template v-if="!referenceWorkspaceActive">
              <div class="image-gen-section">
                <div class="image-gen-label-row">
                  <label class="image-gen-label">画面描述</label>
                  <button v-if="selectedTextText" class="image-gen-inline-link" type="button" @click="useSelectedTextAsPrompt">
                    {{ importButtonLabel }}
                  </button>
                </div>
                <textarea
                  v-model="imagePrompt"
                  class="image-gen-prompt-input"
                  placeholder="描述你想生成的插画..."
                  rows="4"
                  maxlength="600"
                ></textarea>
                <small v-if="presentation === 'authoring'" class="image-gen-prompt-count">{{ imagePrompt.length }} / 600</small>
              </div>

              <div v-if="presentation === 'authoring'" class="image-gen-quality-terms">
                <span>常用质量词</span>
                <div aria-label="常用质量词">
                  <button v-for="term in authoringQualityTerms" :key="term" type="button" @click="appendQualityTerm(term)">{{ term }}</button>
                </div>
              </div>

              <div v-if="presentation === 'authoring'" class="image-gen-section image-gen-style-section">
                <div class="image-gen-label-row">
                  <span class="image-gen-label">画面风格</span>
                  <small>参考 · {{ selectedStylePreset.label }}</small>
                </div>
                <div class="image-gen-style-grid" role="radiogroup" aria-label="画面风格">
                  <button
                    v-for="preset in authoringStylePresets"
                    :key="preset.id"
                    type="button"
                    class="image-gen-style-option"
                    :class="{ active: imageStylePreset === preset.id }"
                    role="radio"
                    :aria-checked="imageStylePreset === preset.id"
                    :title="preset.prompt"
                    @click="imageStylePreset = preset.id"
                  >
                    <span aria-hidden="true" :style="{ backgroundPosition: preset.position }"></span>
                    <strong>{{ preset.label }}</strong>
                  </button>
                </div>
              </div>

              <div v-if="$slots.brief && presentation === 'authoring'" class="image-gen-brief image-gen-brief--authoring">
                <slot name="brief"></slot>
              </div>
            </template>

            <div v-if="showFullReferenceManager" class="image-gen-section image-gen-reference-section">
              <div class="image-gen-label-row">
                <label class="image-gen-label">{{ presentation === 'authoring' ? '参考图' : '参考图库' }}</label>
                <span class="image-gen-reference-count">{{ selectedReferenceImages.length }} / 3</span>
              </div>
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
                <button class="image-gen-reference-upload" type="button" title="上传参考图" @click="referenceInput?.click()">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v5h14v-5"/>
                  </svg>
                  <span>{{ presentation === 'authoring' ? '添加图片' : '上传' }}</span>
                </button>
              </div>
              <input ref="referenceInput" class="image-gen-reference-input" type="file" accept="image/*" multiple @change="handleReferenceUpload" />
              <p v-if="referenceUploadMessage" class="image-gen-reference-message" role="status">{{ referenceUploadMessage }}</p>
              <label v-if="selectedReferenceImages.length" class="image-gen-reference-strength">
                <span>参考强度</span>
                <input v-model.number="referenceStrength" type="range" min="0.2" max="0.9" step="0.05" :disabled="!selectedModelSupportsReference" />
                <strong>{{ Math.round(referenceStrength * 100) }}%</strong>
              </label>
              <p v-if="selectedReferenceImages.length && !selectedModelSupportsReference" class="image-gen-reference-message" role="status">
                当前模型不提交本地底图；参考提示仍会作为文字约束加入生成。
              </p>
              <label v-if="selectedReferenceImages.length && presentation === 'authoring'" class="image-gen-reference-prompt">
                <span>参考提示词</span>
                <textarea
                  v-model="imageReferencePrompt"
                  rows="2"
                  maxlength="240"
                  placeholder="例如：保持人物脸型和发色，只参考服装，不照搬构图"
                ></textarea>
              </label>
              <p v-if="!selectedReferenceImages.length" class="image-gen-reference-hint">可从已有图片选择，或上传最多 3 张；仅支持参考图的模型会使用它们。</p>
            </div>

            <template v-if="!referenceWorkspaceActive">

              <div class="image-gen-section">
                <ImageModelPicker
                  v-model="imageSelectedModel"
                  :configs="modelConfigs"
                  @configs-updated="handleConfigsUpdated"
                />
              </div>

              <button
                v-if="hasSeparateReferenceWorkspace"
                class="image-gen-reference-summary"
                type="button"
                @click="activeMode = 'reference'"
              >
                <span class="image-gen-reference-summary__thumbs" aria-hidden="true">
                  <img v-for="reference in selectedReferenceImages" :key="reference.id" :src="reference.data" alt="" />
                  <span v-if="selectedReferenceImages.length === 0">无</span>
                </span>
                <span>{{ selectedReferenceImages.length ? `已选 ${selectedReferenceImages.length} 张参考图` : '未选择参考图' }}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
              </button>

              <div class="image-gen-parameter-grid">
                <label class="image-gen-compact-field">
                  <span>{{ presentation === 'authoring' ? '比例尺寸' : '画幅' }}</span>
                  <select :value="selectedSizeKey" @change="selectSizePreset($event.target.value)">
                    <option v-for="preset in sizePresets" :key="preset.label" :value="`${preset.width}x${preset.height}`">{{ preset.label }}</option>
                  </select>
                </label>
                <label class="image-gen-compact-field">
                  <span>数量</span>
                  <select v-model.number="imageCount">
                    <option v-for="count in [1, 2, 3, 4]" :key="count" :value="count">{{ count }} 张</option>
                  </select>
                </label>
              </div>

              <div class="image-gen-section">
                <div class="image-gen-label-row">
                  <label class="image-gen-label">负面提示词（可选）</label>
                  <button v-if="presentation === 'authoring'" class="image-gen-inline-link" type="button" @click="useComicSafetyPrompt">使用漫画纯画面约束</button>
                </div>
                <textarea
                  v-model="imageNegativePrompt"
                  class="image-gen-prompt-input small"
                  placeholder="不想出现的内容..."
                  rows="2"
                ></textarea>
              </div>
            </template>
          </fieldset>

          <div v-if="!referenceWorkspaceActive" class="image-gen-actions">
            <button
              v-if="!imageGenerating"
              class="image-gen-generate-btn"
              type="button"
              @click="generateImages"
              :disabled="!imagePrompt.trim() || !imageSelectedModel"
            >
              生成插画
            </button>
            <button v-else class="image-gen-cancel-btn" type="button" @click="cancelGeneration('user')">
              <span class="spin-icon" aria-hidden="true"></span>
              取消生成
            </button>
          </div>
          <p
            v-if="generationStatus.message"
            class="image-gen-status"
            :class="`is-${generationStatus.kind}`"
            :role="generationMessageRole"
          >{{ generationStatus.message }}</p>
        </section>

        <section v-if="!referenceWorkspaceActive" class="image-gen-results" aria-label="插画候选">
          <div class="image-gen-results-title">
            <span>候选与历史</span>
            <small v-if="imageLibrary.length">{{ imageLibrary.length }} 张</small>
          </div>

          <div v-if="selectedPreviewImage" class="image-gen-current-preview">
            <img :src="selectedPreviewImage.data" :alt="selectedPreviewImage.prompt || sourceTitle || '当前插画候选'" />
            <div class="image-gen-current-caption">
              <strong>{{ selectedPreviewImage.prompt || sourceTitle || '当前插画候选' }}</strong>
              <span v-if="selectedPreviewImage.width && selectedPreviewImage.height">{{ selectedPreviewImage.width }}×{{ selectedPreviewImage.height }}</span>
            </div>
          </div>

          <div v-else class="image-gen-empty" role="status">
            <div
              v-if="presentation === 'authoring'"
              class="image-gen-empty__style-preview"
              data-test="image-style-preview"
              :style="{ '--style-position': selectedStylePreset.position }"
              role="img"
              :aria-label="`${selectedStylePreset.label}画面风格参考`"
            ></div>
            <strong>{{ presentation === 'authoring' ? '输入画面描述后生成候选' : '还没有候选' }}</strong>
            <span>{{ emptyResultHint }}</span>
          </div>

          <div v-if="imageLibrary.length" class="image-gen-grid" role="group" aria-label="生成历史">
            <button
              v-for="(img, idx) in imageLibrary"
              :key="img.id"
              type="button"
              class="image-gen-thumb"
              :class="{ active: imagePreviewIndex === idx }"
              :aria-pressed="imagePreviewIndex === idx"
              :aria-label="`查看候选 ${idx + 1}${img.prompt ? `：${img.prompt}` : ''}`"
              @click="previewImage(idx)"
            >
              <img :src="img.data" alt="" />
            </button>
          </div>

          <div v-if="selectedPreviewImage" class="image-gen-inline-actions">
            <button
              v-if="allowInsertImageToEditor"
              class="image-preview-action-btn"
              type="button"
              :disabled="selectedActionGuard.insertDisabled"
              @click="emitInsertImage(selectedPreviewImage)"
            >插入正文</button>
            <button class="image-preview-action-btn" type="button" @click="copyImagePrompt(selectedPreviewImage)">复制提示词</button>
            <button class="image-preview-action-btn image-preview-action-btn--danger" type="button" @click="deleteSelectedImage">删除候选</button>
            <button
              class="image-preview-action-btn"
              type="button"
              :disabled="selectedActionGuard.saveDisabled"
              @click="saveToMaterialLib"
            >保存为素材</button>
          </div>
          <p v-if="selectedActionGuard.reason" class="image-gen-action-reason" role="status">{{ selectedActionGuard.reason }}</p>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.media-generation-inline {
  position: relative;
  display: block;
  width: 100%;
  z-index: 2;
}

.image-generation-workbench {
  width: 100%;
}

.image-gen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.image-gen-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-gen-modes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  margin: -2px 0 10px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 52%, transparent);
}

.image-gen-mode-btn {
  min-height: 30px;
  padding: 4px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 12px;
  cursor: pointer;
}

.image-gen-mode-btn:hover {
  color: var(--archive-ink, var(--text-primary));
}

.image-gen-mode-btn.active {
  border-bottom-color: var(--archive-olive, var(--accent));
  color: var(--archive-olive-strong, var(--accent));
  font-weight: 600;
}

.image-gen-prompt-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  padding: 8px;
  font-size: 12px;
  line-height: 1.5;
  resize: none;
}

.image-gen-prompt-input:focus {
  outline: none;
  border-color: var(--archive-olive, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--archive-olive) 10%, transparent);
}

.image-gen-prompt-input.small {
  min-height: 56px;
}

.image-gen-section {
  margin-bottom: 8px;
}

.image-gen-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--archive-ink-soft, var(--text-secondary));
}

.image-gen-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}

.image-gen-label-row .image-gen-label {
  margin-bottom: 0;
}

.image-gen-reference-count,
.image-gen-reference-hint {
  color: var(--archive-ink-soft, var(--text-muted));
  font-size: 10px;
}

.image-gen-reference-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.image-gen-reference-thumb,
.image-gen-reference-upload {
  position: relative;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 56%, var(--border));
  border-radius: 3px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
}

.image-gen-reference-thumb.active {
  border-color: var(--archive-olive, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--archive-olive) 16%, transparent);
}

.image-gen-reference-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.image-gen-reference-thumb > span {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--archive-olive, var(--accent));
  color: var(--archive-paper-soft, var(--accent-text));
  font-size: 10px;
}

.image-gen-reference-upload {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  border-style: dashed;
  font-size: 10px;
}

.image-gen-reference-message {
  margin: 7px 0 0;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
  line-height: 1.45;
}

.image-gen-reference-upload:hover { border-color: var(--archive-olive, var(--accent)); color: var(--archive-olive-strong, var(--accent)); }
.image-gen-reference-input { display: none; }
.image-gen-reference-hint { margin: 6px 0 0; line-height: 1.45; }
.image-gen-reference-strength { display: grid; grid-template-columns: auto minmax(0, 1fr) 34px; align-items: center; gap: 7px; margin-top: 7px; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.image-gen-reference-strength input { width: 100%; accent-color: var(--archive-olive, var(--accent)); }
.image-gen-reference-strength strong { color: var(--archive-ink, var(--text-primary)); font-size: 10px; text-align: right; }

.image-gen-inline-link {
  min-height: 24px;
  padding: 2px 7px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 56%, var(--border));
  border-radius: 4px;
  background: transparent;
  color: var(--archive-olive-strong, var(--accent));
  cursor: pointer;
  font-size: 10px;
}

.image-gen-reference-summary {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
  padding: 5px 7px;
  border: 0;
  border-top: 1px dashed color-mix(in srgb, var(--archive-gold) 46%, transparent);
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 46%, transparent);
  background: transparent;
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
  font-size: 10px;
  text-align: left;
}

.image-gen-reference-summary:hover { color: var(--archive-olive-strong, var(--accent)); }
.image-gen-reference-summary > span:nth-child(2) { flex: 1; }
.image-gen-reference-summary__thumbs { display: flex; align-items: center; min-width: 30px; }
.image-gen-reference-summary__thumbs img { width: 26px; height: 26px; margin-right: -7px; border: 1px solid var(--archive-paper-soft, var(--bg-secondary)); border-radius: 50%; object-fit: cover; }
.image-gen-reference-summary__thumbs > span { color: var(--archive-ink-soft, var(--text-muted)); font-style: italic; }

.image-gen-parameter-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  gap: 8px;
  margin-bottom: 9px;
}

.image-gen-compact-field {
  display: grid;
  gap: 4px;
}

.image-gen-compact-field > span { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.image-gen-compact-field select {
  width: 100%;
  min-height: 32px;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  border-radius: 4px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
}

.image-gen-actions {
  margin-top: 10px;
}

.image-gen-generate-btn {
  width: 100%;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 72%, var(--border));
  border-radius: 4px;
  padding: 9px 12px;
  background: color-mix(in srgb, var(--archive-olive) 88%, var(--archive-olive-strong));
  color: var(--archive-paper-soft, var(--accent-text));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.image-gen-generate-btn:hover:not(:disabled) {
  background: var(--archive-olive-strong, var(--accent-hover));
}

.spin-icon {
  width: 12px;
  height: 12px;
  border: 1.5px solid color-mix(in srgb, currentColor 36%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: image-gen-spin 0.8s linear infinite;
}

@keyframes image-gen-spin { to { transform: rotate(360deg); } }

.image-gen-generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.image-gen-results {
  margin-top: 12px;
}

.image-gen-results-title {
  font-size: 11px;
  color: var(--archive-ink-soft, var(--text-secondary));
  margin-bottom: 8px;
}

.image-gen-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.image-gen-thumb {
  border: 1px solid color-mix(in srgb, var(--archive-gold) 54%, var(--border));
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: var(--archive-paper-soft, var(--bg-primary));
}

.image-gen-thumb.active {
  border-color: var(--archive-olive, var(--accent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--archive-olive) 32%, transparent);
}

.image-gen-thumb img {
  width: 100%;
  height: 92px;
  object-fit: cover;
  display: block;
}

.image-gen-inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 10px;
  flex-wrap: wrap;
}

.image-preview-action-btn {
  padding: 6px 12px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  border-radius: 4px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.image-preview-action-btn:hover {
  border-color: var(--archive-olive, var(--accent));
  color: var(--archive-olive-strong, var(--accent));
}

.image-gen-workspace,
.image-gen-controls,
.image-gen-results {
  min-width: 0;
}

.image-gen-control-fields {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.image-gen-control-fields:disabled {
  cursor: wait;
}

.image-gen-brief {
  margin-bottom: 12px;
}

.media-generation-inline--split .image-gen-workspace {
  display: grid;
  height: 100%;
  min-height: 0;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.media-generation-inline--split,
.media-generation-inline--split .image-generation-workbench {
  height: 100%;
  min-height: 0;
}

.media-generation-inline--split .image-gen-controls,
.media-generation-inline--split .image-gen-results {
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.media-generation-inline--split .image-gen-results {
  align-self: stretch;
  margin-top: 0;
  padding-left: 20px;
  border-left: 1px solid color-mix(in srgb, var(--archive-gold) 42%, var(--border));
}

.image-gen-results-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.image-gen-results-title small {
  color: var(--archive-ink-soft, var(--text-muted));
  font-size: 10px;
  font-weight: 400;
}

.image-gen-current-preview {
  display: grid;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 48%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, var(--bg-secondary));
}

.image-gen-current-preview > img {
  display: block;
  width: 100%;
  height: min(42vh, 460px);
  min-height: 240px;
  object-fit: contain;
}

.media-generation-inline--stack .image-gen-current-preview > img {
  height: min(34vh, 320px);
  min-height: 180px;
}

.image-gen-current-caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 38%, var(--border));
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.image-gen-current-caption strong {
  min-width: 0;
  overflow: hidden;
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-gen-empty {
  min-height: 240px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 7px;
  padding: 28px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 50%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 72%, transparent);
  color: var(--archive-ink-soft, var(--text-muted));
  text-align: center;
}

.image-gen-empty strong {
  color: var(--archive-ink, var(--text-primary));
  font-size: 12px;
  font-weight: 600;
}

.image-gen-empty span {
  max-width: 34em;
  font-size: 11px;
  line-height: 1.6;
}

.media-generation-inline--split .image-gen-grid {
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  margin-top: 10px;
}

.image-gen-thumb {
  min-width: 0;
  padding: 0;
}

.image-gen-thumb:focus-visible,
.image-preview-action-btn:focus-visible,
.image-gen-generate-btn:focus-visible,
.image-gen-cancel-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive) 72%, transparent);
  outline-offset: 2px;
}

.image-gen-cancel-btn {
  width: 100%;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 62%, var(--border));
  border-radius: 4px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.image-gen-status,
.image-gen-action-reason {
  margin: 8px 0 0;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
  line-height: 1.5;
}

.image-gen-status.is-error,
.image-gen-action-reason {
  color: var(--danger);
}

.image-gen-status.is-success {
  color: var(--archive-olive-strong, var(--accent));
}

.image-gen-status.is-cancelled {
  color: var(--archive-ink-soft, var(--text-muted));
}

.image-preview-action-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.image-preview-action-btn:hover:disabled {
  border-color: color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  color: var(--archive-ink, var(--text-primary));
}

/* Authoring 画师只复用生成与媒体合同，可见编排对齐作家助手的左参数 / 右画布工作台。 */
.media-generation-inline--authoring .image-gen-workspace {
  grid-template-columns: minmax(440px, 480px) minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
}

.media-generation-inline--split.media-generation-inline--authoring .image-gen-controls {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 16px;
  border-right: 1px solid var(--border-subtle);
  background: var(--surface-secondary);
  overflow: hidden;
}

.media-generation-inline--authoring .image-gen-control-fields {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.media-generation-inline--split.media-generation-inline--authoring .image-gen-results {
  display: flex;
  min-height: 0;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 0;
  background: var(--surface-primary);
}

.media-generation-inline--authoring .image-gen-results-title { display: none; }
.media-generation-inline--authoring .image-gen-section { margin-bottom: 16px; }
.media-generation-inline--authoring .image-gen-label { margin-bottom: 7px; color: var(--text-primary); font-size: 14px; font-weight: 520; }
.media-generation-inline--authoring .image-gen-label-row { min-height: 28px; }
.media-generation-inline--authoring .image-gen-prompt-input {
  min-height: 116px;
  padding: 9px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  background: var(--surface-primary);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.65;
}
.media-generation-inline--authoring .image-gen-prompt-input.small { min-height: 72px; }
.media-generation-inline--authoring .image-gen-prompt-input:focus { border-color: var(--accent-primary, var(--accent)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary, var(--accent)) 8%, transparent); }
.media-generation-inline--authoring .image-gen-inline-link { border-style: solid; border-color: var(--border-subtle); color: var(--accent-primary, var(--accent)); font-size: 12px; }

.image-gen-prompt-count { display: block; margin-top: 4px; color: var(--text-muted); font-size: 12px; text-align: right; }
.image-gen-quality-terms { display: grid; gap: 7px; margin: -5px 0 18px; }
.image-gen-quality-terms > span { color: var(--text-primary); font-size: 14px; }
.image-gen-quality-terms > div { display: flex; flex-wrap: wrap; gap: 7px; }
.image-gen-quality-terms button { min-height: 30px; padding: 4px 9px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--surface-primary, var(--bg-primary)); color: var(--text-secondary); font-size: 12px; cursor: pointer; }
.image-gen-quality-terms button:hover { border-color: var(--accent-primary, var(--accent)); color: var(--text-primary); }

.image-gen-reference-prompt { display: grid; gap: 6px; margin-top: 10px; }
.image-gen-reference-prompt > span { color: var(--text-primary); font-size: 13px; }
.image-gen-reference-prompt textarea { min-height: 58px; resize: vertical; padding: 7px 8px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--surface-primary, var(--bg-primary)); color: var(--text-primary); font: inherit; font-size: 13px; line-height: 1.5; }

.image-gen-style-section small { color: var(--text-secondary); font-size: 12px; }
.image-gen-style-grid { display: grid; grid-template-columns: repeat(5, minmax(70px, 1fr)); gap: 7px; }
.image-gen-style-option { min-width: 0; padding: 0; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--surface-primary, var(--bg-primary)); color: var(--text-primary); cursor: pointer; text-align: left; transition: border-color 120ms ease, background-color 120ms ease; }
.image-gen-style-option > span { display: block; height: 64px; border-bottom: 1px solid var(--border-subtle); background-color: color-mix(in srgb, var(--text-secondary) 16%, var(--surface-primary, var(--bg-primary))); background-image: url('../../assets/media/authoring-image-style-presets.webp'); background-repeat: no-repeat; background-size: 500% 100%; }
.image-gen-style-option strong { display: block; overflow: hidden; padding: 6px 7px; font-size: 12px; font-weight: 520; text-overflow: ellipsis; white-space: nowrap; }
.image-gen-style-option:hover { border-color: color-mix(in srgb, var(--accent-primary, var(--accent)) 48%, var(--border-subtle)); }
.image-gen-style-option.active { border-color: var(--accent-primary, var(--accent)); box-shadow: inset 0 -2px var(--accent-primary, var(--accent)); }

.media-generation-inline--authoring .image-gen-brief--authoring { margin: 0 0 16px; }
.media-generation-inline--authoring .image-gen-reference-strip { display: flex; flex-wrap: wrap; grid-template-columns: none; }
.media-generation-inline--authoring .image-gen-reference-thumb { width: 52px; height: 52px; aspect-ratio: 1; border-color: var(--border-subtle); }
.media-generation-inline--authoring .image-gen-reference-upload { width: auto; min-width: 80px; height: 32px; min-height: 32px; align-self: center; aspect-ratio: auto; grid-auto-flow: column; padding: 0 10px; border-style: solid; border-color: var(--border-subtle); font-size: 13px; }
.media-generation-inline--authoring .image-gen-reference-hint,
.media-generation-inline--authoring .image-gen-reference-message,
.media-generation-inline--authoring .image-gen-reference-count,
.media-generation-inline--authoring .image-gen-reference-strength { color: var(--text-secondary); font-size: 12px; }
.media-generation-inline--authoring .image-gen-reference-summary { border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 13px; }
.media-generation-inline--authoring .image-gen-parameter-grid { grid-template-columns: minmax(0, 1fr) 96px; gap: 10px; margin-bottom: 16px; }
.media-generation-inline--authoring .image-gen-compact-field > span { color: var(--text-primary); font-size: 14px; }
.media-generation-inline--authoring .image-gen-compact-field select { min-height: 38px; border-color: var(--border-subtle); background: var(--surface-primary); color: var(--text-primary); font-size: 14px; }
.media-generation-inline--authoring .image-gen-actions { position: sticky; bottom: 0; margin-top: auto; padding-top: 14px; background: var(--surface-secondary); }
.media-generation-inline--authoring .image-gen-generate-btn,
.media-generation-inline--authoring .image-gen-cancel-btn { min-height: 40px; border: 0; border-radius: 4px; background: var(--accent-primary, var(--accent)); color: var(--accent-text, #fff); font-size: 14px; }
.media-generation-inline--authoring .image-gen-cancel-btn { background: var(--text-secondary); }
.media-generation-inline--authoring .image-gen-status,
.media-generation-inline--authoring .image-gen-action-reason { font-size: 12px; }
.media-generation-inline--authoring .image-gen-empty { min-height: 100%; flex: 1 1 auto; border: 0; border-radius: 0; background: transparent; }
.media-generation-inline--authoring .image-gen-empty__style-preview { width: min(420px, 76%); aspect-ratio: 16 / 9; margin-bottom: 12px; border: 1px solid var(--border-subtle); border-radius: 8px; background-color: var(--surface-workbench-muted, var(--surface-secondary)); background-image: linear-gradient(to bottom, transparent 64%, rgb(0 0 0 / 12%)), url('../../assets/media/authoring-image-style-presets.webp'); background-repeat: no-repeat; background-position: center, var(--style-position); background-size: 100% 100%, 500% 100%; box-shadow: 0 12px 32px rgb(0 0 0 / 8%); }
.media-generation-inline--authoring .image-gen-empty strong { max-width: 28em; color: var(--text-primary); font-size: 15px; font-weight: 450; }
.media-generation-inline--authoring .image-gen-empty span { color: var(--text-secondary); font-size: 13px; }
.media-generation-inline--authoring .image-gen-current-preview { flex: 1 1 auto; place-content: center; border: 0; border-radius: 0; background: var(--surface-primary); }
.media-generation-inline--authoring .image-gen-current-preview > img { height: min(68vh, 680px); min-height: 360px; }
.media-generation-inline--authoring .image-gen-current-caption { border-color: var(--border-subtle); font-size: 12px; }
.media-generation-inline--authoring .image-gen-current-caption strong { font-size: 13px; }
.media-generation-inline--authoring .image-gen-grid { padding: 10px 14px 0; }
.media-generation-inline--authoring .image-gen-thumb { border-color: var(--border-subtle); }
.media-generation-inline--authoring .image-gen-inline-actions { padding: 10px 14px 14px; }
.media-generation-inline--authoring .image-preview-action-btn { border-style: solid; border-color: var(--border-subtle); background: var(--surface-primary); color: var(--text-primary); font-size: 13px; }
.media-generation-inline--authoring .image-preview-action-btn--danger { margin-right: auto; color: var(--danger); }

@media (max-width: 720px), (max-height: 560px) {
  .media-generation-inline--split .image-gen-workspace {
    display: block;
    overflow-y: auto;
  }

  .media-generation-inline--split .image-gen-results {
    margin-top: 12px;
    padding-left: 0;
    border-left: 0;
  }

  .media-generation-inline--split .image-gen-controls,
  .media-generation-inline--split .image-gen-results {
    max-height: none;
    overflow: visible;
    scrollbar-gutter: auto;
  }

  .media-generation-inline[data-mobile-pane="parameters"] .image-gen-results,
  .media-generation-inline[data-mobile-pane="results"] .image-gen-controls {
    display: none;
  }

  .image-gen-mode-btn,
  .image-gen-inline-link,
  .image-gen-reference-summary,
  .image-gen-compact-field select,
  .image-gen-generate-btn,
  .image-gen-cancel-btn,
  .image-preview-action-btn {
    min-height: 44px;
  }

  .image-gen-reference-thumb,
  .image-gen-reference-upload,
  .image-gen-thumb {
    min-height: 44px;
  }

  .image-gen-reference-strength input[type="range"] {
    min-height: 44px;
  }

  :global(.image-model-overlay button),
  :global(.image-model-overlay input),
  :global(.image-model-overlay select),
  :global(.image-model-overlay textarea) {
    min-height: 44px;
  }

  .image-gen-current-preview > img,
  .media-generation-inline--stack .image-gen-current-preview > img {
    height: min(46vh, 420px);
    min-height: 220px;
  }
}

@media (min-width: 721px) and (max-width: 1100px) {
  .media-generation-inline--authoring .image-gen-workspace { grid-template-columns: minmax(400px, 46%) minmax(0, 1fr); }
  .image-gen-style-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .image-gen-parameter-grid {
    grid-template-columns: minmax(0, 1fr) minmax(104px, 0.46fr);
  }

  .image-gen-empty {
    min-height: 220px;
    padding: 22px 16px;
  }

  .image-gen-current-caption {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .image-gen-current-caption strong {
    width: 100%;
  }
}

</style>
