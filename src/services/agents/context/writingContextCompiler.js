// WritingContextCompiler（文本工作台 v3 Phase 4）：
// 上下文所有权的唯一 owner。固定流水线：
//   discover（readers 已产出候选）→ eligibility → conflict → representation → packing
// 输出 CompiledContextManifest；runtime（inline/Kernel）只序列化 manifest，
// 不得重新匹配世界书或自行挑选章节。

import {
  normalizeContextCandidates,
  authorityRank
} from './contextCandidateContract.js'

export const COMPILER_PROFILES = Object.freeze({
  'inline-fast': Object.freeze({ totalChars: 3200, maxItems: 8, allowAlternatives: false, allowSummaries: false }),
  'manual-short': Object.freeze({ totalChars: 6400, maxItems: 14, allowAlternatives: false, allowSummaries: true }),
  'narrative-long': Object.freeze({ totalChars: 12800, maxItems: 24, allowAlternatives: true, allowSummaries: true }),
  'analysis-background': Object.freeze({ totalChars: 20000, maxItems: 48, allowAlternatives: true, allowSummaries: true })
})

const REPRESENTATION_ORDER = ['full', 'excerpt', 'summary']

function fnvFingerprint(source) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function cloneContextValue(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  if (Array.isArray(value)) {
    const clone = []
    seen.set(value, clone)
    for (const child of value) clone.push(cloneContextValue(child, seen))
    return clone
  }
  const clone = {}
  seen.set(value, clone)
  for (const [key, child] of Object.entries(value)) clone[key] = cloneContextValue(child, seen)
  return clone
}

function deepFreezeContextValue(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreezeContextValue(child, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

export function createWritingContextManifestFingerprint({
  target = null,
  profile = '',
  taskKind = '',
  blocks = [],
  excluded = [],
  dependencies = {}
} = {}) {
  return `manifest-${fnvFingerprint(JSON.stringify({
    target,
    profile,
    taskKind,
    blocks,
    excluded,
    dependencies
  }))}`
}

export function mergeWritingContextDependencyRevisions(entries = []) {
  const dependencies = {}
  const conflicts = []
  for (const [rawKey, rawValue] of Array.isArray(entries) ? entries : []) {
    const dependency = String(rawKey || '').trim()
    const revision = rawValue === undefined || rawValue === null
      ? ''
      : String(rawValue).trim()
    if (!dependency || !revision) continue
    if (Object.prototype.hasOwnProperty.call(dependencies, dependency)
      && dependencies[dependency] !== revision) {
      conflicts.push({
        dependency,
        expected: dependencies[dependency],
        actual: revision,
        reason: 'dependency-revision-conflict'
      })
      continue
    }
    dependencies[dependency] = revision
  }
  return { dependencies, conflicts }
}

function safeCandidateMetadata(candidate = {}) {
  const metadata = {}
  const hasSourceMetadata = Boolean(
    candidate.label
    || candidate.sourceId
    || candidate.usageRole
    || candidate.primarySourceRef
    || (Array.isArray(candidate.sourceRefs) && candidate.sourceRefs.length)
  )
  if (candidate.label) metadata.label = String(candidate.label)
  if (hasSourceMetadata && candidate.kind) metadata.kind = String(candidate.kind)
  if (hasSourceMetadata && candidate.sourceKind) metadata.sourceKind = String(candidate.sourceKind)
  if (candidate.sourceId) metadata.sourceId = String(candidate.sourceId)
  if (candidate.usageRole) metadata.usageRole = String(candidate.usageRole)
  if (candidate.primarySourceRef) metadata.primarySourceRef = String(candidate.primarySourceRef)
  if (Array.isArray(candidate.sourceRefs) && candidate.sourceRefs.length) {
    metadata.sourceRefs = candidate.sourceRefs.map(String).filter(Boolean)
  }
  return metadata
}

function excludeCandidate(candidate, reason, extra = {}) {
  return {
    candidateId: String(candidate?.id || candidate?.candidateId || ''),
    reason: String(reason || candidate?.reason || 'excluded'),
    ...safeCandidateMetadata(candidate),
    ...extra
  }
}

function normalizeDiscoveryExclusion(item = {}) {
  const source = item && typeof item === 'object' ? item : {}
  const candidateId = String(source.candidateId || source.id || '').trim()
  const reason = String(source.reason || '').trim()
  if (!candidateId || !reason) return null
  return excludeCandidate(source, reason, source.keptCandidateId
    ? { keptCandidateId: String(source.keptCandidateId) }
    : {})
}

function pickRepresentation(candidate, profile, remainingChars) {
  for (const kind of REPRESENTATION_ORDER) {
    if (kind === 'summary' && !profile.allowSummaries) continue
    const representation = candidate.representations[kind]
    if (representation && representation.length <= remainingChars) return { kind, text: representation }
  }
  return null
}

// eligibility：先于评分与预算（0/6 实验第 2 项）。返回 { eligible, reason }。
export function evaluateEligibility(candidate, { taskKind = 'manuscript', targetChapterId = '', targetProjectId = '' } = {}) {
  if (targetProjectId && candidate.projectId !== String(targetProjectId)) {
    return { eligible: false, reason: 'project-mismatch' }
  }
  if (!candidate.revision) return { eligible: false, reason: 'revision-missing-fail-closed' }
  if (candidate.narrativeStatus === 'rejected') return { eligible: false, reason: 'rejected-never-enters' }
  // after-target 正文默认排除；显式钉选也只能作为 intended reference（明示进入）。
  if (candidate.temporalRelation === 'after-target') {
    if (candidate.pinned) return {
      eligible: true,
      reason: 'pinned-intended-reference',
      candidatePatch: { narrativeStatus: 'intent', intendedReference: true }
    }
    return { eligible: false, reason: 'after-target-excluded' }
  }
  // 时间位置无法解析的正文来源 fail-closed。
  if (candidate.temporalRelation === 'unknown' && candidate.kind === 'manuscript-unit') {
    return { eligible: false, reason: 'temporal-unknown-fail-closed' }
  }
  // alternative 只进入探索/比较任务；正文任务默认排除（adopted intent 仍可进）。
  if (candidate.narrativeStatus === 'alternative' && !['exploration', 'conflict-check'].includes(taskKind)) {
    return { eligible: false, reason: 'alternative-not-for-manuscript' }
  }
  // 目标章校验：声明属于目标章但 id 不符的 manuscript-unit 视为位置错误。
  if (candidate.kind === 'manuscript-unit' && targetChapterId
    && candidate.position.chapterId
    && candidate.position.chapterId !== String(targetChapterId)
    && candidate.temporalRelation === 'at-target') {
    return { eligible: false, reason: 'target-chapter-mismatch' }
  }
  return { eligible: true, reason: '' }
}

// conflict：同一 claimKey 的候选组成 conflict set；
// 裁决 = 最高 authority 胜出，低权威项排除并报告 unresolved。
export function resolveConflicts(candidates, { taskKind = 'manuscript' } = {}) {
  const byClaim = new Map()
  const noClaim = []
  for (const candidate of candidates) {
    if (!candidate.claimKey) {
      noClaim.push(candidate)
      continue
    }
    if (!byClaim.has(candidate.claimKey)) byClaim.set(candidate.claimKey, [])
    byClaim.get(candidate.claimKey).push(candidate)
  }
  const winners = [...noClaim]
  const unresolved = []
  const losers = []
  for (const [, group] of byClaim) {
    const sorted = [...group].sort((a, b) => (
      authorityRank(b.sourceAuthority) - authorityRank(a.sourceAuthority)
      || b.estimatedChars - a.estimatedChars
    ))
    const winner = sorted[0]
    winners.push({ ...winner, conflictRole: group.length > 1 ? 'winner' : '' })
    const preserveConflictSet = ['conflict-check', 'exploration'].includes(taskKind)
    if (preserveConflictSet) {
      winners.push(...sorted.slice(1).map((candidate) => ({ ...candidate, conflictRole: 'challenger' })))
    }
    for (const loser of sorted.slice(1)) {
      if (!preserveConflictSet) losers.push(excludeCandidate(loser, 'conflict-set-loser'))
    }
    if (group.length > 1 && authorityRank(winner.sourceAuthority) < 5) {
      unresolved.push({
        claimKey: winner.claimKey,
        claimType: winner.claimType,
        winner: { id: winner.id, authority: winner.sourceAuthority },
        suppressed: sorted.slice(1).map((item) => ({ id: item.id, authority: item.sourceAuthority })),
        visibleCandidateIds: preserveConflictSet ? sorted.map((item) => item.id) : [winner.id]
      })
    }
  }
  return { winners, losers, unresolved }
}

// 表示选择 + 打包：按 authority → 位置 → 大小排序，预算内逐项装入。
function pack(winners, profile) {
  const ranked = [...winners].sort((a, b) => {
    const pinnedDelta = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    if (pinnedDelta) return pinnedDelta
    const authorityDelta = authorityRank(b.sourceAuthority) - authorityRank(a.sourceAuthority)
    if (authorityDelta) return authorityDelta
    const priorityDelta = b.attentionPriority - a.attentionPriority
    if (priorityDelta) return priorityDelta
    return a.estimatedChars - b.estimatedChars
  })
  const blocks = []
  const excluded = []
  let used = 0
  for (const candidate of ranked) {
    if (blocks.length >= profile.maxItems) {
      excluded.push(excludeCandidate(candidate, 'budget-max-items'))
      continue
    }
    const representation = pickRepresentation(candidate, profile, profile.totalChars - used)
    if (!representation) {
      excluded.push(excludeCandidate(candidate, 'no-allowed-representation'))
      continue
    }
    used += representation.text.length
    blocks.push({
      candidateId: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      sourceKind: candidate.sourceKind,
      sourceId: candidate.sourceId,
      usageRole: candidate.usageRole,
      primarySourceRef: candidate.primarySourceRef,
      representation: representation.kind,
      representationReduced: representation.kind !== 'full',
      text: representation.text,
      chars: representation.text.length,
      sourceRefs: candidate.sourceRefs,
      sourceAuthority: candidate.sourceAuthority,
      narrativeStatus: candidate.narrativeStatus,
      temporalRelation: candidate.temporalRelation,
      reason: candidate.reason,
      revision: candidate.revision,
      pinned: candidate.pinned,
      intendedReference: Boolean(candidate.intendedReference),
      conflictRole: candidate.conflictRole || '',
      claimKey: candidate.claimKey,
      claimType: candidate.claimType,
      overrideOf: candidate.overrideOf
    })
  }
  return { blocks, excluded, totalChars: used }
}

// 编译入口：candidates → CompiledContextManifest。
export function compileWritingContext({
  candidates, target = null, profile = 'inline-fast', taskKind = 'manuscript',
  excludedCandidateIds = [], pinnedCandidateIds = [], dependencyRevisions = {},
  discoveryExclusions = []
} = {}) {
  const profileSpec = COMPILER_PROFILES[profile] || COMPILER_PROFILES['inline-fast']
  const excludedByAuthor = new Set((excludedCandidateIds || []).map(String))
  const pinnedByAuthor = new Set((pinnedCandidateIds || []).map(String))
  const normalized = normalizeContextCandidates(candidates)
    .map((candidate) => pinnedByAuthor.has(candidate.id) ? { ...candidate, pinned: true } : candidate)
  const eligible = []
  const preExcluded = (Array.isArray(discoveryExclusions) ? discoveryExclusions : [])
    .map(normalizeDiscoveryExclusion)
    .filter(Boolean)
  const eligibilityExcluded = [...normalized
    .filter((candidate) => excludedByAuthor.has(candidate.id))
    .map((candidate) => excludeCandidate(candidate, 'author-removed-for-run'))]
  for (const candidate of normalized) {
    if (excludedByAuthor.has(candidate.id)) continue
    const verdict = evaluateEligibility(candidate, {
      taskKind,
      targetChapterId: target?.chapterId || '',
      targetProjectId: target?.projectId || ''
    })
    if (verdict.eligible) {
      eligible.push({ ...candidate, ...verdict.candidatePatch, reason: verdict.reason || candidate.reason })
    } else {
      eligibilityExcluded.push(excludeCandidate(candidate, verdict.reason))
    }
  }
  const { winners, losers, unresolved } = resolveConflicts(eligible, { taskKind })
  const conflictExcluded = losers
  const { blocks, excluded, totalChars } = pack(winners, profileSpec)
  const dependencyMerge = mergeWritingContextDependencyRevisions([
    ...Object.entries(dependencyRevisions || {}),
    ...blocks.flatMap((block) => {
      const candidate = normalized.find((item) => item.id === block.candidateId)
      return Object.entries(candidate?.dependencyRevisions || {})
    })
  ])
  if (dependencyMerge.conflicts.length) {
    throw Object.assign(new Error('上下文依赖包含同源异版，已拒绝本次编译'), {
      code: 'CONTEXT_DEPENDENCY_REVISION_CONFLICT',
      dependencyConflicts: dependencyMerge.conflicts
    })
  }
  const dependencies = dependencyMerge.dependencies
  const allExcluded = [...preExcluded, ...eligibilityExcluded, ...conflictExcluded, ...excluded]
  const manifestTarget = target ? cloneContextValue(target) : null
  return deepFreezeContextValue({
    schemaVersion: 1,
    kind: 'compiled-context-manifest',
    target: manifestTarget,
    profile,
    taskKind,
    blocks,
    excluded: allExcluded,
    unresolvedConflicts: unresolved,
    totalChars,
    budget: { totalChars: profileSpec.totalChars, maxItems: profileSpec.maxItems },
    dependencies,
    candidateReport: {
      discovered: normalized.length + preExcluded.length,
      included: blocks.length,
      excluded: allExcluded.length
    },
    // 指纹：目标 + 预算 + 全体入选块内容（挂起请求 stale 判定）。
    fingerprint: createWritingContextManifestFingerprint({
      target: manifestTarget,
      profile,
      taskKind,
      blocks,
      excluded: allExcluded,
      dependencies
    })
  })
}
