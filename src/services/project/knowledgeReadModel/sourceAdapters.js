/**
 * knowledgeReadModel/sourceAdapters.js — read-only adapters from the
 * authorized snapshot's collections to normalized result items (v1).
 *
 * Rules frozen for v1:
 * - Prose (entry content, node summaries, memory content, drafts) is adapted
 *   as bounded EXCERPTS. Nothing regex-extracts "confirmed facts" from prose.
 * - Only `canonicalFacts` become typed fact items; legacy facts carry no
 *   story-time evidence, so `timeApplicability:'unknown'` — recorded time is
 *   never promoted to validity time.
 * - Research claims and memories stay `recorded-claim` excerpts; unadopted
 *   drafts stay informal hypotheses in a separate array. None of them are
 *   upgraded to facts by authority ordering.
 * - Deleted structured characters surface as tombstone diagnostics; physical
 *   deletions simply do not appear (no resurrection).
 * - Adapters are pure: inputs are never mutated; abort is checked by the
 *   orchestrator between adapters.
 */

import {
  KNOWLEDGE_LIMITS,
  REASON_CODES,
  hashValue
} from './contract.js'
import {
  runtimeCharacterKey,
  worldbookEntityKey
} from './identity.js'
import { resolveEraOrder } from './time.js'

function boundedText(text, limit = KNOWLEDGE_LIMITS.maxExcerptCharsPerItem) {
  const value = typeof text === 'string' ? text : ''
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: value.slice(0, limit), truncated: true }
}

function entryTombstoneKey(entry) {
  const meta = entry?.metadata
  if (!meta || typeof meta.structuredSettingRef !== 'string') return null
  if (typeof meta.structuredCharacterKey !== 'string') return null
  return `${meta.structuredSettingRef}:${meta.structuredCharacterKey}`
}

function entryRevision(entry, snapshot) {
  const updatedAt = entry?.metadata?.updatedAt
  if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) return `entry:${updatedAt}`
  const worldbookUpdatedAt = snapshot.worldbook?.updatedAt
  return `worldbook:${typeof worldbookUpdatedAt === 'number' ? worldbookUpdatedAt : 'unknown'}`
}

/**
 * Worldbook entry excerpts for the resolved entry keys.
 * Returns { items, diagnostics, scopeFingerprint } — diagnostics may carry
 * tombstone-present; scopeFingerprint covers exactly the matched entries
 * (bounded query scope, used for dependency/invalidation semantics).
 */
export function adaptWorldbookEntries(snapshot, resolvedEntryKeys) {
  const items = []
  const diagnostics = []
  const scopeInputs = []
  const worldbookId = snapshot.worldbook.id
  const tombstones = Array.isArray(snapshot.worldbook.structuredCharacterTombstones)
    ? snapshot.worldbook.structuredCharacterTombstones
    : []
  const entries = Array.isArray(snapshot.worldbook.entries) ? snapshot.worldbook.entries : []
  for (const entry of entries) {
    const key = worldbookEntityKey(worldbookId, entry.id)
    if (!resolvedEntryKeys.has(key)) continue
    scopeInputs.push([entry.id, entry.metadata?.updatedAt ?? null, entry.metadata?.reviewState ?? null])
    const tombstoneKey = entryTombstoneKey(entry)
    if (tombstoneKey && tombstones.includes(tombstoneKey)) {
      diagnostics.push({ code: REASON_CODES.tombstonePresent, entityKey: key })
      continue
    }
    const bounded = boundedText(entry.content)
    const meta = entry.metadata ?? {}
    items.push({
      kind: 'excerpt',
      id: `excerpt:worldbook-entry:${entry.id}`,
      entityKeys: [key],
      sourceKind: 'worldbook-entry',
      title: typeof entry.name === 'string' ? entry.name : '',
      text: bounded.text,
      textTruncated: bounded.truncated,
      entryType: entry.type ?? null,
      constantInjection: entry.injection?.mode === 'constant',
      sourceRefs: Array.isArray(meta.sourceRefs) ? meta.sourceRefs : [],
      claimIds: Array.isArray(meta.claimIds) ? meta.claimIds : [],
      reviewState: meta.reviewState ?? null,
      revision: entryRevision(entry, snapshot)
    })
  }
  const scopeFingerprint = scopeInputs.length > 0
    ? `worldbook-entries:${hashValue(scopeInputs)}`
    : null
  return { items, diagnostics, scopeFingerprint }
}

/**
 * Derive the declared timeline from geoHistory ages. Exported for trusted
 * snapshot builders: the timeline declaration belongs to the snapshot, the
 * adapters only consume it.
 */
export function deriveTimelineFromGeoHistory(worldbookId, geoHistory) {
  if (!geoHistory || typeof geoHistory !== 'object') return null
  const ages = Array.isArray(geoHistory.ages) ? geoHistory.ages : []
  if (ages.length === 0) return null
  const eras = []
  for (const age of ages) {
    if (!age || typeof age.id !== 'string') continue
    eras.push({
      id: age.id,
      order: Number.isInteger(age.order) ? age.order : eras.length,
      ...(typeof age.label === 'string' ? { label: age.label } : {})
    })
  }
  if (eras.length === 0) return null
  return { id: `timeline:geo:${worldbookId}`, eras }
}

/**
 * geoHistory node excerpts + explicit causal edges for the resolved keys.
 * A node belongs to the result set when:
 * - its id was resolved directly (geo-history-node ref), or
 * - its entryBindings reference a resolved entry key.
 * `links` are the generator's explicit `leads-to` edges — traversal uses
 * these only. Orphan links (missing endpoints) are reported, never followed.
 */
export function adaptGeoHistory(snapshot, resolvedEntryKeys, resolvedNodeKeys) {
  const geoHistory = snapshot.geoHistory
  if (!geoHistory || typeof geoHistory !== 'object') {
    return { items: [], links: [], diagnostics: [] }
  }
  const items = []
  const diagnostics = []
  const worldbookId = snapshot.worldbook.id
  const nodes = Array.isArray(geoHistory.nodes) ? geoHistory.nodes : []
  const nodeIds = new Set()
  for (const node of nodes) {
    if (node && typeof node.id === 'string') nodeIds.add(node.id)
  }
  const links = []
  const rawLinks = Array.isArray(geoHistory.links) ? geoHistory.links : []
  for (const link of rawLinks) {
    if (!link || typeof link.from !== 'string' || typeof link.to !== 'string') continue
    const orphan = !nodeIds.has(link.from) || !nodeIds.has(link.to)
    if (orphan) {
      diagnostics.push({
        code: REASON_CODES.historyLinkOrphan,
        linkId: typeof link.id === 'string' ? link.id : null
      })
      continue
    }
    links.push({ id: link.id ?? `link:${link.from}:${link.to}`, from: link.from, to: link.to, type: link.type ?? 'leads-to' })
  }
  // Conservative graph scope: explicit structure (node ids + entry bindings)
  // of the whole declared geoHistory, so rebindings that could change causal
  // traversal invalidate queries. Node prose is not part of the scope hash.
  const geoRevision = `geohistory:${hashValue({
    seed: geoHistory.seed ?? null,
    source: geoHistory.source ?? null,
    nodes: nodes.map((node) => [node?.id ?? null, Array.isArray(node?.entryIds) ? node.entryIds : null]),
    links: links.map((link) => [link.from, link.to])
  })}`
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string') continue
    const nodeKey = `geonode:${worldbookId}:${node.id}`
    const boundEntryIds = Array.isArray(node.entryIds) ? node.entryIds : []
    const directlyResolved = resolvedNodeKeys.has(nodeKey)
    const boundToResolved = boundEntryIds.some((entryId) => resolvedEntryKeys.has(worldbookEntityKey(worldbookId, entryId)))
    if (!directlyResolved && !boundToResolved) continue
    const bounded = boundedText([
      typeof node.summary === 'string' ? node.summary : '',
      typeof node.yearLabel === 'string' ? ` · ${node.yearLabel}` : ''
    ].join(''))
    items.push({
      kind: 'excerpt',
      id: `excerpt:geo-history-node:${node.id}`,
      entityKeys: [
        nodeKey,
        ...boundEntryIds.map((entryId) => worldbookEntityKey(worldbookId, entryId))
      ],
      sourceKind: 'geo-history-node',
      title: typeof node.title === 'string' ? node.title : '',
      text: bounded.text,
      textTruncated: bounded.truncated,
      eraId: typeof node.ageId === 'string' ? node.ageId : null,
      yearLabel: typeof node.yearLabel === 'string' ? node.yearLabel : null,
      causeLabels: Array.isArray(node.causes) ? node.causes : [],
      consequenceLabels: Array.isArray(node.consequences) ? node.consequences : [],
      entryIds: boundEntryIds,
      playable: node.playable === true,
      revision: geoRevision
    })
  }
  return { items, links, diagnostics, revision: geoRevision }
}

/**
 * Normalize a stored rich interval ({eraId, ordinal}) into comparable form
 * ({eraOrder, ordinal}) against the declared timeline. Semantics:
 * - start absent/null → start unknown (allowed)
 * - endSemantic 'open' → no end bound; 'unknown' → end ignored as unknown;
 *   'exclusive' requires a resolvable end bound
 * - unresolvable eras make the evidence unusable → { usable:false }
 */
function normalizeValidDuring(validDuring, timeline) {
  if (!validDuring || typeof validDuring !== 'object' || !timeline) {
    return { usable: false, interval: null }
  }
  const normalizeBound = (bound) => {
    if (!bound || typeof bound !== 'object') return null
    const eraOrder = resolveEraOrder(timeline, bound.eraId)
    if (eraOrder === null) return null
    return {
      eraOrder,
      ordinal: Number.isInteger(bound.ordinal) ? bound.ordinal : null
    }
  }
  const endSemantic = validDuring.endSemantic
  if (!['exclusive', 'open', 'unknown'].includes(endSemantic)) {
    return { usable: false, interval: null }
  }
  let start = null
  if (validDuring.start) {
    start = normalizeBound(validDuring.start)
    if (start === null) return { usable: false, interval: null }
  }
  let end = null
  if (endSemantic === 'exclusive') {
    end = validDuring.end ? normalizeBound(validDuring.end) : null
    if (end === null) return { usable: false, interval: null }
  }
  return {
    usable: true,
    interval: {
      timelineId: validDuring.timelineId,
      start,
      end,
      endSemantic
    }
  }
}

/**
 * Canonical runtime facts. Subject mapping is explicit only:
 * - subjectId equals a resolved runtime character id → that character key
 * - subjectId is a legacy place id with an explicit mapping → that key
 * - subjectId equals a resolved worldbook entry id → that key
 * Everything else is skipped for entity queries (no name-based guessing).
 * Legacy facts have no validDuring: timeApplicability stays 'unknown'.
 * Rich snapshots may carry `validDuring` ({eraId, ordinal}) + `visibility`;
 * validDuring is normalized to {eraOrder, ordinal} against the declared
 * timeline and timeApplicability becomes 'evidenced' only when usable.
 * scopeFingerprint covers ALL facts that map to the resolved entities
 * (whatever later filters do), so a newly added conflicting fact invalidates
 * the query even though it was not returned.
 */
export function adaptCanonicalFacts(snapshot, resolvedEntityKeys, runtimeCharacterIds, resolvedEntryIds, aliasIndex, timeline) {
  const facts = snapshot.runtime?.canonicalFacts
  if (!facts || typeof facts !== 'object') {
    return { items: [], windowTruncated: false, diagnostics: [], scopeFingerprint: null }
  }
  const items = []
  const diagnostics = []
  const scopeInputs = []
  const projectId = snapshot.project.id
  for (const [factId, raw] of Object.entries(facts)) {
    if (!raw || typeof raw !== 'object') continue
    let entityKey = null
    if (runtimeCharacterIds.has(raw.subjectId)) {
      entityKey = runtimeCharacterKey(projectId, raw.subjectId)
    } else if (resolvedEntryIds.has(raw.subjectId)) {
      entityKey = worldbookEntityKey(snapshot.worldbook.id, raw.subjectId)
    } else if (aliasIndex) {
      // Legacy `place:{wb}:{map}:{site}` subjects resolve only through the
      // explicit geoHistory mapping; ambiguous or unmapped ids never match.
      const mappedKeys = aliasIndex.legacyPlaceToKeys.get(raw.subjectId)
      if (mappedKeys && mappedKeys.length === 1) entityKey = mappedKeys[0]
    }
    if (!entityKey || !resolvedEntityKeys.has(entityKey)) continue
    scopeInputs.push([factId, raw.status ?? null, raw.value ?? null])
    const normalizedTime = normalizeValidDuring(raw.validDuring ?? null, timeline)
    if (raw.validDuring !== undefined && raw.validDuring !== null && !normalizedTime.usable) {
      // Rich-shaped evidence exists but is unusable against the declared
      // timeline: honest downgrade to unknown, never a silent guess.
      diagnostics.push({ code: REASON_CODES.factTimeUnevidenced, factId })
    } else if (raw.validDuring === undefined || raw.validDuring === null) {
      // Legacy shape: absence of time evidence is reported, never defaulted
      // to "always true".
      diagnostics.push({ code: REASON_CODES.factTimeUnevidenced, factId })
    }
    items.push({
      kind: 'fact',
      id: `fact:${factId}`,
      factId,
      entityKey,
      subjectId: raw.subjectId,
      predicate: raw.predicate,
      value: raw.value ?? null,
      status: raw.status ?? 'confirmed',
      ...(typeof raw.confidence === 'number' ? { confidence: raw.confidence } : {}),
      sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
      sourceKind: 'canonical-fact',
      validDuring: normalizedTime.usable ? normalizedTime.interval : null,
      timeApplicability: normalizedTime.usable ? 'evidenced' : 'unknown',
      visibility: raw.visibility ?? null,
      revision: `fact:${hashValue(raw)}`
    })
  }
  const scopeFingerprint = scopeInputs.length > 0
    ? `canonical-facts:${hashValue(scopeInputs)}`
    : null
  return { items, windowTruncated: false, diagnostics, scopeFingerprint }
}

/**
 * Research claims bound to resolved entries via the explicit
 * entry.metadata.claimIds mapping. Stale claims are returned but flagged
 * (expired references must be detectable, not silently fresh).
 */
export function adaptResearchClaims(snapshot, resolvedEntryKeys) {
  const research = snapshot.worldbook?.research
  if (!research || typeof research !== 'object') return { items: [], diagnostics: [], scopeFingerprint: null }
  const claims = Array.isArray(research.claims) ? research.claims : []
  const diagnostics = []
  const worldbookId = snapshot.worldbook.id
  const entries = Array.isArray(snapshot.worldbook.entries) ? snapshot.worldbook.entries : []
  const claimIdsWanted = new Set()
  for (const entry of entries) {
    const key = worldbookEntityKey(worldbookId, entry.id)
    if (!resolvedEntryKeys.has(key)) continue
    for (const claimId of Array.isArray(entry.metadata?.claimIds) ? entry.metadata.claimIds : []) {
      claimIdsWanted.add(claimId)
    }
  }
  if (claimIdsWanted.size === 0) return { items: [], diagnostics, scopeFingerprint: null }
  const items = []
  const scopeInputs = []
  const researchRevision = research.revision ?? null
  for (const claim of claims) {
    if (!claim || typeof claim.id !== 'string' || !claimIdsWanted.has(claim.id)) continue
    scopeInputs.push([claim.id, claim.status ?? null])
    const bounded = boundedText(claim.text)
    if (claim.status === 'stale') {
      diagnostics.push({ code: REASON_CODES.sourceRevisionStale, claimId: claim.id })
    }
    items.push({
      kind: 'excerpt',
      id: `excerpt:research-claim:${claim.id}`,
      entityKeys: [],
      sourceKind: 'research-claim',
      title: `claim ${claim.id}`,
      text: bounded.text,
      textTruncated: bounded.truncated,
      claimType: claim.type ?? null,
      basis: claim.basis ?? null,
      claimStatus: claim.status ?? null,
      evidenceRefs: Array.isArray(claim.evidenceRefs) ? claim.evidenceRefs : [],
      sourceRefs: Array.isArray(claim.sourceRefs) ? claim.sourceRefs : [],
      revision: `research:${researchRevision ?? hashValue(claim)}`
    })
  }
  const scopeFingerprint = scopeInputs.length > 0
    ? `research-claims:${hashValue(scopeInputs)}`
    : null
  return { items, diagnostics, scopeFingerprint }
}

/**
 * Memory excerpts, v1.1: memories are queryable ONLY by explicit 'memory'
 * entity-kind id references (never by association with other entities —
 * that would fabricate provenance). scopeFingerprint covers exactly the
 * referenced memories.
 */
export function adaptMemories(snapshot, resolvedMemoryIds) {
  const wanted = resolvedMemoryIds ?? new Set()
  if (wanted.size === 0) return { items: [], scopeFingerprint: null, diagnostics: [] }
  const memories = Array.isArray(snapshot.memories) ? snapshot.memories : []
  const items = []
  const scopeInputs = []
  for (const memory of memories) {
    if (!memory || typeof memory.id !== 'string' || !wanted.has(memory.id)) continue
    scopeInputs.push([memory.id, memory.status ?? null, hashValue(memory.content ?? '')])
    const bounded = boundedText(memory.content)
    items.push({
      kind: 'excerpt',
      id: `excerpt:memory:${memory.id}`,
      entityKeys: [`memory:${snapshot.project.id}:${memory.id}`],
      sourceKind: 'memory',
      title: typeof memory.title === 'string' && memory.title ? memory.title : '相关记忆',
      text: bounded.text,
      textTruncated: bounded.truncated,
      memoryStatus: memory.status ?? null,
      authority: memory.authority ?? null,
      revision: `memory:${hashValue(memory)}`
    })
  }
  const scopeFingerprint = scopeInputs.length > 0
    ? `memories:${hashValue(scopeInputs)}`
    : null
  return { items, scopeFingerprint, diagnostics: [] }
}

/**
 * Unadopted drafts (writing-ghost-candidate etc.). Only reachable with an
 * explicit id allowlist; they land in hypotheses, never facts.
 */
export function adaptUnadoptedDrafts(snapshot, sourceScope) {
  if (!sourceScope.includeUnadoptedDrafts) {
    const total = Array.isArray(snapshot.drafts) ? snapshot.drafts.length : 0
    return { items: [], excludedCount: total, diagnostics: [] }
  }
  const allow = new Set(sourceScope.draftIds ?? [])
  const items = []
  const drafts = Array.isArray(snapshot.drafts) ? snapshot.drafts : []
  let excludedCount = 0
  for (const draft of drafts) {
    if (!draft || typeof draft.id !== 'string') continue
    if (!allow.has(draft.id)) {
      excludedCount += 1
      continue
    }
    const bounded = boundedText(draft.text)
    items.push({
      kind: 'hypothesis',
      id: `hypothesis:unadopted-draft:${draft.id}`,
      sourceKind: 'unadopted-draft',
      title: typeof draft.mode === 'string' ? `draft ${draft.mode}` : 'unadopted draft',
      text: bounded.text,
      textTruncated: bounded.truncated,
      authority: 'informal',
      draftStatus: draft.status ?? null,
      revision: `draft:${hashValue(draft)}`
    })
  }
  return {
    items,
    excludedCount,
    diagnostics: [{ code: REASON_CODES.draftInformalOnly }]
  }
}
