import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import { addNarrativeAsset } from '@/services/narrativeAssets'
import {
  ensureAssetCanvasCard,
  findAssetCanvasCard,
  listRelationCanvasCards
} from '@/services/relationCanvas'

describe('relationCanvas', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)
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
})
