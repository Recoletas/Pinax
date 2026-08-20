/* global process */
import { performance } from 'node:perf_hooks'
import { createNarrativeAsset } from '../src/services/narrativeAssets.js'
import { findAssetsByContentRefs } from '../src/services/narrativeAssetRetrieval.js'

const SCALES = [20, 100, 500]
const WARMUP_RUNS = 100
const MEASURED_RUNS = 1_000
const lookupRefs = [{ refType: 'chapter', refId: 'chapter-0', projectId: 'book-1' }]

function buildAssetCorpus(size) {
  return Array.from({ length: size }, (_, index) => createNarrativeAsset({
    id: `asset-${String(index + 1).padStart(3, '0')}`,
    title: `素材 ${index + 1}`,
    content: `素材正文 ${index + 1}`,
    projectId: index % 7 === 0 ? 'book-2' : 'book-1',
    status: index % 11 === 0 ? 'archived' : 'accepted',
    sourceRefs: [{
      refType: index % 3 === 0 ? 'chapter' : 'session-message',
      refId: index % 3 === 0 ? `chapter-${index % 5}` : `session-1:message-${index % 9}`,
      projectId: index % 7 === 0 ? 'book-2' : 'book-1'
    }],
    createdAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index
  }))
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

for (const scale of SCALES) {
  const assets = buildAssetCorpus(scale)
  const expectedIds = findAssetsByContentRefs(lookupRefs, { projectId: 'book-1', assets })
  const expectedActiveIds = expectedIds.exactMatches.map((item) => item.asset.id)
  const expectedArchivedIds = expectedIds.archivedMatches.map((item) => item.asset.id)

  if ([...expectedIds.exactMatches, ...expectedIds.archivedMatches]
    .some((item) => item.asset.projectId !== 'book-1')) {
    throw new Error(`Project leakage detected at scale ${scale}`)
  }

  const missing = findAssetsByContentRefs([
    { refType: 'chapter', refId: 'missing', projectId: 'book-1' }
  ], { projectId: 'book-1', assets })
  if (missing.state !== 'no-exact-match') {
    throw new Error(`Negative control failed at scale ${scale}`)
  }

  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    findAssetsByContentRefs(lookupRefs, { projectId: 'book-1', assets })
  }

  const durations = []
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const startedAt = performance.now()
    const result = findAssetsByContentRefs(lookupRefs, { projectId: 'book-1', assets })
    durations.push(performance.now() - startedAt)

    if (JSON.stringify(result.exactMatches.map((item) => item.asset.id)) !== JSON.stringify(expectedActiveIds)
      || JSON.stringify(result.archivedMatches.map((item) => item.asset.id)) !== JSON.stringify(expectedArchivedIds)) {
      throw new Error(`Unstable result ids at scale ${scale}`)
    }
  }

  durations.sort((left, right) => left - right)
  process.stdout.write(`${JSON.stringify({
    scale,
    medianMs: Number(percentile(durations, 0.5).toFixed(4)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(4)),
    matchedCount: expectedActiveIds.length + expectedArchivedIds.length
  })}\n`)
}
