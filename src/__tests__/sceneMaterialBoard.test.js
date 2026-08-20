import { describe, expect, it } from 'vitest'
import {
  addCardToOutline,
  buildSceneMaterialBoard,
  getCanvasCardSourceState,
  moveOutlineItem,
  removeCardFromOutline,
  upsertSceneRelationship
} from '@/services/sceneMaterialBoard'

const activeAsset = { id: 'asset-active', status: 'accepted' }
const archivedAsset = { id: 'asset-archived', status: 'archived' }

describe('sceneMaterialBoard', () => {
  it('classifies card provenance without claiming generic stale state', () => {
    const assetsById = new Map([
      [activeAsset.id, activeAsset],
      [archivedAsset.id, archivedAsset]
    ])

    expect(getCanvasCardSourceState({ assetId: activeAsset.id }, assetsById)).toEqual({
      state: 'linked',
      asset: activeAsset
    })
    expect(getCanvasCardSourceState({ assetId: archivedAsset.id }, assetsById).state).toBe('archived')
    expect(getCanvasCardSourceState({ assetId: 'asset-missing' }, assetsById).state).toBe('detached')
    expect(getCanvasCardSourceState({}, assetsById).state).toBe('untracked')
  })

  it('projects outline order, unplaced cards, valid relationships, and source counts', () => {
    const cards = [
      { id: 'card-3', assetId: 'asset-missing', createdAt: '2026-01-03' },
      { id: 'card-1', assetId: activeAsset.id, createdAt: '2026-01-01' },
      { id: 'card-2', assetId: archivedAsset.id, createdAt: '2026-01-02' }
    ]
    const outline = [
      { cardId: 'card-2', preview: '第二拍' },
      { cardId: 'card-gone', preview: '遗失拍' },
      { cardId: 'card-1', preview: '第一拍' }
    ]
    const edges = [
      { id: 'edge-valid', sourceId: 'card-1', targetId: 'card-2', type: 'continuation' },
      { id: 'edge-missing', sourceId: 'card-2', targetId: 'card-gone', type: 'contrast' }
    ]

    const model = buildSceneMaterialBoard({
      cards,
      outline,
      edges,
      assets: [activeAsset, archivedAsset]
    })

    expect(model.beatItems.map((item) => ({
      cardId: item.card.id,
      sequence: item.sequence,
      outlineItem: item.outlineItem
    }))).toEqual([
      { cardId: 'card-2', sequence: 1, outlineItem: outline[0] },
      { cardId: 'card-1', sequence: 2, outlineItem: outline[2] }
    ])
    expect(model.unplacedItems.map((item) => item.card.id)).toEqual(['card-3'])
    expect(model.relationItems).toEqual([{
      edge: edges[0],
      sourceCard: cards[1],
      targetCard: cards[2]
    }])
    expect(model.detachedCount).toBe(2)
    expect(model.archivedCount).toBe(1)
  })

  it('sorts every unplaced card by creation order without capping the model', () => {
    const cards = Array.from({ length: 7 }, (_, index) => ({
      id: `card-${7 - index}`,
      createdAt: `2026-01-${String(7 - index).padStart(2, '0')}`
    }))

    const model = buildSceneMaterialBoard({ cards, outline: [], edges: [], assets: [] })

    expect(model.unplacedItems.map((item) => item.card.id)).toEqual([
      'card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-6', 'card-7'
    ])
  })

  it('adds and removes cards from the existing outline idempotently', () => {
    const original = [{ cardId: 'card-1', preview: '第一拍' }]
    const card = { id: 'card-2', content: '第二拍正文' }

    const added = addCardToOutline(original, card)

    expect(added).toEqual([
      original[0],
      { cardId: 'card-2', preview: '第二拍正文' }
    ])
    expect(addCardToOutline(added, card)).toBe(added)
    expect(removeCardFromOutline(added, 'card-2')).toEqual(original)
    expect(removeCardFromOutline(original, 'missing')).toBe(original)
  })

  it('moves outline items without loss and returns the original for invalid indices', () => {
    const outline = [{ cardId: 'a' }, { cardId: 'b' }, { cardId: 'c' }]

    expect(moveOutlineItem(outline, 2, 0)).toEqual([
      { cardId: 'c' }, { cardId: 'a' }, { cardId: 'b' }
    ])
    expect(moveOutlineItem(outline, -1, 1)).toBe(outline)
    expect(moveOutlineItem(outline, 0, 3)).toBe(outline)
    expect(moveOutlineItem(outline, 1, 1)).toBe(outline)
  })

  it('upserts only existing relation types and treats a card pair as unordered', () => {
    const original = [{
      id: 'edge-1',
      sourceId: 'card-a',
      targetId: 'card-b',
      type: 'parallel'
    }]

    expect(upsertSceneRelationship(original, {
      sourceId: 'card-b',
      targetId: 'card-a',
      type: 'contrast'
    })).toEqual([{ ...original[0], type: 'contrast' }])

    const added = upsertSceneRelationship(original, {
      sourceId: 'card-a',
      targetId: 'card-c',
      type: 'continuation'
    })
    expect(added).toHaveLength(2)
    expect(added[1]).toMatchObject({
      sourceId: 'card-a',
      targetId: 'card-c',
      type: 'continuation'
    })

    expect(upsertSceneRelationship(original, {
      sourceId: 'card-a', targetId: 'card-a', type: 'contrast'
    })).toBe(original)
    expect(upsertSceneRelationship(original, {
      sourceId: 'card-a', targetId: 'card-c', type: 'invented'
    })).toBe(original)
  })
})
