import { computed, reactive, ref, shallowRef } from 'vue'
import { createAuthoringInterventionRehearsalScope } from '../services/agents/authoring/authoringInterventionRehearsal.js'

function evidenceProjection(session, groups, reviewStatus = {}) {
  const evidenceByRef = new Map((session?.evidenceEnvelope?.evidence || [])
    .map((item) => [String(item?.sourceRef || ''), item]))
  return (groups || []).map((group) => ({
    ...group,
    ...(Object.prototype.hasOwnProperty.call(reviewStatus, group.id)
      ? { reviewStatus: reviewStatus[group.id] }
      : {}),
    evidence: group.evidenceRefs.map((sourceRef) => {
      const item = evidenceByRef.get(String(sourceRef))
      return {
        sourceRef,
        label: item?.label || '正文依据',
        excerpt: item?.excerpt || ''
      }
    })
  }))
}

// Session-local state for “change this condition”. Provider execution and
// manuscript persistence remain injected by Authoring; projections and reset
// invariants live together here so stale ghosts cannot survive a new session.
export function useAuthoringInterventionState({ selectedChapterId }) {
  const composer = reactive({
    open: false,
    phase: 'draft',
    target: null,
    originalText: '',
    session: null,
    notice: '',
    evidenceCount: 0,
    candidateReviews: {},
    rehearsalSelection: null,
    rehearsalResult: null,
    activeGhostId: '',
    retryingGhostId: '',
    adoptingGhostId: '',
    pendingAdoption: null,
    persistError: ''
  })
  const ghostTeleportReady = ref(false)
  const lastUmbrellaReceipt = shallowRef(null)

  const impactGroups = computed(() => evidenceProjection(
    composer.session,
    composer.session?.impactGroups
  ))
  const candidateGroups = computed(() => evidenceProjection(
    composer.session,
    composer.session?.candidateGroups,
    composer.candidateReviews
  ))
  const candidateReviewPendingCount = computed(() => (
    (composer.session?.candidateGroups || []).filter((group) => !composer.candidateReviews[group.id]).length
  ))
  const rehearsalScopeResult = computed(() => createAuthoringInterventionRehearsalScope({
    session: composer.session,
    candidateReviews: composer.candidateReviews
  }))
  const rehearsalDirections = computed(() => (
    rehearsalScopeResult.value?.ok ? rehearsalScopeResult.value.scope.directions : []
  ))
  const ghosts = computed(() => composer.rehearsalResult?.drafts || [])
  const batchGhosts = computed(() => {
    if (composer.rehearsalResult?.status !== 'fresh' || composer.rehearsalResult?.adoptable !== true) return []
    const candidates = ghosts.value.filter((ghost) => (
      ghost.status === 'fresh' && !/[\r\n]/.test(String(ghost.text || ''))
    ))
    const targets = new Set(candidates.map((ghost) => `${ghost.target?.documentId || ''}:${ghost.target?.nodeId || ''}`))
    return candidates.length > 1 && targets.size === candidates.length ? candidates : []
  })
  const activeGhost = computed(() => ghosts.value.find((ghost) => (
    ghost.id === composer.activeGhostId
  )) || ghosts.value[0] || null)
  const ghostInDual = computed(() => Boolean(
    composer.phase === 'ghosts'
    && activeGhost.value
    && String(activeGhost.value.target?.documentId || '') !== String(selectedChapterId.value || '')
  ))
  const displayTarget = computed(() => (
    composer.phase === 'ghosts' && activeGhost.value ? activeGhost.value.target : composer.target
  ))

  function clearRehearsalResult() {
    composer.rehearsalResult = null
    composer.activeGhostId = ''
    composer.retryingGhostId = ''
    composer.adoptingGhostId = ''
    composer.pendingAdoption = null
    composer.persistError = ''
    ghostTeleportReady.value = false
  }

  return {
    composer,
    ghostTeleportReady,
    lastUmbrellaReceipt,
    impactGroups,
    candidateGroups,
    candidateReviewPendingCount,
    rehearsalScopeResult,
    rehearsalDirections,
    ghosts,
    batchGhosts,
    activeGhost,
    ghostInDual,
    displayTarget,
    clearRehearsalResult
  }
}
