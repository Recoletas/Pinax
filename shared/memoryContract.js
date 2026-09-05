export const MEMORY_SCHEMA_VERSION = 2

export const MEMORY_AUTHORITIES = Object.freeze(['accepted', 'derived', 'imported'])

export const MEMORY_DERIVATIONS = Object.freeze(['explicit', 'prose-commit', 'boundary', 'migration'])

export const MEMORY_RETRIEVAL_POLICY = Object.freeze({
  topK: 5,
  maxPerScope: 3,
  minRelevance: 0.18,
  weights: Object.freeze({
    relevance: 0.50,
    importance: 0.18,
    authority: 0.14,
    recency: 0.10,
    scopeFit: 0.08
  })
})

export function normalizeStringList(value, limit = 32) {
  return [...new Set([].concat(value || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))].slice(0, limit)
}

export function defaultMemoryAuthority(status) {
  return status === 'active' ? 'accepted' : 'derived'
}
