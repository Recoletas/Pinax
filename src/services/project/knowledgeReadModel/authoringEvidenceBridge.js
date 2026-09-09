/**
 * knowledgeReadModel/authoringEvidenceBridge.js — narrow F2 evidence bridge
 * (round-2 K23; NOT yet wired into production on its own).
 *
 * Direction in: an EXPLICIT subset of the already-authorized F2 evidence
 * catalog (authoringKnowledgeAnswerContract items, re-validated here through
 * the formal normalizeAuthoringEvidence interface) is mapped into a K
 * snapshot. Only worldbook / history / memory authorities are mappable;
 * anything else is typed-rejected — never disguised as worldbook-entry.
 *
 * Direction out: K result items are mapped back to F2 evidence with the
 * ORIGINAL sourceRef, locator and revision carried from the input catalog
 * (mapping table passthrough), so F2's existing stale reconciliation
 * (reconcileAuthoringKnowledgeAnswer / collectCurrentRevisions) keeps
 * working unchanged. K facts/hypotheses cannot exist in a bridge snapshot;
 * if they ever appear they are reported as unsupported notes, not converted.
 *
 * Identity rules:
 * - `worldbook-entry:<id>` locators carry worldbookId: it must equal the
 *   bridge's declared binding. Prefix-swapping a ref is not a mapping.
 * - `history-node:<id>` / `memory:<id>` locators carry no worldbook field;
 *   their worldbook/project association is asserted by the caller's binding
 *   parameter and per-item projectId checks (documented F2 limitation).
 * - Duplicate sourceRef with conflicting content is rejected (mirrors the F2
 *   catalog conflict policy: ambiguity is dropped, not adjudicated).
 * - The bridge snapshot carries NO timeline and NO character knowledge: time
 *   and perspective questions honestly answer unknown.
 */

import {
  REASON_CODES,
  fingerprintParts,
  freezeKnowledgeSnapshot
} from './contract.js'
import { createKnowledgeScope, queryKnowledge } from './query.js'
import { normalizeAuthoringEvidence } from '../../agents/authoring/authoringKnowledgeAnswerContract.js'

const MAPPABLE_AUTHORITIES = new Set(['worldbook', 'history', 'memory'])

const MISSING_INFORMATION_TEXT = Object.freeze({
  [REASON_CODES.noMatchingData]: '知识模型：已授权资料中没有与该实体直接相关的条目。',
  [REASON_CODES.storyTimeUnknown]: '知识模型：资料未记录可比较的故事时间，无法判断该时点是否成立。',
  [REASON_CODES.timelineUndeclared]: '知识模型：资料未声明时间线，时点问题不可判定。',
  [REASON_CODES.timelineMismatch]: '知识模型：所问时间线不在已授权资料范围内。',
  [REASON_CODES.factTimeUnevidenced]: '知识模型：相关记录没有时间依据，不默认其永恒成立。',
  [REASON_CODES.characterKnowledgeUnrecorded]: '知识模型：资料未记录角色知识依据，无法给出该视角的私有资料。',
  [REASON_CODES.authorRevisionUnavailable]: '知识模型：所问作者版本不可用，仅支持当前实际保存版本。',
  [REASON_CODES.manuscriptCutoffUnavailable]: '知识模型：资料不含稿件版本信息，无法按截止版本回答。'
})

function sameLocator(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

/**
 * Build the bridge from an explicit authorized F2 evidence subset. Every
 * item is re-validated through the formal F2 normalize interface; invalid
 * items fail the whole build (fail-closed) — the caller passed something the
 * F2 catalog could not have produced.
 */
export function createAuthoringKnowledgeEvidenceBridge({
  projectId,
  worldbookId,
  authorizedEvidence = [],
  structuredCharacterTombstones = []
} = {}) {
  const errors = []
  const normalizedProjectId = String(projectId ?? '').trim()
  const normalizedWorldbookId = String(worldbookId ?? '').trim()
  if (!normalizedProjectId) errors.push({ path: 'projectId', code: 'bridge-invalid' })
  if (!normalizedWorldbookId) errors.push({ path: 'worldbookId', code: 'bridge-invalid' })
  if (!Array.isArray(authorizedEvidence) || authorizedEvidence.length === 0) {
    errors.push({ path: 'authorizedEvidence', code: 'bridge-empty' })
  }
  if (errors.length > 0) return { ok: false, errors, rejected: [], bridge: null }

  const byRef = new Map()
  const rejected = []
  const seenRefs = new Map()
  for (const raw of authorizedEvidence) {
    const item = normalizeAuthoringEvidence(raw, { projectId: normalizedProjectId })
    if (!item) {
      rejected.push({ sourceRef: String(raw?.sourceRef ?? ''), authority: String(raw?.authority ?? ''), reason: 'evidence-invalid' })
      continue
    }
    const previous = seenRefs.get(item.sourceRef)
    if (previous) {
      const identical = previous.revision === item.revision
        && sameLocator(previous.locator, item.locator)
        && previous.excerpt === item.excerpt
        && previous.label === item.label
      if (!identical) {
        // Mirrors F2 normalizeCatalog: a sourceRef with conflicting content
        // is ambiguous and must not be adjudicated here.
        rejected.push({ sourceRef: item.sourceRef, authority: item.authority, reason: 'duplicate-source-conflict' })
        byRef.delete(item.sourceRef)
      }
      continue
    }
    seenRefs.set(item.sourceRef, item)
    if (!MAPPABLE_AUTHORITIES.has(item.authority)) {
      rejected.push({ sourceRef: item.sourceRef, authority: item.authority, reason: 'authority-not-mappable' })
      continue
    }
    if (item.authority === 'worldbook') {
      // The locator itself carries the worldbook binding — a bare prefix
      // swap cannot satisfy this check.
      if (item.locator.worldbookId !== normalizedWorldbookId) {
        rejected.push({ sourceRef: item.sourceRef, authority: item.authority, reason: 'worldbook-binding-mismatch' })
        continue
      }
    }
    byRef.set(item.sourceRef, item)
  }

  if (byRef.size === 0) {
    return {
      ok: false,
      errors: [{ path: 'authorizedEvidence', code: 'bridge-nothing-mappable' }],
      rejected,
      bridge: null
    }
  }

  const entries = []
  const nodes = []
  const memories = []
  const mapping = new Map()
  for (const item of byRef.values()) {
    if (item.authority === 'worldbook') {
      const entryId = item.locator.entryId
      mapping.set(item.sourceRef, {
        sourceRef: item.sourceRef,
        authority: item.authority,
        locator: item.locator,
        revision: item.revision,
        label: item.label,
        kindTarget: 'worldbook-entry',
        targetId: entryId,
        entityKey: `wbentry:${normalizedWorldbookId}:${entryId}`,
        entityRef: { kind: 'worldbook-entry', id: entryId }
      })
      entries.push({
        id: entryId,
        name: item.label,
        content: item.excerpt,
        keys: [],
        keysSecondary: [],
        type: 'general',
        injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: {}
      })
    } else if (item.authority === 'history') {
      const historyId = item.locator.historyId
      mapping.set(item.sourceRef, {
        sourceRef: item.sourceRef,
        authority: item.authority,
        locator: item.locator,
        revision: item.revision,
        label: item.label,
        kindTarget: 'geo-history-node',
        targetId: historyId,
        entityKey: `geonode:${normalizedWorldbookId}:${historyId}`,
        entityRef: { kind: 'geo-history-node', id: historyId }
      })
      nodes.push({
        id: historyId,
        title: item.label,
        summary: item.excerpt,
        yearLabel: null,
        ageId: null,
        type: 'catalog-node',
        entryIds: [],
        playable: false
      })
    } else {
      const memoryId = item.locator.memoryId
      mapping.set(item.sourceRef, {
        sourceRef: item.sourceRef,
        authority: item.authority,
        locator: item.locator,
        revision: item.revision,
        label: item.label,
        kindTarget: 'memory',
        targetId: memoryId,
        entityKey: `memory:${normalizedProjectId}:${memoryId}`,
        entityRef: { kind: 'memory', id: memoryId }
      })
      memories.push({
        id: memoryId,
        schemaVersion: 2,
        scope: 'project',
        scopeId: normalizedProjectId,
        kind: 'project-fact',
        content: item.excerpt,
        status: 'active',
        authority: 'accepted',
        sourceRefs: [],
        sourceRevision: ''
      })
    }
  }

  const snapshot = freezeKnowledgeSnapshot({
    schemaVersion: 1,
    project: {
      id: normalizedProjectId,
      revision: `bridge:${fingerprintParts([...byRef.keys()].sort())}`,
      worldbookId: normalizedWorldbookId
    },
    worldbook: {
      id: normalizedWorldbookId,
      name: 'bridged-catalog-subset',
      updatedAt: null,
      entries,
      structuredCharacterTombstones: Array.isArray(structuredCharacterTombstones)
        ? structuredCharacterTombstones.filter((item) => typeof item === 'string' && item.trim())
        : []
    },
    geoHistory: nodes.length > 0
      ? { version: 1, source: 'authoring-evidence-bridge', seed: null, mapId: null, ages: [], nodes, links: [], entryBindings: [], placeRefs: [] }
      : null,
    timeline: null,
    runtime: null,
    memories,
    drafts: []
  })
  const scopeResult = createKnowledgeScope(snapshot)
  if (!scopeResult.ok) {
    return { ok: false, errors: scopeResult.errors, rejected, bridge: null }
  }

  /**
   * Query by ORIGINAL F2 sourceRefs. Refs outside the authorized mapping are
   * denied with typed reasons — the query cannot discover entities the
   * catalog never authorized.
   */
  function queryBySourceRefs(sourceRefs, {
    questionKind = 'entity-context',
    storyTime,
    perspective,
    budget,
    signal
  } = {}) {
    const requested = (Array.isArray(sourceRefs) ? sourceRefs : []).map((ref) => String(ref ?? '').trim()).filter(Boolean)
    const entityRefs = []
    const deniedRefs = []
    const unmappedRefs = []
    for (const sourceRef of requested) {
      const entry = mapping.get(sourceRef)
      if (!entry) {
        // A ref the bridge never authorized: denied whether or not some
        // entity with that id exists — zero existence hints.
        if (seenRefs.has(sourceRef)) deniedRefs.push({ sourceRef, reason: 'authority-not-mappable' })
        else deniedRefs.push({ sourceRef, reason: 'source-not-authorized' })
        continue
      }
      unmappedRefs.push(sourceRef)
      if (entry.entityRef) entityRefs.push(entry.entityRef)
    }
    if (entityRefs.length === 0) {
      return {
        ok: false,
        deniedRefs,
        kResult: null,
        reason: 'bridge-no-queryable-entities'
      }
    }
    const request = {
      schemaVersion: 1,
      projectId: normalizedProjectId,
      entityRefs,
      questionKind,
      perspective: perspective ?? { viewer: 'author' }
    }
    if (storyTime) request.storyTime = storyTime
    const kResult = queryKnowledge(request, { scope: scopeResult.scope, snapshot, budget, signal })
    return { ok: true, deniedRefs, unmappedRefs, kResult }
  }

  /**
   * Map a K result back to F2 evidence. Revisions come straight from the
   * input catalog mapping; K facts/hypotheses are typed-unsupported notes.
   */
  function toAuthoringEvidence(kResult) {
    if (!kResult) return { ok: false, evidence: [], missingInformation: [], notes: [] }
    const evidence = []
    const notes = []
    const emitted = new Set()
    const items = [...(kResult.excerpts ?? []), ...(kResult.facts ?? []), ...(kResult.hypotheses ?? [])]
    for (const item of items) {
      if (item.kind !== 'excerpt') {
        notes.push({ itemId: item.id, kind: item.kind, reason: 'kind-not-bridged' })
        continue
      }
      // Find the mapping whose target produced this excerpt.
      let match = null
      for (const entry of mapping.values()) {
        if (entry.kindTarget === item.sourceKind && entry.targetId === stripKindPrefix(item.id, item.sourceKind)) {
          match = entry
          break
        }
      }
      if (!match) {
        notes.push({ itemId: item.id, kind: 'excerpt', reason: 'no-catalog-mapping' })
        continue
      }
      if (emitted.has(match.sourceRef)) continue
      emitted.add(match.sourceRef)
      const evidenceItem = normalizeAuthoringEvidence({
        sourceRef: match.sourceRef,
        projectId: normalizedProjectId,
        authority: match.authority,
        label: match.label,
        excerpt: item.text,
        revision: match.revision,
        locator: match.locator
      }, { projectId: normalizedProjectId })
      if (!evidenceItem) {
        notes.push({ itemId: item.id, kind: 'excerpt', reason: 'revalidation-failed' })
        continue
      }
      evidence.push(evidenceItem)
    }
    const missingInformation = []
    if (kResult.status === 'unknown') missingInformation.push(MISSING_INFORMATION_TEXT[REASON_CODES.noMatchingData])
    for (const diagnostic of kResult.diagnostics ?? []) {
      const text = MISSING_INFORMATION_TEXT[diagnostic.code]
      if (text && !missingInformation.includes(text)) missingInformation.push(text)
    }
    return { ok: true, evidence, missingInformation: missingInformation.slice(0, 16), notes }
  }

  return {
    ok: true,
    errors: [],
    rejected,
    bridge: Object.freeze({
      projectId: normalizedProjectId,
      worldbookId: normalizedWorldbookId,
      snapshot,
      scope: scopeResult.scope,
      sourceRefs: [...byRef.keys()].sort(),
      mapping,
      fingerprint: fingerprintParts({
        projectId: normalizedProjectId,
        worldbookId: normalizedWorldbookId,
        sources: [...byRef.values()].map((item) => [item.sourceRef, item.revision])
      }),
      queryBySourceRefs,
      toAuthoringEvidence
    })
  }
}

function stripKindPrefix(itemId, sourceKind) {
  return String(itemId ?? '').replace(`excerpt:${sourceKind}:`, '')
}

export default {
  createAuthoringKnowledgeEvidenceBridge
}
