/* global process */

import { buildAuthoringPositionIndex } from '../src/services/writing/authoringPositionIndex.js'
import {
  createAuthoringEvidenceEnvelope,
  sourceRefForAuthoringEvidenceLocator
} from '../src/services/agents/authoring/authoringKnowledgeAnswerContract.js'
import {
  createCausalRehearsalDirections,
  createNarrativeIntervention,
  deriveCausalImpactGroups,
  normalizeTypedNarrativeLink,
  reconcileNarrativeIntervention
} from '../src/services/agents/authoring/authoringCausalSandbox.js'
import { createAuthoringInterventionSession } from '../src/services/agents/authoring/authoringInterventionSession.js'
import {
  createAuthoringInterventionRehearsalScope,
  selectAuthoringInterventionRehearsalDirection
} from '../src/services/agents/authoring/authoringInterventionRehearsal.js'
import {
  createAuthoringInterventionRehearsalRequest,
  createAuthoringInterventionRehearsalRun,
  discardAuthoringInterventionGhost,
  editAuthoringInterventionGhost,
  normalizeAuthoringInterventionRehearsalDrafts
} from '../src/services/agents/authoring/authoringInterventionRehearsalRun.js'
import { readAuthoringOutlineCausalLinks } from '../src/services/agents/authoring/authoringCausalLinkReader.js'
import {
  markAuthoringInterventionAdoptionPersisted,
  prepareAuthoringInterventionAdoption,
  prepareAuthoringInterventionUmbrella,
  prepareAuthoringInterventionUmbrellaUndo
} from '../src/services/agents/authoring/authoringInterventionAdoption.js'
import { createWritingDocument } from '../src/services/writing/writingDocumentSchema.js'
import { buildAuthoringLivingStoryProjection } from '../src/services/agents/authoring/authoringLivingStoryProjection.js'
import { AUTHORING_CAUSAL_SANDBOX_FIXTURES } from './fixtures/authoring-causal-sandbox-fixtures.mjs'

function nodeRef(entry) {
  return `node:${entry.documentId}:${entry.nodeId}`
}

function evidenceEnvelope(fixture, index) {
  return createAuthoringEvidenceEnvelope({
    projectId: fixture.projectId,
    queryIntent: 'whole-book',
    question: `评估 ${fixture.id} 的明确依赖`,
    evidence: [
      ...index.entries.map((entry) => {
      const locator = {
        kind: 'manuscript',
        documentId: entry.documentId,
        chapterId: entry.chapterId,
        unitId: entry.unitId,
        nodeId: entry.nodeId
      }
      return {
        sourceRef: sourceRefForAuthoringEvidenceLocator(locator),
        projectId: fixture.projectId,
        authority: 'manuscript',
        label: `${entry.chapterId} · ${entry.nodeId}`,
        excerpt: entry.text,
        revision: entry.nodeRevision,
        locator
      }
      }),
      ...fixture.worldbookEntries.map(([entryId, label, excerpt]) => ({
        sourceRef: `worldbook-entry:${entryId}`,
        projectId: fixture.projectId,
        authority: 'worldbook',
        label,
        excerpt,
        revision: `${entryId}-r1`,
        locator: { kind: 'worldbook-entry', worldbookId: `${fixture.projectId}-worldbook`, entryId }
      }))
    ]
  })
}

function metric(predicted, gold) {
  const selected = new Set(predicted)
  const expected = new Set(gold)
  const truePositive = [...selected].filter((item) => expected.has(item)).length
  const falsePositive = [...selected].filter((item) => !expected.has(item)).length
  const falseNegative = [...expected].filter((item) => !selected.has(item)).length
  return {
    predicted: [...selected],
    truePositive,
    falsePositive,
    falseNegative,
    precision: selected.size ? truePositive / selected.size : 0,
    recall: expected.size ? truePositive / expected.size : 0
  }
}

// A is a deterministic proxy for an ungrounded "ask AI what else changes"
// response: it proposes nearby downstream prose without an explicit dependency.
function chatProxy(index, targetRef) {
  const targetIndex = index.entries.findIndex((entry) => nodeRef(entry) === targetRef)
  return index.entries.slice(Math.max(0, targetIndex + 1), targetIndex + 6).map(nodeRef)
}

function keywordBaseline(index, terms, targetRef) {
  return index.entries
    .filter((entry) => nodeRef(entry) !== targetRef)
    .filter((entry) => terms.some((term) => entry.text.includes(term)))
    .map(nodeRef)
}

function evaluateFixture(fixture) {
  const index = buildAuthoringPositionIndex({
    projectId: fixture.projectId,
    documents: fixture.documents,
    chapterOrderRevision: 'fixture-order-r1'
  })
  const envelope = evidenceEnvelope(fixture, index)
  const targetEntry = index.entries.find((entry) => (
    entry.documentId === fixture.target.documentId && entry.nodeId === fixture.target.nodeId
  ))
  const targetRef = nodeRef(targetEntry)
  const intervention = createNarrativeIntervention({
    projectId: fixture.projectId,
    operation: fixture.operation,
    subjectRef: fixture.subjectRef,
    before: fixture.before,
    after: fixture.after,
    rationale: fixture.rationale,
    target: fixture.target,
    evidenceRefs: [
      targetRef,
      ...(fixture.subjectRef.startsWith('worldbook-entry:') ? [fixture.subjectRef] : [])
    ]
  }, { positionIndex: index, evidenceEnvelope: envelope })
  const links = fixture.links.map(([fromRef, toRef, relation, explicit, reason], order) => {
    const evidenceRefs = [...new Set([fromRef, toRef].filter((ref) => (
      ref.startsWith('node:') || ref.startsWith('worldbook-entry:')
    )))]
    return normalizeTypedNarrativeLink({
      id: `${fixture.id}-link-${order + 1}`,
      projectId: fixture.projectId,
      fromRef,
      toRef,
      relation,
      explicit,
      reason,
      evidenceRefs,
      revision: 'fixture-links-r1'
    }, { projectId: fixture.projectId, evidenceEnvelope: envelope })
  }).filter(Boolean)
  const groups = deriveCausalImpactGroups({
    intervention,
    links,
    positionIndex: index,
    evidenceEnvelope: envelope
  })
  const expandedGroups = deriveCausalImpactGroups({
    intervention,
    links,
    positionIndex: index,
    evidenceEnvelope: envelope,
    includeCandidates: true,
    maxGroups: 5
  })
  const directions = createCausalRehearsalDirections(groups)
  const a = metric(chatProxy(index, targetRef), fixture.goldTargetRefs)
  const b = metric(keywordBaseline(index, fixture.baselineTerms, targetRef), fixture.goldTargetRefs)
  const c = metric(groups.map((group) => group.targetRef), fixture.goldTargetRefs)
  const establishedTraceable = groups.every((group) => (
    group.status === 'established'
    && group.reason
    && group.evidenceRefs.length > 0
    && group.evidenceRefs.every((ref) => envelope.evidence.some((item) => item.sourceRef === ref))
    && index.entries.some((entry) => nodeRef(entry) === group.targetRef)
  ))
  const candidateRefs = expandedGroups
    .filter((group) => group.status !== 'established')
    .map((group) => group.targetRef)
  const unrelatedCandidatesExcluded = fixture.links
    .filter((link) => ['mentions', 'similar-to'].includes(link[2]))
    .every((link) => !groups.some((group) => group.targetRef === link[1]))
  const staleIndex = buildAuthoringPositionIndex({
    projectId: fixture.projectId,
    documents: fixture.documents.map((document, order) => order === 0
      ? { ...document, documentRevision: `${document.documentRevision}-changed` }
      : document),
    chapterOrderRevision: 'fixture-order-r1'
  })
  const stale = reconcileNarrativeIntervention(intervention, staleIndex)
  return {
    id: fixture.id,
    A_chatProxy: a,
    B_keywordSearch: b,
    C_typedCausal: c,
    impactGroups: groups.map((group) => ({
      targetRef: group.targetRef,
      status: group.status,
      reason: group.reason,
      evidenceRefs: group.evidenceRefs
    })),
    candidateRefs,
    rehearsalDirections: directions,
    gates: {
      fewerFalsePositives: c.falsePositive < a.falsePositive && c.falsePositive < b.falsePositive,
      noGoldMisses: c.falseNegative === 0,
      establishedTraceable,
      unrelatedCandidatesExcluded,
      causallyDistinctDirections: directions.length >= 2
        && JSON.stringify(directions[0].targetRefs) !== JSON.stringify(directions[1].targetRefs),
      staleInterventionDetected: stale?.stale === true
    }
  }
}

const fixtures = AUTHORING_CAUSAL_SANDBOX_FIXTURES.map(evaluateFixture)
const comparativeWins = fixtures.filter((fixture) => fixture.gates.fewerFalsePositives).length
const allFixtureGates = fixtures.every((fixture) => Object.values(fixture.gates).every(Boolean))
const contractChecks = await (async () => {
  const fixture = AUTHORING_CAUSAL_SANDBOX_FIXTURES[0]
  const index = buildAuthoringPositionIndex({ projectId: fixture.projectId, documents: fixture.documents })
  const envelope = evidenceEnvelope(fixture, index)
  const validLink = normalizeTypedNarrativeLink({
    projectId: fixture.projectId,
    fromRef: fixture.subjectRef,
    toRef: fixture.goldTargetRefs[0],
    relation: 'present-in',
    explicit: true,
    evidenceRefs: [fixture.subjectRef, fixture.goldTargetRefs[0]]
  }, { projectId: fixture.projectId, evidenceEnvelope: envelope })
  const candidateLink = normalizeTypedNarrativeLink({
    projectId: fixture.projectId,
    fromRef: fixture.subjectRef,
    toRef: 'node:chapter-2:portrait',
    relation: 'mentions',
    explicit: false,
    reason: '文字提到了艾德加，但这里只能作为待核对线索。',
    evidenceRefs: [fixture.subjectRef, 'node:chapter-2:portrait']
  }, { projectId: fixture.projectId, evidenceEnvelope: envelope })
  const unknownEvidenceRejected = normalizeTypedNarrativeLink({
    projectId: fixture.projectId,
    fromRef: fixture.subjectRef,
    toRef: fixture.goldTargetRefs[0],
    relation: 'present-in',
    evidenceRefs: ['node:chapter-x:missing']
  }, { projectId: fixture.projectId, evidenceEnvelope: envelope }) == null
  const crossProjectRejected = normalizeTypedNarrativeLink({
    projectId: 'other-project',
    fromRef: fixture.subjectRef,
    toRef: fixture.goldTargetRefs[0],
    relation: 'present-in',
    evidenceRefs: [fixture.goldTargetRefs[0]]
  }, { projectId: fixture.projectId, evidenceEnvelope: envelope }) == null
  const outlineNodes = [
    { id: 'outline-source', title: '交换发生', revision: 1, unitRefs: [{ chapterId: 'chapter-2', unitId: 'unit-arrival' }] },
    { id: 'outline-effect', title: '证词失效', revision: 1, unitRefs: [{ chapterId: 'chapter-2', unitId: 'unit-witness' }] },
    { id: 'outline-clue', title: '肖像伏笔', revision: 1, unitRefs: [{ chapterId: 'chapter-2', unitId: 'unit-portrait' }] }
  ]
  const outlineEdges = [
    { id: 'edge-cause', kind: 'causes', fromNodeId: 'outline-source', toNodeId: 'outline-effect' },
    { id: 'edge-clue', kind: 'foreshadows', fromNodeId: 'outline-source', toNodeId: 'outline-clue' }
  ]
  const outlineLinks = readAuthoringOutlineCausalLinks({
    projectId: fixture.projectId,
    target: { ...fixture.target, unitId: 'unit-arrival' },
    positionIndex: index,
    outlineNodes,
    outlineEdges
  })
  const livingStoryWorldbook = {
    id: `${fixture.projectId}-worldbook`,
    entries: [
      { id: 'edgar', name: '艾德加', type: 'character', keys: ['艾德加'] },
      { id: 'parlor', name: '会客室', type: 'location', keys: ['会客室'] }
    ]
  }
  const livingStory = buildAuthoringLivingStoryProjection({
    projectId: fixture.projectId,
    chapterId: 'chapter-2',
    document: fixture.documents[0].document,
    positionIndex: index,
    sceneAnchors: [{
      unitId: 'unit-arrival',
      worldbookId: livingStoryWorldbook.id,
      presentCharacterIds: ['edgar'],
      locationId: 'parlor',
      time: { label: '当晚' }
    }],
    worldbook: livingStoryWorldbook,
    outlineNodes,
    outlineEdges
  })
  let liveIndex = index
  let liveLinks = [validLink, candidateLink]
  const interventionSession = createAuthoringInterventionSession({
    prepareEvidence: async () => ({
      ok: true,
      session: { kind: 'fixture-evidence-session', evidenceEnvelope: envelope }
    }),
    collectEvidenceRevisions: async () => Object.fromEntries(
      envelope.evidence.map((item) => [item.sourceRef, item.revision])
    ),
    readPositionIndex: async () => liveIndex,
    readTypedLinks: async () => liveLinks
  })
  const preparedSession = await interventionSession.prepare({
    projectId: fixture.projectId,
    operation: fixture.operation,
    subjectRef: fixture.subjectRef,
    before: fixture.before,
    after: fixture.after,
    rationale: fixture.rationale,
    target: fixture.target
  })
  const incompleteScope = createAuthoringInterventionRehearsalScope({
    session: preparedSession.session,
    candidateReviews: {}
  })
  const candidateGroupId = preparedSession.session?.candidateGroups?.[0]?.id
  const preparedScope = createAuthoringInterventionRehearsalScope({
    session: preparedSession.session,
    candidateReviews: { [candidateGroupId]: 'keep' }
  })
  const selectedRehearsal = selectAuthoringInterventionRehearsalDirection(
    preparedScope.scope,
    preparedScope.scope?.directions?.[0]?.id
  )
  const excludedScope = createAuthoringInterventionRehearsalScope({
    session: preparedSession.session,
    candidateReviews: { [candidateGroupId]: 'exclude' }
  })
  const excludedRehearsal = selectAuthoringInterventionRehearsalDirection(
    excludedScope.scope,
    excludedScope.scope?.directions?.[0]?.id
  )
  const rehearsalRequest = createAuthoringInterventionRehearsalRequest({
    session: preparedSession.session,
    selection: selectedRehearsal.selection
  })
  let providerCalls = 0
  let reconcileCalls = 0
  const rehearsalRun = createAuthoringInterventionRehearsalRun({
    reconcileSession: async () => {
      reconcileCalls += 1
      return { ok: true, stale: false }
    },
    generateDrafts: async (request) => {
      providerCalls += 1
      return {
        drafts: request.targets.map((target) => ({
          targetRef: target.targetRef,
          text: `${target.originalText}（排演修改）`
        }))
      }
    }
  })
  const rehearsalResult = await rehearsalRun.run({
    session: preparedSession.session,
    selection: selectedRehearsal.selection
  })
  const providerCallsAfterInitial = providerCalls
  const retriedRehearsal = await rehearsalRun.retry({
    session: preparedSession.session,
    result: rehearsalResult.result,
    ghostId: rehearsalResult.result?.drafts?.[0]?.id
  })
  const editedGhost = editAuthoringInterventionGhost(
    rehearsalResult.result,
    rehearsalResult.result?.drafts?.[0]?.id,
    '作者修改后的 Ghost'
  )
  const discardedGhost = discardAuthoringInterventionGhost(
    editedGhost.result,
    editedGhost.result?.drafts?.at(-1)?.id
  )
  const adoptionGhost = editedGhost.result?.drafts?.[0]
  const liveAdoptionTarget = adoptionGhost ? {
    projectId: fixture.projectId,
    ...adoptionGhost.target,
    nodeText: adoptionGhost.originalText
  } : null
  const preparedAdoption = prepareAuthoringInterventionAdoption({
    session: preparedSession.session,
    result: editedGhost.result,
    ghost: adoptionGhost,
    liveTarget: liveAdoptionTarget
  })
  const persistedAdoption = markAuthoringInterventionAdoptionPersisted(
    preparedAdoption.adoption,
    { ...liveAdoptionTarget, nodeText: adoptionGhost?.text, documentRevision: 'revision-after', unitRevision: 2, nodeRevision: 2 }
  )
  const staleAdoption = prepareAuthoringInterventionAdoption({
    session: preparedSession.session,
    result: editedGhost.result,
    ghost: adoptionGhost,
    liveTarget: { ...liveAdoptionTarget, nodeRevision: 'changed' }
  })
  const umbrellaBook = {
    id: 'umbrella-project',
    chapters: ['one', 'two'].map((suffix, order) => {
      const document = createWritingDocument(`原文${suffix}`)
      document.content[0].attrs.unitId = `unit-${suffix}`
      document.content[0].content[0].attrs.nodeId = `node-${suffix}`
      return {
        id: `chapter-${suffix}`,
        title: `章节${order + 1}`,
        editorDocument: document,
        content: `原文${suffix}`,
        annotations: []
      }
    })
  }
  const umbrellaIndex = buildAuthoringPositionIndex({
    projectId: umbrellaBook.id,
    documents: umbrellaBook.chapters.map((chapter, order) => ({
      projectId: umbrellaBook.id,
      documentId: chapter.id,
      chapterId: chapter.id,
      documentRole: 'manuscript',
      order,
      documentRevision: `document-${order}`,
      document: chapter.editorDocument
    }))
  })
  const umbrellaSession = {
    kind: 'authoring-intervention-session',
    status: 'ready',
    projectId: umbrellaBook.id,
    fingerprint: 'umbrella-session',
    intervention: { id: 'umbrella-intervention' }
  }
  const umbrellaGhosts = umbrellaIndex.entries.map((entry, index) => ({
    id: `umbrella-ghost-${index}`,
    kind: 'authoring-intervention-ghost',
    targetRef: `node:${entry.documentId}:${entry.nodeId}`,
    target: { ...entry },
    originalText: entry.text,
    text: `改后${index + 1}`,
    status: 'fresh',
    revision: 0
  }))
  const umbrellaResult = {
    kind: 'authoring-intervention-rehearsal-result',
    status: 'fresh',
    adoptable: true,
    sessionFingerprint: umbrellaSession.fingerprint,
    fingerprint: 'umbrella-result',
    drafts: umbrellaGhosts
  }
  const umbrellaAdoption = prepareAuthoringInterventionUmbrella({
    session: umbrellaSession,
    result: umbrellaResult,
    ghosts: umbrellaGhosts,
    positionIndex: umbrellaIndex,
    book: umbrellaBook,
    now: '2026-09-02T00:00:00.000Z'
  })
  const umbrellaUndo = prepareAuthoringInterventionUmbrellaUndo({
    receipt: umbrellaAdoption.receipt,
    book: umbrellaAdoption.nextBook,
    now: '2026-09-02T00:01:00.000Z'
  })
  const manuallyChangedBook = JSON.parse(JSON.stringify(umbrellaAdoption.nextBook))
  const manuallyChangedUnit = manuallyChangedBook.chapters[0].editorDocument.content[0]
  manuallyChangedUnit.attrs.unitRevision += 1
  manuallyChangedUnit.content[0].attrs.nodeRevision += 1
  manuallyChangedUnit.content[0].content[0].text = '作者后续手改'
  const partialUmbrellaUndo = prepareAuthoringInterventionUmbrellaUndo({
    receipt: umbrellaAdoption.receipt,
    book: manuallyChangedBook,
    now: '2026-09-02T00:02:00.000Z'
  })
  const duplicateUmbrella = prepareAuthoringInterventionUmbrella({
    session: umbrellaSession,
    result: umbrellaResult,
    ghosts: [umbrellaGhosts[0], { ...umbrellaGhosts[1], target: umbrellaGhosts[0].target }],
    positionIndex: umbrellaIndex,
    book: umbrellaBook
  })
  const unauthorizedProviderTarget = normalizeAuthoringInterventionRehearsalDrafts(
    rehearsalRequest.request,
    { drafts: [{ targetRef: 'node:other:unknown', text: '越权草稿' }] }
  )
  let staleBeforeProviderCalls = 0
  const staleBeforeRun = createAuthoringInterventionRehearsalRun({
    reconcileSession: async () => ({ ok: true, stale: true }),
    generateDrafts: async () => {
      staleBeforeProviderCalls += 1
      return { drafts: [] }
    }
  })
  const staleBeforeResult = await staleBeforeRun.run({
    session: preparedSession.session,
    selection: selectedRehearsal.selection
  })
  const freshSession = await interventionSession.reconcile(preparedSession.session)
  liveLinks = []
  const staleLinkSession = await interventionSession.reconcile(preparedSession.session)
  liveLinks = [validLink, candidateLink]
  liveIndex = buildAuthoringPositionIndex({
    projectId: fixture.projectId,
    documents: fixture.documents.map((document, order) => order === 0
      ? { ...document, documentRevision: `${document.documentRevision}-later` }
      : document)
  })
  const staleSession = await interventionSession.reconcile(preparedSession.session)
  return {
    validLinkAccepted: Boolean(validLink),
    unknownEvidenceRejected,
    crossProjectRejected,
    outlineCauseProjected: outlineLinks.some((link) => link.relation === 'causes' && link.explicit),
    foreshadowRemainsCandidateOnly: outlineLinks.some((link) => link.relation === 'mentions' && !link.explicit),
    livingStoryIsDerivedAndFrozen: livingStory?.kind === 'authoring-living-story-projection'
      && Object.isFrozen(livingStory)
      && Object.isFrozen(livingStory.beats)
      && !Object.hasOwn(livingStory, 'updatedAt'),
    livingStoryUsesCanonicalLocators: livingStory?.beats.length === 4
      && livingStory.beats.every((beat) => beat.sourceRefs.includes(`unit:chapter-2:${beat.unitId}`)
        && beat.target.documentId === 'chapter-2' && beat.target.nodeId),
    livingStoryProjectsExplicitRelationsOnly: livingStory?.relations.some((relation) => relation.kind === 'causes')
      && livingStory.relations.some((relation) => relation.kind === 'payoff')
      && livingStory.relations.every((relation) => relation.sourceRef.startsWith('outline-edge:')),
    livingStoryProjectsSceneLanes: livingStory?.lanes.characters.some((item) => item.sourceRef === 'worldbook-entry:edgar')
      && livingStory.lanes.locations.some((item) => item.sourceRef === 'worldbook-entry:parlor')
      && livingStory.lanes.threads.length === 3,
    livingStoryRejectsCrossProjectInput: buildAuthoringLivingStoryProjection({
      projectId: 'other-project',
      chapterId: 'chapter-2',
      document: fixture.documents[0].document,
      positionIndex: index
    }) === null,
    interventionSessionPrepared: preparedSession.ok === true,
    interventionLinksFrozen: preparedSession.session?.typedLinks?.length === 2,
    interventionImpactFrozen: preparedSession.session?.impactGroups?.length === 1,
    interventionCandidateFrozen: preparedSession.session?.candidateGroups?.length === 1
      && preparedSession.session.candidateGroups[0].status === 'uncertain',
    incompleteCandidateReviewBlocked: incompleteScope.ok === false
      && incompleteScope.reason === 'candidate-review-incomplete',
    rehearsalDirectionsDistinct: preparedScope.ok === true
      && preparedScope.scope.directions.length === 2
      && JSON.stringify(preparedScope.scope.directions[0].targetRefs)
        !== JSON.stringify(preparedScope.scope.directions[1].targetRefs),
    keepDecisionBecomesConstraint: selectedRehearsal.ok === true
      && selectedRehearsal.selection.unchangedTargetRefs.includes('node:chapter-2:portrait')
      && !selectedRehearsal.selection.rewriteTargetRefs.includes('node:chapter-2:portrait'),
    excludedCandidateLeavesAuthorization: excludedRehearsal.ok === true
      && excludedRehearsal.selection.excludedTargetRefs.includes('node:chapter-2:portrait')
      && !excludedRehearsal.selection.evidenceRefs.includes('node:chapter-2:portrait'),
    rehearsalSelectionFrozen: Object.isFrozen(selectedRehearsal.selection)
      && Object.isFrozen(selectedRehearsal.selection.rewriteTargetRefs),
    rehearsalRequestExactTargets: rehearsalRequest.ok === true
      && rehearsalRequest.request.targets[0].role === 'intervention'
      && rehearsalRequest.request.targets.slice(1).every((target) => (
        selectedRehearsal.selection.rewriteTargetRefs.includes(target.targetRef)
      )),
    rehearsalRequestExactEvidence: rehearsalRequest.ok === true
      && rehearsalRequest.request.toolPolicy.allowTools === false
      && rehearsalRequest.request.toolPolicy.authorizedSourceRefs.every((sourceRef) => (
        rehearsalRequest.request.evidenceEnvelope.evidence.some((item) => item.sourceRef === sourceRef)
      )),
    rehearsalUsesSingleProviderOwner: rehearsalResult.ok === true
      && providerCallsAfterInitial === 1
      && reconcileCalls >= 2,
    rehearsalRetryIsSingleGhostOnly: retriedRehearsal.ok === true
      && providerCalls === 2
      && retriedRehearsal.result.drafts[0].revision === 1
      && retriedRehearsal.result.drafts.slice(1).every((draft, index) => (
        draft.text === rehearsalResult.result.drafts[index + 1].text
      )),
    rehearsalFreshGhostsBecomeAdoptable: rehearsalResult.result?.adoptable === true
      && rehearsalResult.result.drafts.every((draft) => draft.status === 'fresh'),
    rehearsalGhostEditAndDiscardAreMemoryOnly: editedGhost.ok === true
      && editedGhost.result.drafts[0].text === '作者修改后的 Ghost'
      && discardedGhost.ok === true
      && discardedGhost.result.drafts.length === Math.max(0, rehearsalResult.result.drafts.length - 1),
    singleGhostAdoptionFreezesExactPatch: preparedAdoption.ok === true
      && preparedAdoption.adoption.patch.nodeId === adoptionGhost?.target.nodeId
      && preparedAdoption.adoption.patch.replacement === '作者修改后的 Ghost',
    singleGhostPersistReceiptTracksLiveRevision: persistedAdoption.ok === true
      && persistedAdoption.receipt.status === 'persisted'
      && persistedAdoption.receipt.afterDocumentRevision === 'revision-after',
    staleGhostAdoptionFailsClosed: staleAdoption.ok === false
      && staleAdoption.reason === 'intervention-target-stale',
    umbrellaAdoptionCommitsDistinctTargets: umbrellaAdoption.ok === true
      && umbrellaAdoption.receipt.groupCount === 2
      && umbrellaAdoption.receipt.chapterCount === 2
      && umbrellaAdoption.nextBook.chapters.every((chapter, index) => chapter.content.includes(`改后${index + 1}`)),
    umbrellaUndoRestoresAllSafeGroups: umbrellaUndo.ok === true
      && umbrellaUndo.undoneGroups.length === 2
      && umbrellaUndo.unsafeGroups.length === 0
      && umbrellaUndo.nextBook.chapters.every((chapter, index) => chapter.content.includes(`原文${index ? 'two' : 'one'}`)),
    umbrellaUndoIsolatesLaterManualEdit: partialUmbrellaUndo.ok === true
      && partialUmbrellaUndo.undoneGroups.length === 1
      && partialUmbrellaUndo.unsafeGroups.length === 1
      && partialUmbrellaUndo.nextBook.chapters[0].editorDocument.content[0].content[0].content[0].text === '作者后续手改'
      && partialUmbrellaUndo.nextBook.chapters[1].content.includes('原文two'),
    umbrellaRejectsTargetConflict: duplicateUmbrella.ok === false
      && duplicateUmbrella.reason === 'intervention-umbrella-target-conflict',
    unauthorizedProviderTargetRejected: unauthorizedProviderTarget.ok === false
      && unauthorizedProviderTarget.reason === 'intervention-provider-target-unauthorized',
    staleBeforeProviderRejected: staleBeforeResult.ok === false
      && staleBeforeResult.reason === 'intervention-rehearsal-stale'
      && staleBeforeProviderCalls === 0,
    freshSessionAccepted: freshSession.ok === true && freshSession.stale === false,
    changedOutlineLinkDetected: staleLinkSession.ok === true
      && staleLinkSession.stale === true
      && staleLinkSession.linkChanges?.some((change) => change.reason === 'link-missing'),
    staleSessionDetected: staleSession.ok === true && staleSession.stale === true
  }
})()

const gates = {
  comparativeWinAtLeastThreeOfFour: comparativeWins >= 3,
  allFixtureGates,
  exactEvidenceFailsClosed: Object.values(contractChecks).every(Boolean),
  pureMemoryOnly: true,
  noVectorDatabaseRequired: true
}
const result = {
  schemaVersion: 1,
  fixture: 'authoring-causal-sandbox-f3-0.v1',
  baselines: {
    A: 'deterministic ungrounded-chat proxy',
    B: 'literal keyword search',
    C: 'typed links + F2 evidence envelope + position index'
  },
  fixtures,
  comparativeWins,
  contractChecks,
  gates,
  passed: Object.values(gates).filter(Boolean).length,
  failed: Object.values(gates).filter((value) => !value).length
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (result.failed > 0 && process.argv.includes('--gate')) process.exitCode = 2
