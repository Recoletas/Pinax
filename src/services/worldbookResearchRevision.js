function text(value, maxChars = Infinity) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function hashValue(value) {
  const serialized = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizeSource(source) {
  return {
    id: text(source?.id).toUpperCase(),
    url: text(source?.url, 1600),
    title: text(source?.title, 240),
    content: text(source?.content, 6000),
    evidenceBlocks: (Array.isArray(source?.evidenceBlocks) ? source.evidenceBlocks : [])
      .map((block) => ({
        id: text(block?.id, 20).toUpperCase(),
        locator: text(block?.locator, 80),
        text: text(block?.text, 800)
      }))
      .filter((block) => block.id && block.text)
  }
}

function normalizeClaim(claim) {
  return {
    id: text(claim?.id).toUpperCase(),
    type: text(claim?.type, 30),
    text: text(claim?.text, 500),
    basis: text(claim?.basis, 20),
    sourceRefs: Array.isArray(claim?.sourceRefs) ? [...claim.sourceRefs].sort() : [],
    evidenceRefs: Array.isArray(claim?.evidenceRefs)
      ? claim.evidenceRefs.map((item) => ({
        sourceId: text(item?.sourceId).toUpperCase(),
        locator: text(item?.locator, 80),
        quote: text(item?.quote, 320)
      })).sort((left, right) => `${left.sourceId}:${left.locator}`.localeCompare(`${right.sourceId}:${right.locator}`))
      : []
  }
}

export function createResearchRevision({ input = {}, queries = [], sources = [], claims = [], excludedSourceIds = [] } = {}) {
  const normalizedInput = {
    brief: text(input?.brief, 4000),
    genre: text(input?.genre, 60),
    genreLabel: text(input?.genreLabel, 60),
    nameHint: text(input?.nameHint, 120),
    targetCount: Number(input?.targetCount) || 0
  }
  const sourceSnapshot = (Array.isArray(sources) ? sources : [])
    .map(normalizeSource)
    .sort((left, right) => left.id.localeCompare(right.id))
  const claimSnapshot = (Array.isArray(claims) ? claims : [])
    .map(normalizeClaim)
    .sort((left, right) => left.id.localeCompare(right.id))
  const normalizedExcluded = [...new Set((Array.isArray(excludedSourceIds) ? excludedSourceIds : [])
    .map((id) => text(id).toUpperCase())
    .filter(Boolean))].sort()
  const sourceFingerprint = hashValue({ sources: sourceSnapshot, excludedSourceIds: normalizedExcluded })
  const claimFingerprint = hashValue({ claims: claimSnapshot })
  const queryFingerprint = hashValue([...new Set((Array.isArray(queries) ? queries : []).map((query) => text(query, 240)))])
  const fingerprint = hashValue({
    input: normalizedInput,
    queryFingerprint,
    sourceFingerprint,
    claimFingerprint
  })
  return {
    version: 1,
    fingerprint,
    sourceFingerprint,
    claimFingerprint,
    queryFingerprint,
    input: normalizedInput,
    state: 'ready'
  }
}

export function researchRevisionChanged(revision, nextRevision) {
  if (!revision?.fingerprint || !nextRevision?.fingerprint) return false
  return revision.fingerprint !== nextRevision.fingerprint
}
