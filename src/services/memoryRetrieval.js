import { MEMORY_RETRIEVAL_POLICY, normalizeStringList } from '../../shared/memoryContract'
import { deriveMemoryImportance } from './memoryImportance'

const AUTHORITY_SCORES = Object.freeze({
  accepted: 1,
  imported: 0.45,
  derived: 0.4
})

const SCOPE_FIT_SCORES = Object.freeze({
  session: 1,
  project: 0.7,
  'global-author': 0.4
})

const RECENCY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000

function text(value) {
  return String(value ?? '').trim()
}

function stripPunctuation(value) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》·—…-]/g, '')
}

export function tokenizeMemoryQuery(query) {
  const raw = text(query)
  if (!raw) return { terms: [], bigrams: new Set() }
  const seen = new Set()
  const terms = []
  const chunks = raw.split(/[\s,，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》\n\r\t/]+/u)
  for (const chunk of chunks) {
    const cleaned = chunk.trim().toLowerCase()
    if (!cleaned) continue
    if (!seen.has(cleaned)) {
      seen.add(cleaned)
      terms.push(cleaned)
    }
    if (/[\u3400-\u9fff]/.test(cleaned) && cleaned.length >= 2) {
      for (let index = 0; index < cleaned.length - 1; index += 1) {
        const gram = cleaned.slice(index, index + 2)
        if (!seen.has(gram)) {
          seen.add(gram)
          terms.push(gram)
        }
      }
    }
  }
  return { terms: terms.slice(0, 256), bigrams: createBigrams(raw) }
}

function createBigrams(value) {
  const normalized = stripPunctuation(value)
  const grams = new Set()
  if (normalized.length < 2) {
    if (normalized) grams.add(normalized)
    return grams
  }
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2))
  }
  return grams
}

function diceCoefficient(left, right) {
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const gram of left) {
    if (right.has(gram)) intersection += 1
  }
  return (2 * intersection) / (left.size + right.size)
}

function candidateEntityIds(candidate) {
  const fromMetadata = candidate?.metadata || {}
  return [
    ...normalizeStringList(candidate?.characterIds),
    ...normalizeStringList(candidate?.placeIds),
    ...normalizeStringList(fromMetadata.characterIds),
    ...normalizeStringList(fromMetadata.placeIds)
  ]
}

function computeRelevance(candidate, queryContext, contextEntityIds = []) {
  if (!queryContext.terms.length) return 0
  const haystack = `${text(candidate?.kind)} ${text(candidate?.title || '')} ${text(candidate?.content)} ${candidateEntityIds(candidate).join(' ')}`.toLowerCase()
  const contentGrams = createBigrams(text(candidate?.content))

  let matchedTerms = 0
  for (const term of queryContext.terms) {
    if (haystack.includes(term)) matchedTerms += 1
  }
  const termOverlap = (() => {
    const denominator = Math.min(queryContext.terms.length, 8)
    return denominator ? matchedTerms / denominator : 0
  })()
  const dice = diceCoefficient(queryContext.bigrams, contentGrams)

  const entities = new Set(candidateEntityIds(candidate).map((id) => id.toLowerCase()))
  const rawQuery = text(queryContext.raw).toLowerCase()
  const entityHit = entities.size > 0 && (
    [...entities].some((id) => rawQuery.includes(id))
    || contextEntityIds.some((id) => entities.has(text(id).toLowerCase()))
  )

  const score = (termOverlap * 0.55 + dice * 0.35 + (entityHit ? 0.10 : 0))
  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000))
}

function computeRecency(candidate, now) {
  const updatedAt = Number(candidate?.updatedAt || candidate?.createdAt || 0)
  if (!updatedAt) return 0
  const age = Math.max(0, now - updatedAt)
  const decay = 0.5 ** (age / RECENCY_HALF_LIFE_MS)
  return Math.round(decay * 1000) / 1000
}

function scopeAuthorized(candidate, { authorId, projectId, sessionId }) {
  const scope = text(candidate?.scope)
  const scopeId = text(candidate?.scopeId)
  if (scope === 'global-author') {
    return !authorId || !scopeId || scopeId === authorId
  }
  if (scope === 'project') {
    return Boolean(projectId) && scopeId === projectId
  }
  if (scope === 'session') {
    return Boolean(sessionId) && scopeId === sessionId
  }
  return false
}

function sourceRevisionCurrent(candidate, currentRevisions = {}) {
  const refs = normalizeStringList(candidate?.sourceRefs)
  const revision = text(candidate?.sourceRevision)
  if (!refs.length || !revision) return true
  return refs.every((ref) => {
    const expected = currentRevisions[ref]
    return expected === undefined || expected === null || expected === '' || expected === revision
  })
}

function clampConfidence(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0.5
  return Math.max(0, Math.min(1, num))
}

function countMatchedTerms(candidate, queryContext) {
  if (!queryContext.terms.length) return 0
  const haystack = `${text(candidate?.kind)} ${text(candidate?.title || '')} ${text(candidate?.content)} ${candidateEntityIds(candidate).join(' ')}`.toLowerCase()
  let matched = 0
  for (const term of queryContext.terms) {
    if (haystack.includes(term)) matched += 1
  }
  return matched
}

export function rankMemoryCandidates({
  candidates,
  query,
  authorId = '',
  projectId = '',
  sessionId = '',
  entityIds = [],
  now = Date.now(),
  policy = MEMORY_RETRIEVAL_POLICY,
  currentRevisions = {}
} = {}) {
  const list = Array.isArray(candidates) ? candidates : []
  const queryContext = { raw: text(query), ...tokenizeMemoryQuery(query) }
  const weights = policy.weights

  const included = []
  const excluded = []
  let eligible = 0

  for (const candidate of list) {
    if (!candidate || typeof candidate !== 'object') continue
    const base = {
      id: text(candidate.id),
      scope: text(candidate.scope),
      scopeId: text(candidate.scopeId),
      kind: text(candidate.kind),
      authority: candidate.authority || (candidate.status === 'active' ? 'accepted' : 'derived'),
      sourceRefs: normalizeStringList(candidate.sourceRefs),
      importance: Number(candidate.importance)
    }

    if (candidate.status !== 'active') {
      excluded.push({ ...base, skipReason: 'status' })
      continue
    }
    if (!scopeAuthorized(candidate, { authorId, projectId, sessionId })) {
      excluded.push({ ...base, skipReason: 'scope' })
      continue
    }
    if (!sourceRevisionCurrent(candidate, currentRevisions)) {
      excluded.push({ ...base, skipReason: 'source-stale' })
      continue
    }

    eligible += 1

    if (!queryContext.raw) continue

    // 用户置顶/降权以显式 override 优先于派生 importance。
    const overrideValue = Number(candidate?.importanceOverride)
    const baseImportance = Number.isFinite(base.importance)
      ? Math.max(0, Math.min(1, base.importance))
      : deriveMemoryImportance({ kind: base.kind })
    const importanceValue = Number.isFinite(overrideValue)
      ? Math.max(0, Math.min(1, overrideValue))
      : baseImportance
    const authorityValue = AUTHORITY_SCORES[base.authority] ?? 0.4
    const recencyValue = computeRecency(candidate, now)
    const relevanceValue = computeRelevance(candidate, queryContext, normalizeStringList(entityIds))
    const scopeFitValue = SCOPE_FIT_SCORES[base.scope] ?? 0.3
    const finalValue = Math.round((
      weights.relevance * relevanceValue
      + weights.importance * importanceValue
      + weights.authority * authorityValue
      + weights.recency * recencyValue
      + weights.scopeFit * scopeFitValue
    ) * 1000) / 1000

    const confidenceValue = clampConfidence(candidate?.confidence)
    const entry = {
      ...base,
      confidence: confidenceValue,
      matchedTerms: countMatchedTerms(candidate, queryContext),
      importance: importanceValue,
      recallCount: Number(candidate.recallCount) || 0,
      updatedAt: Number(candidate.updatedAt || candidate.createdAt || 0),
      score: {
        relevance: relevanceValue,
        importance: importanceValue,
        authority: authorityValue,
        recency: recencyValue,
        scopeFit: scopeFitValue,
        final: finalValue
      }
    }

    if (relevanceValue < policy.minRelevance) {
      excluded.push({ ...entry, skipReason: 'below-threshold' })
    } else {
      included.push(entry)
    }
  }

  included.sort((left, right) => (
    right.score.final - left.score.final
    || right.confidence - left.confidence
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  ))

  const perScopeCount = {}
  const finalIncluded = []
  const capped = []
  for (const entry of included) {
    const used = perScopeCount[entry.scope] || 0
    if (used >= policy.maxPerScope) {
      capped.push({ ...entry, skipReason: 'per-scope-cap' })
    } else if (finalIncluded.length >= policy.topK) {
      capped.push({ ...entry, skipReason: 'top-k' })
    } else {
      perScopeCount[entry.scope] = used + 1
      finalIncluded.push({ ...entry, reason: 'included' })
    }
  }

  return {
    query: queryContext.raw,
    queryTerms: queryContext.terms,
    included: finalIncluded,
    excluded: [...capped, ...excluded],
    counts: {
      total: list.length,
      eligible,
      included: finalIncluded.length,
      excluded: capped.length + excluded.length,
      perScope: Object.fromEntries(Object.entries(perScopeCount))
    }
  }
}
