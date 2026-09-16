/**
 * knowledgeReadModel/query.js — bounded read-only knowledge query (v1).
 *
 * Fixed semantics (frozen with contract.js v1):
 * 1. Authorization first: the request cannot self-assert project, perspective
 *    or branch; everything is filtered by the trusted snapshot BEFORE entity
 *    matching, time filtering, sorting and truncation. Hidden data never
 *    leaks through ids, titles, counts or error messages; perspective-
 *    filtered items are not even counted.
 * 2. Exact entity resolution only: no full-text search, no fuzzy matching,
 *    no implicit paging.
 * 3. Time filtering happens before sorting/truncation; unknown-time items are
 *    labeled, never treated as eternally valid.
 * 4. Conflicts are surfaced, never absorbed by authority ordering.
 * 5. Deterministic output for identical inputs; cancellation stops result
 *    publication; zero writes, zero provider calls.
 */

import {
  REASON_CODES,
  addDiagnostic,
  contextBudget,
  createEmptyResult,
  fingerprintParts,
  isDeepFrozen,
  normalizeKnowledgeRequest,
  stableStringify,
  promoteStatus,
  validateKnowledgeContext
} from './contract.js'
import {
  buildAliasIndex,
  geoNodeKey,
  resolveEntityRef,
  resolvePerspectiveCharacter,
  runtimeCharacterKey,
  worldbookEntityKey
} from './identity.js'
import {
  eraMatchesWindow,
  intervalOverlapsWindow,
  toQueryWindow,
  toTimePoint,
  validateTimeline
} from './time.js'
import { RUNTIME_EVENT_LIMIT } from '../../experience/runtimeEvents.js'
import {
  adaptCanonicalFacts,
  adaptGeoHistory,
  adaptMemories,
  adaptResearchClaims,
  adaptUnadoptedDrafts,
  adaptWorldbookEntries,
  deriveTimelineFromGeoHistory
} from './sourceAdapters.js'

function diagnosticKey(entry) {
  return `${entry.code}:${JSON.stringify(entry.detail ?? null)}:${entry.entityKey ?? ''}:${entry.factId ?? ''}:${entry.claimId ?? ''}:${entry.linkId ?? ''}`
}

function pushDiagnostic(result, entry) {
  const key = diagnosticKey(entry)
  if (result.diagnostics.some((existing) => diagnosticKey(existing) === key)) return
  const before = result.diagnostics.length
  addDiagnostic(result, entry.code, entry.detail)
  if (result.diagnostics.length === before) return
  const stored = result.diagnostics[result.diagnostics.length - 1]
  if (entry.entityKey) stored.entityKey = entry.entityKey
  if (entry.factId) stored.factId = entry.factId
  if (entry.claimId) stored.claimId = entry.claimId
  if (entry.linkId) stored.linkId = entry.linkId
}

function failResult(status, diagnostics) {
  const result = createEmptyResult()
  result.status = status
  for (const entry of diagnostics) result.diagnostics.push(entry)
  return Object.freeze(result)
}

/**
 * Prepare a trusted scope from an authorized snapshot: derived timeline,
 * alias index, and frozen shape. Measured as the cold-build phase by the
 * benchmark. The snapshot is validated; invalid scopes fail closed.
 */
export function createKnowledgeScope(snapshot) {
  const validation = validateKnowledgeContext({ snapshot })
  if (!validation.ok) return { ok: false, errors: validation.errors }
  // Freeze responsibility: the module never freezes (or clones) caller
  // objects. It refuses unfrozen snapshots instead, so a scope can never
  // hold an alias index that drifts away from mutable content.
  if (!isDeepFrozen(snapshot)) {
    return { ok: false, errors: [{ path: 'snapshot', code: 'snapshot-unfrozen' }] }
  }
  const worldbookId = snapshot.worldbook.id
  const timeline = snapshot.timeline ?? deriveTimelineFromGeoHistory(worldbookId, snapshot.geoHistory)
  const timelineCheck = validateTimeline(timeline)
  if (!timelineCheck.ok) return { ok: false, errors: [{ path: 'timeline', code: timelineCheck.error }] }
  const aliasIndex = buildAliasIndex(snapshot)
  const scope = Object.freeze({
    snapshot,
    aliasIndex,
    timeline: timeline ? Object.freeze({
      id: timeline.id,
      eras: Object.freeze(timeline.eras.map((era) => Object.freeze({ ...era })))
    }) : null
  })
  return { ok: true, scope }
}

function runtimeWindow(snapshot, branchId) {
  const runtime = snapshot.runtime
  if (!runtime || typeof runtime !== 'object') return null
  if (branchId !== undefined && runtime.branchId !== undefined && runtime.branchId !== branchId) {
    return { branchMismatch: true, branchId: runtime.branchId ?? null }
  }
  const events = Array.isArray(runtime.events) ? runtime.events : []
  return {
    branchMismatch: false,
    branchId: runtime.branchId ?? null,
    eventCount: events.length,
    firstEventId: events.length > 0 ? (events[0]?.id ?? null) : null,
    lastEventId: events.length > 0 ? (events[events.length - 1]?.id ?? null) : null
  }
}

function sortFacts(facts) {
  return [...facts].sort((left, right) => {
    if (left.entityKey !== right.entityKey) return left.entityKey < right.entityKey ? -1 : 1
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}

function sortExcerpts(excerpts) {
  return [...excerpts].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}

function detectConflicts(facts) {
  const bySubjectPredicate = new Map()
  for (const fact of facts) {
    if (fact.status !== 'confirmed') continue
    const groupKey = `${fact.entityKey}||${fact.predicate}`
    const bucket = bySubjectPredicate.get(groupKey) ?? []
    bucket.push(fact)
    bySubjectPredicate.set(groupKey, bucket)
  }
  const conflicts = []
  for (const [groupKey, bucket] of bySubjectPredicate) {
    if (bucket.length < 2) continue
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        if (!factsGenuinelyConflict(bucket[i], bucket[j])) continue
        const [entityKey, predicate] = groupKey.split('||')
        conflicts.push({
          entityKey,
          predicate,
          factIds: [bucket[i].id, bucket[j].id],
          values: [bucket[i].value, bucket[j].value]
        })
        if (conflicts.length >= 12) return conflicts
      }
    }
  }
  return conflicts
}

/**
 * Two same-subject same-predicate confirmed facts conflict only when their
 * validity could actually overlap. Both evidenced with disjoint half-open
 * intervals on the same timeline → different times, not a conflict. Any
 * unevidenced/unknown time → conservatively reported (time cannot separate
 * them), never silently absorbed by authority ordering.
 */
function factsGenuinelyConflict(left, right) {
  if (JSON.stringify(left.value) === JSON.stringify(right.value)) return false
  const leftEvidenced = left.timeApplicability === 'evidenced' && left.validDuring
  const rightEvidenced = right.timeApplicability === 'evidenced' && right.validDuring
  if (!leftEvidenced || !rightEvidenced) return true
  if (left.validDuring.timelineId !== right.validDuring.timelineId) return true
  const overlap = intervalOverlapsWindow(right.validDuring, left.validDuring)
  return overlap !== 'outside'
}

function truncateOutput(facts, excerpts, hypotheses, budget) {
  let chars = 0
  let truncated = false
  const keptFacts = []
  const keptExcerpts = []
  const keptHypotheses = []
  const countTruncated = { facts: 0, excerpts: 0, hypotheses: 0 }
  let itemCount = 0
  // The budget covers the WHOLE serialized item (ids, predicates, sourceRefs,
  // diagnostics-bearing fields — not just text/value), so large non-text
  // fields cannot silently inflate the output past the contract limit.
  const pushItem = (item, kind) => {
    const size = stableStringify(item).length
    if (itemCount >= budget.maxOutputItems || chars + size > budget.maxOutputChars) {
      truncated = true
      countTruncated[kind] += 1
      return
    }
    chars += size
    itemCount += 1
    if (kind === 'facts') keptFacts.push(item)
    else if (kind === 'excerpts') keptExcerpts.push(item)
    else keptHypotheses.push(item)
  }
  for (const fact of facts) pushItem(fact, 'facts')
  for (const excerpt of excerpts) pushItem(excerpt, 'excerpts')
  for (const hypothesis of hypotheses) pushItem(hypothesis, 'hypotheses')
  return { keptFacts, keptExcerpts, keptHypotheses, truncated, countTruncated, chars }
}

function collectHistoryCauses(scope, resolvedEntryKeys, resolvedNodeKeys, result, signal) {
  const snapshot = scope.snapshot
  const worldbookId = snapshot.worldbook.id
  const adapted = adaptGeoHistory(snapshot, resolvedEntryKeys, resolvedNodeKeys)
  for (const diagnostic of adapted.diagnostics ?? []) pushDiagnostic(result, diagnostic)
  const items = [...(adapted.items ?? [])]
  const excerptItemIds = new Set(items.map((item) => item.id))
  const nodes = Array.isArray(snapshot.geoHistory?.nodes) ? snapshot.geoHistory.nodes : []
  const nodeById = new Map(
    nodes.filter((node) => node && typeof node.id === 'string').map((node) => [node.id, node])
  )
  const adjacency = new Map()
  for (const link of adapted.links ?? []) {
    // history-causes walks INCOMING explicit edges: the anchor's causes are
    // the nodes that link TO it. causes/consequences prose strings are never
    // traversed.
    const bucket = adjacency.get(link.to) ?? []
    bucket.push(link.from)
    adjacency.set(link.to, bucket)
  }
  // Anchors are node ids: directly resolved nodes plus nodes already bound to
  // resolved entries (the latter arrive as adapted excerpts).
  const anchors = new Set()
  for (const key of resolvedNodeKeys) {
    anchors.add(key.slice(`geonode:${worldbookId}:`.length))
  }
  for (const item of items) {
    if (item.sourceKind === 'geo-history-node') {
      anchors.add(item.id.slice('excerpt:geo-history-node:'.length))
    }
  }
  const visited = new Set()
  let capped = false
  const queue = [...anchors].map((nodeId) => ({ nodeId, hop: 0 }))
  while (queue.length > 0) {
    if (signal?.aborted) return { aborted: true }
    const current = queue.shift()
    if (visited.has(current.nodeId)) {
      pushDiagnostic(result, { code: REASON_CODES.historyCycleTruncated, detail: current.nodeId })
      continue
    }
    visited.add(current.nodeId)
    if (visited.size > 24) {
      capped = true
      break
    }
    if (current.hop >= 2) continue
    for (const nextId of adjacency.get(current.nodeId) ?? []) {
      if (visited.has(nextId)) continue
      if (visited.size + queue.length >= 24) {
        capped = true
        break
      }
      if (!nodeById.has(nextId)) continue
      queue.push({ nodeId: nextId, hop: current.hop + 1 })
    }
  }
  if (capped) pushDiagnostic(result, { code: REASON_CODES.historyHopLimitReached })
  const geoRevision = adapted.revision ?? 'geohistory:unknown'
  for (const nodeId of visited) {
    const excerptId = `excerpt:geo-history-node:${nodeId}`
    if (excerptItemIds.has(excerptId)) continue
    const node = nodeById.get(nodeId)
    if (!node) continue
    const boundEntryIds = Array.isArray(node.entryIds) ? node.entryIds : []
    items.push({
      kind: 'excerpt',
      id: excerptId,
      entityKeys: [
        geoNodeKey(worldbookId, nodeId),
        ...boundEntryIds.map((entryId) => worldbookEntityKey(worldbookId, entryId))
      ],
      sourceKind: 'geo-history-node',
      title: typeof node.title === 'string' ? node.title : '',
      text: [typeof node.summary === 'string' ? node.summary : '',
        typeof node.yearLabel === 'string' ? ` · ${node.yearLabel}` : ''].join('').slice(0, 1200),
      textTruncated: false,
      eraId: typeof node.ageId === 'string' ? node.ageId : null,
      yearLabel: typeof node.yearLabel === 'string' ? node.yearLabel : null,
      causeLabels: Array.isArray(node.causes) ? node.causes : [],
      consequenceLabels: Array.isArray(node.consequences) ? node.consequences : [],
      entryIds: boundEntryIds,
      playable: node.playable === true,
      revision: geoRevision
    })
  }
  const causalEdges = (adapted.links ?? [])
    .filter((link) => visited.has(link.from) && visited.has(link.to))
    .map((link) => ({ from: link.from, to: link.to, type: link.type }))
  // Cycle check runs on the explicit edges induced by the visited set: a
  // cyclic cause chain must be reported, not silently walked or hidden.
  if (visitedSubgraphHasCycle(causalEdges)) {
    pushDiagnostic(result, { code: REASON_CODES.historyCycleTruncated })
  }
  return { items, causalEdges, revision: adapted.revision ?? null }
}

function visitedSubgraphHasCycle(edges) {
  const adjacency = new Map()
  for (const edge of edges) {
    const bucket = adjacency.get(edge.from) ?? []
    bucket.push(edge.to)
    adjacency.set(edge.from, bucket)
  }
  const state = new Map()
  let cyclic = false
  const visit = (node) => {
    if (cyclic) return
    const current = state.get(node)
    if (current === 1) {
      cyclic = true
      return
    }
    if (current === 2) return
    state.set(node, 1)
    for (const next of adjacency.get(node) ?? []) visit(next)
    state.set(node, 2)
  }
  for (const node of adjacency.keys()) visit(node)
  return cyclic
}

function applyPerspectiveToItems({ facts, excerpts, hypotheses, perspectiveEntity, snapshot, result }) {
  if (!perspectiveEntity) return { facts, excerpts, hypotheses }
  const characterId = perspectiveEntity.id
  const characterKey = runtimeCharacterKey(snapshot.project.id, characterId)
  const assertions = new Set()
  const knowledgeAssertionList = Array.isArray(snapshot.knowledgeAssertions) ? snapshot.knowledgeAssertions : []
  for (const assertion of knowledgeAssertionList) {
    if (assertion && assertion.characterId === characterId && typeof assertion.refId === 'string') {
      assertions.add(assertion.refId)
    }
  }
  const keptFacts = []
  let knowledgeUnrecorded = false
  for (const fact of facts) {
    if (fact.entityKey === characterKey) {
      keptFacts.push(fact)
      continue
    }
    const visibility = fact.visibility
    if (visibility && visibility.level === 'public') {
      keptFacts.push(fact)
      continue
    }
    if (visibility && visibility.level === 'known-by' && Array.isArray(visibility.characterIds)) {
      if (visibility.characterIds.includes(characterId) || assertions.has(fact.factId)) {
        keptFacts.push(fact)
      }
      continue
    }
    if (visibility && visibility.level === 'private') continue
    if (assertions.has(fact.factId)) {
      keptFacts.push(fact)
      continue
    }
    knowledgeUnrecorded = true
  }
  if (knowledgeUnrecorded) {
    pushDiagnostic(result, { code: REASON_CODES.characterKnowledgeUnrecorded })
  }
  const keptExcerpts = []
  for (const excerpt of excerpts) {
    const visibility = excerpt.visibility
    if (visibility && visibility.level === 'public') {
      keptExcerpts.push(excerpt)
      continue
    }
    if (excerpt.sourceKind === 'worldbook-entry') {
      const entryId = excerpt.id.replace('excerpt:worldbook-entry:', '')
      if (assertions.has(`entry:${entryId}`)) {
        keptExcerpts.push(excerpt)
        continue
      }
    }
    if (excerpt.sourceKind === 'geo-history-node') {
      const nodeId = excerpt.id.replace('excerpt:geo-history-node:', '')
      if (assertions.has(`node:${nodeId}`)) {
        keptExcerpts.push(excerpt)
        continue
      }
    }
    knowledgeUnrecorded = true
  }
  // Author-workspace material (unadopted drafts) never enters a character
  // perspective, and perspective-hidden items are not counted.
  return { facts: keptFacts, excerpts: keptExcerpts, hypotheses: [] }
}

/**
 * Main entry point. `context = { snapshot? , scope?, budget?, signal? }`.
 * Returns a frozen result envelope; on abort the envelope carries no partial
 * content.
 */
export function queryKnowledge(request, context) {
  const normalized = normalizeKnowledgeRequest(request)
  if (!normalized.ok) {
    return failResult('unsupported', normalized.errors.map((error) => ({
      code: error.code ?? REASON_CODES.requestInvalid,
      detail: error.path ?? null
    })))
  }
  const requestNorm = normalized.request
  const validation = validateKnowledgeContext(context)
  if (!validation.ok) {
    return failResult('denied', [{ code: REASON_CODES.contextInvalid }])
  }
  const signal = context.signal ?? null
  if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])

  let scopeResult
  if (context.scope) {
    scopeResult = { ok: true, scope: context.scope }
  } else {
    scopeResult = createKnowledgeScope(context.snapshot)
  }
  if (!scopeResult.ok) {
    return failResult('denied', scopeResult.errors.map((error) => ({ code: error.code ?? REASON_CODES.contextInvalid })))
  }
  const scope = scopeResult.scope
  const snapshot = scope.snapshot
  const budget = contextBudget(context)

  // Authorization precondition: the request may only query the snapshot's own
  // project. No content, count, or existence hint crosses projects.
  if (requestNorm.projectId !== snapshot.project.id) {
    return failResult('denied', [{ code: REASON_CODES.projectMismatch }])
  }
  if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])

  // Perspective resolution (before any data leaves the snapshot).
  const perspectiveResolution = resolvePerspectiveCharacter(requestNorm.perspective, snapshot, scope.aliasIndex)
  if (!perspectiveResolution.ok) {
    if (perspectiveResolution.reason === 'cross-project-ref') {
      return failResult('denied', [{ code: REASON_CODES.crossProjectRef }])
    }
    return failResult('unknown', [{ code: REASON_CODES.perspectiveEntityUnknown }])
  }
  const perspectiveEntity = perspectiveResolution.character

  // Entity resolution.
  const result = createEmptyResult()
  result.coverage.requestedEntities = requestNorm.entityRefs.length
  const resolvedEntityKeys = new Set()
  const resolvedEntryKeys = new Set()
  const resolvedNodeKeys = new Set()
  const resolvedEntryIds = new Set()
  const runtimeCharacterIds = new Set()
  const resolvedMemoryIds = new Set()
  let anyRefDenied = false
  for (const ref of requestNorm.entityRefs) {
    if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])
    const resolution = resolveEntityRef(ref, snapshot, scope.aliasIndex)
    if (resolution.status === 'resolved') {
      resolvedEntityKeys.add(resolution.key)
      if (resolution.entity.kind === 'worldbook-entry') {
        resolvedEntryKeys.add(resolution.key)
        resolvedEntryIds.add(resolution.entity.id)
      } else if (resolution.entity.kind === 'geo-history-node') {
        resolvedNodeKeys.add(resolution.key)
      } else if (resolution.entity.kind === 'runtime-character') {
        runtimeCharacterIds.add(resolution.entity.id)
        resolvedEntryKeys.add(resolution.key)
      } else if (resolution.entity.kind === 'memory') {
        resolvedMemoryIds.add(resolution.entity.id)
      }
    } else if (resolution.status === 'ambiguous') {
      result.coverage.ambiguousRefs.push({ ref: { kind: ref.kind, id: ref.id }, candidates: resolution.candidates })
      pushDiagnostic(result, { code: REASON_CODES.entityAmbiguous, entityKey: ref.id })
    } else if (resolution.status === 'denied') {
      anyRefDenied = true
    } else {
      result.coverage.unresolvedRefs.push({ kind: ref.kind, id: ref.id })
      pushDiagnostic(result, {
        code: resolution.reason === 'legacy-alias-unmapped' ? REASON_CODES.legacyAliasUnmapped : REASON_CODES.entityNotFound,
        entityKey: ref.id
      })
    }
  }
  if (anyRefDenied) {
    return failResult('denied', [{ code: REASON_CODES.crossProjectRef }])
  }
  result.coverage.resolvedEntities = resolvedEntityKeys.size

  // Author revision / manuscript cutoff: v1 only serves the actual saved
  // version. Anything else is unsupported, never approximated.
  if (requestNorm.authorRevision !== undefined) {
    const currentAuthorRevision = snapshot.revision?.author ?? null
    if (!currentAuthorRevision || requestNorm.authorRevision !== currentAuthorRevision) {
      pushDiagnostic(result, { code: REASON_CODES.authorRevisionUnavailable })
      promoteStatus(result, 'unsupported')
      return Object.freeze(result)
    }
  }
  if (requestNorm.manuscriptCutoff !== undefined) {
    const currentManuscriptRevision = snapshot.revision?.manuscript ?? null
    if (!currentManuscriptRevision || requestNorm.manuscriptCutoff !== currentManuscriptRevision) {
      pushDiagnostic(result, { code: REASON_CODES.manuscriptCutoffUnavailable })
      promoteStatus(result, 'unsupported')
      return Object.freeze(result)
    }
  }

  // Timeline handling. A story time on an undeclared or different timeline is
  // a data gap (unknown), not authorization failure.
  let queryWindow = null
  if (requestNorm.storyTime) {
    if (!scope.timeline) {
      pushDiagnostic(result, { code: REASON_CODES.timelineUndeclared })
      promoteStatus(result, 'unknown')
    } else {
      const point = toTimePoint(requestNorm.storyTime, scope.timeline)
      if (!point.ok) {
        pushDiagnostic(result, {
          code: point.error === 'timeline-mismatch' ? REASON_CODES.timelineMismatch : REASON_CODES.storyTimeUnknown
        })
        promoteStatus(result, 'unknown')
      } else {
        const window = toQueryWindow(point.point, scope.timeline)
        if (!window.ok) {
          pushDiagnostic(result, { code: REASON_CODES.storyTimeUnknown })
          promoteStatus(result, 'unknown')
        } else {
          queryWindow = window.window
        }
      }
    }
  }
  if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])

  // Source adaptation, gated by the caller-declared scope. Each consulted
  // adapter contributes its bounded scope fingerprint so dependency checks
  // cover "new conflicting fact appears" without hashing unrelated data.
  const scopeRevisions = {}
  const includeSources = new Set(requestNorm.sourceScope.includeSources)
  const facts = []
  const excerpts = []
  const hypotheses = []
  const runtimeWindowInfo = runtimeWindow(snapshot, requestNorm.sourceScope.runtimeBranchId)
  if (runtimeWindowInfo?.branchMismatch) {
    pushDiagnostic(result, { code: REASON_CODES.sourceScopeExcluded, detail: 'runtime-branch' })
  }

  const wantsRuntimeFacts = includeSources.has('canonical-fact') && !runtimeWindowInfo?.branchMismatch
  if (wantsRuntimeFacts) {
    const adaptedFacts = adaptCanonicalFacts(
      snapshot,
      resolvedEntityKeys,
      runtimeCharacterIds,
      resolvedEntryIds,
      scope.aliasIndex,
      scope.timeline
    )
    facts.push(...adaptedFacts.items)
    if (adaptedFacts.scopeFingerprint) scopeRevisions.canonicalFacts = adaptedFacts.scopeFingerprint
    for (const diagnostic of adaptedFacts.diagnostics) pushDiagnostic(result, diagnostic)
  }
  if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])

  if (includeSources.has('worldbook-entry')) {
    const adaptedEntries = adaptWorldbookEntries(snapshot, resolvedEntryKeys)
    excerpts.push(...adaptedEntries.items)
    if (adaptedEntries.scopeFingerprint) scopeRevisions.worldbookEntries = adaptedEntries.scopeFingerprint
    for (const diagnostic of adaptedEntries.diagnostics) pushDiagnostic(result, diagnostic)
  }
  if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])

  let causalEdges = []
  if (requestNorm.questionKind === 'history-causes') {
    const traversal = collectHistoryCauses(scope, resolvedEntryKeys, resolvedNodeKeys, result, signal)
    if (traversal.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])
    if (traversal.causalEdges) causalEdges = traversal.causalEdges
    if (traversal.revision) scopeRevisions.geoHistory = traversal.revision
    excerpts.push(...(traversal.items ?? []))
  } else if (includeSources.has('geo-history-node')) {
    const adaptedHistory = adaptGeoHistory(snapshot, resolvedEntryKeys, resolvedNodeKeys)
    excerpts.push(...(adaptedHistory.items ?? []))
    if (adaptedHistory.revision && (adaptedHistory.items ?? []).length > 0) {
      scopeRevisions.geoHistory = adaptedHistory.revision
    }
    for (const diagnostic of adaptedHistory.diagnostics ?? []) pushDiagnostic(result, diagnostic)
  }
  if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])

  if (includeSources.has('research-claim')) {
    const adaptedClaims = adaptResearchClaims(snapshot, resolvedEntryKeys)
    excerpts.push(...adaptedClaims.items)
    if (adaptedClaims.scopeFingerprint) scopeRevisions.researchClaims = adaptedClaims.scopeFingerprint
    for (const diagnostic of adaptedClaims.diagnostics) pushDiagnostic(result, diagnostic)
  }
  if (includeSources.has('memory') && resolvedMemoryIds.size > 0) {
    const adaptedMemory = adaptMemories(snapshot, resolvedMemoryIds)
    excerpts.push(...adaptedMemory.items)
    if (adaptedMemory.scopeFingerprint) scopeRevisions.memories = adaptedMemory.scopeFingerprint
    for (const diagnostic of adaptedMemory.diagnostics) pushDiagnostic(result, diagnostic)
  }

  // Unadopted drafts: excluded by policy unless explicitly allowlisted.
  const wantsDrafts = requestNorm.sourceScope.includeUnadoptedDrafts
  if (wantsDrafts) {
    const adaptedDrafts = adaptUnadoptedDrafts(snapshot, requestNorm.sourceScope)
    hypotheses.push(...adaptedDrafts.items)
    result.coverage.excludedByPolicy.unadoptedDrafts = adaptedDrafts.excludedCount
    for (const diagnostic of adaptedDrafts.diagnostics) pushDiagnostic(result, diagnostic)
  } else {
    const total = Array.isArray(snapshot.drafts) ? snapshot.drafts.length : 0
    if (total > 0) result.coverage.excludedByPolicy.unadoptedDrafts = total
  }

  if (signal?.aborted) return failResult('aborted', [{ code: REASON_CODES.aborted }])

  // Time filtering / labeling happens BEFORE sorting and truncation.
  if (queryWindow) {
    const timeFiltered = []
    for (const fact of facts) {
      if (fact.timeApplicability !== 'evidenced' || !fact.validDuring) {
        result.coverage.timeUnknownCount += 1
        timeFiltered.push(fact)
        continue
      }
      const overlap = intervalOverlapsWindow(fact.validDuring, queryWindow)
      if (overlap === 'inside') timeFiltered.push(fact)
      else if (overlap === 'unknown') {
        result.coverage.timeUnknownCount += 1
        pushDiagnostic(result, { code: REASON_CODES.intervalEndUnknown, factId: fact.factId })
        timeFiltered.push(fact)
      }
    }
    facts.length = 0
    facts.push(...timeFiltered)
    const eraFiltered = []
    for (const excerpt of excerpts) {
      if (excerpt.sourceKind !== 'geo-history-node' || !excerpt.eraId) {
        eraFiltered.push(excerpt)
        continue
      }
      const inside = eraMatchesWindow(excerpt.eraId, queryWindow, scope.timeline)
      if (inside === 'inside') eraFiltered.push(excerpt)
    }
    excerpts.length = 0
    excerpts.push(...eraFiltered)
  } else if (requestNorm.questionKind === 'fact-at-time') {
    // A time-scoped question without a usable window cannot assert
    // applicability at the requested time for ANY fact — evidenced or not.
    // The evidence stays on the item; the coverage count records the gap.
    result.coverage.timeUnknownCount += facts.length
  }

  // Perspective filtering (character private view). Counts are NOT recorded
  // for perspective-hidden items: absence of evidence is not evidence of
  // absence, and counts could hint at hidden material.
  const perspectiveOutcome = applyPerspectiveToItems({
    facts,
    excerpts,
    hypotheses,
    perspectiveEntity,
    snapshot,
    result
  })

  // Conflicts among the (already authorized, time-filtered, perspective-
  // filtered) confirmed facts. Authority ordering never absorbs them.
  const conflicts = detectConflicts(perspectiveOutcome.facts)
  for (const conflict of conflicts) result.conflicts.push(conflict)

  // Deterministic order, then bounded truncation.
  const orderedFacts = sortFacts(perspectiveOutcome.facts)
  const orderedExcerpts = sortExcerpts(perspectiveOutcome.excerpts)
  const orderedHypotheses = sortExcerpts(perspectiveOutcome.hypotheses)
  const truncation = truncateOutput(orderedFacts, orderedExcerpts, orderedHypotheses, budget)

  result.facts.push(...truncation.keptFacts)
  result.excerpts.push(...truncation.keptExcerpts)
  result.hypotheses.push(...truncation.keptHypotheses)
  result.coverage.truncated = truncation.truncated
  if (truncation.truncated) {
    pushDiagnostic(result, {
      code: REASON_CODES.outputTruncated,
      detail: truncation.countTruncated
    })
  }
  const events = Array.isArray(snapshot.runtime?.events) ? snapshot.runtime.events : []
  if (wantsRuntimeFacts && events.length >= RUNTIME_EVENT_LIMIT) {
    // Only the consulted runtime window can be truncated for this query.
    result.coverage.windowTruncated = true
    pushDiagnostic(result, { code: REASON_CODES.runtimeWindowTruncated })
  }

  // Dependencies: returned item revisions plus the bounded scope revisions
  // (collected during adaptation), so a newly added conflicting fact
  // invalidates the query even though it was not returned.
  const returnedRevisions = {}
  for (const item of [...result.facts, ...result.excerpts, ...result.hypotheses]) {
    returnedRevisions[item.id] = item.revision ?? null
  }
  result.dependencies = {
    snapshotRevision: snapshot.project.revision ?? null,
    worldbookRevision: typeof snapshot.worldbook.updatedAt === 'number' ? snapshot.worldbook.updatedAt : null,
    runtimeWindow: runtimeWindowInfo && !runtimeWindowInfo.branchMismatch
      ? {
        branchId: runtimeWindowInfo.branchId,
        eventCount: runtimeWindowInfo.eventCount,
        firstEventId: runtimeWindowInfo.firstEventId,
        lastEventId: runtimeWindowInfo.lastEventId
      }
      : null,
    scopeRevisions,
    returnedRevisions
  }
  if (causalEdges.length > 0) result.coverage.causalEdges = causalEdges

  // Final status. Empty content with unresolved/unknown reasons → unknown;
  // content with gaps → partial; conflicts outrank ready.
  const hasContent = result.facts.length + result.excerpts.length + result.hypotheses.length > 0
  if (!hasContent && result.conflicts.length === 0) {
    promoteStatus(result, 'unknown')
    if (result.coverage.unresolvedRefs.length === 0
      && result.coverage.ambiguousRefs.length === 0
      && result.diagnostics.every((diagnostic) => diagnostic.code !== REASON_CODES.entityNotFound
        && diagnostic.code !== REASON_CODES.entityAmbiguous
        && diagnostic.code !== REASON_CODES.timelineUndeclared
        && diagnostic.code !== REASON_CODES.storyTimeUnknown)) {
      pushDiagnostic(result, { code: REASON_CODES.noMatchingData })
    }
  } else if (result.conflicts.length > 0) {
    promoteStatus(result, 'conflict')
  }
  const hasGaps = result.coverage.truncated
    || result.coverage.windowTruncated
    || result.coverage.timeUnknownCount > 0
    || result.coverage.unresolvedRefs.length > 0
    || result.coverage.ambiguousRefs.length > 0
  // Policy exclusions (e.g. unadopted drafts behind an explicit allowlist)
  // are by-design defaults, not answer gaps: they stay visible in coverage
  // but do not demote the status.
  if (hasContent && hasGaps) promoteStatus(result, 'partial')

  result.fingerprint = fingerprintParts({
    request: requestNorm,
    snapshotRevision: result.dependencies.snapshotRevision,
    scopeRevisions,
    budget
  })

  Object.freeze(result.facts)
  Object.freeze(result.excerpts)
  Object.freeze(result.hypotheses)
  Object.freeze(result.conflicts)
  Object.freeze(result.diagnostics)
  return Object.freeze(result)
}

export default {
  queryKnowledge,
  createKnowledgeScope
}
