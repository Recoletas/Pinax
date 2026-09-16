// 上下文候选合同（文本工作台 v3 Phase 4 / 0/6 实验硬修复）：
// readers 只产出候选——发现什么、为什么、多少字、什么表示；不拼 prompt、不裁剪。
// 四轴（sourceAuthority / narrativeStatus / temporalRelation / scope）是
// established/intended/speculative 的底层真源；三态只是编译后视图。

export const SOURCE_AUTHORITY = Object.freeze([
  'canonical-manuscript', 'author-explicit', 'author-adopted', 'accepted-derived',
  'imported-reference', 'machine-detected', 'machine-generated'
])

export const NARRATIVE_STATUS = Object.freeze([
  'fact', 'constraint', 'intent', 'hypothesis', 'alternative', 'rejected'
])

export const TEMPORAL_RELATION = Object.freeze([
  'before-target', 'at-target', 'after-target', 'atemporal', 'unknown'
])

export const CONTEXT_SCOPE = Object.freeze([
  'project', 'volume', 'chapter', 'scene', 'writing-unit', 'selection', 'run-only'
])

export const CANDIDATE_KINDS = Object.freeze([
  'manuscript-unit', 'chapter-continuity', 'scene-projection', 'outline-node',
  'exploration-doc', 'worldbook-entry', 'history-node', 'narrative-asset', 'memory', 'author-note', 'pinned'
])

export const CLAIM_TYPES = Object.freeze([
  'temporal-event', 'setting', 'identity', 'state', 'relation', 'unknown'
])

export const CONTEXT_USAGE_ROLES = Object.freeze(['intent', 'fact', 'inspiration'])

const PRIMARY_SOURCE_PREFIXES = Object.freeze({
  'manuscript-unit': ['unit:'],
  'chapter-continuity': ['chapter:'],
  'scene-projection': ['scene-projection:'],
  'outline-node': ['outline-node:'],
  'exploration-doc': ['exploration:'],
  'worldbook-entry': ['worldbook-entry:'],
  'history-node': ['history-node:'],
  'narrative-asset': ['narrative-asset:'],
  memory: ['memory:'],
  'author-note': ['author-override:', 'scene-intent:', 'author-note:'],
  pinned: ['pinned:']
})

const AUTHORITY_RANK = Object.freeze({
  'canonical-manuscript': 7,
  'author-explicit': 6,
  'author-adopted': 5,
  'accepted-derived': 4,
  'imported-reference': 3,
  'machine-detected': 2,
  'machine-generated': 1
})

export function authorityRank(authority) {
  return AUTHORITY_RANK[authority] ?? 0
}

export function estimateChars(text) {
  return String(text ?? '').length
}

function uniqueSourceRefs(refs) {
  return [...new Set((Array.isArray(refs) ? refs : []).map((ref) => String(ref || '').trim()).filter(Boolean))]
}

function deepFreezeContextValue(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreezeContextValue(child, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

// primarySourceRef 是“同一来源最多一次”的稳定去重键；只从候选显式声明或
// 该 kind 的 canonical ref 前缀中解析，绝不拿任意 provenance ref 猜主来源。
export function resolveContextCandidatePrimarySourceRef({ kind = '', primarySourceRef = '', sourceRefs = [] } = {}) {
  const refs = uniqueSourceRefs(sourceRefs)
  const explicit = String(primarySourceRef || '').trim()
  const prefixes = PRIMARY_SOURCE_PREFIXES[kind] || []
  if (explicit && refs.includes(explicit) && prefixes.some((prefix) => explicit.startsWith(prefix))) return explicit
  return refs.find((ref) => prefixes.some((prefix) => ref.startsWith(prefix))) || ''
}

// 候选归一：缺轴/非法值一律落到最保守值（fail-closed 的数据侧）。
export function normalizeContextCandidate(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const kind = CANDIDATE_KINDS.includes(source.kind) ? source.kind : null
  if (!kind) return null
  const full = typeof source.representations?.full === 'string' ? source.representations.full : ''
  const summary = typeof source.representations?.summary === 'string' ? source.representations.summary : ''
  const excerpt = typeof source.representations?.excerpt === 'string' ? source.representations.excerpt : ''
  if (!full && !summary && !excerpt) return null
  const id = String(source.id || '').trim()
  // 候选 ID 参与去重、预算回执和 stale 校验；随机补 ID 会让同一输入产生不同 manifest。
  if (!id) return null
  const sourceRefs = uniqueSourceRefs(source.sourceRefs)
  const primarySourceRef = resolveContextCandidatePrimarySourceRef({
    kind,
    primarySourceRef: source.primarySourceRef,
    sourceRefs
  })
  return deepFreezeContextValue({
    id,
    kind,
    projectId: String(source.projectId || ''),
    documentId: String(source.documentId || ''),
    label: String(source.label || ''),
    sourceKind: String(source.sourceKind || kind),
    sourceId: String(source.sourceId || ''),
    usageRole: CONTEXT_USAGE_ROLES.includes(source.usageRole) ? source.usageRole : '',
    primarySourceRef,
    sourceAuthority: SOURCE_AUTHORITY.includes(source.sourceAuthority) ? source.sourceAuthority : 'machine-generated',
    // 非法/缺失 narrativeStatus 保守落 hypothesis（绝不默认 fact）。
    narrativeStatus: NARRATIVE_STATUS.includes(source.narrativeStatus) ? source.narrativeStatus : 'hypothesis',
    temporalRelation: TEMPORAL_RELATION.includes(source.temporalRelation) ? source.temporalRelation : 'unknown',
    scope: CONTEXT_SCOPE.includes(source.scope) ? source.scope : 'run-only',
    position: {
      chapterId: String(source.position?.chapterId || ''),
      chapterOrder: Number.isFinite(Number(source.position?.chapterOrder)) ? Number(source.position.chapterOrder) : null,
      unitId: String(source.position?.unitId || ''),
      unitIndex: Number.isFinite(Number(source.position?.unitIndex)) ? Number(source.position.unitIndex) : null
    },
    reason: String(source.reason || ''),
    sourceRefs,
    revision: String(source.revision || ''),
    estimatedChars: Number.isFinite(Number(source.estimatedChars))
      ? Number(source.estimatedChars)
      : estimateChars(full || summary || excerpt),
    attentionPriority: Number.isFinite(Number(source.attentionPriority))
      ? Math.max(0, Math.min(100, Number(source.attentionPriority)))
      : 50,
    dependencyRevisions: source.dependencyRevisions && typeof source.dependencyRevisions === 'object'
      ? Object.fromEntries(Object.entries(source.dependencyRevisions).map(([key, value]) => [String(key), String(value)]).filter(([, value]) => value))
      : {},
    representations: {
      ...(full ? { full } : {}),
      ...(summary ? { summary } : {}),
      ...(excerpt ? { excerpt } : {})
    },
    // 冲突分组键：同一命题（实体+主张类型）的候选构成 conflict set。
    claimKey: String(source.claimKey || ''),
    claimType: CLAIM_TYPES.includes(source.claimType) ? source.claimType : 'unknown',
    overrideOf: String(source.overrideOf || ''),
    pinned: Boolean(source.pinned)
  })
}

export function normalizeContextCandidates(candidates) {
  const normalized = []
  const seen = new Set()
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const candidate = normalizeContextCandidate(raw)
    if (!candidate || seen.has(candidate.id)) continue
    seen.add(candidate.id)
    normalized.push(candidate)
  }
  return deepFreezeContextValue(normalized)
}

// 用户纠正只生成独立 author-explicit override，不回写或篡改原世界书候选。
export function buildAuthorOverrideCandidate({
  id = '', projectId = '', claimKey = '', claimType = 'unknown', content = '',
  revision = '', sourceRefs = [], overrideOf = '', temporalRelation = 'atemporal'
} = {}) {
  return normalizeContextCandidate({
    id: id || `override:${claimKey || 'claim'}:${revision || 'current'}`,
    kind: 'author-note',
    projectId,
    sourceAuthority: 'author-explicit',
    narrativeStatus: 'constraint',
    temporalRelation,
    scope: 'run-only',
    reason: '作者显式纠正',
    sourceRefs,
    revision,
    representations: { full: String(content || '') },
    claimKey,
    claimType,
    overrideOf
  })
}
