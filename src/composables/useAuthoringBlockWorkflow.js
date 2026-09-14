import { computed, reactive, ref, shallowRef } from 'vue'
import { normalizeAuthoringFailure } from '../services/agents/authoring/authoringExecutionResult.js'
import { createExplorationDocument } from '../services/writing/authoringDocumentRepository.js'
import {
  AUTHORING_TURN_TASK_IDS,
  buildAuthoringTurnIntent
} from '../services/agents/authoring/authoringTurnContract.js'
import { shouldDispatchAuthoringObservers } from '../services/agents/authoring/authoringObserverDispatch.js'
import { getWritingMarkdownPosition } from '../services/writing/writingDocumentSchema.js'
import { getWritingBlockText } from '../../shared/writingBlockHistoryContract.js'

const RUN_FAILURE_MESSAGES = Object.freeze({
  aborted: '这一拍已取消',
  stale: '资料或目标已更新，请重新生成',
  timeout: '模型响应超时，可以重试这一拍',
  'grounding-insufficient': '现有资料不足以可靠生成这一拍',
  'loop-capped': '资料查询达到上限，本轮已停止',
  'invalid-result': '模型没有返回可用正文'
})

export function useAuthoringBlockWorkflow({
  selectedBookId,
  selectedChapterId,
  sceneProjection,
  activeDocumentSourceRef,
  isEmptyDocument,
  getTargetContext,
  defaultTarget,
  targetScopeKey,
  referenceTargetKey,
  setReferenceTargetKey,
  scheduleContextPreflight,
  preserveSceneIntents,
  clearRunReferences,
  clearSceneIntents,
  clearPendingDraft,
  cancelCopilot,
  closeIntervention,
  closeCharacterIf,
  cancelTask,
  getTurnContext,
  runTask,
  dispatchObservers,
  onObserverFailure,
  restoreSelection,
  blurEditor,
  focusInstruction,
  hasPendingAdoption,
  performAdoption,
  retryTaskPersist,
  afterRetryPersist,
  shouldCompleteFirstRun,
  completeFirstRun,
  getExplorationContext,
  refreshExplorations,
  onIfExplorationSaved,
  notify
}) {
  const preview = shallowRef(null)
  const draftText = ref('')
  const originalText = ref('')
  const previousText = ref('')
  const composer = reactive({
    open: false,
    target: null,
    failure: null,
    staleResult: null,
    initialInstruction: ''
  })
  const failure = shallowRef(null)
  const adoptionBusy = ref(false)
  let requestVersion = 0
  let explorationSavePending = false

  const people = computed(() => {
    const projection = sceneProjection.value || {}
    const byId = new Map()
    for (const person of [
      projection.viewpointCharacter,
      projection.activeActor,
      projection.dialogueTarget,
      ...(projection.presentCharacters || [])
    ]) {
      if (!person?.id && !person?.name) continue
      const id = person.id || person.name
      if (!byId.has(id)) byId.set(id, { id: person.id || '', name: person.name || '' })
    }
    return [...byId.values()]
  })
  const sourceRefs = computed(() => {
    const refs = [activeDocumentSourceRef()]
    if (sceneProjection.value?.sceneId) refs.push(`scene-thread:${sceneProjection.value.sceneId}`)
    return refs
  })

  function resolveTarget(target = {}) {
    const context = getTargetContext()
    const fallbackUnit = context.document?.content?.at(-1)
    const requestedUnitId = target.unitId || fallbackUnit?.attrs?.unitId || null
    const unit = (context.document?.content || [])
      .find((item) => String(item?.attrs?.unitId || '') === String(requestedUnitId || '')) || fallbackUnit || null
    const unitId = unit?.attrs?.unitId || null
    const node = (unit?.content || [])
      .find((item) => String(item?.attrs?.nodeId || '') === String(target.nodeId || '')) || unit?.content?.at(-1) || null
    const nodeId = node?.attrs?.nodeId || null
    const sameLiveNode = Boolean(nodeId && String(context.selection.nodeId || '') === String(nodeId))
    const nodeText = node ? getWritingBlockText(node) : ''
    const nodeEnd = nodeId ? getWritingMarkdownPosition(context.document, nodeId, nodeText.length) : null
    const caret = sameLiveNode && Number.isFinite(context.selection.end)
      ? context.selection.end
      : Number.isFinite(nodeEnd) ? nodeEnd : context.documentTextLength
    const cursorLocalOffset = sameLiveNode && Number.isFinite(Number(target.cursorLocalOffset))
      ? Math.max(0, Math.min(nodeText.length, Number(target.cursorLocalOffset)))
      : nodeText.length
    return Object.freeze({
      projectId: context.projectId,
      documentId: context.documentId,
      documentRole: context.documentRole,
      chapterId: context.chapterId,
      unitId,
      unitRevision: Number(unit?.attrs?.unitRevision || 0),
      nodeId,
      nodeRevision: Number(node?.attrs?.nodeRevision || 0),
      cursorLocalOffset,
      caret,
      markdownFrom: caret,
      markdownTo: caret,
      selectionBookmark: target.selectionBookmark || context.selectionBookmark,
      documentRevision: context.documentRevision,
      documentSchemaRevision: Number(context.document?.revision || 0)
    })
  }

  function targetIsCurrent(target) {
    if (!target) return false
    const context = getTargetContext()
    if (String(target.projectId || '') !== String(context.projectId)
      || String(target.documentId || '') !== String(context.documentId)
      || String(target.documentRole || '') !== context.documentRole
      || String(target.documentRevision || '') !== String(context.documentRevision)) return false
    const unit = (context.document?.content || [])
      .find((item) => String(item?.attrs?.unitId || '') === String(target.unitId || ''))
    if (!unit || Number(unit?.attrs?.unitRevision || 0) !== Number(target.unitRevision || 0)) return false
    const node = (unit.content || [])
      .find((item) => String(item?.attrs?.nodeId || '') === String(target.nodeId || ''))
    return Boolean(node && Number(node?.attrs?.nodeRevision || 0) === Number(target.nodeRevision || 0))
  }

  function currentVersion() {
    return requestVersion
  }

  function beginRequest() {
    requestVersion += 1
    return requestVersion
  }

  function invalidateRequest() {
    requestVersion += 1
    return requestVersion
  }

  function isCurrentRequest(version) {
    return version === requestVersion
  }

  function clearDraft() {
    preview.value = null
    draftText.value = ''
    originalText.value = ''
    previousText.value = ''
  }

  function resetComposer() {
    composer.open = false
    composer.target = null
    composer.failure = null
    composer.staleResult = null
    composer.initialInstruction = ''
  }

  function resetScope() {
    invalidateRequest()
    clearDraft()
    clearPendingDraft()
    resetComposer()
    failure.value = null
  }

  function open(target = defaultTarget(), options = {}) {
    const frozenTarget = resolveTarget(target || {})
    if (!frozenTarget.unitId && !isEmptyDocument()) return false
    const nextReferenceKey = targetScopeKey(frozenTarget)
    if (referenceTargetKey() && referenceTargetKey() !== nextReferenceKey) clearRunReferences()
    setReferenceTargetKey(nextReferenceKey)
    if (options.preserveSceneIntents) preserveSceneIntents(frozenTarget)
    else clearSceneIntents()
    cancelCopilot()
    closeIntervention()
    invalidateRequest()
    if (!options.preserveInstruction) composer.initialInstruction = ''
    composer.open = true
    composer.failure = null
    composer.staleResult = null
    composer.target = frozenTarget
    scheduleContextPreflight()
    blurEditor()
    focusInstruction()
    return true
  }

  function abandon({ shouldRestoreSelection = false } = {}) {
    if (hasPendingAdoption()) return false
    closeCharacterIf()
    const bookmark = composer.target?.selectionBookmark
    invalidateRequest()
    cancelTask()
    clearDraft()
    resetComposer()
    clearRunReferences()
    clearSceneIntents()
    if (shouldRestoreSelection) restoreSelection(bookmark)
    return true
  }

  function close() {
    return abandon({ shouldRestoreSelection: true })
  }

  function restoreDraft() {
    if (hasPendingAdoption()) return false
    draftText.value = originalText.value
    composer.failure = null
    composer.staleResult = null
    return true
  }

  function recordOutcome(outcome) {
    if (!outcome) return
    failure.value = outcome.ok ? null : normalizeAuthoringFailure(outcome)
  }

  async function execute(payload, version = currentVersion()) {
    const context = getTurnContext()
    if (context.worldbookStatus === 'missing') {
      notify('世界书已缺失，请先重新关联或解除绑定')
      return { ok: false, reason: 'worldbook-missing' }
    }
    if (!context.worldbookReady) {
      notify('正在切换世界书，请稍候再继续下一拍')
      return { ok: false, reason: 'worldbook-loading' }
    }
    const built = buildAuthoringTurnIntent({
      operation: payload.operation || 'next-passage',
      kind: payload.kind,
      actorId: payload.actorId || context.actorId,
      targetId: payload.targetId || context.targetId,
      viewpointCharacterId: context.viewpointCharacterId,
      instruction: payload.instruction || '',
      directorNote: payload.directorNote || '',
      sourceRefs: payload.sourceRefs?.length ? payload.sourceRefs : context.sourceRefs,
      selectedDirection: payload.selectedDirection || null
    })
    if (!built.ok) {
      notify(`这一拍无法提交：${built.reason}`)
      return { ok: false, text: '', reason: built.reason }
    }
    const turn = built.turn
    const taskId = turn.operation === 'rewrite-unit'
      ? AUTHORING_TURN_TASK_IDS.action
      : (turn.instruction || turn.selectedDirection)
          ? AUTHORING_TURN_TASK_IDS[turn.kind]
          : AUTHORING_TURN_TASK_IDS.continue
    const outcome = await runTask(taskId, {
      turn,
      targetOverride: payload.invocationTarget || null,
      authoringRunSession: payload.authoringRunSession || null
    })
    if (!isCurrentRequest(version)) {
      return { ok: false, reason: 'superseded', phase: 'provider', code: 'AUTHORING_SUPERSEDED', retryable: true }
    }
    recordOutcome(outcome)
    if (shouldDispatchAuthoringObservers(outcome)) {
      try {
        await dispatchObservers({ outcome, turn })
      } catch {
        onObserverFailure()
      }
    }
    return outcome
  }

  async function run(payload, version = currentVersion()) {
    if (!selectedBookId.value || !selectedChapterId.value) return { ok: false, text: '', reason: 'no-target' }
    try {
      return await execute(payload, version)
    } catch (error) {
      const status = error?.contextOutcome?.status || ''
      if (isCurrentRequest(version)) {
        failure.value = normalizeAuthoringFailure({
          phase: status === 'stale' ? 'stale' : status === 'grounding-insufficient' ? 'context' : 'provider',
          code: error?.code || 'AUTHORING_RUNTIME_ERROR',
          message: RUN_FAILURE_MESSAGES[status] || '这一拍执行出错',
          retryable: error?.contextOutcome?.retryable !== false
        })
      }
      throw error
    }
  }

  async function submit({ target, turn, authorNote }) {
    const version = beginRequest()
    if (!targetIsCurrent(target)) {
      composer.failure = normalizeAuthoringFailure({
        phase: 'stale',
        code: 'AUTHORING_TARGET_STALE',
        message: '打开推演后正文或目标文本块已变化，请在新的落笔处重新打开',
        retryable: true
      })
      return
    }
    const outcome = await run({
      ...turn,
      directorNote: authorNote || turn.directorNote,
      sourceRefs: turn.sourceRefs,
      invocationTarget: target
    }, version)
    if (!isCurrentRequest(version)) return
    composer.failure = outcome?.ok ? null : normalizeAuthoringFailure(outcome)
    if (outcome?.reason === 'stale' || outcome?.reason === 'target-unit-stale') {
      composer.staleResult = {
        text: outcome.text || '',
        target,
        adoptable: false,
        contextManifest: outcome.contextManifest || null,
        contextReceipt: outcome.contextReceipt || null,
        contextCallReceipts: Array.isArray(outcome.contextCallReceipts) ? outcome.contextCallReceipts : [],
        dependencyIssues: outcome.dependencyIssues || []
      }
    }
    if (outcome?.ok && !outcome.preview) composer.open = false
  }

  async function accept() {
    if (adoptionBusy.value) return false
    adoptionBusy.value = true
    const guided = shouldCompleteFirstRun()
    try {
      const ok = await performAdoption()
      if (ok && guided) completeFirstRun()
      return ok
    } finally {
      adoptionBusy.value = false
    }
  }

  async function retryPersist() {
    if (hasPendingAdoption()) {
      const saved = await accept()
      failure.value = saved ? null : composer.failure
      return saved
    }
    const outcome = await Promise.resolve(retryTaskPersist())
    if (!outcome.ok) {
      failure.value = outcome
      return false
    }
    failure.value = null
    try {
      await afterRetryPersist(outcome)
    } catch {
      onObserverFailure()
    }
    return true
  }

  async function saveAsExploration() {
    if (explorationSavePending) return false
    const text = String(draftText.value || '').trim()
    if (!text || !selectedBookId.value) return false
    explorationSavePending = true
    const projectId = selectedBookId.value
    const chapterId = selectedChapterId.value
    const version = currentVersion()
    const context = getExplorationContext()
    const title = `试稿 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString().slice(0, 5)}`
    let result
    try {
      result = await createExplorationDocument(projectId, {
        title,
        content: context.note ? `${text}\n\n---\n${context.note}` : text,
        sourceRefs: chapterId ? [`chapter:${chapterId}`] : []
      })
    } catch {
      result = { ok: false }
    } finally {
      explorationSavePending = false
    }
    if (selectedBookId.value !== projectId || selectedChapterId.value !== chapterId
      || !isCurrentRequest(version) || String(draftText.value || '').trim() !== text) return false
    if (!result?.ok) {
      notify('留作构思保存失败，请重试')
      return false
    }
    refreshExplorations(projectId)
    draftText.value = ''
    if (context.ifExperiment) {
      preview.value = null
      onIfExplorationSaved(context.ifExperiment)
      notify('已留作构思，另一支仍保留在本次对照中')
      return true
    }
    abandon({ shouldRestoreSelection: true })
    notify('已留作构思，可在左栏构思区查看')
    return true
  }

  return {
    preview,
    draftText,
    originalText,
    previousText,
    composer,
    failure,
    adoptionBusy,
    people,
    sourceRefs,
    resolveTarget,
    targetIsCurrent,
    currentVersion,
    beginRequest,
    invalidateRequest,
    isCurrentRequest,
    clearDraft,
    resetScope,
    open,
    abandon,
    close,
    dismiss: close,
    restoreDraft,
    recordOutcome,
    run,
    submit,
    accept,
    retryPersist,
    saveAsExploration
  }
}
