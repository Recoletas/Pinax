// 文本工作台 v3 Phase 6：结构化事实索引与 continuity 投影。
// 精确事实与 prose summary 分层：summary 可以遗漏，但遗漏必须可解释，
// 且任何事实都能沿 evidenceRefs 回读来源。

const FACT_STATUSES = new Set(['fact', 'constraint', 'intent', 'hypothesis', 'alternative', 'rejected'])
const FACT_FACETS = new Set(['event', 'state', 'relation', 'identity', 'mechanism', 'secret', 'time', 'location', 'other'])

function text(value) {
  return String(value ?? '').trim()
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
}

function fnv1a(source) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function normalizeWritingFact(raw = {}) {
  const claimKey = text(raw.claimKey)
  const value = raw.value == null ? '' : String(raw.value)
  const evidenceRefs = unique(raw.evidenceRefs || raw.sourceRefs)
  const status = FACT_STATUSES.has(raw.status) ? raw.status : 'hypothesis'
  if (!claimKey || !value || !evidenceRefs.length) return null
  return Object.freeze({
    id: text(raw.id) || `fact:${fnv1a(`${claimKey}\0${value}\0${evidenceRefs.join('|')}`)}`,
    claimKey,
    entityId: text(raw.entityId),
    predicate: text(raw.predicate),
    value,
    facet: FACT_FACETS.has(raw.facet) ? raw.facet : 'other',
    status,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 1))),
    evidenceRefs,
    sourceRevision: text(raw.sourceRevision),
    method: text(raw.method) || 'structured'
  })
}

export function buildUnitFactIndex({
  projectId = '', chapterId = '', unitId = '', unitRevision = '', facts = [], previousIndex = null
} = {}) {
  const revision = text(unitRevision)
  if (!text(projectId) || !text(chapterId) || !text(unitId) || !revision) return null
  if (
    previousIndex?.projectId === text(projectId)
    && previousIndex?.chapterId === text(chapterId)
    && previousIndex?.unitId === text(unitId)
    && previousIndex?.unitRevision === revision
  ) return previousIndex
  const normalizedFacts = (Array.isArray(facts) ? facts : [])
    .map(normalizeWritingFact)
    .filter((fact) => fact && fact.status !== 'rejected')
    .map((fact) => ({
      ...fact,
      projectId: text(projectId),
      chapterId: text(chapterId),
      unitId: text(unitId),
      sourceRevision: fact.sourceRevision || revision
    }))
  const indexRevision = `unit-facts-${fnv1a(JSON.stringify({ projectId, chapterId, unitId, revision, normalizedFacts }))}`
  return Object.freeze({
    schemaVersion: 1,
    kind: 'unit-fact-index',
    projectId: text(projectId),
    chapterId: text(chapterId),
    unitId: text(unitId),
    unitRevision: revision,
    revision: indexRevision,
    facts: normalizedFacts,
    coverage: {
      factCount: normalizedFacts.length,
      evidenceRefs: unique(normalizedFacts.flatMap((fact) => fact.evidenceRefs))
    }
  })
}

export function aggregateWritingFactIndexes({ projectId = '', chapterId = '', indexes = [], scope = 'chapter' } = {}) {
  const valid = (Array.isArray(indexes) ? indexes : []).filter((index) => (
    index?.kind === 'unit-fact-index'
    && index.projectId === text(projectId)
    && (!chapterId || index.chapterId === text(chapterId))
    && text(index.revision)
  ))
  const byClaim = new Map()
  for (const index of valid) {
    for (const fact of index.facts || []) byClaim.set(fact.claimKey, fact)
  }
  const childRevisions = Object.fromEntries(valid.map((index) => [index.unitId, index.revision]))
  const facts = [...byClaim.values()]
  return Object.freeze({
    schemaVersion: 1,
    kind: 'aggregate-fact-index',
    scope,
    projectId: text(projectId),
    chapterId: text(chapterId),
    childRevisions,
    revision: `aggregate-facts-${fnv1a(JSON.stringify({ scope, projectId, chapterId, childRevisions, facts }))}`,
    facts,
    coverage: {
      unitIds: valid.map((index) => index.unitId),
      factCount: facts.length,
      facets: [...new Set(facts.map((fact) => fact.facet))],
      evidenceRefs: unique(facts.flatMap((fact) => fact.evidenceRefs))
    }
  })
}

export function buildContinuitySummaryRequest({ aggregateIndex, previousProjection = null, changedUnitIds = [] } = {}) {
  if (!aggregateIndex?.revision) return null
  const changed = unique(changedUnitIds)
  return Object.freeze({
    aggregateRevision: aggregateIndex.revision,
    childRevisions: { ...aggregateIndex.childRevisions },
    previousNeutralSummary: text(previousProjection?.summary?.text),
    changedUnitIds: changed,
    facts: aggregateIndex.facts
      .filter((fact) => !changed.length || changed.includes(fact.unitId))
      .map((fact) => ({
      claimKey: fact.claimKey,
      facet: fact.facet,
      value: fact.value,
      evidenceRefs: fact.evidenceRefs
      }))
  })
}

export function commitContinuityProjection({
  aggregateIndex, previousProjection = null, request = null, result = null,
  currentChildRevisions = null
} = {}) {
  if (!aggregateIndex?.revision || !request) return previousProjection
  const resultText = text(result?.summary || result?.text)
  const current = currentChildRevisions || aggregateIndex.childRevisions
  const stale = request.aggregateRevision !== aggregateIndex.revision
    || JSON.stringify(request.childRevisions) !== JSON.stringify(current)
  if (stale || result?.ok === false || !resultText) return previousProjection
  const summarizedClaimKeys = new Set(unique(result.summarizedClaimKeys))
  const knownOmissions = aggregateIndex.facts
    .filter((fact) => !summarizedClaimKeys.has(fact.claimKey))
    .map((fact) => ({ claimKey: fact.claimKey, facet: fact.facet, reason: 'not-in-prose-summary', evidenceRefs: fact.evidenceRefs }))
  const summary = {
    text: resultText,
    method: text(result.method) || 'model',
    coverage: {
      aggregateRevision: aggregateIndex.revision,
      unitIds: [...aggregateIndex.coverage.unitIds],
      summarizedClaimKeys: [...summarizedClaimKeys]
    },
    facets: unique(result.facets),
    knownOmissions
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'chapter-continuity-projection',
    projectId: aggregateIndex.projectId,
    chapterId: aggregateIndex.chapterId,
    sourceRevision: aggregateIndex.revision,
    childRevisions: { ...aggregateIndex.childRevisions },
    facts: aggregateIndex.facts,
    summary,
    revision: `continuity-${fnv1a(JSON.stringify({ aggregate: aggregateIndex.revision, summary }))}`
  })
}

export function queryWritingFacts(source, { claimKeys = [], facets = [] } = {}) {
  const claims = new Set(unique(claimKeys))
  const facetSet = new Set(unique(facets))
  return (Array.isArray(source?.facts) ? source.facts : []).filter((fact) => (
    (!claims.size || claims.has(fact.claimKey))
    && (!facetSet.size || facetSet.has(fact.facet))
  ))
}

// task view 只存在于本次 run；不会写回 aggregate/continuity 真源。
export function buildWritingFactTaskView(source, { taskKind = 'manuscript' } = {}) {
  const includeSpeculative = ['exploration', 'conflict-check'].includes(taskKind)
  const facts = (source?.facts || []).filter((fact) => (
    !['rejected'].includes(fact.status)
    && (includeSpeculative || !['hypothesis', 'alternative'].includes(fact.status))
  ))
  return Object.freeze({ kind: 'writing-fact-task-view', taskKind, sourceRevision: text(source?.revision), facts })
}
