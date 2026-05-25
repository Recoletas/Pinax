import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  addNarrativeAsset,
  createNarrativeAsset,
  getAssetKindLabel,
  listNarrativeAssets,
  setNarrativeAssetStatus,
  updateNarrativeAsset
} from '@/services/narrativeAssets'

describe('narrativeAssets', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
  })

  it('creates normalized inbox assets', () => {
    const asset = createNarrativeAsset({
      content: '  第一段正文候选  ',
      kind: 'draft-prose',
      source: {
        type: 'experience-session',
        id: 'session-a',
        messageIds: ['m1']
      }
    })

    expect(asset.schemaVersion).toBe(1)
    expect(asset.kind).toBe('draft-prose')
    expect(asset.status).toBe('inbox')
    expect(asset.title).toBe('第一段正文候选')
    expect(asset.content).toBe('第一段正文候选')
    expect(asset.source.messageIds).toEqual(['m1'])
  })

  it('stores, filters, and updates assets', () => {
    const first = addNarrativeAsset({
      content: '角色得知了新的秘密。',
      kind: 'event',
      projectId: 'book-a'
    })
    addNarrativeAsset({
      content: '另一本书的素材。',
      kind: 'inspiration',
      projectId: 'book-b'
    })

    expect(listNarrativeAssets({ status: 'inbox', projectId: 'book-a' })).toHaveLength(1)

    const updated = updateNarrativeAsset(first.id, {
      title: '新的秘密',
      kind: 'character-fact'
    })
    expect(updated.title).toBe('新的秘密')
    expect(updated.kind).toBe('character-fact')

    setNarrativeAssetStatus(first.id, 'accepted')
    expect(listNarrativeAssets({ status: 'inbox', projectId: 'book-a' })).toHaveLength(0)
    expect(listNarrativeAssets({ status: 'accepted', projectId: 'book-a' })).toHaveLength(1)
  })

  it('falls back invalid kind and exposes labels', () => {
    const asset = createNarrativeAsset({
      content: '一条没有类型的材料。',
      kind: 'unknown-kind'
    })

    expect(asset.kind).toBe('inspiration')
    expect(getAssetKindLabel('worldbook-draft')).toBe('世界书草稿')
  })
})
