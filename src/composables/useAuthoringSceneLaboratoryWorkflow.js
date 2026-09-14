import { computed, reactive, ref } from 'vue'
import {
  selectAuthoringSceneLaboratoryDirection,
  validateAuthoringSceneLaboratoryRun
} from '../services/agents/authoring/authoringSceneLaboratoryRun.js'

function failureMessage(result = {}) {
  if (result.reason === 'scene-session-prepare-failed' || result.reason === 'scene-session-prepare-threw') {
    return '当前落笔处或引用已经变化，请核对后重试。'
  }
  if (result.reason === 'scene-pressure-conflict') return '当前场存在互相冲突的依据，请先调整当前场。'
  if (result.reason?.includes('json') || result.reason?.includes('direction')) {
    return '返回的方向不完整或过于相似，已保留现场，可以单独重试。'
  }
  return '规划方向时连接中断，已保留冻结现场，可以单独重试。'
}

export function useAuthoringSceneLaboratoryWorkflow({
  boundWorldbook,
  rehearsal,
  notifyPendingDraft,
  isBusy,
  hasPendingDrafts,
  resolveTarget,
  getDefaultTarget,
  isEmptyDocument,
  prepareSurface,
  restoreScroll,
  getRunner,
  collectLiveDependencies,
  createDraft,
  onRunReady,
  resetCharacterIf,
  clearSceneIntents,
  restoreSelection
}) {
  const laboratory = reactive({
    open: false,
    phase: 'preparing-context',
    selectedDirectionId: '',
    target: null,
    run: null,
    failedSession: null,
    failedPressureProjection: null,
    instruction: '',
    notice: '',
    returnScrollTop: null
  })
  const appendRequirement = ref('')
  let requestVersion = 0
  let abortController = null

  const directions = computed(() => laboratory.run?.directionSet?.directions || [])
  const pressure = computed(() => {
    const projection = laboratory.run?.pressureProjection || laboratory.failedPressureProjection
    if (!projection) return null
    if (laboratory.phase === 'insufficient') {
      return { missing: '当前场还缺少明确的目标、冲突、未决事件或地点规则。补充一项后再试。' }
    }
    const directionPressure = laboratory.run?.directionSet?.pressure
    const seed = projection.pressureSeeds?.[0]
    const evidenceByRef = new Map((projection.evidence || []).flatMap((item) => (
      [item.ref, ...(item.sourceRefs || [])].map((ref) => [String(ref), item])
    )))
    const seenEvidence = new Set()
    const evidence = (seed?.evidenceRefs || []).map((ref) => {
      const item = evidenceByRef.get(String(ref))
      const worldbookRef = [String(ref), item?.ref, ...(item?.sourceRefs || [])]
        .map(String)
        .find((candidate) => candidate.startsWith('worldbook-entry:')) || ''
      const displayKey = worldbookRef || String(item?.ref || ref)
      if (seenEvidence.has(displayKey)) return null
      seenEvidence.add(displayKey)
      const worldbookId = worldbookRef.slice('worldbook-entry:'.length)
      const entry = worldbookId
        ? (boundWorldbook.value?.entries || []).find((candidate) => String(candidate?.id || '') === worldbookId)
        : null
      return {
        id: String(ref),
        label: item?.label || entry?.name || '本场依据',
        kind: entry?.type || '',
        entityId: entry?.id || ''
      }
    }).filter(Boolean).slice(0, 4)
    return {
      statement: directionPressure?.statement || seed?.summary || '根据当前落笔处的有效依据整理本场方向。',
      evidence
    }
  })

  function cancelRequest() {
    requestVersion += 1
    abortController?.abort()
    abortController = null
  }

  function beginRequest() {
    cancelRequest()
    abortController = new AbortController()
    return { version: requestVersion, signal: abortController.signal }
  }

  function applyResult(result, version) {
    if (version !== requestVersion || !laboratory.open) return false
    if (!result?.ok) {
      laboratory.phase = 'failed'
      laboratory.run = null
      laboratory.failedSession = result?.session || null
      laboratory.failedPressureProjection = result?.pressureProjection || null
      laboratory.notice = failureMessage(result)
      return false
    }
    laboratory.run = result.run
    laboratory.failedSession = null
    laboratory.failedPressureProjection = null
    laboratory.phase = result.run.phase
    laboratory.selectedDirectionId = result.run.selectedDirectionId || ''
    laboratory.notice = ''
    if (['ready', 'insufficient'].includes(result.run.phase)) {
      rehearsal.start(result.run)
      onRunReady(result.run)
    }
    return true
  }

  async function open({ target = null, instruction = '' } = {}) {
    if (isBusy()) return false
    if (hasPendingDrafts()) {
      notifyPendingDraft()
      return false
    }
    const frozenTarget = resolveTarget(target || getDefaultTarget() || {})
    if (!frozenTarget.unitId && !isEmptyDocument()) return false
    rehearsal.clear()
    prepareSurface()
    const request = beginRequest()
    laboratory.open = true
    laboratory.phase = 'preparing-context'
    laboratory.selectedDirectionId = ''
    laboratory.target = frozenTarget
    laboratory.run = null
    laboratory.failedSession = null
    laboratory.failedPressureProjection = null
    laboratory.instruction = String(instruction || '').trim()
    laboratory.notice = ''
    restoreScroll(laboratory.returnScrollTop)
    const result = await getRunner().prepare({
      taskId: 'authoring.advance',
      request: {
        intent: {
          instruction: laboratory.instruction,
          operation: 'next-passage',
          invocationTarget: frozenTarget
        }
      },
      signal: request.signal,
      onPhase: (phase) => {
        if (request.version === requestVersion && laboratory.open) laboratory.phase = phase
      }
    })
    return applyResult(result, request.version)
  }

  function selectDirection(directionId) {
    if (!directionId) {
      laboratory.selectedDirectionId = ''
      laboratory.phase = 'ready'
      laboratory.notice = ''
      return true
    }
    const selected = selectAuthoringSceneLaboratoryDirection(laboratory.run, directionId)
    if (!selected.ok) return false
    laboratory.run = selected.run
    laboratory.selectedDirectionId = selected.run.selectedDirectionId
    laboratory.phase = selected.run.phase
    laboratory.notice = ''
    return true
  }

  async function confirmDirection() {
    if (!laboratory.selectedDirectionId || !laboratory.run || isBusy()) return false
    const version = requestVersion
    const run = laboratory.run
    const target = laboratory.target
    laboratory.phase = 'validating-dependencies'
    laboratory.notice = ''
    const validation = await validateAuthoringSceneLaboratoryRun(run, collectLiveDependencies)
    if (version !== requestVersion || !laboratory.open) return false
    if (!validation.ok) {
      laboratory.phase = 'failed'
      laboratory.failedSession = null
      laboratory.failedPressureProjection = null
      laboratory.notice = validation.reason === 'scene-session-stale'
        ? '落笔处或本次依据已变化，未调用正文模型。请重新核对本场方向。'
        : '未能复核本次冻结依据，正文模型没有启动。'
      return false
    }
    const requirement = appendRequirement.value
    laboratory.phase = 'generating-prose'
    const outcome = await createDraft({ target, validation, instruction: requirement })
    if (version !== requestVersion || !laboratory.open) return false
    if (outcome?.preview) {
      if (appendRequirement.value === requirement) appendRequirement.value = ''
      close({ restoreSelection: false, clearIntents: false })
      return true
    }
    laboratory.phase = 'direction-selected'
    laboratory.notice = outcome?.reason === 'stale'
      ? '本场依据在生成期间已更新，草稿未进入可采纳状态。'
      : '本次没有生成可用正文，已保留所选方向。'
    return false
  }

  function close({ restoreSelection: shouldRestoreSelection = true, clearIntents = true } = {}) {
    if (!laboratory.open) return false
    const bookmark = laboratory.target?.selectionBookmark
    resetCharacterIf()
    cancelRequest()
    laboratory.open = false
    laboratory.phase = 'preparing-context'
    laboratory.selectedDirectionId = ''
    laboratory.target = null
    laboratory.run = null
    laboratory.failedSession = null
    laboratory.failedPressureProjection = null
    laboratory.instruction = ''
    laboratory.notice = ''
    laboratory.returnScrollTop = null
    if (clearIntents) clearSceneIntents()
    if (shouldRestoreSelection) restoreSelection(bookmark)
    return true
  }

  async function retryDirections() {
    if (laboratory.phase !== 'failed' || !laboratory.failedSession || !laboratory.failedPressureProjection) {
      return open({ target: laboratory.target, instruction: laboratory.instruction })
    }
    const request = beginRequest()
    laboratory.notice = ''
    const result = await getRunner().retryDirections({
      session: laboratory.failedSession,
      pressureProjection: laboratory.failedPressureProjection,
      instruction: laboratory.instruction,
      signal: request.signal,
      onPhase: (phase) => {
        if (request.version === requestVersion && laboratory.open) laboratory.phase = phase
      }
    })
    return applyResult(result, request.version)
  }

  return {
    laboratory,
    appendRequirement,
    directions,
    pressure,
    open,
    close,
    cancelRequest,
    selectDirection,
    confirmDirection,
    retryDirections
  }
}
