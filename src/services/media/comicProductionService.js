import { buildComicPanelImageRequest } from './comicImagePrompt'
import { getComicPanelImageSize } from './comicLayout'
import {
  addComicPanelStageArtifact,
  clearComicStagePendingRequest,
  listComicPages,
  updateComicPanelStage
} from './comicPageStore'
import { canSendComicRequest, comicRequestIntentHash, createComicRequestId } from './comicRequestGuard'
import {
  generateImage,
  getImageProviderCapabilities
} from './imageProviderService'
import {
  addGeneratedImageToLibrary,
  getMediaAssetDataUrl
} from './mediaAssetStore'

export const COMIC_STAGE_LABELS = Object.freeze({
  rough: '草稿',
  line: '线稿',
  flats: '平涂',
  tones: '黑块/网点',
  render: '上色',
  effects: '效果'
})

export const COMIC_PRODUCTION_ROUTES = Object.freeze({
  color: Object.freeze(['rough', 'line', 'flats', 'render', 'effects']),
  monochrome: Object.freeze(['rough', 'line', 'tones', 'effects'])
})

export function getComicProductionRoute(page = {}) {
  return page.colorMode === 'monochrome'
    ? COMIC_PRODUCTION_ROUTES.monochrome
    : COMIC_PRODUCTION_ROUTES.color
}

export function getComicStageInputArtifact(panel = {}, stage, page = {}) {
  const route = getComicProductionRoute(page)
  const stageIndex = route.indexOf(stage)
  const upstreamStage = stageIndex > 0 ? route[stageIndex - 1] : null
  if (!upstreamStage) return null
  const upstream = panel.production?.[upstreamStage]
  if (upstream?.status !== 'approved' || !upstream.selectedArtifactId) return null
  return {
    stage: upstreamStage,
    artifactId: upstream.selectedArtifactId
  }
}

export function getComicStageInputRevision(page = {}, panel = {}, stage) {
  const upstream = getComicStageInputArtifact(panel, stage, page)
  const payload = {
    stage,
    visual: panel.visual,
    beat: panel.beat,
    frame: panel.frame,
    direction: panel.direction,
    continuityRefs: panel.continuityRefs,
    referenceBindings: panel.referenceBindings,
    visualBibleRevision: page.visualBible?.revision || 1,
    styleBible: page.styleBible,
    colorMode: page.colorMode,
    upstream: upstream?.artifactId || null
  }
  return `comic-stage-v1:${hashString(JSON.stringify(payload))}`
}

export function getComicStageGate({ page = {}, panel = {}, stage, config = {}, mode = 'generate' } = {}) {
  const capabilities = getImageProviderCapabilities(config)
  if (!page.id || !panel.id) return { allowed: false, reason: '缺少漫画页或当前格', capabilities }
  if (!panel.visual?.trim()) return { allowed: false, reason: '请先填写当前格画面', capabilities }
  const route = getComicProductionRoute(page)
  if (!route.includes(stage)) {
    return {
      allowed: false,
      reason: page.colorMode === 'monochrome' ? '黑白项目不使用彩色制作阶段' : '彩色项目不使用网点制作阶段',
      capabilities
    }
  }
  if (!config.type) return { allowed: false, reason: '请先选择图片模型', capabilities }
  if (mode === 'inpaint') {
    const current = panel.production?.[stage]
    if (!current?.selectedArtifactId) return { allowed: false, reason: '请先选择要修订的阶段候选', capabilities }
    if (!capabilities.inpaint) return { allowed: false, reason: '当前模型不支持局部遮罩修订', capabilities }
    return { allowed: true, reason: '', capabilities }
  }
  if (stage === 'rough') {
    return capabilities.textToImage
      ? { allowed: true, reason: '', capabilities }
      : { allowed: false, reason: '当前模型不支持文生图草稿', capabilities }
  }
  const upstream = getComicStageInputArtifact(panel, stage, page)
  if (!upstream) {
    const stageIndex = route.indexOf(stage)
    const upstreamStage = route[stageIndex - 1]
    return {
      allowed: false,
      reason: `请先确认${COMIC_STAGE_LABELS[upstreamStage] || '上游阶段'}`,
      capabilities
    }
  }
  if (!capabilities.imageToImage) {
    return { allowed: false, reason: '当前模型不支持保持上游构图继续生成', capabilities }
  }
  return { allowed: true, reason: '', capabilities, upstream }
}

export function getComicBatchEligiblePanels(page = {}, stage, config = {}) {
  if (page.sequenceId && page.visualBibleStatus !== 'confirmed') return []
  return (page.panels || []).filter((panel) => {
    const status = panel.production?.[stage]?.status || 'empty'
    return ['empty', 'stale', 'failed'].includes(status)
      && getComicStageGate({ page, panel, stage, config }).allowed
  })
}

export function getComicReferenceCapabilityWarnings(panel = {}, config = {}) {
  const capabilities = getImageProviderCapabilities(config)
  const roles = new Set((panel.referenceBindings || []).map((binding) => binding.role))
  const warnings = []
  if ([...roles].some((role) => ['identity', 'costume', 'location', 'prop', 'style'].includes(role)) && !capabilities.identityReference) {
    warnings.push('当前模型不会提交身份/风格参考图')
  }
  if ([...roles].some((role) => ['pose', 'edge', 'depth'].includes(role)) && !capabilities.controlImages) {
    warnings.push('当前模型不会提交 pose/edge/depth 控制图')
  }
  return warnings
}

export async function runComicStageGeneration({
  page,
  panel,
  stage,
  config,
  storageKey,
  projectId,
  sourceTitle = '',
  sourceText = '',
  previousPanel = null,
  previousImageData = '',
  mode = 'generate',
  maskImage = '',
  revisionPrompt = '',
  fetchImpl,
  mediaOptions = {},
  // B 夜：显式再生成时由调用方传入被批准清除的旧请求 ID；
  // 未提供而同格仍有未决请求时拒绝发送，不自动重试。
  approvedClearRequestId = ''
} = {}) {
  const gate = getComicStageGate({ page, panel, stage, config, mode })
  if (!gate.allowed) throw new Error(gate.reason)
  // 防重守卫优先读持久化实时状态，调用方快照可能已过期。
  const livePending = listComicPages({}).find((item) => item.id === page.id)?.panels
    .find((item) => item.id === panel.id)?.production?.[stage]?.pendingRequest || null
  const existingPending = livePending || panel.production?.[stage]?.pendingRequest || null
  const inputRevision = getComicStageInputRevision(page, panel, stage)
  const intentHash = comicRequestIntentHash({
    pageId: page.id,
    panelId: panel.id,
    stage,
    mode,
    inputRevision,
    mask: mode === 'inpaint' ? maskImage : ''
  })
  const sendCheck = canSendComicRequest(existingPending, { intentHash })
  if (!sendCheck.allowed && existingPending.requestId !== approvedClearRequestId) {
    throw new Error('上一请求结果未知，请先核查或明确选择“重新生成”，避免重复请求')
  }
  const requestId = createComicRequestId()
  const selectedStageArtifact = panel.production?.[stage]?.selectedArtifactId || null
  const parentAssetId = mode === 'inpaint'
    ? selectedStageArtifact
    : gate.upstream?.artifactId || null
  updateComicPanelStage(page.id, panel.id, stage, {
    status: 'working',
    error: null,
    staleReason: '',
    pendingRequest: {
      requestId,
      intentHash,
      inputRevision,
      stage,
      mode,
      sentAt: Date.now()
    }
  })
  try {
    const imageSize = getComicPanelImageSize(page, panel.order)
    const baseRequest = buildComicPanelImageRequest({
      page,
      panel,
      previousPanel,
      sourceTitle,
      sourceText,
      providerType: config.type,
      previousImageData,
      targetAspect: `${imageSize.width}:${imageSize.height}`
    })
    const referenceImages = []
    if (parentAssetId) {
      const data = await getMediaAssetDataUrl(parentAssetId, mediaOptions)
      if (!data) throw new Error('上游阶段产物不可用，请重新选择或上传')
      referenceImages.push({ id: parentAssetId, data, title: '阶段上游' })
    } else {
      referenceImages.push(...baseRequest.referenceImages)
    }
    const bindingInputs = await resolveReferenceBindings(panel.referenceBindings, gate.capabilities, mediaOptions)
    const prompt = buildComicStagePrompt({
      page,
      stage,
      basePrompt: baseRequest.prompt,
      revisionPrompt,
      mode
    })
    const data = await generateImage(config, {
      ...baseRequest,
      prompt,
      width: imageSize.width,
      height: imageSize.height,
      count: 1,
      referenceImages: [...referenceImages, ...bindingInputs.referenceImages].slice(0, 3),
      controlImages: bindingInputs.controlImages,
      maskImage: mode === 'inpaint' ? maskImage : '',
      fetchImpl
    })
    const archiveResult = await archiveStageArtifactWithRecovery({
      requestId,
      page,
      panel,
      stage,
      config,
      storageKey,
      projectId,
      data,
      prompt,
      negativePrompt: baseRequest.negativePrompt,
      width: imageSize.width,
      height: imageSize.height,
      parentAssetId,
      inputRevision,
      origin: mode === 'inpaint' ? 'edited' : 'generated',
      mediaOptions
    })
    if (archiveResult.retryable) {
      // 生成成功、媒资保存失败：保留内存结果等待“只重试保存”，不再调用模型。
      markStageFailure(page.id, panel.id, stage, {
        code: 'media-persist-failed',
        message: archiveResult.error?.message || '图片保存失败，可只重试保存',
        retryable: true
      })
      clearComicStagePendingRequest(page.id, panel.id, stage, requestId)
      const persistError = new Error(archiveResult.error?.message || '图片保存失败，可只重试保存')
      persistError.code = 'media-persist-failed'
      persistError.requestId = requestId
      throw persistError
    }
    clearComicStagePendingRequest(page.id, panel.id, stage, requestId)
    return archiveResult.page
  } catch (error) {
    if (error?.code !== 'media-persist-failed') {
      const rejected = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.status !== 408
      markStageFailure(page.id, panel.id, stage, {
        code: rejected ? 'stage_generation_failed' : 'outcome-unknown',
        message: error?.message || '阶段生成失败',
        retryable: true
      })
      // Network failure/timeout/5xx can occur AFTER the provider accepted the
      // image job. Keep its durable identity until explicit user clearance.
      if (rejected) clearComicStagePendingRequest(page.id, panel.id, stage, requestId)
    }
    throw error
  }
}

// B 夜：媒资保存失败的会话内恢复区。只保存生成结果本身，
// 不重调模型；刷新后数据 URL 丢失，只能显式重新生成。
const persistRetryQueue = new Map()
const PERSIST_RETRY_LIMIT = 3

export function getComicPersistRetry(requestId) {
  return persistRetryQueue.get(requestId) || null
}

export function listComicPersistRetries(pageId = '', panelId = '', stage = '') {
  return [...persistRetryQueue.values()].filter((entry) => (
    (!pageId || entry.pageId === pageId)
    && (!panelId || entry.panelId === panelId)
    && (!stage || entry.stage === stage)
  ))
}

export async function retryComicStagePersist(requestId) {
  const entry = persistRetryQueue.get(requestId)
  if (!entry) throw new Error('没有待恢复的图片保存任务')
  const retry = await archiveStageArtifactWithRecovery({ ...entry.payload, requestId })
  if (retry.retryable) throw retry.error || new Error('图片保存仍然失败')
  persistRetryQueue.delete(requestId)
  if (retry.page) clearComicStagePendingRequest(entry.pageId, entry.panelId, entry.stage, requestId)
  return retry
}

async function archiveStageArtifactWithRecovery(params) {
  const { requestId, page, panel, stage, inputRevision, parentAssetId, origin } = params
  try {
    const entry = await addGeneratedImageToLibrary(params.storageKey, {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      modelName: params.config.name,
      modelId: params.config.defaultModel,
      modelType: params.config.type || 'manual',
      width: params.width,
      height: params.height,
      data: params.data,
      parentAssetId,
      createdAt: new Date().toISOString()
    }, {
      projectId: params.projectId,
      purpose: 'comic-panel',
      parentAssetId,
      sourceRefs: [
        ...(page.sourceRefs || []),
        ...(panel.continuityRefs || []),
        { refType: 'comic-page', refId: page.id, projectId: params.projectId },
        { refType: 'comic-panel', refId: panel.id, projectId: params.projectId }
      ],
      ...params.mediaOptions
    })
    const livePage = listComicPages({}).find((item) => item.id === page.id) || null
    const livePanel = livePage?.panels.find((item) => item.id === panel.id) || null
    if (!livePanel) {
      // 原格在请求期间被删除：媒资留在素材库（sourceRefs 可反查），不复活对象。
      persistRetryQueue.delete(requestId)
      return { entry, page: null, retryable: false, targetMissing: true }
    }
    const liveInputRevision = getComicStageInputRevision(livePage, livePanel, stage)
    const inputChanged = liveInputRevision !== inputRevision
    const saved = addComicPanelStageArtifact(page.id, panel.id, stage, {
      id: entry.mediaAssetId,
      parentAssetId,
      inputRevision,
      origin,
      createdAt: Date.now()
    }, { select: !inputChanged })
    if (saved && inputChanged) {
      // 请求发出后作者修改了格内容：候选进入原格候选区，不自动替换现选对象。
      updateComicPanelStage(page.id, panel.id, stage, {
        staleReason: '生成请求后格内容已修改，候选未自动选用'
      })
    }
    persistRetryQueue.delete(requestId)
    return { entry, page: saved, retryable: false, targetMissing: false, staleAttach: inputChanged }
  } catch (error) {
    while (persistRetryQueue.size >= PERSIST_RETRY_LIMIT) {
      const oldest = [...persistRetryQueue.values()].sort((left, right) => left.storedAt - right.storedAt)[0]
      if (oldest) persistRetryQueue.delete(oldest.requestId)
    }
    persistRetryQueue.set(requestId, {
      requestId,
      pageId: page.id,
      panelId: panel.id,
      stage,
      payload: { ...params },
      storedAt: Date.now()
    })
    return { entry: null, page: null, retryable: true, error }
  }
}

function markStageFailure(pageId, panelId, stage, error) {
  try {
    updateComicPanelStage(pageId, panelId, stage, {
      status: 'failed',
      error
    })
  } catch {
    // 目标页/格已被删除时不复活它；媒资保留在素材库。
  }
}

export async function archiveUploadedComicStage({
  page,
  panel,
  stage,
  config = {},
  storageKey,
  projectId,
  data,
  width = 0,
  height = 0,
  mediaOptions = {}
} = {}) {
  const upstream = getComicStageInputArtifact(panel, stage, page)
  return archiveComicStageArtifact({
    page,
    panel,
    stage,
    config,
    storageKey,
    projectId,
    data,
    prompt: `人工上传${COMIC_STAGE_LABELS[stage] || stage}`,
    negativePrompt: '',
    width,
    height,
    parentAssetId: upstream?.artifactId || null,
    inputRevision: getComicStageInputRevision(page, panel, stage),
    origin: 'uploaded',
    mediaOptions
  })
}

async function archiveComicStageArtifact({
  page,
  panel,
  stage,
  config,
  storageKey,
  projectId,
  data,
  prompt,
  negativePrompt,
  width,
  height,
  parentAssetId,
  inputRevision,
  origin,
  mediaOptions = {}
}) {
  const entry = await addGeneratedImageToLibrary(storageKey, {
    prompt,
    negativePrompt,
    modelName: config.name,
    modelId: config.defaultModel,
    modelType: config.type || 'manual',
    width,
    height,
    data,
    parentAssetId,
    createdAt: new Date().toISOString()
  }, {
    projectId,
    purpose: 'comic-panel',
    parentAssetId,
    sourceRefs: [
      ...(page.sourceRefs || []),
      ...(panel.continuityRefs || []),
      { refType: 'comic-page', refId: page.id, projectId },
      { refType: 'comic-panel', refId: panel.id, projectId }
    ],
    ...mediaOptions
  })
  const saved = addComicPanelStageArtifact(page.id, panel.id, stage, {
    id: entry.mediaAssetId,
    parentAssetId,
    inputRevision,
    origin,
    createdAt: Date.now()
  })
  return { entry, page: saved }
}

async function resolveReferenceBindings(bindings = [], capabilities = {}, mediaOptions = {}) {
  const referenceImages = []
  const controlImages = []
  for (const binding of bindings) {
    if (!binding.assetId) continue
    const data = await getMediaAssetDataUrl(binding.assetId, mediaOptions).catch(() => '')
    if (!data) continue
    if (['identity', 'costume', 'location', 'prop', 'style'].includes(binding.role) && capabilities.identityReference) {
      referenceImages.push({ id: binding.assetId, data, title: binding.role })
    }
    if (['pose', 'edge', 'depth'].includes(binding.role) && capabilities.controlImages) {
      controlImages.push({
        id: binding.assetId,
        role: binding.role,
        data,
        weight: binding.weight ?? 1
      })
    }
  }
  return { referenceImages, controlImages }
}

export function buildComicStagePrompt({
  page = {},
  stage,
  basePrompt = '',
  revisionPrompt = '',
  mode = 'generate'
} = {}) {
  const instructions = {
    rough: '制作可审阅的漫画粗分镜草稿：重点确认人物站位、动作、透视、景别和明暗大关系，使用简洁灰阶线条，不要完成上色。',
    line: '严格沿用输入草稿的构图、人物身份、动作和透视，清理为可继续制作的黑白线稿；轮廓明确，背景层级清楚，不增加新人物或文字。',
    flats: '严格保持输入线稿的轮廓、构图和人物身份，只铺设干净的固有色分区；色块边界服从线稿，不添加光影、材质高光、文字或新物体。',
    tones: '严格保持输入线稿的轮廓、构图和人物身份，完成黑块、灰阶与网点分区；保持纯黑白输出，不引入彩色、文字或新物体。',
    render: '严格保持输入平涂的色彩分区、线稿、构图和人物身份，在其上增加光影、材质与空间层次；不要重画人物、改变配色或加入文字。',
    effects: '严格保持已确认上游画面、人物身份、构图和主要明暗，只增加受控的环境、速度、光效与最终统一处理；不要遮挡叙事焦点或加入文字。'
  }
  const bible = page.visualBible || {}
  const palette = Array.isArray(bible.palette) && bible.palette.length
    ? `限定色板：${bible.palette.join('、')}。`
    : ''
  const lineStyle = bible.lineStyle ? `线条规则：${bible.lineStyle}。` : ''
  const renderingNotes = bible.renderingNotes ? `上色/网点/效果规则：${bible.renderingNotes}。` : ''
  const styleBible = page.styleBible ? `统一画风：${page.styleBible}。` : ''
  const stageRules = stage === 'flats' || stage === 'render' || (stage === 'effects' && page.colorMode !== 'monochrome')
    ? [palette, renderingNotes]
    : stage === 'tones' || (stage === 'effects' && page.colorMode === 'monochrome')
      ? [lineStyle, renderingNotes]
      : [lineStyle]
  const localRevision = mode === 'inpaint'
    ? `只修改遮罩区域，遮罩外像素、构图和人物身份保持不变。修订要求：${String(revisionPrompt || '').trim() || '修复局部结构与细节。'}`
    : ''
  return [
    instructions[stage] || `基于已确认上游制作${COMIC_STAGE_LABELS[stage] || stage}候选，不改变剧情与构图。`,
    styleBible,
    ...stageRules,
    localRevision,
    basePrompt
  ].filter(Boolean).join('\n')
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export default {
  archiveUploadedComicStage,
  buildComicStagePrompt,
  getComicBatchEligiblePanels,
  getComicPersistRetry,
  getComicProductionRoute,
  getComicReferenceCapabilityWarnings,
  getComicStageGate,
  getComicStageInputArtifact,
  getComicStageInputRevision,
  listComicPersistRetries,
  retryComicStagePersist,
  runComicStageGeneration
}
