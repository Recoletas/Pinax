import { computed, nextTick, ref, shallowRef } from 'vue'
import {
  assessAuthoringVisualBriefFreshness,
  createAuthoringVisualBrief,
  finalizeAuthoringVisualBrief
} from '../services/agents/authoring/authoringVisualBrief.js'
import { listActiveNarrativeAssets } from '../services/media/narrativeAssets.js'
import { hydrateNarrativeImageAssets } from '../services/media/narrativeImageAssetBridge.js'
import {
  saveAuthoringIllustrationAsMaterial,
  validateAuthoringIllustrationInsert
} from '../services/agents/authoring/authoringIllustrationActions.js'
import { updateMediaAsset } from '../services/media/mediaAssetStore.js'

function clone(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function worldbookEntryId(source = {}) {
  const direct = String(source.entityId || '').trim()
  if (direct && ['character', 'location'].includes(source.kind)) return direct
  const ref = String(source.sourceRef || '')
  return ref.startsWith('worldbook-entry:') ? ref.slice('worldbook-entry:'.length) : ''
}

function assetReferencesEntry(asset, entryIds) {
  return (asset?.sourceRefs || []).some((ref) => (
    ref?.refType === 'worldbook-entry' && entryIds.has(String(ref?.refId || ''))
  ))
}

export function useAuthoringIllustrator(host = null) {
  const open = ref(false)
  const brief = shallowRef(null)
  const liveSource = shallowRef(null)
  const returnSurface = shallowRef(null)
  const selectedSceneSourceIds = ref([])
  const referenceCandidates = ref([])
  const notice = ref('')
  const minimized = ref(false)
  const blocking = computed(() => open.value && !minimized.value)
  let referenceLoadRevision = 0
  let preparedSource = null
  let preparedMobileSource = null
  let activeJob = null

  const generationBrief = computed(() => {
    if (!brief.value) return null
    return finalizeAuthoringVisualBrief(brief.value, {
      selectedSceneSourceIds: selectedSceneSourceIds.value
    })
  })

  const freshness = computed(() => {
    const target = generationBrief.value || brief.value
    const assessment = assessAuthoringVisualBriefFreshness(target, liveSource.value || {})
    const reasons = Array.isArray(assessment?.staleSources) ? assessment.staleSources : []
    const detached = reasons.some((issue) => [
      'project-changed',
      'document-changed',
      'chapter-changed',
      'pane-changed',
      'source-missing'
    ].includes(issue?.reason))
    return Object.freeze({
      ...assessment,
      fresh: assessment?.stale === false,
      detached,
      reasons
    })
  })

  async function loadReferenceCandidatesForBrief(nextBrief, inlineCandidates = []) {
    const revision = ++referenceLoadRevision
    referenceCandidates.value = clone(inlineCandidates)
    const entryIds = new Set((nextBrief?.scene?.sources || []).map(worldbookEntryId).filter(Boolean))
    if (!nextBrief?.projectId && !nextBrief?.source?.projectId) return
    if (!entryIds.size) return
    const projectId = String(nextBrief.projectId || nextBrief.source.projectId || '')
    const assets = listActiveNarrativeAssets({ projectId, kind: 'reference-image' })
      .filter((asset) => assetReferencesEntry(asset, entryIds))
    const hydrated = await hydrateNarrativeImageAssets(assets)
    if (revision !== referenceLoadRevision || brief.value?.sessionId !== nextBrief.sessionId) return
    referenceCandidates.value = [...clone(inlineCandidates), ...hydrated
      .filter((asset) => asset?.image?.mediaAssetId && asset?.image?.data)
      .map((asset) => ({
        id: String(asset.id),
        mediaAssetId: String(asset.image.mediaAssetId),
        data: String(asset.image.data),
        title: String(asset.title || '设定参考图'),
        prompt: String(asset.content || asset.title || ''),
        sourceRefs: clone(asset.sourceRefs || []),
        mediaPurpose: 'storyboard-reference'
      }))]
  }

  function start(invocation, surface = null) {
    const nextBrief = createAuthoringVisualBrief(invocation || {})
    if (!nextBrief) return { ok: false, reason: 'visual-source-unavailable' }
    const inlineCandidates = Array.isArray(invocation?.visualReferenceCandidates)
      ? invocation.visualReferenceCandidates.filter((candidate) => candidate?.id && candidate?.data)
      : []
    brief.value = nextBrief
    liveSource.value = clone(invocation)
    returnSurface.value = surface || null
    selectedSceneSourceIds.value = []
    referenceCandidates.value = clone(inlineCandidates)
    notice.value = ''
    open.value = true
    void loadReferenceCandidatesForBrief(nextBrief, inlineCandidates).catch(() => {
      if (brief.value?.sessionId === nextBrief.sessionId) {
        notice.value = '设定参考图暂时无法读取，仍可直接生成。'
      }
    })
    return { ok: true, brief: nextBrief }
  }

  function reconcile(nextLiveSource) {
    liveSource.value = clone(nextLiveSource)
    return freshness.value
  }

  function close() {
    open.value = false
    return returnSurface.value
  }

  function clear() {
    referenceLoadRevision += 1
    open.value = false
    brief.value = null
    liveSource.value = null
    returnSurface.value = null
    selectedSceneSourceIds.value = []
    referenceCandidates.value = []
    notice.value = ''
    minimized.value = false
    preparedSource = null
    preparedMobileSource = null
    activeJob = null
  }

  function freezeSource(event) {
    if (!host || (event?.button != null && event.button !== 0)) return
    if (host.isCompositionEvent?.(event)) {
      preparedSource = null
      return
    }
    preparedSource = capturePreparedSource()
  }

  function freezeMobileSource(event) {
    if (!host?.mobileToolsActive?.() || host.isCompositionEvent?.(event)) {
      preparedMobileSource = null
      return
    }
    preparedMobileSource = capturePreparedSource()
  }

  function capturePreparedSource() {
    const invocation = host?.captureSource?.()
    const surface = host?.captureSurface?.()
    return invocation && surface ? { invocation, surface, createdAt: Date.now() } : null
  }

  function consumePreparedSource(preferred = null) {
    const candidate = preferred || preparedSource
    preparedSource = null
    if (candidate && Date.now() - Number(candidate.createdAt || 0) < 30000) return candidate
    return capturePreparedSource()
  }

  function reconcileSource() {
    return reconcile(host?.captureLiveSource?.())
  }

  function openWithPrepared(prepared = null) {
    if (!host) return false
    if (host.compositionActive?.()) {
      host.notify?.('请先完成当前中文输入，再打开画师')
      return false
    }
    if (host.draftBlocksOpen?.()) {
      host.notify?.('请先处理当前推演草稿，再打开画师')
      return false
    }
    if (activeJob && brief.value) {
      reconcileSource()
      minimized.value = false
      open.value = true
      return true
    }
    const source = consumePreparedSource(prepared)
    if (!source) {
      host.notify?.('请先把光标放在正文或速记的文本块中')
      return false
    }
    host.prepareOpen?.()
    const started = start({
      ...source.invocation,
      sessionId: `visual-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    }, source.surface)
    if (!started.ok) {
      host.notify?.('当前落笔处无法建立画面任务，请重新选择正文')
      return false
    }
    reconcile(source.invocation)
    minimized.value = false
    activeJob = null
    return true
  }

  function openForCharacter({ entry, prompt, referenceImage } = {}) {
    const invocation = host?.captureSource?.()
    const surface = host?.captureSurface?.()
    if (!invocation || !surface || !prompt) {
      host?.notify?.('请先把光标放在当前正文的文本块中')
      return false
    }
    const selection = {
      ...(invocation.selection || {}),
      text: prompt,
      selectedText: prompt,
      empty: false,
      markdownFrom: undefined,
      markdownTo: undefined
    }
    const visualReferenceCandidates = referenceImage ? [{
      id: `character-avatar:${entry?.id || entry?.name || 'draft'}`,
      data: referenceImage,
      title: `${entry?.name || '角色'}参考图`,
      prompt,
      sourceRefs: entry?.id ? [{ refType: 'worldbook-entry', refId: String(entry.id) }] : [],
      mediaPurpose: 'storyboard-reference',
      autoSelected: true
    }] : []
    return openWithPrepared({
      invocation: { ...invocation, selection, visualReferenceCandidates },
      surface,
      createdAt: Date.now()
    })
  }

  function openFromMobileTools() {
    const prepared = preparedMobileSource
    preparedMobileSource = null
    host?.closeMobileTools?.()
    return openWithPrepared(prepared)
  }

  function releaseMobileSource() {
    const prepared = preparedMobileSource
    preparedMobileSource = null
    return prepared
  }

  function closeAndRestore() {
    minimized.value = false
    const surface = close()
    reconcileSource()
    nextTick(async () => {
      if (await host?.restoreSurface?.(surface)) return
      host?.focusFallback?.()
    })
  }

  function illustrationEntryBrief(image = {}) {
    return image?.generationContext?.authoringVisualBrief
      || image?.authoringVisualBrief
      || image?.generationParams?.authoringVisualBrief
      || null
  }

  async function saveMaterial(image) {
    const result = await saveAuthoringIllustrationAsMaterial({
      image,
      brief: illustrationEntryBrief(image) || generationBrief.value,
      projectId: brief.value?.projectId || brief.value?.source?.projectId
    })
    notice.value = !result.ok
      ? '素材保存失败；图片候选仍保留，可直接重试保存。'
      : (result.reused ? '这张图片已经在素材库中。' : '已保存到素材库。')
  }

  function insertImage(image) {
    const entryBrief = illustrationEntryBrief(image)
    const live = host?.captureLiveSource?.()
    const entryFreshness = assessAuthoringVisualBriefFreshness(entryBrief, live || {})
    const source = entryBrief?.source || {}
    if (source.role !== 'manuscript') {
      notice.value = '当前来源是速记；可保存为素材，不能写入正文。'
      return
    }
    const validation = validateAuthoringIllustrationInsert({
      image,
      brief: entryBrief,
      freshness: entryFreshness,
      projectId: host?.projectId?.(),
      documentId: source.documentId
    })
    if (!validation.ok) {
      notice.value = validation.reason === 'media-asset-missing'
        ? '图片资产已缺失，不能插入正文。'
        : '原正文或当前场已经变化，这张候选不能再插入。'
      reconcileSource()
      return
    }
    const result = host?.insertMediaReference?.({
      projectId: source.projectId,
      documentId: source.documentId,
      mediaAssetId: validation.mediaAssetId,
      alt: String(image?.prompt || entryBrief?.prompt || '正文插画').replace(/\s+/g, ' ').slice(0, 120),
      sourceRefs: validation.sourceRefs,
      afterUnitId: source.unitId,
      expectedUnitRevision: source.unitRevision,
      expectedDocumentRevision: source.documentSchemaRevision
    }, entryBrief.pane)
    if (!result?.ok) {
      notice.value = '正文位置已变化，未写入图片引用。'
      reconcileSource()
      return
    }
    updateMediaAsset(validation.mediaAssetId, { status: 'accepted' })
    notice.value = '已插入正文；正文中只保存媒体引用。'
    nextTick(reconcileSource)
  }

  function generationStart(payload = {}) {
    activeJob = payload.job || payload
    notice.value = '正在生成；你可以取消，当前正文不会变化。'
  }

  function generationComplete(payload = {}) {
    if (activeJob?.jobId && payload?.job?.jobId && activeJob.jobId !== payload.job.jobId) return
    activeJob = null
    const currentFreshness = reconcileSource()
    notice.value = currentFreshness?.fresh
      ? '候选已生成。选择后可保存为素材或插入正文。'
      : '候选已生成，但来源已经更新；已禁止插入原正文。'
  }

  function generationError() {
    activeJob = null
    notice.value = '生成失败；画面描述和参考图仍保留。'
  }

  function generationCancel() {
    activeJob = null
    notice.value = '已取消生成；正文和素材均未写入。'
  }

  return {
    open,
    brief,
    liveSource,
    returnSurface,
    selectedSceneSourceIds,
    referenceCandidates,
    notice,
    generationBrief,
    freshness,
    minimized,
    blocking,
    start,
    reconcile,
    close,
    clear,
    loadReferenceCandidatesForBrief,
    freezeSource,
    freezeMobileSource,
    openWithPrepared,
    openIllustrator: () => openWithPrepared(),
    openForCharacter,
    openFromMobileTools,
    releaseMobileSource,
    reconcileSource,
    closeAndRestore,
    saveMaterial,
    insertImage,
    generationStart,
    generationComplete,
    generationError,
    generationCancel
  }
}

export default useAuthoringIllustrator
