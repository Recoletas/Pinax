import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  addNarrativeAsset,
  addNarrativeAssetDurable,
  buildNarrativeAssetContentHash,
  createNarrativeAssetSourceRef,
  createNarrativeAsset,
  deleteNarrativeAsset,
  deleteNarrativeAssetsDurable,
  findDuplicateNarrativeAsset,
  getAssetKindExplanation,
  getAssetKindLabel,
  getAssetSourceDetail,
  getAssetSourceLabel,
  listActiveNarrativeAssets,
  listNarrativeAssets,
  mergeSourceRefs,
  mergeNarrativeAssets,
  mergeNarrativeAssetsDurable,
  normalizeContentRef,
  normalizeImagePresentation,
  sourceRefsToEvidenceRefs,
  setNarrativeAssetsStatus,
  setNarrativeAssetStatus,
  updateNarrativeAsset,
  updateNarrativeAssetDurable
} from '@/services/media/narrativeAssets'
import { createChapterOutlineItemFromAsset } from '@/services/writing/chapterOutline'
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
import {
  ensureAssetCanvasCards,
  ensureAssetCanvasCardWithExtra,
  listRelationCanvasCards
} from '@/services/canvas/relationCanvas'
import { useNotesAssetCatalog } from '@/composables/useNotesAssetCatalog'
import { resolveCanvasCreationProjectId, resolveCanvasCardProjectId, getDirectorProjectId } from '@/services/canvas/canvasProjectOwnership.js'
import { createDirectorExportFingerprint, resolveDirectorExportTitle } from '@/services/canvas/canvasDirectorIdentity.js'
import { normalizeStoryboardShot } from '@/services/media/storyboardStore.js'
import { toMarkdown } from '@/services/media/shotExporter.js'
import { SHOT_TYPES, CAMERA_MOVEMENTS } from '@/types/director.js'
import { saveExternalMediaAsset, getMediaAsset, updateMediaAsset } from '@/services/media/mediaAssetStore.js'
import { saveStoryboardVideoOriginal } from '@/services/media/storyboardVideoArchive.js'
import * as aiApi from '@/services/api.js'
import { generateComicAdaptationCandidates } from '@/services/media/comicAdaptationService.js'

describe('narrativeAssets', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)
  })

  it("creates normalized inbox assets（合并4例）", async () => {
{
    const previousBooks = localStorage.getItem(STORAGE_KEYS.WRITING_BOOKS)
    const originalSetItem = Storage.prototype.setItem
    let saveOk = true
    let loaded = null
    const routes = []
    const catalog = useNotesAssetCatalog({
      editor: {
        saveCurrentChapter: () => ({ ok: saveOk }),
        loadAsset: asset => { loaded = asset },
        clearAsset: () => { loaded = null }
      },
      navigate: location => routes.push(location)
    })
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, JSON.stringify([{ id: 'creation-a' }, { id: 'creation-b' }]))
    try {
      const created = catalog.createAsset({ title: '新素材', content: '第一场', kind: 'inspiration', projectId: 'creation-a' })
      expect(created.ok).toBe(true)
      expect(loaded).toMatchObject({ id: created.asset.id, projectId: 'creation-a', title: '新素材' })
      expect(catalog.selectedChapterId.value).toBe(created.asset.id)
      expect(routes).toEqual([])
      catalog.refreshCatalog()
      expect(catalog.selectedAsset.value).toMatchObject({ title: '新素材', content: '第一场', projectId: 'creation-a' })
      expect(catalog.mediaGenerationProjectId.value).toBe('creation-a')
      expect(catalog.mediaGenerationSourceRefs.value[0]).toMatchObject({ refId: created.asset.id, projectId: 'creation-a' })

      const beforeFailure = localStorage.getItem(STORAGE_KEYS.NARRATIVE_ASSETS)
      saveOk = false
      expect(catalog.createAsset({ title: '不得切走' })).toMatchObject({ ok: false, reason: 'save-blocked' })
      expect(catalog.selectedChapterId.value).toBe(created.asset.id)
      expect(localStorage.getItem(STORAGE_KEYS.NARRATIVE_ASSETS)).toBe(beforeFailure)
      saveOk = true
      Storage.prototype.setItem = function (key, value) {
        if (key === STORAGE_KEYS.NARRATIVE_ASSETS) throw new DOMException('quota', 'QuotaExceededError')
        return originalSetItem.call(this, key, value)
      }
      expect(catalog.createAsset({ title: '写入失败', content: '待保存', projectId: 'creation-b' })).toMatchObject({ ok: false, reason: 'storage-write-failed' })
      expect(catalog.selectedChapterId.value).toBe(created.asset.id)
      expect(loaded.id).toBe(created.asset.id)
      expect(routes).toEqual([])
      Storage.prototype.setItem = originalSetItem
      expect(catalog.createAsset({ title: '未归属', content: '独立素材' }).asset.projectId).toBeNull()
      expect(catalog.createAsset({ title: '不存在的书', content: '不猜归属', projectId: 'missing-book' }).asset.projectId).toBeNull()

      let activeBook = 'creation-a'
      const capturedOwner = resolveCanvasCreationProjectId(activeBook)
      activeBook = 'creation-b'
      await Promise.resolve()
      expect(catalog.createAsset({ title: '迟到的分镜', content: '只属于创建时的书', projectId: capturedOwner }).asset.projectId).toBe('creation-a')
      expect(resolveCanvasCreationProjectId(activeBook)).toBe('creation-b')
      expect(resolveCanvasCreationProjectId('missing-book')).toBeNull()
      expect(resolveCanvasCreationProjectId()).toBeNull()
      expect(resolveCanvasCardProjectId({ projectId: 'creation-a' }, null)).toBe('creation-a')
      expect(resolveCanvasCardProjectId({}, null)).toBeNull()
      expect(resolveCanvasCardProjectId({ projectId: 'creation-a' }, { projectId: null })).toBeNull()
      const cardRef = projectId => ({ refType: 'canvas-card', refId: 'one', projectId })
      expect(getDirectorProjectId([cardRef('creation-a')])).toBe('creation-a')
      expect(getDirectorProjectId([cardRef(null)])).toBeNull()
      expect(getDirectorProjectId([cardRef(null), { refType: 'chapter', refId: 'old', projectId: 'creation-a' }])).toBeNull()
      expect(() => getDirectorProjectId([cardRef('creation-a'), cardRef('creation-b')])).toThrow('不同作品')
      expect(() => getDirectorProjectId([cardRef('creation-a'), cardRef(null)])).toThrow('未归属')
      expect(routes).toEqual([])
      for (const option of Object.values(SHOT_TYPES)) {
        const shot = normalizeStoryboardShot({ content: '画面', shotType: option.id })
        expect(shot.shotType).toBe(option.id)
        expect(toMarkdown([shot])).toContain(`| 景别 | ${option.label} |`)
      }
      for (const option of Object.values(CAMERA_MOVEMENTS)) {
        const shot = normalizeStoryboardShot({ content: '画面', cameraMovement: option.id })
        expect(shot.cameraMovement).toBe(option.id)
        expect(toMarkdown([shot])).toContain(`| 运镜 | ${option.label} |`)
      }
      expect(SHOT_TYPES.wide.label).toBe('远景')
      expect(CAMERA_MOVEMENTS.tilt_up.label).toBe('仰拍')
      const identityShot = { sequence: 1, content: '仰拍', shotType: 'wide', camera: 'tilt_up' }
      const identity = createDirectorExportFingerprint([identityShot], '灯塔')
      expect(createDirectorExportFingerprint([{ ...identityShot }], '灯塔')).toBe(identity)
      const legacyIdentity = JSON.parse(identity)
      expect(legacyIdentity.vocabulary[1]).toContain('tilt_up')
      delete legacyIdentity.vocabulary
      expect(JSON.stringify(legacyIdentity)).not.toBe(identity)
      expect(createDirectorExportFingerprint([{ ...identityShot, camera: 'fixed' }], '灯塔')).not.toBe(identity)
      const ownedTitle = { projectId: 'creation-a', sourceAssets: [{ projectId: 'creation-a', title: '雾港镜头' }] }
      expect(resolveDirectorExportTitle({ ...ownedTitle, topic: '作者命名' })).toBe('作者命名')
      expect(resolveDirectorExportTitle({ ...ownedTitle, savedDocument: { projectId: 'creation-a', source: { title: '既有分镜名' } } })).toBe('既有分镜名')
      expect(resolveDirectorExportTitle({ ...ownedTitle, savedDocument: { projectId: 'creation-b', source: { title: '别书分镜' } } })).toBe('雾港镜头')
      expect(resolveDirectorExportTitle({ ...ownedTitle, savedDocument: { projectId: 'creation-a', source: { title: '卡片画布' } } })).toBe('雾港镜头')
      const titleBooks = [{ id: 'creation-a', title: '真实归属书' }]
      expect(resolveDirectorExportTitle({ projectId: 'creation-a', sourceAssets: [{ projectId: 'creation-b', title: '别书素材' }] }, titleBooks)).toBe('真实归属书')
      expect(resolveDirectorExportTitle({ projectId: null }, titleBooks)).toBe('卡片画布')
      expect(resolveDirectorExportTitle({ projectId: null, sourceAssets: [{ projectId: null, title: '独立素材' }] }, titleBooks)).toBe('独立素材')
      const sendChat = vi.spyOn(aiApi, 'sendChatStream').mockRejectedValue(new Error('request-timeout'))
      try {
        const controller = new AbortController()
        const request = { sources: [{ content: '只有一段简短剧情' }], settings: { baseUrl: 'https://example.test', apiKey: 'unit-test', model: 'unit-test' }, signal: controller.signal }
        await expect(generateComicAdaptationCandidates(request)).rejects.toThrow('request-timeout')
        expect(sendChat).toHaveBeenCalledTimes(1)
        // 20261008 预算裁定：调用点不再写死 max_tokens（thinking 端点计量不同），交内核缺省 4096。
        expect(sendChat.mock.calls[0][4]).toMatchObject({ timeout_ms: 120000, retryCount: 0 })
        expect(sendChat.mock.calls[0][4].max_tokens).toBeUndefined()
        expect(sendChat.mock.calls[0][6].signal).toBe(controller.signal)
        controller.abort()
        await expect(generateComicAdaptationCandidates(request)).rejects.toMatchObject({ name: 'AbortError' })
        expect(sendChat).toHaveBeenCalledTimes(1)
        const pendingController = new AbortController()
        sendChat.mockImplementation((...args) => new Promise((resolve, reject) => {
          args[6].signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true })
        }))
        const pending = generateComicAdaptationCandidates({ ...request, signal: pendingController.signal })
        pendingController.abort()
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        expect(sendChat).toHaveBeenCalledTimes(2)
      } finally { sendChat.mockRestore() }
    } finally {
      Storage.prototype.setItem = originalSetItem
      if (previousBooks === null) localStorage.removeItem(STORAGE_KEYS.WRITING_BOOKS)
      else localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, previousBooks)
    }
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

const asset = createNarrativeAsset({
      content: '  第一段正文候选  ',
      kind: 'draft-prose',
      embeddedImagePresentations: {
        'media:image-a': { wrap: 'tight', align: 'left', scale: 4 },
        '': { wrap: 'front' }
      },
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
    expect(asset.embeddedImagePresentations).toEqual({
      'media:image-a': expect.objectContaining({ wrap: 'tight', align: 'left', scale: 2 })
    })
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
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

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
    const asset = createNarrativeAsset({
      id: 'asset-history',
      projectId: 'book-1',
      content: '来自灰墙旧税所的账册线索',
      sourceRefs: [
        { refType: 'history-node', refId: 'history-gray-wall', projectId: 'book-1' },
        { refType: 'map-site', refId: 'place:gray-wall:tax-office', projectId: 'book-1' }
      ]
    })
    const merged = mergeSourceRefs([
      ...asset.sourceRefs,
      createNarrativeAssetSourceRef(asset),
      asset.sourceRefs[0]
    ])
    expect(sourceRefsToEvidenceRefs(merged)).toEqual([
      'history-node:history-gray-wall',
      'map-site:place:gray-wall:tax-office',
      'narrative-asset:asset-history'
    ])
    expect(createChapterOutlineItemFromAsset(asset).sourceRefs).toEqual(merged)
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

expect(getAssetSourceLabel({ type: 'experience-session' })).toBe('体验会话')
    expect(getAssetSourceLabel({ type: 'poetry-node' })).toBe('诗歌节点')
    expect(getAssetSourceLabel({ type: 'prose-card' })).toBe('散文卡片')
    expect(getAssetSourceLabel({ type: 'relation-canvas' })).toBe('卡片画布')
    expect(getAssetSourceLabel({ type: 'note' })).toBe('素材')
    expect(getAssetSourceDetail({ type: 'experience-session', id: 'session-a', messageIds: ['m1', 'm2'] }))
      .toBe('体验会话 · session-a · 2 段')
}
})

  it("stores, filters, and updates assets（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

const first = addNarrativeAsset({ content: '素材一', kind: 'draft-prose' })
    const second = addNarrativeAsset({ content: '素材二', kind: 'draft-prose' })

    const updated = setNarrativeAssetsStatus([first.id, second.id], 'archived')

    expect(updated).toHaveLength(2)
    expect(listNarrativeAssets({ status: 'inbox' })).toHaveLength(0)
    expect(listNarrativeAssets({ status: 'archived' })).toHaveLength(2)
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

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
    expect(mergeNarrativeAssetsDurable([first.id, 'missing'])).toMatchObject({
      ok: false,
      reason: 'merge-invalid-selection',
      retryable: false
    })
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

const inbox = addNarrativeAsset({ content: '待处理素材', kind: 'inspiration', status: 'inbox' })
    const accepted = addNarrativeAsset({ content: '采纳素材', kind: 'event', status: 'accepted' })
    addNarrativeAsset({ content: '归档素材', kind: 'draft-prose', status: 'archived' })
    addNarrativeAsset({ content: '拒绝素材', kind: 'worldbook-draft', status: 'rejected' })

    expect(listActiveNarrativeAssets().map((asset) => asset.id)).toEqual([accepted.id, inbox.id])
}
})

  it("imports an ordered asset selection into canvas cards idempotently（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

const assetA = createNarrativeAsset({ id: 'asset-a', content: '素材 A' })
    const assetB = createNarrativeAsset({ id: 'asset-b', content: '素材 B' })

    const result = ensureAssetCanvasCards([assetB, assetA, assetB, null, {}])

    expect(result.cards.map((card) => card.assetId)).toEqual([assetB.id, assetA.id])
    expect(result.createdAssetIds).toEqual([assetB.id, assetA.id])
    expect(result.existingAssetIds).toEqual([])

    const storedBeforeRepeat = listRelationCanvasCards()
    storedBeforeRepeat[0].content = '画布中已经修改的内容'
    storedBeforeRepeat[0].x = 120
    localStorage.setItem(STORAGE_KEYS.PROSE_CARDS_V1, JSON.stringify(storedBeforeRepeat))

    const repeated = ensureAssetCanvasCards([assetA, assetB])

    expect(repeated.createdAssetIds).toEqual([])
    expect(repeated.existingAssetIds).toEqual([assetA.id, assetB.id])
    expect(repeated.cards.map((card) => card.assetId)).toEqual([assetA.id, assetB.id])
    expect(listRelationCanvasCards()).toHaveLength(2)
    expect(listRelationCanvasCards().find((card) => card.assetId === assetB.id))
      .toMatchObject({ content: '画布中已经修改的内容', x: 120 })
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

expect(ensureAssetCanvasCards([])).toEqual({
      cards: [],
      createdAssetIds: [],
      existingAssetIds: []
    })
    expect(ensureAssetCanvasCards([null, {}, { id: '' }])).toEqual({
      cards: [],
      createdAssetIds: [],
      existingAssetIds: []
    })
    expect(listRelationCanvasCards()).toEqual([])
}
{
    // 素材跨工作区必须同时保住编辑输入、书籍归属与真实写盘结果。
    const previousBooks = localStorage.getItem(STORAGE_KEYS.WRITING_BOOKS)
    const originalSetItem = Storage.prototype.setItem
    const assetA = { id: 'handoff-a', projectId: 'book-a', title: '', content: '', kind: 'inspiration', status: 'inbox' }
    const assetB = { ...assetA, id: 'handoff-b', projectId: 'book-b' }
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, JSON.stringify([
      { id: 'book-a', worldbookId: 'world-shared' },
      { id: 'book-b', worldbookId: 'world-b' },
      { id: 'book-c', worldbookId: 'world-shared' }
    ]))
    localStorage.setItem(STORAGE_KEYS.NARRATIVE_ASSETS, JSON.stringify([assetA, assetB]))
    const routes = []
    let saveOk = true
    const catalog = useNotesAssetCatalog({
      editor: { saveCurrentChapter: () => ({ ok: saveOk }) },
      navigate: route => routes.push(route)
    })
    catalog.chapters.value = [assetA, assetB]
    catalog.selectedChapterId.value = assetB.id
    try {
      expect(catalog.openSelectedAssetInComics('book-a')).toEqual({ ok: true })
      expect(routes.pop()).toEqual({ name: 'comics', query: { bookId: 'book-b', assetId: assetB.id } })
      saveOk = false
      expect(catalog.openSelectedAssetInComics('book-a')).toMatchObject({ ok: false, reason: 'save-blocked' })
      expect(routes).toEqual([])
      expect(catalog.canvasTransferFeedback.value).toContain('保存失败')
      saveOk = true

      catalog.selectedAsset.value.projectId = 'world-shared'
      expect(catalog.resolveWorkspaceBookId('book-c')).toBe('book-c')
      expect(catalog.resolveWorkspaceBookId('book-b')).toBe('')
      expect(catalog.resolveWorkspaceBookId()).toBe('')
      catalog.selectedAsset.value.projectId = null
      expect(catalog.resolveWorkspaceBookId('book-a')).toBe('')
      catalog.selectedAsset.value.projectId = 'missing-book'
      expect(catalog.resolveWorkspaceBookId('book-a')).toBe('')
      catalog.selectedAsset.value.projectId = 'book-b'

      catalog.checkedAssetIds.value = [assetA.id, assetB.id]
      let failedWrites = 0
      Storage.prototype.setItem = function (key, value) {
        if (key === STORAGE_KEYS.PROSE_CARDS_V1) {
          failedWrites += 1
          throw new DOMException('quota', 'QuotaExceededError')
        }
        return originalSetItem.call(this, key, value)
      }
      expect(() => ensureAssetCanvasCards([assetA])).toThrow('画布保存失败')
      expect(() => ensureAssetCanvasCardWithExtra(assetA, { duration: 5 })).toThrow('画布保存失败')
      expect(listRelationCanvasCards()).toEqual([])
      expect(catalog.openSelectedAssetInCanvas()).toMatchObject({ ok: false, reason: 'storage-write-failed' })
      expect(catalog.sendCheckedAssetsToCanvas()).toMatchObject({ ok: false, reason: 'storage-write-failed' })
      expect(catalog.checkedAssetIds.value).toEqual([assetA.id, assetB.id])
      expect(catalog.selectedChapterId.value).toBe(assetB.id)
      expect(catalog.canvasImportRevision.value).toBe(0)
      expect(routes).toEqual([])
      const writesBeforeGeneration = failedWrites
      // 空文本使真实生成器立即返回，不调用渠道；写盘失败不能触发 fallback 再写。
      expect(await catalog.generateAndImportToCanvas()).toMatchObject({ ok: false, reason: 'storage-write-failed' })
      expect(failedWrites).toBe(writesBeforeGeneration + 1)
      expect(routes).toEqual([])
      expect(listRelationCanvasCards()).toEqual([])

      Storage.prototype.setItem = originalSetItem
      expect(catalog.sendCheckedAssetsToCanvas()).toEqual({ ok: true })
      expect(catalog.checkedAssetIds.value).toEqual([])
      expect(routes.pop()).toEqual({ name: 'prose-essay', query: { assetId: assetB.id } })
      expect(listRelationCanvasCards()).toHaveLength(2)

      localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)
      const pending = catalog.generateAndImportToCanvas()
      catalog.selectedAsset.value.content = '等待期间继续写的内容'
      saveOk = false
      expect(await pending).toEqual({ ok: false, reason: 'save-blocked', canvasSaved: true })
      expect(routes).toEqual([])
      expect(catalog.selectedAsset.value.content).toBe('等待期间继续写的内容')
      expect(listRelationCanvasCards()[0]).toMatchObject({ assetId: assetB.id, content: '' })
    } finally {
      Storage.prototype.setItem = originalSetItem
      if (previousBooks === null) localStorage.removeItem(STORAGE_KEYS.WRITING_BOOKS)
      else localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, previousBooks)
    }
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

const first = addNarrativeAsset({
      content: '要删除的素材',
      kind: 'inspiration',
      embeddedImagePresentations: { 'media:image-a': { wrap: 'square', align: 'left' } }
    })
    const second = addNarrativeAsset({ content: '保留的素材', kind: 'event' })
    const updated = updateNarrativeAsset(first.id, {
      embeddedImagePresentations: { 'media:image-a': { wrap: 'top-bottom', align: 'right', scale: 0.2 } }
    })

    expect(updated.embeddedImagePresentations['media:image-a'])
      .toMatchObject({ wrap: 'top-bottom', align: 'right', scale: 0.5 })

    const deleted = deleteNarrativeAsset(first.id)

    expect(deleted?.id).toBe(first.id)
    expect(listNarrativeAssets({ status: null }).map((asset) => asset.id)).toEqual([second.id])
    expect(deleteNarrativeAsset(first.id)).toBeNull()
    expect(deleteNarrativeAsset('')).toBeNull()

    const beforeFailedBatch = localStorage.getItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
    try {
      expect(deleteNarrativeAssetsDurable([second.id])).toMatchObject({
        ok: false,
        reason: 'storage-write-failed',
        retryable: true
      })
      expect(updateNarrativeAssetDurable(second.id, { title: '不应写入' })).toMatchObject({
        ok: false,
        reason: 'storage-write-failed',
        retryable: true
      })
      expect(addNarrativeAssetDurable({ content: '不应创建' })).toMatchObject({
        ok: false,
        reason: 'storage-write-failed',
        retryable: true
      })
    } finally {
      Storage.prototype.setItem = originalSetItem
    }
    expect(localStorage.getItem(STORAGE_KEYS.NARRATIVE_ASSETS)).toBe(beforeFailedBatch)
}
{

    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.PROSE_CARDS_V1)

const asset = createNarrativeAsset({
      content: '一条没有类型的材料。',
      kind: 'unknown-kind'
    })

    expect(asset.kind).toBe('inspiration')
    expect(getAssetKindLabel('worldbook-draft')).toBe('世界书草稿')
    expect(getAssetKindExplanation('worldbook-draft')).toContain('世界书')
    expect(getAssetKindExplanation('unknown-kind')).toBe('可复用的写作素材条目。')
}
})

  it('migrates reference image binaries into MediaAsset storage', async () => {
    const blobs = new Map()
    const binaryStore = {
      put: async (id, blob) => blobs.set(id, blob),
      get: async (id) => blobs.get(id) || null,
      delete: async (id) => blobs.delete(id)
    }
    // Video originals share the same binary store and backup metadata as images.
    const remoteVideo = saveExternalMediaAsset({
      id: 'video-original', projectId: 'book-video', kind: 'video', purpose: 'storyboard-take',
      generationJobId: 'video-job', externalUrl: 'https://media.example/clip.mp4'
    })
    const videoBinary = new Blob(['test-video-binary'], { type: 'video/mp4' })
    const downloadJobOutput = vi.fn().mockResolvedValue(videoBinary)
    const videoOptions = { binaryStore, videoJobService: { downloadJobOutput } }
    const savedVideo = await saveStoryboardVideoOriginal(remoteVideo, videoOptions)
    expect(savedVideo).toMatchObject({ reused: false, asset: { id: remoteVideo.id, projectId: 'book-video', storageRef: 'idb://pinax-media/assets/video-original' } })
    expect((await getMediaAsset(remoteVideo.id, { binaryStore })).blob).toBe(videoBinary)
    expect(await saveStoryboardVideoOriginal(remoteVideo, videoOptions)).toMatchObject({ reused: true, asset: { id: remoteVideo.id } })
    expect(downloadJobOutput).toHaveBeenCalledTimes(1)
    await expect(saveStoryboardVideoOriginal({ ...remoteVideo, projectId: 'other-book' }, videoOptions)).rejects.toThrow('归属')
    const failedVideo = saveExternalMediaAsset({ ...remoteVideo, id: 'failed-video' })
    downloadJobOutput.mockRejectedValueOnce(new Error('download failed'))
    await expect(saveStoryboardVideoOriginal(failedVideo, videoOptions)).rejects.toThrow('download failed')
    expect((await getMediaAsset(failedVideo.id, { binaryStore })).asset.storageRef).toMatch(/^external:/)
    expect(blobs.has(failedVideo.id)).toBe(false)
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('metadata full') }
    try { await expect(saveStoryboardVideoOriginal(failedVideo, videoOptions)).rejects.toThrow('metadata full') }
    finally { Storage.prototype.setItem = originalSetItem }
    expect(blobs.has(failedVideo.id)).toBe(false)
    expect((await getMediaAsset(failedVideo.id, { binaryStore })).asset.storageRef).toMatch(/^external:/)
    downloadJobOutput.mockImplementationOnce(async () => {
      updateMediaAsset(failedVideo.id, { projectId: 'moved-book' })
      return videoBinary
    })
    await expect(saveStoryboardVideoOriginal(failedVideo, videoOptions)).rejects.toThrow('记录已改变')
    expect(blobs.has(failedVideo.id)).toBe(false)
    updateMediaAsset(failedVideo.id, { projectId: 'book-video' })
    const cancel = new AbortController()
    let reads = 0
    const cancellingStore = { ...binaryStore, get: async (id) => { if (++reads === 2) cancel.abort(); return blobs.get(id) || null } }
    await expect(saveStoryboardVideoOriginal(failedVideo, { ...videoOptions, binaryStore: cancellingStore, signal: cancel.signal })).rejects.toThrow()
    expect(blobs.has(failedVideo.id)).toBe(false)

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
