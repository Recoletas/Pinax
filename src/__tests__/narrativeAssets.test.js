import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  addNarrativeAsset,
  buildNarrativeAssetContentHash,
  createNarrativeAsset,
  deleteNarrativeAsset,
  findDuplicateNarrativeAsset,
  getAssetKindExplanation,
  getAssetKindLabel,
  getAssetSourceDetail,
  getAssetSourceLabel,
  listActiveNarrativeAssets,
  listNarrativeAssets,
  mergeNarrativeAssets,
  normalizeContentRef,
  normalizeImagePresentation,
  setNarrativeAssetsStatus,
  setNarrativeAssetStatus,
  updateNarrativeAsset
} from '@/services/narrativeAssets'
import {
  addNarrativeImageAsset,
  getMediaImagePresentation,
  migrateNarrativeImageAssets,
  updateNarrativeImagePresentation
} from '@/services/media/narrativeImageAssetBridge'
import {
  hydrateMarkdownMediaContent,
  migrateMarkdownMediaContent
} from '@/services/media/markdownMediaBridge'

describe('narrativeAssets', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
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
    expect(normalizeImagePresentation({ fit: 'cover', scale: 4, positionX: -20, positionY: 75 })).toEqual({
      fit: 'cover',
      scale: 2,
      positionX: 0,
      positionY: 75,
      wrap: 'square',
      align: 'right',
      textGap: 16,
      anchorOffset: 0
    })
    expect(normalizeImagePresentation({ wrap: 'tight', align: 'left', textGap: 80, anchorOffset: 19.6 }))
      .toMatchObject({ wrap: 'tight', align: 'left', textGap: 48, anchorOffset: 20 })
    expect(asset.contentHash).toBe(buildNarrativeAssetContentHash('第一段正文候选'))
    expect(asset.sourceRefs).toEqual([
      {
        refType: 'session-message',
        refId: 'session-a:m1',
        projectId: null,
        version: null,
        excerpt: null
      }
    ])
  })

  it('normalizes content refs and fingerprints whitespace-equivalent text', () => {
    expect(normalizeContentRef({
      type: 'chapter',
      id: 'ch-1',
      projectId: 'book-1',
      excerpt: '  原文\n片段  '
    })).toEqual({
      refType: 'chapter',
      refId: 'ch-1',
      projectId: 'book-1',
      version: null,
      excerpt: '原文 片段'
    })
    expect(buildNarrativeAssetContentHash('a\n b')).toBe(buildNarrativeAssetContentHash('a b'))
  })

  it('finds duplicates only when project, content, and source ref all match', () => {
    const original = addNarrativeAsset({
      content: '同一段正文',
      projectId: 'book-1',
      sourceRefs: [{ refType: 'chapter', refId: 'ch-1', projectId: 'book-1' }]
    })

    expect(findDuplicateNarrativeAsset({
      content: '同一段正文',
      projectId: 'book-1',
      sourceRefs: [{ refType: 'chapter', refId: 'ch-1', projectId: 'book-1' }]
    })?.id).toBe(original.id)
    expect(findDuplicateNarrativeAsset({
      content: '同一段正文',
      projectId: 'book-2',
      sourceRefs: [{ refType: 'chapter', refId: 'ch-1', projectId: 'book-2' }]
    })).toBeNull()
    expect(findDuplicateNarrativeAsset({
      content: '同一段正文',
      projectId: 'book-1',
      sourceRefs: [{ refType: 'chapter', refId: 'ch-2', projectId: 'book-1' }]
    })).toBeNull()
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

  it('merges same-project assets while preserving content and source refs', () => {
    const first = addNarrativeAsset({
      content: '第一段',
      projectId: 'book-1',
      sourceRefs: [{ refType: 'chapter', refId: 'ch-1', projectId: 'book-1' }]
    })
    const second = addNarrativeAsset({
      content: '第二段',
      projectId: 'book-1',
      sourceRefs: [{ refType: 'session-message', refId: 'session-1:m2', projectId: 'book-1' }]
    })

    const result = mergeNarrativeAssets([first.id, second.id], { targetId: first.id })

    expect(result?.mergedIds).toEqual([second.id])
    expect(result?.asset.content).toBe('第一段\n\n第二段')
    expect(result?.asset.sourceRefs).toHaveLength(2)
    expect(listNarrativeAssets({ status: null })).toHaveLength(1)
    expect(mergeNarrativeAssets([first.id, 'missing'])).toBeNull()
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

  it('migrates reference image binaries into MediaAsset storage', async () => {
    const blobs = new Map()
    const binaryStore = {
      put: async (id, blob) => blobs.set(id, blob),
      get: async (id) => blobs.get(id) || null,
      delete: async (id) => blobs.delete(id)
    }
    const asset = addNarrativeAsset({
      title: '雨夜街角',
      content: '雨夜街角，冷色调',
      kind: 'reference-image',
      image: {
        id: 'img-a',
        prompt: '雨夜街角',
        data: 'data:image/png;base64,abc',
        width: 1024,
        height: 768,
        presentation: { fit: 'cover', scale: 1.25, positionX: 36, positionY: 62 }
      }
    })
    const hydrated = await migrateNarrativeImageAssets({ binaryStore })
    const migrated = listNarrativeAssets({ status: null })[0]

    expect(asset.kind).toBe('reference-image')
    expect(migrated.image.prompt).toBe('雨夜街角')
    expect(migrated.image.mediaAssetId).toBeTruthy()
    expect(migrated.image.data).toBe('')
    expect(migrated.image.presentation).toMatchObject({
      fit: 'cover', scale: 1.25, positionX: 36, positionY: 62,
      wrap: 'square', align: 'right', textGap: 16, anchorOffset: 0
    })
    expect(localStorage.getItem(STORAGE_KEYS.NARRATIVE_ASSETS)).not.toContain('data:image/png')
    expect(blobs.has(migrated.image.mediaAssetId)).toBe(true)
    expect(hydrated[0].image.data).toContain('data:image/png')

    const reframed = updateNarrativeImagePresentation(migrated.id, {
      fit: 'contain',
      scale: 1.6,
      positionX: 82,
      positionY: 18
    })
    expect(reframed.image.presentation).toMatchObject({ fit: 'contain', scale: 1.6, positionX: 82, positionY: 18 })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.MEDIA_ASSETS))[0].generationParams.presentation)
      .toMatchObject({ fit: 'contain', scale: 1.6, positionX: 82, positionY: 18 })
    expect(getMediaImagePresentation(migrated.image.mediaAssetId))
      .toMatchObject({ fit: 'contain', scale: 1.6, positionX: 82, positionY: 18 })

    const direct = await addNarrativeImageAsset({
      title: '新参考图',
      content: '新参考图',
      status: 'accepted',
      image: {
        prompt: '新参考图',
        data: 'data:image/png;base64,YWJj',
        modelType: 'http',
        presentation: { fit: 'cover', scale: 0.8, positionX: 44, positionY: 56 }
      }
    }, { binaryStore })
    expect(direct.image.mediaAssetId).toBeTruthy()
    expect(direct.image.data).toBe('')
    expect(direct.image.presentation).toMatchObject({ fit: 'cover', scale: 0.8, positionX: 44, positionY: 56 })
    expect(localStorage.getItem(STORAGE_KEYS.NARRATIVE_ASSETS)).not.toContain('YWJj')

    const migratedMarkdown = await migrateMarkdownMediaContent(
      '正文\n\n![雨夜](data:image/png;base64,YWJj)',
      { sourceRefs: [{ refType: 'narrative-asset', refId: direct.id }] },
      { binaryStore }
    )
    expect(migratedMarkdown.content).toMatch(/!\[雨夜\]\(pinax-media:\/\//)
    expect(migratedMarkdown.content).not.toContain('YWJj')
    expect(await hydrateMarkdownMediaContent(migratedMarkdown.content, { binaryStore }))
      .toContain('data:image/png;base64')

    const fallback = addNarrativeAsset({
      title: '待迁移参考图',
      content: '待迁移参考图',
      kind: 'reference-image',
      image: { data: 'data:image/png;base64,ZGVm' }
    })
    await migrateNarrativeImageAssets({
      binaryStore: {
        put: async () => { throw new Error('storage unavailable') },
        get: async () => null,
        delete: async () => false
      }
    })
    expect(listNarrativeAssets({ status: null }).find((item) => item.id === fallback.id)?.image.data)
      .toContain('data:image/png')
    expect(getAssetKindLabel('reference-image')).toBe('参考图')
  })
})
