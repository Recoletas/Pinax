import { computed, ref, shallowRef } from 'vue'
import {
  assessAuthoringVisualBriefFreshness,
  createAuthoringVisualBrief,
  finalizeAuthoringVisualBrief
} from '../services/agents/authoring/authoringVisualBrief.js'
import { listActiveNarrativeAssets } from '../services/narrativeAssets.js'
import { hydrateNarrativeImageAssets } from '../services/media/narrativeImageAssetBridge.js'

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

export function useAuthoringIllustrator() {
  const open = ref(false)
  const brief = shallowRef(null)
  const liveSource = shallowRef(null)
  const returnSurface = shallowRef(null)
  const selectedSceneSourceIds = ref([])
  const referenceCandidates = ref([])
  const notice = ref('')
  let referenceLoadRevision = 0

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
    start,
    reconcile,
    close,
    clear,
    loadReferenceCandidatesForBrief
  }
}

export default useAuthoringIllustrator
