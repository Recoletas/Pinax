import {
  selectAuthoringInterventionRehearsalDirection
} from '../services/agents/authoring/authoringInterventionRehearsal.js'
import {
  discardAuthoringInterventionGhost,
  editAuthoringInterventionGhost
} from '../services/agents/authoring/authoringInterventionRehearsalRun.js'

function preparationFailureMessage(reason = '') {
  if (reason === 'knowledge-required-source-missing' || reason.includes('target')) {
    return '原文位置已经变化，请回到正文重新打开。'
  }
  if (reason === 'intervention-session-aborted') return ''
  if (reason.includes('evidence') || reason.includes('position')) {
    return '暂时无法核对这项变化的依据，表单已保留，可以重试。'
  }
  return '这项条件还无法建立可靠的影响检查，请调整后重试。'
}

// Owns cancellable provider/session transitions for an intervention. Applying
// a ghost to manuscript data remains a separate persistence transaction.
export function useAuthoringInterventionWorkflow({
  state,
  scopeResult,
  ghosts,
  clearResult,
  isAuthoringTaskBusy,
  getSessionRunner,
  getRehearsalRunner,
  selectGhost,
  close
}) {
  let requestVersion = 0
  let abortController = null

  function cancel() {
    abortController?.abort()
    abortController = null
    requestVersion += 1
  }

  function beginRequest() {
    cancel()
    abortController = new AbortController()
    return { version: requestVersion, signal: abortController.signal }
  }

  function isCurrent(version) {
    return version === requestVersion && state.open
  }

  async function prepare(input = {}) {
    if (!state.open || isAuthoringTaskBusy()) return false
    const request = beginRequest()
    state.phase = 'preparing'
    state.notice = ''
    state.candidateReviews = {}
    state.rehearsalSelection = null
    clearResult()
    const result = await getSessionRunner().prepare(input, { signal: request.signal })
    if (!isCurrent(request.version)) return false
    if (!result?.ok) {
      state.phase = 'failed'
      state.session = null
      state.evidenceCount = 0
      state.notice = preparationFailureMessage(result?.reason || '')
      return false
    }
    state.phase = 'ready'
    state.session = result.session
    state.evidenceCount = result.session.evidenceEnvelope?.evidence?.length || 0
    state.notice = ''
    return true
  }

  function reviewCandidate({ groupId = '', decision = '' } = {}) {
    if (state.phase !== 'ready' || !state.session) return false
    const candidate = (state.session.candidateGroups || [])
      .find((group) => String(group?.id || '') === String(groupId || ''))
    if (!candidate || !['exclude', 'keep'].includes(decision)) return false
    state.candidateReviews = { ...state.candidateReviews, [candidate.id]: decision }
    state.rehearsalSelection = null
    clearResult()
    return true
  }

  function selectDirection(directionId = '') {
    if (state.phase !== 'ready' || !scopeResult.value?.ok) return false
    const selected = selectAuthoringInterventionRehearsalDirection(scopeResult.value.scope, directionId)
    if (!selected?.ok) return false
    state.rehearsalSelection = selected.selection
    clearResult()
    return true
  }

  async function rehearse() {
    if (state.phase !== 'ready' || !state.session || !state.rehearsalSelection) return false
    const request = beginRequest()
    state.phase = 'generating'
    state.notice = ''
    clearResult()
    const outcome = await getRehearsalRunner().run({
      session: state.session,
      selection: state.rehearsalSelection
    }, { signal: request.signal })
    if (!isCurrent(request.version)) return false
    if (!outcome?.ok) {
      state.phase = outcome?.reason === 'intervention-rehearsal-stale' ? 'stale' : 'ready'
      state.notice = outcome?.reason === 'intervention-rehearsal-stale'
        ? '原文或依据已经变化，请重新核对后再生成。'
        : outcome?.reason === 'intervention-rehearsal-aborted'
          ? ''
          : '修改草稿生成失败，冻结范围仍保留，可以重试。'
      return false
    }
    state.rehearsalResult = outcome.result
    state.phase = 'ghosts'
    state.notice = ''
    const firstGhost = outcome.result.drafts[0]
    if (firstGhost) await selectGhost(firstGhost.id)
    return true
  }

  function updateGhost({ ghostId = '', text = '' } = {}) {
    if (state.pendingAdoption) return false
    const updated = editAuthoringInterventionGhost(state.rehearsalResult, ghostId, text)
    if (!updated.ok) return false
    state.rehearsalResult = updated.result
    return true
  }

  async function retryGhost(ghostId = '') {
    if (state.phase !== 'ghosts' || state.retryingGhostId || state.pendingAdoption) return false
    const request = beginRequest()
    state.retryingGhostId = ghostId
    const outcome = await getRehearsalRunner().retry({
      session: state.session,
      result: state.rehearsalResult,
      ghostId
    }, { signal: request.signal })
    if (!isCurrent(request.version)) return false
    state.retryingGhostId = ''
    if (!outcome?.ok) {
      if (outcome?.reason === 'intervention-rehearsal-stale') {
        state.notice = '原文或依据已经变化；已有草稿保留，但不能继续重试。'
        state.rehearsalResult = Object.freeze({
          ...state.rehearsalResult,
          status: 'stale',
          drafts: Object.freeze(ghosts.value.map((draft) => Object.freeze({ ...draft, status: 'stale' })))
        })
      }
      return false
    }
    state.rehearsalResult = outcome.result
    return true
  }

  async function discardGhost(ghostId = '') {
    if (state.pendingAdoption) return false
    const currentIndex = ghosts.value.findIndex((ghost) => ghost.id === ghostId)
    const discarded = discardAuthoringInterventionGhost(state.rehearsalResult, ghostId)
    if (!discarded.ok) return false
    state.rehearsalResult = discarded.result
    if (!discarded.result.drafts.length) return close({ restoreSelection: true })
    const nextGhost = discarded.result.drafts[Math.min(Math.max(0, currentIndex), discarded.result.drafts.length - 1)]
    return selectGhost(nextGhost.id)
  }

  function markDocumentStale() {
    state.phase = 'stale'
    state.rehearsalSelection = null
    clearResult()
    state.notice = '原文已变化，刚才冻结的影响依据已经过期；表单仍保留，请重新核对。'
  }

  async function reconcileKnowledgeChange() {
    const session = state.session
    if (!state.open || !session || state.pendingAdoption || state.adoptingGhostId) return false
    const request = beginRequest()
    state.phase = 'preparing'
    state.notice = '项目资料已变化，正在复核这项条件……'
    const result = await getSessionRunner().reconcile(session, { signal: request.signal })
    if (!isCurrent(request.version)) return false
    if (!result?.ok || result.stale) {
      state.phase = 'stale'
      state.rehearsalSelection = null
      clearResult()
      state.notice = '原文或依据已经变化，表单仍保留；请重新核对后再继续。'
      return false
    }
    state.phase = 'ready'
    state.notice = ''
    return true
  }

  return {
    cancel,
    prepare,
    reviewCandidate,
    selectDirection,
    rehearse,
    updateGhost,
    retryGhost,
    discardGhost,
    markDocumentStale,
    reconcileKnowledgeChange
  }
}
