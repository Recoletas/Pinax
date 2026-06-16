import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  addNarrativeAsset,
  createNarrativeAsset,
  deleteNarrativeAsset,
  getAssetKindExplanation,
  getAssetKindLabel,
  getAssetSourceDetail,
  getAssetSourceLabel,
  listActiveNarrativeAssets,
  listNarrativeAssets,
  setNarrativeAssetsStatus,
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

  it('describes asset sources', () => {
    expect(getAssetSourceLabel({ type: 'experience-session' })).toBe('体验会话')
    expect(getAssetSourceLabel({ type: 'poetry-node' })).toBe('诗歌节点')
    expect(getAssetSourceLabel({ type: 'prose-card' })).toBe('散文卡片')
    expect(getAssetSourceLabel({ type: 'relation-canvas' })).toBe('卡片画布')
    expect(getAssetSourceLabel({ type: 'note' })).toBe('素材')
    expect(getAssetSourceDetail({ type: 'experience-session', id: 'session-a', messageIds: ['m1', 'm2'] }))
      .toBe('体验会话 · session-a · 2 段')
  })

  it('stores, filters, and updates assets', () => {
    const first = addNarrativeAsset({
      content: '角色得知了新的秘密。',
      kind: 'event',
      projectId: 'book-a',
      source: {
        type: 'experience-session',
        id: 'session-a'
      }
    })
    addNarrativeAsset({
      content: '另一本书的素材。',
      kind: 'inspiration',
      projectId: 'book-b'
    })
    addNarrativeAsset({
      content: '未绑定素材。',
      kind: 'inspiration',
      projectId: null
    })

    expect(listNarrativeAssets({ status: 'inbox', projectId: 'book-a' })).toHaveLength(1)
    expect(listNarrativeAssets({ status: 'inbox', projectId: null })).toHaveLength(1)
    expect(listNarrativeAssets({ status: 'inbox', kind: 'event' })).toHaveLength(1)
    expect(listNarrativeAssets({ status: 'inbox', kind: 'inspiration' })).toHaveLength(2)
    expect(listNarrativeAssets({ status: 'inbox', sourceType: 'experience-session', sourceId: 'session-a' })).toHaveLength(1)

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

  it('updates multiple asset statuses at once', () => {
    const first = addNarrativeAsset({ content: '素材一', kind: 'draft-prose' })
    const second = addNarrativeAsset({ content: '素材二', kind: 'draft-prose' })

    const updated = setNarrativeAssetsStatus([first.id, second.id], 'archived')

    expect(updated).toHaveLength(2)
    expect(listNarrativeAssets({ status: 'inbox' })).toHaveLength(0)
    expect(listNarrativeAssets({ status: 'archived' })).toHaveLength(2)
  })

  it('lists only active inbox and accepted assets for material sidebar views', () => {
    const inbox = addNarrativeAsset({ content: '待处理素材', kind: 'inspiration', status: 'inbox' })
    const accepted = addNarrativeAsset({ content: '采纳素材', kind: 'event', status: 'accepted' })
    addNarrativeAsset({ content: '归档素材', kind: 'draft-prose', status: 'archived' })
    addNarrativeAsset({ content: '拒绝素材', kind: 'worldbook-draft', status: 'rejected' })

    expect(listActiveNarrativeAssets().map((asset) => asset.id)).toEqual([accepted.id, inbox.id])
  })

  it('permanently deletes an asset instead of archiving it', () => {
    const first = addNarrativeAsset({ content: '要删除的素材', kind: 'inspiration' })
    const second = addNarrativeAsset({ content: '保留的素材', kind: 'event' })

    const deleted = deleteNarrativeAsset(first.id)

    expect(deleted?.id).toBe(first.id)
    expect(listNarrativeAssets({ status: null }).map((asset) => asset.id)).toEqual([second.id])
    expect(deleteNarrativeAsset(first.id)).toBeNull()
    expect(deleteNarrativeAsset('')).toBeNull()
  })

  it('falls back invalid kind and exposes labels', () => {
    const asset = createNarrativeAsset({
      content: '一条没有类型的材料。',
      kind: 'unknown-kind'
    })

    expect(asset.kind).toBe('inspiration')
    expect(getAssetKindLabel('worldbook-draft')).toBe('世界书草稿')
    expect(getAssetKindExplanation('worldbook-draft')).toContain('世界书')
    expect(getAssetKindExplanation('unknown-kind')).toBe('可复用的写作素材条目。')
  })

  it('stores reference image metadata', () => {
    const asset = addNarrativeAsset({
      title: '雨夜街角',
      content: '雨夜街角，冷色调',
      kind: 'reference-image',
      image: {
        id: 'img-a',
        prompt: '雨夜街角',
        data: 'data:image/png;base64,abc',
        width: 1024,
        height: 768
      }
    })

    expect(asset.kind).toBe('reference-image')
    expect(asset.image.prompt).toBe('雨夜街角')
    expect(asset.image.data).toContain('data:image/png')
    expect(getAssetKindLabel('reference-image')).toBe('参考图')
  })
})
