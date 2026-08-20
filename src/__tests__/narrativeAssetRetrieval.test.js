import { describe, expect, it } from 'vitest'
import { createNarrativeAsset } from '@/services/narrativeAssets'
import { findAssetsByContentRefs } from '@/services/narrativeAssetRetrieval'

function asset(input = {}) {
  return createNarrativeAsset({
    id: input.id,
    title: input.id,
    content: `正文 ${input.id}`,
    projectId: Object.prototype.hasOwnProperty.call(input, 'projectId') ? input.projectId : 'book-1',
    status: input.status || 'accepted',
    source: input.source,
    sourceRefs: input.sourceRefs,
    createdAt: input.createdAt || 1_700_000_000_000,
    updatedAt: input.updatedAt || 1_700_000_000_000
  })
}

function buildAssetCorpus(size, { projectId = 'book-1' } = {}) {
  return Array.from({ length: size }, (_, index) => createNarrativeAsset({
    id: `asset-${String(index + 1).padStart(3, '0')}`,
    title: `素材 ${index + 1}`,
    content: `素材正文 ${index + 1}`,
    projectId: index % 7 === 0 ? 'book-2' : projectId,
    status: index % 11 === 0 ? 'archived' : 'accepted',
    sourceRefs: [{
      refType: index % 3 === 0 ? 'chapter' : 'session-message',
      refId: index % 3 === 0 ? `chapter-${index % 5}` : `session-1:message-${index % 9}`,
      projectId: index % 7 === 0 ? 'book-2' : projectId
    }],
    createdAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index
  }))
}

function expectedIds(size, { archived = false } = {}) {
  const ids = []
  for (let index = size - 1; index >= 0; index -= 1) {
    if (index % 7 === 0 || index % 15 !== 0 || (index % 11 === 0) !== archived) continue
    ids.push(`asset-${String(index + 1).padStart(3, '0')}`)
  }
  return ids
}

describe('findAssetsByContentRefs', () => {
  it('groups active and archived exact matches without recency fallback', () => {
    const ref = { refType: 'chapter', refId: 'chapter-1', projectId: 'book-1' }
    const activeExact = asset({ id: 'active', sourceRefs: [ref] })
    const archivedExact = asset({ id: 'archived', status: 'archived', sourceRefs: [ref] })
    const unrelated = asset({
      id: 'recent-unrelated',
      updatedAt: 1_800_000_000_000,
      sourceRefs: [{ refType: 'chapter', refId: 'chapter-2', projectId: 'book-1' }]
    })

    expect(findAssetsByContentRefs([ref], {
      projectId: 'book-1',
      assets: [unrelated, archivedExact, activeExact]
    })).toEqual({
      state: 'matched',
      exactMatches: [{
        asset: activeExact,
        matchedRefs: [expect.objectContaining({ refType: 'chapter', refId: 'chapter-1' })],
        reasons: ['exact-ref']
      }],
      archivedMatches: [{
        asset: archivedExact,
        matchedRefs: [expect.objectContaining({ refType: 'chapter', refId: 'chapter-1' })],
        reasons: ['archived-exact-ref']
      }]
    })

    expect(findAssetsByContentRefs([
      { refType: 'chapter', refId: 'missing', projectId: 'book-1' }
    ], { projectId: 'book-1', assets: [unrelated] })).toEqual({
      state: 'no-exact-match',
      exactMatches: [],
      archivedMatches: []
    })
  })

  it.each([
    ['different project', 'book-2'],
    ['legacy null project', null]
  ])('does not leak %s assets into a scoped lookup', (_label, assetProjectId) => {
    const exactRef = { refType: 'chapter', refId: 'chapter-1', projectId: assetProjectId }
    const candidate = asset({
      id: `asset-${assetProjectId || 'null'}`,
      projectId: assetProjectId,
      sourceRefs: [exactRef]
    })

    expect(findAssetsByContentRefs([
      { refType: 'chapter', refId: 'chapter-1', projectId: 'book-1' }
    ], { projectId: 'book-1', assets: [candidate] }).state).toBe('no-exact-match')
  })

  it('omits rejected assets and normalizes legacy chapter sources', () => {
    const legacy = asset({
      id: 'legacy',
      source: { type: 'chapter', id: 'chapter-legacy' },
      sourceRefs: []
    })
    const rejected = asset({
      id: 'rejected',
      status: 'rejected',
      sourceRefs: [{ refType: 'chapter', refId: 'chapter-legacy', projectId: 'book-1' }]
    })

    const result = findAssetsByContentRefs([
      { refType: 'chapter', refId: 'chapter-legacy', projectId: 'book-1' }
    ], { projectId: 'book-1', assets: [rejected, legacy] })

    expect(result.exactMatches.map((item) => item.asset.id)).toEqual(['legacy'])
    expect(result.archivedMatches).toEqual([])
  })

  it('deduplicates assets while preserving every requested match and version evidence', () => {
    const candidate = asset({
      id: 'multi-ref',
      sourceRefs: [
        { refType: 'chapter', refId: 'chapter-1', projectId: 'book-1', version: 'source-v1' },
        { refType: 'session-message', refId: 'session-1:m2', projectId: 'book-1' }
      ]
    })

    const result = findAssetsByContentRefs([
      { refType: 'chapter', refId: 'chapter-1', projectId: 'book-1', version: 'requested-v2' },
      { refType: 'session-message', refId: 'session-1:m2', projectId: 'book-1' },
      { refType: 'chapter', refId: 'chapter-1', projectId: 'book-1', version: 'requested-v2' }
    ], { projectId: 'book-1', assets: [candidate, candidate] })

    expect(result.exactMatches).toHaveLength(1)
    expect(result.exactMatches[0].matchedRefs).toEqual([
      expect.objectContaining({ refType: 'chapter', refId: 'chapter-1', version: 'requested-v2' }),
      expect.objectContaining({ refType: 'session-message', refId: 'session-1:m2' })
    ])
  })

  it('sorts accepted before inbox, then newer updates, then asset id', () => {
    const sourceRefs = [{ refType: 'chapter', refId: 'chapter-1', projectId: 'book-1' }]
    const candidates = [
      asset({ id: 'accepted-z', status: 'accepted', updatedAt: 10, sourceRefs }),
      asset({ id: 'inbox-new', status: 'inbox', updatedAt: 30, sourceRefs }),
      asset({ id: 'accepted-b', status: 'accepted', updatedAt: 20, sourceRefs }),
      asset({ id: 'accepted-a', status: 'accepted', updatedAt: 20, sourceRefs })
    ]

    const result = findAssetsByContentRefs(sourceRefs, { projectId: 'book-1', assets: candidates })

    expect(result.exactMatches.map((item) => item.asset.id)).toEqual([
      'accepted-a',
      'accepted-b',
      'accepted-z',
      'inbox-new'
    ])
  })

  describe.each([20, 100, 500])('%i-asset corpus', (size) => {
    it('returns deterministic exact ids with stable archived grouping and no leakage', () => {
      const corpus = buildAssetCorpus(size)
      const result = findAssetsByContentRefs([
        { refType: 'chapter', refId: 'chapter-0', projectId: 'book-1' }
      ], { projectId: 'book-1', assets: corpus })

      expect(result.exactMatches.map((item) => item.asset.id)).toEqual(expectedIds(size))
      expect(result.archivedMatches.map((item) => item.asset.id)).toEqual(expectedIds(size, { archived: true }))
      expect([...result.exactMatches, ...result.archivedMatches])
        .not.toContainEqual(expect.objectContaining({ asset: expect.objectContaining({ projectId: 'book-2' }) }))

      expect(findAssetsByContentRefs([
        { refType: 'chapter', refId: 'missing', projectId: 'book-1' }
      ], { projectId: 'book-1', assets: corpus })).toEqual({
        state: 'no-exact-match',
        exactMatches: [],
        archivedMatches: []
      })
    })
  })
})
