const CLAIM_TYPES = new Set(['fact', 'inspiration', 'creative', 'rule', 'timeline', 'geography', 'history', 'culture', 'technology'])

function text(value, maxChars = Infinity) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function clampConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0.5
  return Math.max(0, Math.min(1, number))
}

function normalizeIds(value, pattern, max = 8) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => text(item).toUpperCase())
    .filter((item) => pattern.test(item)))]
    .slice(0, max)
}

function normalizeEvidenceRefs(value, sourceIds) {
  const values = Array.isArray(value) ? value : []
  return values.map((item) => {
    if (typeof item === 'string') {
      const match = item.trim().toUpperCase().match(/^(S\d+)(?:[:#](P\d+|SNIPPET))?$/)
      if (!match || !sourceIds.has(match[1])) return null
      return { sourceId: match[1], locator: match[2] || '正文段落未标注', quote: '' }
    }
    const sourceId = text(item?.sourceId || item?.sourceRef || item?.source).toUpperCase()
    if (!sourceIds.has(sourceId)) return null
    const locator = text(item?.locator || item?.paragraph || item?.blockId, 80).toUpperCase()
    return {
      sourceId,
      locator: locator || '正文段落未标注',
      quote: text(item?.quote || item?.text, 320)
    }
  }).filter(Boolean).filter((item, index, all) => (
    all.findIndex((candidate) => candidate.sourceId === item.sourceId && candidate.locator === item.locator) === index
  )).slice(0, 6)
}

export function normalizeResearchClaims(rawClaims, sourceIds = new Set(), excludedSourceIds = new Set()) {
  const knownSourceIds = sourceIds instanceof Set ? sourceIds : new Set(sourceIds || [])
  const excludedIds = excludedSourceIds instanceof Set ? excludedSourceIds : new Set(excludedSourceIds || [])
  return (Array.isArray(rawClaims) ? rawClaims : [])
    .map((claim, index) => {
      const id = text(claim?.id || `C${index + 1}`).toUpperCase()
      const sourceRefs = normalizeIds(claim?.sourceRefs || claim?.sources, /^S\d+$/)
        .filter((sourceId) => knownSourceIds.has(sourceId))
      const evidenceRefs = normalizeEvidenceRefs(claim?.evidenceRefs || claim?.evidence || claim?.locations, knownSourceIds)
      const evidenceSourceRefs = evidenceRefs.map((item) => item.sourceId)
      const mergedSourceRefs = [...new Set([...sourceRefs, ...evidenceSourceRefs])].slice(0, 8)
      const basisValue = text(claim?.basis).toLowerCase()
      const basis = ['research', 'mixed', 'creative'].includes(basisValue)
        ? basisValue
        : (mergedSourceRefs.length ? 'research' : 'creative')
      const excludedRefs = mergedSourceRefs.filter((sourceId) => excludedIds.has(sourceId))
      return {
        id: /^C\d+$/.test(id) ? id : `C${index + 1}`,
        type: CLAIM_TYPES.has(text(claim?.type).toLowerCase()) ? text(claim.type).toLowerCase() : 'fact',
        text: text(claim?.text || claim?.claim || claim?.content, 500),
        basis,
        sourceRefs: mergedSourceRefs,
        evidenceRefs,
        confidence: clampConfidence(claim?.confidence),
        excludedRefs,
        status: excludedRefs.length
          ? 'stale'
          : (basis !== 'creative' && mergedSourceRefs.length && !evidenceRefs.length ? 'needs-evidence' : 'ready')
      }
    })
    .filter((claim, index, all) => claim.text && all.findIndex((item) => item.id === claim.id) === index)
    .slice(0, 32)
}

export function normalizeResearchConflicts(rawConflicts, claimIds = new Set()) {
  return (Array.isArray(rawConflicts) ? rawConflicts : [])
    .map((conflict, index) => {
      const claimIdsValue = normalizeIds(
        conflict?.claimIds || [conflict?.claimId, conflict?.withClaimId],
        /^C\d+$/,
        2
      ).filter((claimId) => claimIds.has(claimId))
      return {
        id: text(conflict?.id || `X${index + 1}`).toUpperCase(),
        claimIds: claimIdsValue,
        reason: text(conflict?.reason || conflict?.description, 400),
        severity: ['high', 'medium', 'low'].includes(text(conflict?.severity).toLowerCase())
          ? text(conflict.severity).toLowerCase()
          : 'medium'
      }
    })
    .filter((conflict, index, all) => (
      conflict.claimIds.length === 2 && conflict.reason &&
      all.findIndex((item) => item.id === conflict.id) === index
    ))
    .slice(0, 16)
}

export function refreshResearchReview(research, entries = []) {
  if (!research || typeof research !== 'object') return null
  const claims = Array.isArray(research.claims) ? research.claims : []
  const conflicts = Array.isArray(research.conflicts) ? research.conflicts : []
  const conflictClaimIds = new Set(conflicts.flatMap((conflict) => conflict.claimIds || []))
  const staleClaimIds = new Set(claims
    .filter((claim) => claim.status === 'stale' || (claim.basis !== 'creative' && !claim.sourceRefs.length))
    .map((claim) => claim.id))
  const evidenceMissingClaimIds = new Set(claims
    .filter((claim) => claim.status === 'needs-evidence')
    .map((claim) => claim.id))
  const reviewClaimIds = new Set([...conflictClaimIds, ...staleClaimIds, ...evidenceMissingClaimIds])
  const revisionStale = research.revision?.state === 'stale'
  const entryReview = entries
    .map((entry) => ({
      name: text(entry?.name, 160),
      claimIds: Array.isArray(entry?.metadata?.claimIds) ? entry.metadata.claimIds : []
    }))
    .filter((entry) => entry.claimIds.some((claimId) => reviewClaimIds.has(claimId)))
  const excludedSourceIds = [...new Set((Array.isArray(research.excludedSourceIds) ? research.excludedSourceIds : [])
    .map((sourceId) => text(sourceId).toUpperCase())
    .filter((sourceId) => /^S\d+$/.test(sourceId)))]
  return {
    state: reviewClaimIds.size || revisionStale ? 'needs-review' : 'ready',
    needsReview: reviewClaimIds.size > 0 || revisionStale,
    conflictCount: conflicts.length,
    staleClaimIds: [...staleClaimIds],
    evidenceMissingClaimIds: [...evidenceMissingClaimIds],
    revisionStale,
    reviewClaimIds: [...reviewClaimIds],
    affectedEntries: entryReview.map((entry) => entry.name),
    excludedSourceIds,
    message: revisionStale
      ? `研究来源或输入已变化，旧预览失效；另有 ${reviewClaimIds.size} 条声明需要核对。`
      : reviewClaimIds.size
        ? `有 ${reviewClaimIds.size} 条声明需要核对，涉及 ${entryReview.length} 个条目。`
      : '来源与声明关系完整，可进入导入预览。'
  }
}

export function excludeResearchSource(research, sourceId) {
  if (!research || typeof research !== 'object') return research
  const id = text(sourceId).toUpperCase()
  if (!/^S\d+$/.test(id)) return research
  const excludedSourceIds = [...new Set([...(research.excludedSourceIds || []), id])]
  const sourceIds = new Set((research.sources || []).map((source) => text(source?.id).toUpperCase()))
  const claims = normalizeResearchClaims(research.claims, sourceIds, new Set(excludedSourceIds))
  const claimIds = new Set(claims.map((claim) => claim.id))
  const conflicts = normalizeResearchConflicts(research.conflicts, claimIds)
  return {
    ...research,
    excludedSourceIds,
    claims,
    conflicts,
    review: refreshResearchReview({ ...research, excludedSourceIds, claims, conflicts }, [])
  }
}
