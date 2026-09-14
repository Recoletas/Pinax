import { computed, ref, shallowRef, watch } from 'vue'
import {
  fingerprintSceneAnchors,
  normalizeSceneAnchors,
  removeSceneAnchor,
  upsertSceneAnchor
} from '../services/agents/authoring/authoringSceneAnchors.js'
import { buildSceneCurationCandidates } from '../services/agents/authoring/authoringWorldbookSceneAdapter.js'

function persistentSnapshot(draft = {}) {
  return {
    presentCharacterIds: [...(draft.presentCharacterIds || [])].map(String).sort(),
    locationId: String(draft.locationId || ''),
    viewpointCharacterId: String(draft.viewpointCharacterId || ''),
    time: {
      label: String(draft.time?.label || ''),
      period: String(draft.time?.period || '')
    }
  }
}

export function useAuthoringSceneWorkflow({
  activeWritingUnitId,
  boundWorldbook,
  getBookWorldbookStatus,
  inspectorDetailState,
  lastSceneAnchorUndoReceipt,
  sceneAnchors,
  selectedBookId,
  selectedBookWorldbookId,
  selectedChapterId,
  getDocumentRevision,
  persistChapter,
  closeSceneDetail,
  reopenSceneCuration,
  getSceneAnchorStatus,
  setSceneDetailNotice,
  notify,
  onScopeInvalidated = () => {}
}) {
  const sceneCurationDraft = ref(null)
  const sceneCurationBaseline = shallowRef(null)
  const sceneCurationBusy = ref(false)
  const sceneCurationError = shallowRef(null)
  const curationLocationQuery = ref('')
  const curationPeopleQuery = ref('')

  const sceneCurationPreviewOpen = computed(() => (
    Boolean(sceneCurationDraft.value?.unitId)
    && inspectorDetailState.value?.kind === 'scene-edit'
  ))
  const sceneCurationTarget = computed(() => (
    sceneCurationPreviewOpen.value
      ? { unitId: sceneCurationDraft.value.unitId }
      : null
  ))
  const sceneCurationHasUnsavedChanges = computed(() => (
    Boolean(sceneCurationDraft.value && sceneCurationBaseline.value)
    && JSON.stringify(persistentSnapshot(sceneCurationDraft.value))
      !== JSON.stringify(sceneCurationBaseline.value)
  ))
  const sceneCurationCanUndo = computed(() => (
    lastSceneAnchorUndoReceipt.value?.type === 'manual-edit'
    && fingerprintSceneAnchors(sceneAnchors.value) === lastSceneAnchorUndoReceipt.value.afterFingerprint
  ))
  const sceneCurationCanRestoreInheritance = computed(() => (
    Boolean(sceneCurationDraft.value?.unitId)
    && sceneCurationDraft.value?.unitId === activeWritingUnitId.value
    && sceneAnchors.value.some((anchor) => (
      String(anchor?.unitId || '') === String(sceneCurationDraft.value?.unitId || '')
      && !anchor?.status
    ))
  ))

  const curationCharacterCandidates = computed(() => buildSceneCurationCandidates({
    axis: 'character',
    worldbook: boundWorldbook.value,
    query: curationPeopleQuery.value,
    selectedIds: sceneCurationDraft.value?.presentCharacterIds || []
  }))
  const curationLocationCandidates = computed(() => buildSceneCurationCandidates({
    axis: 'location',
    worldbook: boundWorldbook.value,
    query: curationLocationQuery.value,
    selectedIds: sceneCurationDraft.value?.locationId ? [sceneCurationDraft.value.locationId] : []
  }))
  const curationWorldbookCharacterIds = computed(() => new Set(
    (boundWorldbook.value?.entries || [])
      .filter((entry) => entry?.type === 'character')
      .map((entry) => String(entry?.id || '')).filter(Boolean)
  ))
  const curationWorldbookLocationIds = computed(() => new Set(
    (boundWorldbook.value?.entries || [])
      .filter((entry) => entry?.type === 'location')
      .map((entry) => String(entry?.id || '')).filter(Boolean)
  ))
  const curationMissingCharacterIds = computed(() => (
    getBookWorldbookStatus()?.status === 'bound'
      ? (sceneCurationDraft.value?.presentCharacterIds || [])
        .filter((id) => !curationWorldbookCharacterIds.value.has(String(id)))
      : []
  ))
  const curationMissingLocationId = computed(() => {
    const id = String(sceneCurationDraft.value?.locationId || '')
    return getBookWorldbookStatus()?.status === 'bound'
      && id
      && !curationWorldbookLocationIds.value.has(id)
      ? id
      : ''
  })

  function beginSceneCuration(draft) {
    sceneCurationDraft.value = draft
    sceneCurationBaseline.value = persistentSnapshot(draft)
    curationLocationQuery.value = ''
    curationPeopleQuery.value = ''
    sceneCurationError.value = null
  }

  function discardSceneCurationDraft() {
    sceneCurationDraft.value = null
    sceneCurationBaseline.value = null
    sceneCurationError.value = null
    curationLocationQuery.value = ''
    curationPeopleQuery.value = ''
  }

  function handleCurationDraftUpdate(draft) {
    if (draft) sceneCurationDraft.value = draft
  }

  function handleCurationSearch({ axis, query }) {
    if (axis === 'location') curationLocationQuery.value = String(query || '')
    else curationPeopleQuery.value = String(query || '')
  }

  function commitSceneAnchorDraft(draft) {
    if (
      String(draft?.projectId || '') !== String(selectedBookId.value || '')
      || String(draft?.chapterId || '') !== String(selectedChapterId.value || '')
      || String(draft?.worldbookId || '') !== String(selectedBookWorldbookId.value || '')
      || String(draft?.anchorFingerprint || '') !== fingerprintSceneAnchors(sceneAnchors.value)
    ) {
      return { ok: false, reason: 'stale' }
    }
    const result = upsertSceneAnchor({
      anchors: sceneAnchors.value,
      anchor: {
        ...draft,
        unitId: draft.unitId || activeWritingUnitId.value,
        worldbookId: selectedBookWorldbookId.value
      },
      expectedDocumentRevision: draft.documentRevision,
      liveDocumentRevision: getDocumentRevision()
    })
    if (!result.ok) return result
    const previousAnchors = sceneAnchors.value
    const beforeFingerprint = fingerprintSceneAnchors(previousAnchors)
    sceneAnchors.value = result.anchors
    if (!persistChapter()) {
      sceneAnchors.value = previousAnchors
      return { ok: false, reason: 'persist' }
    }
    lastSceneAnchorUndoReceipt.value = {
      beforeFingerprint,
      afterFingerprint: fingerprintSceneAnchors(sceneAnchors.value),
      previousAnchors,
      type: 'manual-edit',
      at: Date.now()
    }
    return result
  }

  function commitSceneCuration({ closeAfterSave = true } = {}) {
    const draft = sceneCurationDraft.value
    if (!draft || sceneCurationBusy.value) return false
    if (getBookWorldbookStatus()?.status === 'missing') {
      sceneCurationError.value = { phase: 'validation', message: '原世界书不可用，请先重新关联或解除关联' }
      return false
    }
    if ((draft.presentCharacterIds || []).length > 8) {
      sceneCurationError.value = { phase: 'validation', message: '当前场最多保留 8 位在场人物，请先移除多余人物' }
      return false
    }
    if (curationMissingCharacterIds.value.length || curationMissingLocationId.value) {
      sceneCurationError.value = { phase: 'validation', message: '请先移除或改选失效的人物与地点引用' }
      return false
    }
    sceneCurationBusy.value = true
    let result
    try {
      result = commitSceneAnchorDraft({ ...draft, plannedCharacterIds: [] })
    } finally {
      sceneCurationBusy.value = false
    }
    if (!result.ok) {
      sceneCurationError.value = {
        phase: result.reason,
        message: result.reason === 'stale'
          ? '文档已变化，请核对当前落笔处后重试'
          : result.reason === 'persist'
            ? '现场未保存，已恢复原状态；草稿仍保留，可重试'
            : '无法保存这份现场调整'
      }
      return false
    }
    discardSceneCurationDraft()
    if (closeAfterSave) closeSceneDetail?.()
    return true
  }

  function handleCurationSave() {
    return commitSceneCuration({ closeAfterSave: true })
  }

  function handleCurationCancel() {
    discardSceneCurationDraft()
    closeSceneDetail?.()
  }

  function undoSceneAnchorCommit() {
    const receipt = lastSceneAnchorUndoReceipt.value
    if (!receipt || receipt.type !== 'manual-edit') return false
    if (fingerprintSceneAnchors(sceneAnchors.value) !== receipt.afterFingerprint) return false
    const appliedAnchors = sceneAnchors.value
    sceneAnchors.value = normalizeSceneAnchors(receipt.previousAnchors)
    if (!persistChapter()) {
      sceneAnchors.value = appliedAnchors
      notify?.('当前场撤销保存失败，已恢复撤销前状态')
      return false
    }
    lastSceneAnchorUndoReceipt.value = null
    return true
  }

  function handleCurationUndo() {
    if (!undoSceneAnchorCommit()) return false
    reopenSceneCuration?.()
    setSceneDetailNotice?.('已撤销上一次现场保存。')
    return true
  }

  function handleCurationRestoreInheritance() {
    const draft = sceneCurationDraft.value
    if (!draft || sceneCurationBusy.value) return false
    if (
      String(draft.projectId || '') !== String(selectedBookId.value || '')
      || String(draft.chapterId || '') !== String(selectedChapterId.value || '')
      || String(draft.anchorFingerprint || '') !== fingerprintSceneAnchors(sceneAnchors.value)
    ) {
      sceneCurationError.value = { phase: 'stale', message: '现场锚点已变化，请重新打开当前场后再操作' }
      return false
    }
    const result = removeSceneAnchor({
      anchors: sceneAnchors.value,
      unitId: draft.unitId,
      expectedDocumentRevision: draft.documentRevision,
      liveDocumentRevision: getDocumentRevision()
    })
    if (!result.ok) {
      sceneCurationError.value = {
        phase: result.reason,
        message: result.reason === 'stale'
          ? '文档已变化，请核对当前落笔处后重试'
          : '当前落笔处没有可移除的现场'
      }
      return false
    }
    const previousAnchors = sceneAnchors.value
    sceneAnchors.value = result.anchors
    if (!persistChapter()) {
      sceneAnchors.value = previousAnchors
      sceneCurationError.value = { phase: 'persist', message: '现场未改变；章节保存失败，可重试' }
      return false
    }
    lastSceneAnchorUndoReceipt.value = {
      beforeFingerprint: fingerprintSceneAnchors(previousAnchors),
      afterFingerprint: fingerprintSceneAnchors(sceneAnchors.value),
      previousAnchors,
      type: 'manual-edit',
      at: Date.now()
    }
    reopenSceneCuration?.()
    setSceneDetailNotice?.(getSceneAnchorStatus?.() === 'inherited'
      ? '当前落笔处已恢复沿用前文。'
      : '已移除当前落笔处的独立现场。')
    return true
  }

  watch([selectedBookId, selectedChapterId, activeWritingUnitId, selectedBookWorldbookId], () => {
    const draft = sceneCurationDraft.value
    if (!draft) return
    const stillCurrent = (
      String(draft.projectId || '') === String(selectedBookId.value || '')
      && String(draft.chapterId || '') === String(selectedChapterId.value || '')
      && String(draft.unitId || '') === String(activeWritingUnitId.value || '')
      && String(draft.worldbookId || '') === String(selectedBookWorldbookId.value || '')
    )
    if (stillCurrent) return
    discardSceneCurationDraft()
    if (inspectorDetailState.value?.kind === 'scene-edit') inspectorDetailState.value = null
    onScopeInvalidated()
  })

  return {
    beginSceneCuration,
    curationCharacterCandidates,
    curationLocationCandidates,
    curationMissingCharacterIds,
    curationMissingLocationId,
    discardSceneCurationDraft,
    handleCurationCancel,
    handleCurationDraftUpdate,
    handleCurationRestoreInheritance,
    handleCurationSave,
    handleCurationSearch,
    handleCurationUndo,
    sceneCurationBaseline,
    sceneCurationBusy,
    sceneCurationCanRestoreInheritance,
    sceneCurationCanUndo,
    sceneCurationDraft,
    sceneCurationError,
    sceneCurationHasUnsavedChanges,
    sceneCurationPreviewOpen,
    sceneCurationTarget
  }
}
