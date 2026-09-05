import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  createAuthoringDirectionProposalBinding,
  createAuthoringRehearsalHostRegistry,
  createAuthoringRehearsalLiveReader,
  createCollaborationPromotionRequest,
  getAuthoringRehearsalSourceArtifacts,
  parseCollaborableArtifact,
  preflightAuthoringRehearsalPromotion,
  resolveAuthoringRehearsalEvidenceAfterReconciliation,
  serializeCollaborableArtifact,
  toCollaborableArtifact,
  verifyCollaborableArtifactFingerprint
} from '../src/services/collaboration/authoringRehearsalBridge.js'
import { canonicalJson } from '../shared/collaboration/canonicalJson.js'
import {
  createAuthoringInterventionRehearsalScope,
  selectAuthoringInterventionRehearsalDirection
} from '../src/services/agents/authoring/authoringInterventionRehearsal.js'
import {
  createAuthoringInterventionRehearsalRequest,
  normalizeAuthoringInterventionRehearsalDrafts
} from '../src/services/agents/authoring/authoringInterventionRehearsalRun.js'
import { createAuthoringEvidenceEnvelope } from '../src/services/agents/authoring/authoringKnowledgeAnswerContract.js'

let passed = 0
let failed = 0

async function check (name, body) {
  try {
    await body()
    passed += 1
    console.log(`ok ${passed} - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`not ok ${passed + failed} - ${name}`)
    console.error(error)
  }
}

const target = Object.freeze({
  projectId: 'project-1', documentId: 'chapter-1', chapterId: 'chapter-1', documentRevision: 7,
  unitId: 'unit-1', unitRevision: 5, nodeId: 'node-1', nodeRevision: 3
})
const downstream = Object.freeze({
  documentId: 'chapter-1', chapterId: 'chapter-1', documentRevision: 7,
  unitId: 'unit-2', unitRevision: 2, nodeId: 'node-2', nodeRevision: 4
})

const evidence = Object.freeze([
  { sourceRef: 'node:chapter-1:node-1', projectId: 'project-1', authority: 'manuscript', label: '当前条件', excerpt: '钟楼的门仍然关闭。', revision: '3', locator: { kind: 'manuscript', documentId: 'chapter-1', chapterId: 'chapter-1', unitId: 'unit-1', nodeId: 'node-1', start: 2, end: 12 } },
  { sourceRef: 'node:chapter-1:node-2', projectId: 'project-1', authority: 'manuscript', label: '明确后果', excerpt: '守钟人因此错过约定。', revision: '4', locator: { kind: 'manuscript', documentId: 'chapter-1', chapterId: 'chapter-1', unitId: 'unit-2', nodeId: 'node-2' } },
  { sourceRef: 'worldbook-entry:keeper', projectId: 'project-1', authority: 'worldbook', label: '守钟人', excerpt: '守钟人重视准时。', revision: '8', locator: { kind: 'worldbook-entry', worldbookId: 'world-1', entryId: 'keeper' } },
  { sourceRef: 'outline-node:o-1', projectId: 'project-1', authority: 'outline', label: '大纲节点', excerpt: '门开启导致约定失败。', revision: '5', locator: { kind: 'outline-node', nodeId: 'o-1' } },
  { sourceRef: 'exploration:chapter-1', projectId: 'project-1', authority: 'suggestion', label: '探索', excerpt: '可以追查门轴。', revision: '2', locator: { kind: 'exploration', documentId: 'chapter-1' } },
  { sourceRef: 'memory:m-1', projectId: 'project-1', authority: 'memory', label: '记忆', excerpt: '守钟人曾经迟到。', revision: '6', locator: { kind: 'memory-source', memoryId: 'm-1', sourceRef: 'PRIVATE_MEMORY_ORIGIN' } },
  { sourceRef: 'history-node:h-1', projectId: 'project-1', authority: 'history', label: '历史', excerpt: '旧约定在冬至签订。', revision: '9', locator: { kind: 'history', historyId: 'h-1' } },
  { sourceRef: 'scene-anchor:a-1', projectId: 'project-1', authority: 'scene', label: '当前场', excerpt: '众人在钟楼门前。', revision: '10', locator: { kind: 'scene', chapterId: 'chapter-1', unitId: 'unit-1', anchorId: 'a-1' } }
])
const evidenceEnvelope = createAuthoringEvidenceEnvelope({
  projectId: 'project-1', queryIntent: 'foreshadowing', evidence, claims: []
})

const impactGroup = Object.freeze({
  id: 'impact-1', status: 'established', title: '守钟人的约定', reason: '大纲明确声明前者 causes 后者。',
  targetRef: evidence[1].sourceRef, evidenceRefs: evidence.map(item => item.sourceRef), position: downstream,
  relationPath: [{ relation: 'causes', fromRef: evidence[0].sourceRef, toRef: evidence[1].sourceRef, evidenceRefs: [evidence[1].sourceRef] }]
})

const session = Object.freeze({
  schemaVersion: 1, kind: 'authoring-intervention-session', status: 'ready', projectId: 'project-1',
  target, positionFingerprint: 'position-fingerprint-1', fingerprint: 'intervention-session-1',
  providerConfig: { apiKey: 'SENTINEL_API_KEY' },
  intervention: {
    schemaVersion: 1, kind: 'narrative-intervention', id: 'intervention-1', projectId: 'project-1',
    operation: 'change-event', target, subjectRef: 'PRIVATE_SUBJECT_REF', before: '钟楼的门仍然关闭。',
    after: '钟楼的门提前打开。', rationale: '检验守钟人的选择。', evidenceRefs: [evidence[0].sourceRef],
    evidenceFingerprint: 'evidence-1', positionFingerprint: 'position-fingerprint-1'
  },
  impactGroups: [impactGroup], candidateGroups: [],
  evidenceEnvelope: { ...evidenceEnvelope, localToken: 'SENTINEL_TOKEN' }
})

const scope = createAuthoringInterventionRehearsalScope({ session }).scope
const selection = selectAuthoringInterventionRehearsalDirection(scope, 'minimal-repair').selection

const rehearsalRequest = createAuthoringInterventionRehearsalRequest({ session, selection }).request
const drafts = normalizeAuthoringInterventionRehearsalDrafts(rehearsalRequest, rehearsalRequest.targets.map(item => ({
  targetRef: item.targetRef,
  text: `${item.originalText}（排演版本）`
}))).drafts
const result = Object.freeze({
  schemaVersion: 1, kind: 'authoring-intervention-rehearsal-result', projectId: 'project-1',
  sessionFingerprint: session.fingerprint, selectionFingerprint: selection.fingerprint,
  request: rehearsalRequest, reconciliation: { stale: false }, status: 'fresh', adoptable: true,
  drafts, fingerprint: 'intervention-rehearsal-result-1'
})

const intervention = toCollaborableArtifact({ kind: 'intervention', session, scope })
const directions = toCollaborableArtifact({ kind: 'direction-set', session, scope })
const impact = toCollaborableArtifact({ kind: 'impact-group', session, scope, impactGroup })
const branch = toCollaborableArtifact({ kind: 'rehearsal-branch', session, scope, selection, result })

await check('A1 maps all four artifacts only from the same ready session and frozen scope', () => {
  for (const value of [intervention, directions, impact, branch]) {
    assert.equal(value.ok, true)
    assert.equal(verifyCollaborableArtifactFingerprint(value.artifact), true)
  }
  assert.equal(toCollaborableArtifact({ kind: 'intervention', session }).ok, false)
  assert.equal(toCollaborableArtifact({ kind: 'direction-set', session, scope, selection }).reason, 'collaborable-artifact-input-invalid')
  assert.equal(toCollaborableArtifact({ kind: 'impact-group', session, scope: Object.freeze({ ...scope, fingerprint: 'other' }), impactGroup }).ok, false)
})

await check('A2 emits all seven exact typed evidence locators without sourceRef fallback', () => {
  const refs = directions.artifact.evidenceRefs
  assert.deepEqual([...new Set(refs.map(item => item.kind))].sort(), [
    'exploration', 'history', 'manuscript', 'memory-source', 'outline-node', 'scene', 'worldbook-entry'
  ])
  assert.deepEqual(refs.find(item => item.kind === 'manuscript' && item.nodeId === 'node-1'), {
    kind: 'manuscript', projectFingerprint: refs[0].projectFingerprint, sourceRevision: '3',
    documentId: 'chapter-1', chapterId: 'chapter-1', unitId: 'unit-1', nodeId: 'node-1',
    startOffset: 2, endOffset: 12
  })
  assert.equal('sourceRef' in refs.find(item => item.kind === 'memory-source'), false)
  assert.ok(Object.keys(directions.artifact.sourceRevisions).every(key => /^locator:sha256:[0-9a-f]{64}$/.test(key)))
})

await check('B recursively excludes raw refs, project id, provider state, and Ghost-shaped network fields', () => {
  const serialized = [intervention, directions, impact, branch].map(item => serializeCollaborableArtifact(item.artifact)).join('\n')
  for (const sentinel of [
    'project-1', 'PRIVATE_SUBJECT_REF', 'PRIVATE_MEMORY_ORIGIN', 'SENTINEL_API_KEY',
    'SENTINEL_TOKEN', 'node:chapter-1:node-1', 'node:chapter-1:node-2'
  ]) assert.equal(serialized.includes(sentinel), false, sentinel)
  for (const forbiddenKey of ['sourceRef', 'targetRef', 'fromRef', 'toRef', 'subjectRef', 'projectId', 'drafts', 'ghost']) {
    assert.equal(new RegExp(`"${forbiddenKey}"`, 'i').test(serialized), false, forbiddenKey)
  }
  assert.equal(branch.artifact.authority, 'derived-plausible')
  assert.ok(Array.isArray(branch.artifact.visiblePayload.preview))
})

await check('C direction proposal binds an existing direction and artifact fingerprint only', () => {
  const bound = createAuthoringDirectionProposalBinding({ directionSetArtifact: directions.artifact, directionId: 'minimal-repair', body: 'free text' })
  assert.equal(bound.ok, true)
  assert.deepEqual(Object.keys(bound.binding), ['kind', 'directionId', 'directionSetArtifactFingerprint'])
  assert.equal(createAuthoringDirectionProposalBinding({ directionSetArtifact: directions.artifact, directionId: 'invented' }).ok, false)
})

await check('C2 canonical serialization roundtrips and tamper fails closed', () => {
  const serialized = serializeCollaborableArtifact(branch.artifact)
  const parsed = parseCollaborableArtifact(serialized)
  assert.equal(parsed.ok, true)
  assert.equal(serializeCollaborableArtifact(parsed.artifact), serialized)
  const tampered = structuredClone(branch.artifact)
  tampered.visiblePayload.preview[0].after = 'tampered'
  assert.equal(verifyCollaborableArtifactFingerprint(tampered), false)
  assert.equal(parseCollaborableArtifact(JSON.stringify(tampered)).reason, 'collaborable-artifact-invalid')
})

function locatorIdentityKey (locator) {
  return canonicalJson(Object.fromEntries(Object.entries(locator)
    .filter(([key]) => key !== 'sourceRevision' && !key.endsWith('Revision'))))
}

const targetRepository = new Map()
const evidenceRepository = new Map()
const liveReader = createAuthoringRehearsalLiveReader({
  readTarget: async locator => structuredClone(targetRepository.get(locatorIdentityKey(locator)) || null),
  readEvidence: async locator => structuredClone(evidenceRepository.get(locatorIdentityKey(locator)) || null)
})

function seedLiveArtifact (artifact) {
  for (const locator of [artifact.target, ...artifact.visiblePayload.preview.map(item => item.target)]) {
    targetRepository.set(locatorIdentityKey(locator), structuredClone(locator))
  }
  for (const locator of artifact.evidenceRefs) {
    evidenceRepository.set(locatorIdentityKey(locator), structuredClone(locator))
  }
}

let runnerCalls = 0
let runnerSelection = null
const registry = createAuthoringRehearsalHostRegistry({
  runRehearsal: async ({ session: actualSession, selection: actualSelection }) => {
    runnerCalls += 1
    assert.equal(actualSession, session)
    runnerSelection = actualSelection
    assert.deepEqual(actualSelection, selection)
    return { ok: true, result }
  },
  liveReader
})
const registered = registry.registerSource({ session, scope })
const binding = createAuthoringDirectionProposalBinding({
  directionSetArtifact: registered.directionSetArtifact,
  directionId: selection.directionId
}).binding
const room = Object.freeze({ roomId: 'room-1', shareSessionId: 'share-1', hostEpoch: 4 })
const proposal = Object.freeze({ id: 'proposal-1', status: 'selected', target: registered.directionSetArtifact.target, baseRevision: 3 })
const generationInput = {
  actorRole: 'host', room, proposal, proposalBinding: binding,
  generationRequestId: 'generation-1', sourceHandle: registered.sourceHandle
}

await check('C3 registry owns frozen established impact artifacts and empty established sources stay empty', () => {
  assert.equal(registered.impactGroupArtifacts.length, 1)
  assert.equal(registered.impactGroupArtifacts[0].fingerprint, impact.artifact.fingerprint)
  assert.equal(Object.isFrozen(registered.impactGroupArtifacts), true)
  assert.equal(Object.isFrozen(registered.impactGroupArtifacts[0]), true)
  const owned = registry.getSourceArtifacts(registered.sourceHandle)
  assert.equal(owned.ok, true)
  assert.equal(owned.impactGroupArtifacts, registered.impactGroupArtifacts)
  assert.equal(getAuthoringRehearsalSourceArtifacts({ registry, sourceHandle: registered.sourceHandle }).ok, true)
  assert.equal(getAuthoringRehearsalSourceArtifacts({ registry: { getSourceArtifacts: registry.getSourceArtifacts }, sourceHandle: registered.sourceHandle }).ok, false)

  const emptySession = Object.freeze({ ...session, impactGroups: [] })
  const empty = registry.registerSource({ session: emptySession, scope })
  assert.equal(empty.ok, false)
  assert.deepEqual(empty.impactGroupArtifacts, [])
  assert.equal(Object.isFrozen(empty.impactGroupArtifacts), true)
  assert.equal(registry.getSourceArtifacts(Object.freeze({})).ok, false)
})

await check('D opaque source handle fences arbitrary session/scope and host runner is once-only', async () => {
  assert.equal(registered.ok, true)
  assert.equal(registered.directionSetArtifact.visiblePayload.interventionArtifactFingerprint, registered.interventionArtifact.fingerprint)
  assert.ok(registered.directionSetArtifact.visiblePayload.constraints)
  const guest = await registry.runSelectedProposal({ ...generationInput, actorRole: 'reviewer' })
  assert.equal(guest.reason, 'collaboration-generation-host-required')
  assert.equal((await registry.runSelectedProposal({ ...generationInput, session, scope })).ok, false)
  assert.equal((await registry.runSelectedProposal({ ...generationInput, sourceHandle: Object.freeze({}) })).ok, false)
  assert.equal(runnerCalls, 0)
  const [first, duplicate] = await Promise.all([
    registry.runSelectedProposal(generationInput),
    registry.runSelectedProposal(generationInput)
  ])
  assert.equal(first.ok, true)
  assert.equal(duplicate.artifact, first.artifact)
  assert.equal(runnerCalls, 1)
  assert.equal((await registry.runSelectedProposal({ ...generationInput, generationRequestId: 'generation-replay' })).reason, 'collaboration-generation-already-owned')
  assert.equal(runnerCalls, 1)
})

const generated = await registry.runSelectedProposal(generationInput)
seedLiveArtifact(generated.artifact)

await check('D2 tampered source fields, constraints, selection, request, and branch targets fail before extra provider calls', async () => {
  let mismatchCalls = 0
  const isolated = createAuthoringRehearsalHostRegistry({
    runRehearsal: async () => { mismatchCalls += 1; return { ok: true, result } },
    liveReader
  })
  const invalidScopes = [
    { ...scope, reviews: [{ groupId: 'invented', decision: 'keep' }] },
    { ...scope, unchangedTargetRefs: [impactGroup.targetRef] },
    { ...scope, excludedTargetRefs: [impactGroup.targetRef] },
    { ...scope, includedEvidenceRefs: [evidence[0].sourceRef] },
    { ...scope, directions: [{ ...scope.directions[0], targetGroups: [] }] }
  ]
  for (const changed of invalidScopes) {
    assert.equal(isolated.registerSource({ session, scope: Object.freeze(changed) }).ok, false)
  }
  assert.equal((await isolated.runSelectedProposal({ ...generationInput, sourceHandle: Object.freeze({}) })).ok, false)
  assert.equal(mismatchCalls, 0)
  const wrongTargetDraft = { ...drafts[0], target: downstream }
  assert.equal(toCollaborableArtifact({
    kind: 'rehearsal-branch', session, scope, selection,
    result: { ...result, drafts: [wrongTargetDraft, drafts[1]] }
  }).ok, false)
  const duplicateDraft = { ...drafts[1], targetRef: drafts[0].targetRef, target: drafts[0].target, role: drafts[0].role, title: drafts[0].title, originalText: drafts[0].originalText }
  assert.equal(toCollaborableArtifact({ kind: 'rehearsal-branch', session, scope, selection, result: { ...result, drafts: [drafts[0], duplicateDraft] } }).ok, false)
})

await check('D3 post-registration intervention mutation invalidates the opaque source before provider', async () => {
  for (const field of ['before', 'after', 'rationale', 'operation']) {
    let calls = 0
    const mutableSession = structuredClone(session)
    const mutableScope = createAuthoringInterventionRehearsalScope({ session: mutableSession }).scope
    const isolated = createAuthoringRehearsalHostRegistry({
      runRehearsal: async () => { calls += 1; return { ok: true, result } },
      liveReader
    })
    const source = isolated.registerSource({ session: mutableSession, scope: mutableScope })
    const localBinding = createAuthoringDirectionProposalBinding({
      directionSetArtifact: source.directionSetArtifact,
      directionId: 'minimal-repair'
    }).binding
    const localProposal = {
      id: `proposal-${field}`, status: 'selected',
      target: source.directionSetArtifact.target, baseRevision: 3
    }
    mutableSession.intervention[field] = `${mutableSession.intervention[field]} changed`
    assert.equal((await isolated.runSelectedProposal({
      actorRole: 'host', room, proposal: localProposal, proposalBinding: localBinding,
      generationRequestId: `generation-${field}`, sourceHandle: source.sourceHandle
    })).ok, false)
    assert.equal(calls, 0)
  }
})

await check('D4 draft role, title, original text, missing target, and secret target all fail closed', () => {
  for (const change of [
    { role: 'secret' },
    { title: 'secret' },
    { originalText: 'secret' },
    { targetRef: 'node:secret:target' }
  ]) {
    const changed = { ...drafts[0], ...change }
    assert.equal(toCollaborableArtifact({
      kind: 'rehearsal-branch', session, scope, selection,
      result: { ...result, drafts: [changed, drafts[1]] }
    }).ok, false)
  }
  assert.equal(toCollaborableArtifact({
    kind: 'rehearsal-branch', session, scope, selection,
    result: { ...result, drafts: [drafts[0]] }
  }).ok, false)
})

let promotion
await check('E creates complete promotion request from field-by-field branded live readers', async () => {
  promotion = await createCollaborationPromotionRequest({
    registry, room, proposal, proposalBinding: binding, artifact: generated.artifact, generationRequestId: 'generation-1'
  })
  assert.equal(promotion.ok, true)
  assert.equal(promotion.request.artifactId, generated.artifact.artifactId)
  assert.equal(promotion.request.generationRequestId, 'generation-1')
})

await check('E2 reconnect accepts canonical clones but requires binding and the local registry record', async () => {
  const clonedRoom = structuredClone(room)
  const clonedProposal = structuredClone(proposal)
  const clonedBinding = structuredClone(binding)
  const parsedArtifact = parseCollaborableArtifact(serializeCollaborableArtifact(generated.artifact)).artifact
  const prepared = await preflightAuthoringRehearsalPromotion({
    registry, request: promotion.request, room: clonedRoom, proposal: clonedProposal,
    proposalBinding: clonedBinding, artifact: parsedArtifact
  })
  assert.equal(prepared.ok, true)
  assert.equal(prepared.result, result)
  assert.equal((await preflightAuthoringRehearsalPromotion({
    registry, request: promotion.request, room, proposal, artifact: parsedArtifact
  })).ok, false)
  assert.equal((await preflightAuthoringRehearsalPromotion({
    registry, request: promotion.request, room, proposal,
    proposalBinding: { ...binding, directionId: 'wrong' }, artifact: parsedArtifact
  })).ok, false)
})

await check('E2b registry snapshots proposal target and binding instead of aliasing mutable network objects', async () => {
  const isolated = createAuthoringRehearsalHostRegistry({
    runRehearsal: async () => ({ ok: true, result }),
    liveReader
  })
  const source = isolated.registerSource({ session, scope })
  const mutableBinding = structuredClone(createAuthoringDirectionProposalBinding({
    directionSetArtifact: source.directionSetArtifact,
    directionId: selection.directionId
  }).binding)
  const mutableProposal = {
    id: 'proposal-mutable', status: 'selected',
    target: structuredClone(source.directionSetArtifact.target), baseRevision: 3
  }
  const localGenerated = await isolated.runSelectedProposal({
    actorRole: 'host', room, proposal: mutableProposal, proposalBinding: mutableBinding,
    generationRequestId: 'generation-mutable', sourceHandle: source.sourceHandle
  })
  seedLiveArtifact(localGenerated.artifact)
  const localPromotion = await createCollaborationPromotionRequest({
    registry: isolated, room, proposal: mutableProposal, proposalBinding: mutableBinding,
    artifact: localGenerated.artifact, generationRequestId: 'generation-mutable'
  })
  assert.equal(localPromotion.ok, true)
  mutableProposal.target.nodeId = 'mutated-after-registration'
  mutableBinding.directionId = 'mutated-after-registration'
  assert.equal((await preflightAuthoringRehearsalPromotion({
    registry: isolated, request: localPromotion.request, room,
    proposal: mutableProposal, proposalBinding: mutableBinding, artifact: localGenerated.artifact
  })).ok, false)
})

await check('E3 main document/unit/node, branch target, and evidence revision changes each fail closed', async () => {
  const assertStaleAfter = async (repository, locator, key) => {
    const identity = locatorIdentityKey(locator)
    const original = repository.get(identity)
    repository.set(identity, { ...original, [key]: Number(original[key] || 0) + 1 })
    assert.equal((await preflightAuthoringRehearsalPromotion({
      registry, request: promotion.request, room, proposal, proposalBinding: binding, artifact: generated.artifact
    })).reason, 'collaboration-promotion-stale')
    repository.set(identity, original)
  }
  for (const key of ['documentRevision', 'unitRevision', 'nodeRevision']) {
    await assertStaleAfter(targetRepository, generated.artifact.target, key)
  }
  const branchTarget = generated.artifact.visiblePayload.preview.find(item => item.target.nodeId === 'node-2').target
  await assertStaleAfter(targetRepository, branchTarget, 'unitRevision')
  await assertStaleAfter(evidenceRepository, generated.artifact.evidenceRefs[0], 'sourceRevision')
  const evidenceIdentity = locatorIdentityKey(generated.artifact.evidenceRefs[0])
  const removed = evidenceRepository.get(evidenceIdentity)
  evidenceRepository.delete(evidenceIdentity)
  assert.equal((await preflightAuthoringRehearsalPromotion({
    registry, request: promotion.request, room, proposal, proposalBinding: binding, artifact: generated.artifact
  })).ok, false)
  evidenceRepository.set(evidenceIdentity, removed)
})

await check('E4 any stale reconciliation, including outline-link-only drift, invalidates evidence reads', () => {
  const locator = directions.artifact.evidenceRefs.find(item => item.kind === 'manuscript')
  const sourceRef = evidence[0].sourceRef
  assert.deepEqual(resolveAuthoringRehearsalEvidenceAfterReconciliation({
    reconciled: { ok: true, stale: false, evidenceChanges: [] },
    locator,
    sourceRef
  }), locator)
  assert.equal(resolveAuthoringRehearsalEvidenceAfterReconciliation({
    reconciled: {
      ok: true,
      stale: true,
      evidenceChanges: [],
      linkChanges: [{ reason: 'outline-link-stale', relation: 'causes' }]
    },
    locator,
    sourceRef
  }), null)
})

await check('F success returns original local identities, deep-frozen preview, and no adoption operation', async () => {
  const prepared = await preflightAuthoringRehearsalPromotion({
    registry, request: promotion.request, room, proposal, proposalBinding: binding, artifact: generated.artifact
  })
  assert.equal(prepared.ok, true)
  assert.equal(prepared.session, session)
  assert.equal(prepared.scope, scope)
  assert.equal(prepared.selection, runnerSelection)
  assert.equal(prepared.result, result)
  assert.deepEqual(prepared.ghostIds, drafts.map(item => item.id))
  assert.equal('adoption' in prepared, false)
  assert.equal('patch' in prepared, false)
  const parsed = parseCollaborableArtifact(serializeCollaborableArtifact(generated.artifact)).artifact
  assert.equal(Object.isFrozen(parsed.visiblePayload.preview[0]), true)
  const source = await readFile(new URL('../src/services/collaboration/authoringRehearsalBridge.js', import.meta.url), 'utf8')
  assert.equal(source.includes('authoringInterventionAdoption'), false)
})

console.log(`collaboration-authoring-bridge matrix: ${passed}/${passed + failed} passed`)
if (failed) process.exitCode = 1
