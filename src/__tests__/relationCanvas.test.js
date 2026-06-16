import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import { addNarrativeAsset } from '@/services/narrativeAssets'
import {
  deleteAssetCanvasReferences,
  ensureAssetCanvasCard,
  findAssetCanvasCard,
  listRelationCanvasCards
} from '@/services/relationCanvas'

describe('relationCanvas', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)
    localStorage.removeItem(STORAGE_KEYS.PROSE_EDGES_V1)
    localStorage.removeItem(STORAGE_KEYS.PROSE_OUTLINE_V1)
    localStorage.removeItem(STORAGE_KEYS.PROSE_TIMELINE_V1)
    localStorage.removeItem(STORAGE_KEYS.PROSE_PILES_V1)
  })

  it('creates one canvas reference node for a material asset', () => {
    const asset = addNarrativeAsset({
      title: '雨夜街角',
      content: '角色在雨夜街角停住脚步。',
      kind: 'storyboard-seed',
      status: 'accepted'
    })

    const first = ensureAssetCanvasCard(asset)
    const second = ensureAssetCanvasCard(asset)

    expect(first.assetId).toBe(asset.id)
    expect(second.id).toBe(first.id)
    expect(findAssetCanvasCard(asset.id)?.assetId).toBe(asset.id)
    expect(listRelationCanvasCards()).toHaveLength(1)
  })

  it('removes canvas references when a material asset is deleted', () => {
    const asset = addNarrativeAsset({
      title: '删除目标',
      content: '这个素材已导入画布。',
      kind: 'storyboard-seed',
      status: 'accepted'
    })
    const otherAsset = addNarrativeAsset({
      title: '保留目标',
      content: '这个素材仍留在画布。',
      kind: 'storyboard-seed',
      status: 'accepted'
    })

    const card = ensureAssetCanvasCard(asset)
    const otherCard = ensureAssetCanvasCard(otherAsset)

    localStorage.setItem(STORAGE_KEYS.PROSE_EDGES_V1, JSON.stringify([
      { id: 'edge-delete', sourceId: card.id, targetId: otherCard.id, type: 'continuation' },
      { id: 'edge-keep', sourceId: otherCard.id, targetId: 'manual-card', type: 'parallel' }
    ]))
    localStorage.setItem(STORAGE_KEYS.PROSE_OUTLINE_V1, JSON.stringify([
      { cardId: card.id, preview: '删除目标' },
      { cardId: otherCard.id, preview: '保留目标' }
    ]))
    localStorage.setItem(STORAGE_KEYS.PROSE_TIMELINE_V1, JSON.stringify([
      { id: 'timeline-asset', assetId: asset.id, action: '素材操作' },
      { id: 'timeline-card', cardId: card.id, action: '卡片操作' },
      { id: 'timeline-keep', focusCardId: otherCard.id, action: '保留卡片操作' }
    ]))

    const result = deleteAssetCanvasReferences(asset.id)

    expect(result.removedCards.map((item) => item.id)).toEqual([card.id])
    expect(result.removedEdges).toBe(1)
    expect(result.removedOutlineItems).toBe(1)
    expect(result.removedTimelineItems).toBe(2)
    expect(listRelationCanvasCards().map((item) => item.id)).toEqual([otherCard.id])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PROSE_EDGES_V1))).toEqual([
      { id: 'edge-keep', sourceId: otherCard.id, targetId: 'manual-card', type: 'parallel' }
    ])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PROSE_OUTLINE_V1))).toEqual([
      { cardId: otherCard.id, preview: '保留目标' }
    ])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PROSE_TIMELINE_V1))).toEqual([
      { id: 'timeline-keep', focusCardId: otherCard.id, action: '保留卡片操作' }
    ])
  })
})
