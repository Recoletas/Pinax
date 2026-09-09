/**
 * characterIf/contract.js — session-scoped single-variable character IF
 * contract (round-4 K44/K45). Pure functions, in-memory state, no
 * persistence, no provider calls, no formal world writes.
 *
 * Frozen v0 semantics (§4.1):
 * - An Experiment freezes one baseline (facts + target + revisions + model
 *   config) and derives exactly two branches A/B that differ in EXACTLY one
 *   belief condition. Everything else is semantically identical.
 * - Branches have independent request tokens per experiment/branch/generation.
 *   A late result belongs to its old generation and can never overwrite the
 *   current one.
 * - Editing a shared fact stales both branches; editing only one branch's
 *   belief creates a new generation for that branch alone.
 * - Adopting one branch's draft does NOT affect the other branch's targets.
 * - Zero formal writes: no worldbook/event/memory/relationship changes from
 *   IF operations. The caller's formal hashes must be identical before and
 *   after.
 */

const IF_SCHEMA_VERSION = 1

const IF_LIFECYCLE = Object.freeze([
  'editing', 'frozen', 'planning', 'awaiting-choice', 'drafting', 'ready',
  'cancelled', 'failed', 'stale'
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function hashText(text) {
  let hash = 0x811c9dc5
  const input = String(text)
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Create an Experiment from author-confirmed inputs. The baselineFacts are
 * NOT re-derived from character cards or world text: the caller supplies a
 * short, explicitly confirmed fact package.
 */
export function createIfExperiment({
  experimentId,
  projectId,
  targetRef,
  baselineFacts,
  sourceRevisions,
  actorRef,
  beliefA,
  beliefB,
  modelConfig
} = {}) {
  const errors = []
  if (typeof experimentId !== 'string' || !experimentId.trim()) errors.push({ path: 'experimentId', code: 'required' })
  if (typeof projectId !== 'string' || !projectId.trim()) errors.push({ path: 'projectId', code: 'required' })
  if (!isPlainObject(targetRef)) errors.push({ path: 'targetRef', code: 'required' })
  if (!Array.isArray(baselineFacts) || baselineFacts.length === 0) errors.push({ path: 'baselineFacts', code: 'required' })
  if (!isPlainObject(sourceRevisions)) errors.push({ path: 'sourceRevisions', code: 'required' })
  if (typeof actorRef !== 'string' || !actorRef.trim()) errors.push({ path: 'actorRef', code: 'required' })
  if (typeof beliefA !== 'string' || !beliefA.trim()) errors.push({ path: 'beliefA', code: 'required' })
  if (typeof beliefB !== 'string' || !beliefB.trim()) errors.push({ path: 'beliefB', code: 'required' })
  if (!isPlainObject(modelConfig)) errors.push({ path: 'modelConfig', code: 'required' })
  if (errors.length > 0) return { ok: false, errors, experiment: null }

  const baselineFingerprint = hashText(stableStringify({
    facts: baselineFacts, targetRef, sourceRevisions, modelConfig, actorRef, projectId
  }))
  const experiment = deepFreeze({
    schemaVersion: IF_SCHEMA_VERSION,
    kind: 'character-if-experiment',
    lifecycle: 'editing',
    experimentId,
    generation: 1,
    projectId,
    targetRef: cloneInput(targetRef),
    baselineFingerprint,
    baselineFacts: cloneInput(baselineFacts),
    sourceRevisions: cloneInput(sourceRevisions),
    actorRef,
    beliefA: beliefA.trim(),
    beliefB: beliefB.trim(),
    modelConfig: cloneInput(modelConfig),
    branches: Object.freeze({
      A: createBranch(experimentId, 'A', 1, baselineFingerprint, beliefA.trim()),
      B: createBranch(experimentId, 'B', 1, baselineFingerprint, beliefB.trim())
    })
  })
  return { ok: true, errors: [], experiment }
}

function createBranch(experimentId, branchId, generation, inputFingerprint, belief) {
  return Object.freeze({
    branchId,
    generation,
    requestId: `if:${experimentId}:${branchId}:g${generation}:${hashText(inputFingerprint + belief)}`,
    inputFingerprint,
    belief,
    proposalSet: null,
    selectedProposal: null,
    authorAssumptions: [],
    draft: null,
    previousDraft: null,
    lifecycle: 'editing',
    failure: null
  })
}

/**
 * Canonical semantic diff between A and B conditions: only `belief` may
 * differ. Everything else (facts, target, revisions, model config) must be
 * semantically identical. Returns { ok, differences } where differences is
 * empty for valid A/B and non-empty for tampered setups.
 */
export function validateIfSemanticIdentity(experiment) {
  if (!experiment || experiment.kind !== 'character-if-experiment') {
    return { ok: false, differences: [{ field: 'experiment', code: 'invalid' }] }
  }
  const differences = []
  const a = experiment.branches?.A
  const b = experiment.branches?.B
  if (!a || !b) return { ok: false, differences: [{ field: 'branches', code: 'invalid' }] }
  const fingerprint = hashText(stableStringify({
    facts: experiment.baselineFacts, targetRef: experiment.targetRef,
    sourceRevisions: experiment.sourceRevisions, modelConfig: experiment.modelConfig,
    actorRef: experiment.actorRef, projectId: experiment.projectId
  }))
  if (fingerprint !== experiment.baselineFingerprint ||
      a.inputFingerprint !== fingerprint || b.inputFingerprint !== fingerprint) {
    differences.push({ field: 'baselineFingerprint', code: 'tampered' })
  }
  if (a.inputFingerprint !== b.inputFingerprint) {
    differences.push({ field: 'inputFingerprint', code: 'divergent' })
  }
  if (a.belief === b.belief) {
    // A/A is legal (control group), but must be explicitly acknowledged.
    differences.push({ field: 'belief', code: 'identical' })
  }
  return { ok: differences.length === 0 || (differences.length === 1 && differences[0].code === 'identical'), differences }
}

/**
 * Freeze the experiment: lifecycle transitions from editing → frozen.
 * After freezing, baselineFacts and beliefs cannot be changed without
 * creating a new generation.
 */
export function freezeIfExperiment(experiment) {
  if (!experiment || experiment.kind !== 'character-if-experiment') return null
  if (experiment.lifecycle !== 'editing' || !validateIfSemanticIdentity(experiment).ok) return null
  if (Object.values(experiment.branches).some(branch => ['stale', 'cancelled', 'failed'].includes(branch.lifecycle))) return null
  return deepFreeze({ ...experiment, lifecycle: 'frozen' })
}

/**
 * Record a proposal set for a branch (from a direction planning call).
 * Proposals are predictions (gain/cost), not facts.
 */
export function recordIfProposals(experiment, branchId, proposals, generation) {
  const branch = getBranch(experiment, branchId, generation)
  if (!branch) return { ok: false, reason: 'branch-not-found' }
  return { ok: true, branch: deepFreeze({ ...branch, proposalSet: proposals, lifecycle: 'awaiting-choice' }) }
}

/**
 * Select a proposal on a branch. Only the selected branch is confirmed; the
 * other branch is untouched.
 */
export function selectIfProposal(experiment, branchId, proposalIndex, generation) {
  const branch = getBranch(experiment, branchId, generation)
  if (!branch?.proposalSet?.proposals?.[proposalIndex]) return { ok: false, reason: 'proposal-not-found' }
  return { ok: true, branch: deepFreeze({ ...branch, selectedProposal: branch.proposalSet.proposals[proposalIndex] }) }
}

/**
 * Advance a branch generation (e.g. author changed only this branch's belief).
 * The other branch is unaffected. Returns the new experiment.
 */
export function advanceIfBranchGeneration(experiment, branchId, newBelief) {
  if (!getBranch(experiment, branchId, experiment?.branches?.[branchId]?.generation)) {
    return { ok: false, reason: 'branch-not-found' }
  }
  if (typeof newBelief !== 'string' || !newBelief.trim()) return { ok: false, reason: 'belief-required' }
  newBelief = newBelief.trim()
  const old = experiment.branches[branchId]
  const newGeneration = old.generation + 1
  const updated = createBranch(experiment.experimentId, branchId, newGeneration, old.inputFingerprint, newBelief)
  const branches = { ...experiment.branches, [branchId]: updated }
  return {
    ok: true,
    experiment: deepFreeze({ ...experiment, [branchId === 'A' ? 'beliefA' : 'beliefB']: newBelief,
      generation: experiment.generation + 1, branches: Object.freeze(branches) })
  }
}

/**
 * Mark both branches stale (e.g. shared baseline fact was edited). Already-
 * obtained results are preserved but marked non-adoptable.
 */
export function staleIfExperiment(experiment, reason) {
  if (!experiment || !isPlainObject(experiment.branches)) return null
  return deepFreeze({
    ...experiment,
    lifecycle: 'stale',
    branches: Object.freeze(Object.fromEntries(
      Object.entries(experiment.branches).map(([id, branch]) => [
        id,
        { ...branch, lifecycle: 'stale', failure: reason ?? 'baseline-changed' }
      ])
    ))
  })
}

function getBranch(experiment, branchId, generation) {
  if (!experiment || !isPlainObject(experiment.branches)) return null
  if (!validateIfSemanticIdentity(experiment).ok ||
      ['stale', 'cancelled', 'failed'].includes(experiment.lifecycle)) return null
  const branch = experiment.branches[branchId]
  if (!branch || branch.generation !== generation) return null
  if (['stale', 'cancelled', 'failed'].includes(branch.lifecycle)) return null
  return branch
}

function cloneInput(value) {
  if (Array.isArray(value)) return value.map(cloneInput)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneInput(item)])
  )
  return value
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const item of Object.values(value)) deepFreeze(item, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

export { IF_SCHEMA_VERSION, IF_LIFECYCLE, stableStringify, hashText }
