const HAN_RUN = /[\p{Script=Han}]+/gu
const WORD_TOKEN = /[A-Za-z0-9_]{2,}/g

function text(value) {
  return String(value ?? '').trim()
}

function unique(values) {
  return [...new Set(values.map((value) => text(value).toLowerCase()).filter((value) => value.length >= 2))]
}

export function buildSourceSearchTerms(values = []) {
  const terms = []
  for (const value of Array.isArray(values) ? values : [values]) {
    const input = text(value).toLowerCase()
    if (!input) continue
    terms.push(...input.match(WORD_TOKEN) || [])
    for (const run of input.match(HAN_RUN) || []) {
      const bounded = run.slice(0, 48)
      terms.push(bounded)
      for (let index = 0; index < bounded.length - 1; index += 1) {
        terms.push(bounded.slice(index, index + 2))
      }
    }
  }
  return unique(terms).slice(0, 64)
}

function splitSourceText(content, chunkSize = 900) {
  const normalized = text(content)
  if (!normalized) return []
  const paragraphs = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  const chunks = []
  let offset = 0
  for (const paragraph of paragraphs) {
    let localOffset = 0
    while (localOffset < paragraph.length) {
      const chunk = paragraph.slice(localOffset, localOffset + chunkSize).trim()
      if (chunk) {
        const start = offset + localOffset
        chunks.push({
          text: chunk,
          locator: { type: 'preview-offset', start, end: start + chunk.length }
        })
      }
      localOffset += chunkSize
    }
    offset += paragraph.length + 2
  }
  return chunks
}

function scoreCandidate(candidate, terms, linkedSourceIds) {
  const title = candidate.title.toLowerCase()
  const content = candidate.text.toLowerCase()
  const titleHits = terms.reduce((count, term) => count + (title.includes(term) ? 1 : 0), 0)
  const contentHits = terms.reduce((count, term) => count + (content.includes(term) ? 1 : 0), 0)
  const linked = linkedSourceIds.has(candidate.sourceId) ? 5 : 0
  return linked + titleHits * 4 + Math.min(contentHits, 8) * 2
}

export function selectSourceChunks({
  sourceDocuments = [],
  sectionLabel = '',
  fieldLabel = '',
  userBrief = '',
  currentFieldValue = '',
  matchedEntries = [],
  maxChars = 5000,
  maxChunks = 6,
  maxChunksPerSource = 2
} = {}) {
  const documents = Array.isArray(sourceDocuments) ? sourceDocuments : []
  if (!documents.length) return { chunks: [], context: '', coverage: { sources: 0, chars: 0 } }

  const terms = buildSourceSearchTerms([
    sectionLabel,
    fieldLabel,
    userBrief,
    currentFieldValue,
    ...matchedEntries.flatMap((entry) => [entry?.name, ...(entry?.keys || []), ...(entry?.keysSecondary || [])])
  ])
  const linkedSourceIds = new Set(matchedEntries.flatMap((entry) => entry?.metadata?.sourceDocumentIds || []).map(String))
  const candidatesByText = new Map()
  documents.forEach((document, documentIndex) => {
    const sourceId = text(document?.id) || `source-${documentIndex + 1}`
    const title = text(document?.title) || `原始资料 ${documentIndex + 1}`
    splitSourceText(document?.content).forEach((chunk, chunkIndex) => {
      const candidate = {
        sourceId,
        title,
        text: chunk.text,
        locator: chunk.locator,
        order: documentIndex * 10000 + chunkIndex,
        sourceRefs: [{ sourceId, locator: chunk.locator }],
        sourceTitles: { [sourceId]: title }
      }
      const score = scoreCandidate(candidate, terms, linkedSourceIds)
      const existing = candidatesByText.get(candidate.text)
      if (!existing) {
        candidatesByText.set(candidate.text, { ...candidate, score })
        return
      }
      existing.score = Math.max(existing.score, score)
      existing.sourceRefs.push(...candidate.sourceRefs)
      existing.sourceTitles[sourceId] = title
    })
  })

  const candidates = [...candidatesByText.values()].map((candidate) => ({
    ...candidate,
    sourceRefs: candidate.sourceRefs.filter((ref, index, refs) => refs.findIndex((item) => (
      item.sourceId === ref.sourceId
      && JSON.stringify(item.locator) === JSON.stringify(ref.locator)
    )) === index)
  }))
  const ranked = [...candidates].sort((left, right) => right.score - left.score || left.order - right.order)
  const selected = []
  const selectedPerSource = new Map()
  let usedChars = 0
  for (const candidate of ranked) {
    if (selected.length >= maxChunks) break
    const eligibleRefs = candidate.sourceRefs.filter((ref) => (
      (selectedPerSource.get(ref.sourceId) || 0) < maxChunksPerSource
    ))
    if (!eligibleRefs.length) continue
    const blockLength = candidate.text.length + candidate.title.length + 8
    if (usedChars + blockLength > maxChars) continue
    selected.push({
      ...candidate,
      sourceId: eligibleRefs[0].sourceId,
      locator: eligibleRefs[0].locator
    })
    for (const ref of eligibleRefs) {
      selectedPerSource.set(ref.sourceId, (selectedPerSource.get(ref.sourceId) || 0) + 1)
    }
    usedChars += blockLength
  }

  const context = selected
    .map((candidate) => {
      const sources = candidate.sourceRefs
        .map((ref) => `${ref.sourceId} · ${candidate.sourceTitles[ref.sourceId] || candidate.title}`)
        .join(' / ')
      const locator = candidate.locator.type === 'preview-offset' ? `片段 ${candidate.locator.start + 1}` : '资料'
      return `【来源 ${sources} · ${locator}】\n${candidate.text}`
    })
    .join('\n\n')
  return {
    chunks: selected,
    context,
    coverage: {
      sources: new Set(selected.flatMap((candidate) => candidate.sourceRefs.map((ref) => ref.sourceId))).size,
      chars: selected.reduce((sum, candidate) => sum + candidate.text.length, 0),
      availableSources: documents.length,
      availableChunks: candidates.length
    }
  }
}
