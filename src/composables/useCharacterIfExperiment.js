/**
 * useCharacterIfExperiment — session-scoped composable for single-variable
 * character IF experiments (round-4 U45–U47). Manages the experiment
 * lifecycle, branch states, and author interactions.
 *
 * Default inactive: no UI, no reads, no provider calls unless explicitly
 * started by the author from the SceneLaboratory.
 */
import { computed, ref, watch } from 'vue'
import {
  createIfExperiment,
  advanceIfBranchGeneration,
  staleIfExperiment
} from '../services/project/characterIf/contract.js'

export function useCharacterIfExperiment({ projectId }) {
  const active = ref(null)
  const busy = ref(false)
  const error = ref('')
  const activeBranch = ref('A')

  const isActive = computed(() => Boolean(active.value))
  const phase = computed(() => active.value?.lifecycle ?? 'inactive')
  const branches = computed(() => {
    if (!active.value) return { A: null, B: null }
    return {
      A: active.value.branches.A ?? null,
      B: active.value.branches.B ?? null
    }
  })
  const selectedBranch = computed(() => {
    if (!active.value) return null
    return active.value.branches[activeBranch.value] ?? null
  })

  function start({ targetRef, baselineFacts, sourceRevisions, actorRef, beliefA, beliefB, modelConfig }) {
    error.value = ''
    const result = createIfExperiment({
      experimentId: `if-${Date.now().toString(36)}`,
      projectId: projectId.value ?? projectId,
      targetRef, baselineFacts, sourceRevisions, actorRef, beliefA, beliefB, modelConfig
    })
    if (!result.ok) {
      error.value = result.errors.map((e) => e.code).join(',')
      return false
    }
    active.value = result.experiment
    activeBranch.value = 'A'
    return true
  }

  function stop() {
    active.value = null
    busy.value = false
    error.value = ''
    activeBranch.value = 'A'
  }

  function stale(reason) {
    if (!active.value) return
    active.value = staleIfExperiment(active.value, reason)
  }

  function advanceBranch(branchId, newBelief) {
    if (!active.value) return { ok: false }
    const result = advanceIfBranchGeneration(active.value, branchId, newBelief)
    if (result.ok) active.value = result.experiment
    return result
  }

  function switchBranch(branchId) {
    if (['A', 'B'].includes(branchId)) activeBranch.value = branchId
  }

  watch(() => projectId.value, stop, { flush: 'sync' })

  return Object.freeze({
    active, busy, error, activeBranch, isActive, phase, branches, selectedBranch,
    start, stop, stale, advanceBranch, switchBranch
  })
}
