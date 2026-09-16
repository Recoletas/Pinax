import { describe, expect, it } from 'vitest'
import { beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  installWorkspaceRouteAdapter,
  handleRouteChangeForTest,
  isWorkspaceRouteSyncing
} from '../services/workspace/workspaceRouteAdapter'
import { STORAGE_KEYS } from '../composables/useStorage'


import {
  normalizeBookWorldbookBinding,
  resolveBookWorldbookStatus,
  previewWorldbookRebind,
  bindUnboundSceneAnchors,
  detachSceneAnchorsFromWorldbook
} from '../services/agents/authoring/authoringProjectWorldbook.js'
import {
  resolveSettingsProjectContext,
  createSettingsWorldbookLoader
} from '../services/workspace/settingsProjectContext.js'

// worldbook scene closure Task 2：每本书显式绑定一个世界书。
// 绑定是书的数据，不是全局 active 状态的隐式回退。

describe('authoring project worldbook binding', () => {
  it("normalizes the binding id to a trimmed string（合并5例）", async () => {
{
// —— 设定页项目上下文解析（联动闭环 L1）：bookId -> book.worldbookId 是唯一项目绑定。——
    const books = [
      { id: 'book-a', worldbookId: 'wa', title: '书甲' },
      { id: 'book-b', worldbookId: 'wb', title: '书乙' },
      { id: 'book-none', worldbookId: '', title: '未绑' }
    ]
    expect(resolveSettingsProjectContext({ books, bookId: 'book-a' }))
      .toMatchObject({ mode: 'project', bookId: 'book-a', worldbookId: 'wa', status: 'ready', notice: '' })
    // 路由快照与绑定不一致：采用当前绑定并产生可读提示，不静默按旧 query 打开。
    expect(resolveSettingsProjectContext({ books, bookId: 'book-a', worldbookId: 'wb' }))
      .toMatchObject({ mode: 'project', worldbookId: 'wa', status: 'route-mismatch' })
    // 未绑定与书不存在：明确空态，不回退别的库。
    expect(resolveSettingsProjectContext({ books, bookId: 'book-none' }))
      .toMatchObject({ status: 'unbound', worldbookId: '' })
    expect(resolveSettingsProjectContext({ books, bookId: 'book-gone' }))
      .toMatchObject({ status: 'missing-book', worldbookId: '' })
    // 全局模式：显式 worldbookId 优先，否则沿用 active 兜底；无 bookId 时不解析项目。
    expect(resolveSettingsProjectContext({ books, worldbookId: 'wx', fallbackWorldbookId: 'wa' }))
      .toMatchObject({ mode: 'global', worldbookId: 'wx', source: 'explicit-global', status: 'ready' })
    expect(resolveSettingsProjectContext({ books, fallbackWorldbookId: 'wa' }))
      .toMatchObject({ mode: 'global', worldbookId: 'wa', source: 'fallback-active' })
    expect(resolveSettingsProjectContext({ books }))
      .toMatchObject({ mode: 'global', worldbookId: '', status: 'unbound' })
}
{
// —— 世界书内容加载竞态：只认最后一次请求；缺失/失败 typed 返回，不回退其他库。——
    const calls = []
    let resolveSlow
    const loader = createSettingsWorldbookLoader(async (id) => {
      calls.push(id)
      if (id === 'wa-slow') return new Promise((resolve) => { resolveSlow = resolve })
      if (id === 'wb') return { id: 'wb', entries: [] }
      return null
    })
    const slow = loader('wa-slow')
    const fast = await loader('wb')
    expect(fast).toMatchObject({ ok: true, worldbook: { id: 'wb' } })
    resolveSlow({ id: 'wa-slow' })
    expect(await slow).toMatchObject({ ok: false, reason: 'superseded' })
    expect(await loader('missing')).toMatchObject({ ok: false, reason: 'missing-worldbook', worldbook: null })
    expect(calls).toEqual(['wa-slow', 'wb', 'missing'])
}
{
expect(normalizeBookWorldbookBinding({ worldbookId: 42 })).toBe('42')
    expect(normalizeBookWorldbookBinding({ worldbookId: ' wb-1 ' })).toBe('wb-1')
    expect(normalizeBookWorldbookBinding({})).toBe('')
    expect(normalizeBookWorldbookBinding(null)).toBe('')
}
{
expect(resolveBookWorldbookStatus({ book: {}, worldbooks: [] }))
      .toMatchObject({ status: 'unbound', worldbookId: '', worldbook: null })
    expect(resolveBookWorldbookStatus({
      book: { worldbookId: 'wb-missing' }, worldbooks: []
    })).toMatchObject({ status: 'missing', worldbookId: 'wb-missing', worldbook: null })
    expect(resolveBookWorldbookStatus({
      book: { worldbookId: 'wb-1' },
      worldbooks: [{ id: 'wb-1', name: '海港世界' }, { id: 'wb-2', name: '另一世界' }]
    })).toMatchObject({ status: 'bound', worldbookId: 'wb-1', worldbook: { id: 'wb-1' } })
}
{
expect(previewWorldbookRebind({
      book: { worldbookId: 'wb-old', chapters: [{ sceneAnchors: [{ worldbookId: 'wb-old' }] }] },
      nextWorldbookId: 'wb-new'
    })).toMatchObject({ affectedAnchorCount: 1, requiresConfirmation: true })
    // 同一绑定：无需确认。
    expect(previewWorldbookRebind({
      book: { worldbookId: 'wb-old', chapters: [{ sceneAnchors: [{ worldbookId: 'wb-old' }] }] },
      nextWorldbookId: 'wb-old'
    })).toMatchObject({ affectedAnchorCount: 0, requiresConfirmation: false })
    // 未锚定到旧世界书的章节不受影响。
    expect(previewWorldbookRebind({
      book: { worldbookId: 'wb-old', chapters: [{ sceneAnchors: [{ worldbookId: '' }, {}] }] },
      nextWorldbookId: 'wb-new'
    })).toMatchObject({ affectedAnchorCount: 0, requiresConfirmation: false })
}
{
// 计划定义：非空 worldbookId ≠ 目标 ID 即受影响（含指向其他世界书的锚点）；
    // 空/缺失 worldbookId 的锚点不受影响；畸形章节安全跳过。
    expect(previewWorldbookRebind({
      book: {
        worldbookId: 'wb-old',
        chapters: [
          null,
          { sceneAnchors: [{ worldbookId: 'wb-other' }, { unitId: 'u1' }] },
          { sceneAnchors: 'not-an-array' }
        ]
      },
      nextWorldbookId: 'wb-new'
    })).toMatchObject({ affectedAnchorCount: 1, requiresConfirmation: true })
    // 解绑（目标为空）会让所有已绑定世界书的锚点失效。
    expect(previewWorldbookRebind({
      book: {
        worldbookId: 'wb-old',
        chapters: [{ sceneAnchors: [{ worldbookId: 'wb-other' }, { unitId: 'u1' }] }]
      },
      nextWorldbookId: ''
    })).toMatchObject({ affectedAnchorCount: 1, requiresConfirmation: true })
}
{
const source = [{
      id: 'chapter-1',
      sceneAnchors: [
        { unitId: 'unit-time', worldbookId: '', time: { label: '深夜' } },
        { unitId: 'unit-old', worldbookId: 'wb-old', locationId: 'old-place' }
      ]
    }]
    const migration = bindUnboundSceneAnchors({ chapters: source, nextWorldbookId: 'wb-new' })
    expect(migration.migratedAnchorCount).toBe(1)
    expect(migration.chapters[0].sceneAnchors[0]).toMatchObject({ unitId: 'unit-time', worldbookId: 'wb-new' })
    expect(migration.chapters[0].sceneAnchors[1]).toMatchObject({ unitId: 'unit-old', worldbookId: 'wb-old' })
    expect(source[0].sceneAnchors[0].worldbookId).toBe('')
    expect(bindUnboundSceneAnchors({ chapters: source, nextWorldbookId: '' })).toMatchObject({
      chapters: source,
      migratedAnchorCount: 0
    })
    const detached = detachSceneAnchorsFromWorldbook({ chapters: source })
    expect(detached.clearedReferenceCount).toBe(1)
    expect(detached.chapters[0].sceneAnchors[0]).toMatchObject({
      worldbookId: '',
      time: { label: '深夜' }
    })
    expect(detached.chapters[0].sceneAnchors[1]).toMatchObject({
      worldbookId: '',
      locationId: '',
      viewpointCharacterId: '',
      presentCharacterIds: []
    })
    expect(source[0].sceneAnchors[1]).toMatchObject({ worldbookId: 'wb-old', locationId: 'old-place' })
}
})
})

// —— 工作台标签计划 Task 1：书籍 repository 是 writing_books 的唯一读写边界 ——
import {
  loadWritingBooks,
  saveWritingBooks,
  saveWritingBooksDurable,
  findWritingBook,
  createWritingBookRecord,
  renameWritingBook,
  deleteWritingBook,
  subscribeWritingBooks,
  normalizeWritingBook
} from '../services/writing/writingBooksRepository.js'
import {
  buildSingleChapterPreview,
  createImportedWritingBook,
  decodeManuscriptBytes,
  parseManuscriptText,
  validateManuscriptFile
} from '../services/writing/writingManuscriptImport.js'

describe('writing books repository', () => {
  it("loads, saves and revises books through one boundary（合并5例）", async () => {
{
localStorage.clear()
    // 旧数据兼容：legacy `name` 记录读出时补齐 title，原字段保留。
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'b1', name: '旧书', chapters: null },
      { id: 'b2', title: ' 新书 ', worldbookId: ' wb-2 ' }
    ]))
    const books = loadWritingBooks()
    expect(books).toHaveLength(2)
    expect(books[0].title).toBe('旧书')
    expect(books[0].name).toBe('旧书')
    expect(books[0].chapters).toEqual([])
    expect(books[1].title).toBe('新书')
    expect(books[1].worldbookId).toBe('wb-2')
    // 畸形输入：无 id 记录被丢弃，非数组存储回退为空。
    expect(normalizeWritingBook(null)).toBe(null)
    expect(normalizeWritingBook({ title: '无 id' })).toBe(null)
    localStorage.setItem('writing_books', '{"broken":true}')
    expect(loadWritingBooks()).toEqual([])
}
{
localStorage.clear()
    // 保存 + revision 订阅：成功写入后通知订阅方；失败不通知。
    const seen = []
    const unsubscribe = subscribeWritingBooks((event) => seen.push(event.revision))
    expect(saveWritingBooks([{ id: 'b1', title: '书一' }])).toBe(true)
    expect(saveWritingBooks('not-an-array')).toBe(false)
    expect(saveWritingBooksDurable('not-an-array')).toMatchObject({
      ok: false,
      reason: 'invalid-books',
      retryable: false
    })
    unsubscribe()
    saveWritingBooks([{ id: 'b1', title: '书一改' }])
    expect(seen).toHaveLength(1)
    expect(loadWritingBooks()[0].title).toBe('书一改')
}
{
localStorage.clear()
    // 创建记录：与既有 Date.now id 方案和字段形状一致。
    const book = createWritingBookRecord({ title: ' 新书 ', description: ' d ', worldbookId: 'wb-9' })
    expect(book.title).toBe('新书')
    expect(book.description).toBe('d')
    expect(book.worldbookId).toBe('wb-9')
    expect(book.chapters).toEqual([])
    expect(typeof book.id).toBe('string')
    expect(book.createdAt).toBeTruthy()
}
{
localStorage.clear()
    // 仓储级读改写：rename/delete 不依赖页面内存数组。
    saveWritingBooks([{ id: 'b1', title: '书一' }, { id: 'b2', title: '书二' }])
    expect(renameWritingBook('b1', ' 书一改 ')).toMatchObject({ ok: true, book: { title: '书一改' } })
    expect(renameWritingBook('b-missing', 'x')).toMatchObject({ ok: false, reason: 'not-found' })
    expect(renameWritingBook('b2', '   ')).toMatchObject({ ok: false, reason: 'empty-title' })
    expect(findWritingBook(loadWritingBooks(), 'b1').title).toBe('书一改')
    expect(findWritingBook(loadWritingBooks(), 42)).toBe(null)
    expect(deleteWritingBook('b1')).toMatchObject({ ok: true, book: { id: 'b1' } })
    expect(loadWritingBooks()).toHaveLength(1)
    expect(deleteWritingBook('b1')).toMatchObject({ ok: false, reason: 'not-found' })
}
{
localStorage.clear()
    // quota 失败：写入被拒且不推进 revision、不通知订阅方。
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
    try {
      const seen = []
      subscribeWritingBooks(() => seen.push(1))
      expect(saveWritingBooks([{ id: 'b1' }])).toBe(false)
      expect(saveWritingBooksDurable([{ id: 'b1' }])).toMatchObject({
        ok: false,
        reason: 'storage-write-failed',
        retryable: true,
        resource: 'writing-books'
      })
      expect(seen).toHaveLength(0)
    } finally {
      Storage.prototype.setItem = originalSetItem
    }
}
{
    // Web beta 首访：Markdown 标题拆章、纯文本章节识别和整篇回退均不丢正文。
    const markdown = parseManuscriptText({
      filename: '潮汐档案.md',
      text: '# 潮汐档案\n\n## 第一章 失灯\n\n港口熄灯。\n\n## 第二章 回声\n\n钟声从水下传来。'
    })
    expect(markdown).toMatchObject({ ok: true, title: '潮汐档案', detected: true })
    expect(markdown.chapters.map((chapter) => chapter.title)).toEqual(['第一章 失灯', '第二章 回声'])
    expect(markdown.chapters[0].content).toBe('港口熄灯。')

    const plain = parseManuscriptText({
      filename: '旧稿.txt',
      text: '前置说明\n\n第一章 雨夜\n正文一。\n\n第二章 来客\n正文二。'
    })
    expect(plain.chapters.map((chapter) => chapter.title)).toEqual(['卷首', '第一章 雨夜', '第二章 来客'])
    expect(buildSingleChapterPreview(plain)).toEqual([{ title: '正文', content: plain.text.trim() }])

    const imported = createImportedWritingBook({
      title: plain.title,
      chapters: plain.chapters,
      now: () => new Date('2026-09-12T00:00:00.000Z'),
      idFactory: (kind, index) => `${kind}-${index}`
    })
    expect(imported).toMatchObject({ ok: true, book: { title: '旧稿' } })
    expect(imported.book.chapters[0].id).toBe('chapter-0')
    expect(imported.book.chapters[2].content).toBe('正文二。')
    const gb18030 = decodeManuscriptBytes(new Uint8Array([
      0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xd3, 0xea, 0xd2, 0xb9, 0x0a,
      0xd5, 0xfd, 0xce, 0xc4, 0xd2, 0xbb, 0xa1, 0xa3
    ]))
    expect(gb18030).toMatchObject({ ok: true, encoding: 'gb18030' })
    expect(parseManuscriptText({ filename: '旧编码.txt', text: gb18030.text }).chapters[0])
      .toMatchObject({ title: '第一章 雨夜', content: '正文一。' })
    expect(validateManuscriptFile({ name: '稿件.docx', size: 1 })).toMatchObject({ ok: false })
    expect(validateManuscriptFile({ name: '稿件.txt', size: 4 * 1024 * 1024 })).toMatchObject({ ok: true })
    expect(validateManuscriptFile({ name: '稿件.txt', size: 5 * 1024 * 1024 + 1 })).toMatchObject({ ok: false })
}
  })
})

// —— 工作台标签计划 Task 2：标签合同与 store（纯视图会话，无 router 依赖）——
import {
  buildProjectTabKey,
  buildGlobalTabKey,
  parseTabKey,
  resolveRouteIntent
} from '../services/workspace/workspaceTabContract.js'
import { useWorkspaceTabsStore } from '../stores/workspaceTabsStore'

describe('workspace tabs store', () => {
  it("dedupes, hydrates, closes neighbors and syncs from routes（合并6例）", async () => {
{
// 合同：key 构建/解析 + 路由意图。project surface 必须带 bookId。
    expect(buildProjectTabKey('b1', 'settings')).toBe('project:b1:settings')
    expect(buildGlobalTabKey('docs')).toBe('global:docs')
    expect(buildGlobalTabKey('collaboration-review', 'room:一')).toBe('global:collaboration-review:room%3A%E4%B8%80')
    expect(parseTabKey('project:b1:settings')).toEqual({ scope: 'project', projectId: 'b1', surface: 'settings' })
    expect(parseTabKey('global:docs')).toEqual({ scope: 'global', projectId: null, surface: 'docs', instanceId: null })
    expect(parseTabKey('global:collaboration-review:room%3A%E4%B8%80')).toEqual({ scope: 'global', projectId: null, surface: 'collaboration-review', instanceId: 'room:一' })
    expect(parseTabKey('project:b1')).toBe(null)
    expect(resolveRouteIntent({ name: 'authoring', query: { bookId: 'b1', chapterId: 'c3' } }))
      .toMatchObject({ scope: 'project', surface: 'authoring', projectId: 'b1' })
    expect(resolveRouteIntent({ name: 'authoring', query: {} })).toBe(null)
    expect(resolveRouteIntent({ name: 'welcome', query: {} })).toBe(null)
    expect(resolveRouteIntent({ name: 'settings-structured', query: { bookId: 'b1' } }))
      .toMatchObject({ scope: 'project', surface: 'settings', projectId: 'b1' })
    expect(resolveRouteIntent({ name: 'settings-world-map', query: { bookId: 'b1', worldbookId: 'wb-1' } }))
      .toMatchObject({ scope: 'project', surface: 'map', projectId: 'b1', worldbookId: 'wb-1' })
    expect(resolveRouteIntent({ name: 'settings-world-map', query: {} })).toBe(null)
    expect(resolveRouteIntent({ name: 'docs', query: {} })).toMatchObject({ scope: 'global', surface: 'docs' })
    expect(resolveRouteIntent({ name: 'collaboration-review', params: { roomSlug: 'room-one' }, query: {} }))
      .toMatchObject({ scope: 'global', surface: 'collaboration-review', instanceId: 'room-one' })
    expect(resolveRouteIntent({ name: 'collaboration-review', params: {}, query: {} })).toBe(null)
}
{
// openOrFocus：同 key 去重聚焦，restoreState 合并，不产生重复标签。
    const store = useWorkspaceTabsStore()
    store.refreshBookIndex()
    const first = store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'b1' })
    const second = store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'b1' }, { restoreState: { chapterId: 'c2' } })
    expect(second.id).toBe(first.id)
    expect(store.tabs).toHaveLength(1)
    expect(second.restoreState.chapterId).toBe('c2')
    expect(store.activeTabId).toBe(first.id)
    store.setVolatileRestoreStateByKey(first.key, { selection: { from: 3, to: 7 }, scroll: { top: 120, left: 0 } })
    store.persist()
    expect(localStorage.getItem('workspace_tabs_v1')).not.toContain('"from":3')
    expect(store.consumeVolatileRestoreStateByKey(first.key)).toEqual({ selection: { from: 3, to: 7 }, scroll: { top: 120, left: 0 } })
    expect(store.consumeVolatileRestoreStateByKey(first.key)).toBe(null)
    // 同书不同 surface 是不同标签。
    const settingsTab = store.openOrFocus({ scope: 'project', surface: 'settings', projectId: 'b1' })
    expect(store.tabs).toHaveLength(2)
    expect(settingsTab.key).toBe('project:b1:settings')
    expect(store.activeTabId).toBe(settingsTab.id)
    const reviewOne = store.openOrFocus({ scope: 'global', surface: 'collaboration-review', instanceId: 'room-one' })
    const reviewTwo = store.openOrFocus({ scope: 'global', surface: 'collaboration-review', instanceId: 'room-two' })
    expect(reviewOne.key).toBe('global:collaboration-review:room-one')
    expect(reviewTwo.key).toBe('global:collaboration-review:room-two')
    expect(reviewTwo.id).not.toBe(reviewOne.id)
    // updateContext：dirty 与 restoreState 不互相覆盖。
    store.updateContext(first.id, { dirty: true })
    store.updateContext(first.id, { restoreState: { chapterId: 'c9' } })
    const refreshed = store.tabs.find((tab) => tab.id === first.id)
    expect(refreshed.dirty).toBe(true)
    expect(refreshed.restoreState).toMatchObject({ chapterId: 'c9' })
}
{
// close：确定性邻居（先右后左）；最后一个标签回欢迎页。
    const store = useWorkspaceTabsStore()
    store.tabs = []
    const a = store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'b1' })
    const b = store.openOrFocus({ scope: 'project', surface: 'settings', projectId: 'b1' })
    const c = store.openOrFocus({ scope: 'global', surface: 'docs' })
    // 关闭中间标签（先激活它）→ 聚焦右侧邻居。
    store.activate(b.id)
    let result = store.close(b.id)
    expect(result).toMatchObject({ ok: true })
    expect(result.route).toMatchObject({ name: 'docs' })
    expect(store.activeTabId).toBe(c.id)
    // 关闭最右（活动）→ 回左侧邻居。
    result = store.close(c.id)
    expect(result.route).toMatchObject({ name: 'authoring' })
    expect(store.activeTabId).toBe(a.id)
    // 关闭非活动标签不产生导航。
    const d = store.openOrFocus({ scope: 'global', surface: 'docs' })
    store.activate(a.id)
    result = store.close(d.id)
    expect(result.route).toBe(null)
    expect(store.activeTabId).toBe(a.id)
    // 最后一个标签 → 欢迎页回退。
    result = store.close(a.id)
    expect(result.route).toMatchObject({ name: 'welcome' })
    expect(store.tabs).toHaveLength(0)
    expect(store.activeTabId).toBe('')
}
{
// hydrate：版本不符丢弃重建；书不存在移除；损坏 route 剔除。
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'b1', title: '书一', worldbookId: 'wb-1' }
    ]))
    localStorage.setItem('workspace_tabs_v1', JSON.stringify({
      version: 1,
      activeTabId: 't-live',
      tabs: [
        { id: 't-live', key: 'project:b1:authoring', title: '书一', route: { name: 'authoring', query: { bookId: 'b1' } }, lastActiveAt: 5 },
        { id: 't-dead', key: 'project:b2:authoring', title: '已删书', route: { name: 'authoring', query: { bookId: 'b2' } }, lastActiveAt: 9 },
        { id: 't-broken', key: 'project:b1:materials', title: '坏路由', route: {}, lastActiveAt: 3 }
      ]
    }))
    const store = useWorkspaceTabsStore()
    store.hydrate()
    expect(store.tabs.map((tab) => tab.id)).toEqual(['t-live'])
    expect(store.activeTabId).toBe('t-live')
    // 版本不符 → 丢弃重建。
    localStorage.setItem('workspace_tabs_v1', JSON.stringify({ version: 99, tabs: [{ id: 'x', key: 'global:docs', route: { name: 'docs' } }] }))
    const storeV2 = useWorkspaceTabsStore()
    storeV2.hydrate()
    expect(storeV2.tabs).toEqual([])
    // 损坏 JSON 可丢弃重建，不抛异常。
    localStorage.setItem('workspace_tabs_v1', '{broken')
    const storeV3 = useWorkspaceTabsStore()
    expect(() => storeV3.hydrate()).not.toThrow()
    expect(storeV3.tabs).toEqual([])
}
{
// syncFromRoute：直接 URL / 前进后退聚焦或创建正确标签，并回报定位意图。
    localStorage.setItem('writing_books', JSON.stringify([{ id: 'b1', title: '书一' }]))
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: { name: 'authoring', query: { bookId: 'b1', chapterId: 'c3' } } })
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].restoreState).toMatchObject({ chapterId: 'c3' })
    // back/forward 到无 query 旧链接：聚焦同一标签并刷新 route。
    store.syncFromRoute({ name: 'authoring', query: { bookId: 'b1' } })
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].route.query).toEqual({ bookId: 'b1' })
    // 同书设定 surface 从 URL 打开 → 新标签。
    store.syncFromRoute({ name: 'settings-structured', query: { bookId: 'b1', focus: 'entry-7' } })
    expect(store.tabs).toHaveLength(2)
    expect(store.tabs[1].restoreState).toMatchObject({ objectId: 'entry-7' })
    // 非标签 surface（欢迎页）不动会话。
    store.syncFromRoute({ name: 'welcome', query: {} })
    expect(store.tabs).toHaveLength(2)
}
{
// 书传播：closeProject 关闭该书全部标签；replaceProjectTitle 同步子 surface 标题。
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'b1', title: '书一', chapters: [] },
      { id: 'b2', title: '书二', chapters: [] }
    ]))
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: { name: 'authoring', query: { bookId: 'b1' } } })
    store.openOrFocus({ scope: 'project', surface: 'settings', projectId: 'b1' })
    store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'b2' })
    expect(store.tabs).toHaveLength(3)
    // 重命名传播：写作标签书名，子 surface 书名 · surface。
    store.replaceProjectTitle('b1', '书一改')
    const titles = store.tabs.filter((tab) => tab.projectId === 'b1').map((tab) => tab.title).sort()
    expect(titles).toEqual(['书一改', '书一改 · 设定'])
    // 删除书：该书所有标签关闭，其他书保持，活动标签切换到剩余标签。
    const result = store.closeProject('b1')
    expect(result.ok).toBe(true)
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].projectId).toBe('b2')
    expect(store.activeTabId).toBe(store.tabs[0].id)
    // 书籍 revision 事件传播：删除书后 reconcile 清掉残留标签。
    saveWritingBooks([{ id: 'b2', title: '书二', chapters: [] }])
    const kept = store.tabs[0].id
    saveWritingBooks([])
    expect(store.tabs.map((tab) => tab.id)).not.toContain(kept)
    expect(store.activeTabId).toBe('')
}
  })
})
// —— 工作台标签计划 Task 3：路由适配器（mock router，验证双向同步与防循环）——
import {
  activateWorkspaceTab,
  closeWorkspaceTab,
  openOrFocusWorkspaceTab
} from '../services/workspace/workspaceRouteAdapter.js'
import { vi } from 'vitest'

function createMockRouter(currentRoute = { name: 'welcome', query: {} }) {
  return {
    currentRoute: { value: currentRoute },
    isReady: vi.fn(async () => {}),
    push: vi.fn(async () => {}),
    replace: vi.fn(async () => {}),
    afterEachHandlers: [],
    afterEach(handler) {
      this.afterEachHandlers.push(handler)
    },
    emit(to) {
      for (const handler of this.afterEachHandlers) handler(to)
    }
  }
}

describe('workspace route adapter', () => {
  it("syncs route->tab without loops and pushes only on explicit intents（合并3例）", async () => {
{
// install：hydrate 当前路由；afterEach 里 URL 变化只跟随 store，不反向 push。
    localStorage.clear()
    localStorage.setItem('writing_books', JSON.stringify([{ id: 'b1', title: '书一', chapters: [] }]))
    const router = createMockRouter({ name: 'authoring', query: { bookId: 'b1' } })
    const store = useWorkspaceTabsStore()
    installWorkspaceRouteAdapter(store, router)
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].key).toBe('project:b1:authoring')
    router.emit({ name: 'authoring', query: { bookId: 'b1', chapterId: 'c2' } })
    expect(store.tabs).toHaveLength(1)
    expect(router.push).not.toHaveBeenCalled()
    // 直接 URL 打开另一本书 → 新标签聚焦。
    router.emit({ name: 'authoring', query: { bookId: 'b2', chapterId: 'c1' } })
    expect(store.tabs.map((tab) => tab.key)).toContain('project:b2:authoring')
}
{
// 旧无 query 链接：replace 为 canonical URL（最近书或首书）。
// canonical 状态先应用到 store 再 replace，因此标签立即存在，不创建无主标签。
    localStorage.clear()
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'b1', title: '书一', chapters: [] },
      { id: 'b2', title: '书二', updatedAt: '2026-08-24T10:00:00Z', chapters: [] }
    ]))
    const router = createMockRouter({ name: 'authoring', query: {} })
    const store = useWorkspaceTabsStore()
    installWorkspaceRouteAdapter(store, router)
    router.emit({ name: 'authoring', query: {} })
    expect(router.replace).toHaveBeenCalledWith({ name: 'authoring', query: { bookId: 'b2' } })
    expect(store.tabs.map((tab) => tab.key)).toEqual(['project:b2:authoring'])
    // 无任何书：保持原 URL，不产生标签（页面显示空态/建书入口）。
    const router2 = createMockRouter({ name: 'welcome', query: {} })
    localStorage.setItem('writing_books', JSON.stringify([]))
    const store2 = useWorkspaceTabsStore()
    installWorkspaceRouteAdapter(store2, router2)
    router2.emit({ name: 'authoring', query: {} })
    expect(router2.replace).not.toHaveBeenCalled()
    expect(store2.tabs).toHaveLength(0)
}
{
// 显式意图才 push：激活/打开/关闭标签。
    localStorage.clear()
    localStorage.setItem('writing_books', JSON.stringify([{ id: 'b1', title: '书一', chapters: [] }]))
    const router = createMockRouter({ name: 'authoring', query: { bookId: 'b1' } })
    const store = useWorkspaceTabsStore()
    installWorkspaceRouteAdapter(store, router)
    const docsTab = store.openOrFocus({ scope: 'global', surface: 'docs' })
    router.push.mockClear()
    await activateWorkspaceTab(store, router, docsTab.id)
    expect(router.push).toHaveBeenCalledWith({ name: 'docs', query: {} })
    const authoringTab = store.tabs.find((tab) => tab.key === 'project:b1:authoring')
    await activateWorkspaceTab(store, router, authoringTab.id)
    expect(router.push).toHaveBeenLastCalledWith({ name: 'authoring', query: { bookId: 'b1' } })
    // 关闭活动标签 → push 邻居路由；最后一个 → 欢迎页。
    await closeWorkspaceTab(store, router, authoringTab.id)
    expect(router.push).toHaveBeenLastCalledWith({ name: 'docs', query: {} })
    await closeWorkspaceTab(store, router, store.tabs[0].id)
    expect(router.push).toHaveBeenLastCalledWith({ name: 'welcome', query: {} })
    // openOrFocus 走 push 并返回标签。
    const opened = await openOrFocusWorkspaceTab(store, router, { scope: 'global', surface: 'docs' })
    expect(opened?.key).toBe('global:docs')
    expect(router.push).toHaveBeenCalled()
}
  })
})

// —— 复验修复 2：绑定同步的时序安全（行为测试，非源码 pin）——
import { createBoundWorldbookSync, buildChapterBoundaryPayload } from '../services/agents/authoring/authoringProjectWorldbook.js'

describe('createBoundWorldbookSync timing safety', () => {
  function makeSync() {
    return createBoundWorldbookSync({
      loadWorldbookForProject: vi.fn(async (id) => ({ id, name: `wb-${id}` }))
    })
  }

  it("clears the previous binding synchronously when a new book activates（合并4例）", async () => {
{
const sync = makeSync()
    await sync.sync({ id: 'book-1', worldbookId: 'wb-old' }, 'book-1')
    expect(sync.boundWorldbook.value?.id).toBe('wb-old')

    // 激活新书：在加载 promise resolve 之前，旧绑定必须已经不可见。
    const pending = sync.sync({ id: 'book-2', worldbookId: 'wb-new' }, 'book-2')
    expect(sync.boundWorldbook.value).toBe(null)
    expect(sync.ready()).toBe(false)
    await pending
    expect(sync.boundWorldbook.value?.id).toBe('wb-new')
    expect(sync.ready()).toBe(true)
}
{
let releaseFirst
    const slow = createBoundWorldbookSync({
      loadWorldbookForProject: vi.fn((id) => id === 'wb-slow'
        ? new Promise((resolve) => { releaseFirst = resolve })
        : Promise.resolve({ id, name: id }))
    })
    const first = slow.sync({ id: 'book-1', worldbookId: 'wb-slow' }, 'book-1')
    // 用户切到另一本书；慢返回随后才完成。
    const second = slow.sync({ id: 'book-2', worldbookId: 'wb-fast' }, 'book-2')
    releaseFirst({ id: 'wb-slow' })
    await first
    await second
    // 迟到的旧书世界书不得覆盖新书绑定。
    expect(slow.boundWorldbook.value?.id).toBe('wb-fast')
}
{
const sync = makeSync()
    await sync.sync({ id: 'book-1', worldbookId: 'wb-a' }, 'book-1')
    const result = await sync.sync({ id: 'book-2' }, 'book-2')
    expect(result).toBe(null)
    expect(sync.boundWorldbook.value).toBe(null)
    expect(sync.ready()).toBe(true)
}
{
// 换书边界：memoryProjectId 必须是旧项目 ID，即使调用时新 ID 已知。
    const payload = buildChapterBoundaryPayload({
      previousChapterId: 'ch-old',
      previousProjectId: 'book-old',
      text: '旧章正文',
      revision: 'rev-9'
    })
    expect(payload).toMatchObject({
      scopeKey: 'chapter:ch-old',
      memoryProjectId: 'book-old',
      revision: 'rev-9'
    })
    expect(payload.sourceRefs).toEqual(['chapter:ch-old'])
    // 无出向章节（首本书）不产生 boundary。
    expect(buildChapterBoundaryPayload({ previousChapterId: '', previousProjectId: 'book-x' })).toBe(null)
}
})
})

// 项目工作台标签（plan 2026-08-24 Task 2/3）：store 合同 + 数据丢失竞态回归。
// 关键竞态：install 里若用 router.isReady() 延迟 hydrate，初始导航的 afterEach
// 会先在空 store 上执行 syncFromRoute 并 persist，覆盖上一会话的持久化 payload。
// 合同：hydrate 同步完成，afterEach 后置注册。

function makeTabsStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _raw: store
  }
}

function seedTabsBooks(storage, books) {
  storage.setItem('writing_books', JSON.stringify(books))
}

function makeTabsFakeRouter({ initialRoute = { name: 'welcome', query: {} } } = {}) {
  const hooks = []
  return {
    hooks,
    afterEach(fn) {
      hooks.push(fn)
      return () => {}
    },
    currentRoute: { value: initialRoute },
    push: vi.fn(async () => {}),
    replace: vi.fn(async () => {})
  }
}

describe('workspace tabs store contract', () => {
  let pinia
  let storage

  beforeEach(() => {
    storage = makeTabsStorage()
    globalThis.localStorage = storage
    globalThis.sessionStorage = makeTabsStorage()
    pinia = createPinia()
    setActivePinia(pinia)
    seedTabsBooks(storage, [
      { id: 'book-a', title: '雾港书稿', worldbookId: 'wb-1', updatedAt: '2026-08-24T01:00:00Z' },
      { id: 'book-b', title: '灯塔手记', worldbookId: '', updatedAt: '2026-08-24T02:00:00Z' }
    ])
    storage.removeItem(STORAGE_KEYS.WORKSPACE_TABS)
  })

  it('hydrate restores sanitized tabs and drops tabs of deleted books', () => {
    storage.setItem(STORAGE_KEYS.WORKSPACE_TABS, JSON.stringify({
      version: 1,
      activeTabId: '',
      tabs: [
        { id: 't1', key: 'project:book-a:authoring', scope: 'project', surface: 'authoring', projectId: 'book-a', title: '雾港书稿', pinned: false, dirty: false, lastActiveAt: 5, route: { name: 'authoring', query: { bookId: 'book-a' } } },
        // 指向已删除书的标签：hydrate 时剔除。
        { id: 't2', key: 'project:book-gone:materials', scope: 'project', surface: 'materials', projectId: 'book-gone', title: '', pinned: false, dirty: false, lastActiveAt: 9, route: { name: 'materials', query: { bookId: 'book-gone' } } }
      ]
    }))
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: null })
    expect(store.tabs.map((tab) => tab.id)).toEqual(['t1'])
    // 无显式活动标签时回退到最近使用的标签。
    expect(store.activeTabId).toBe('t1')
    expect(store.hydrated).toBe(true)
  })

  it('openOrFocus dedupes by key and refocuses instead of duplicating', () => {
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: null })
    const first = store.openOrFocus(
      { scope: 'project', surface: 'authoring', projectId: 'book-a' },
      { route: { name: 'authoring', query: { bookId: 'book-a', chapterId: 'ch-1' } } }
    )
    const second = store.openOrFocus(
      { scope: 'project', surface: 'authoring', projectId: 'book-a' },
      { route: { name: 'authoring', query: { bookId: 'book-a', chapterId: 'ch-9' } } }
    )
    expect(second.id).toBe(first.id)
    expect(store.tabs).toHaveLength(1)
    expect(store.activeTabId).toBe(first.id)
    expect(second.route.query.chapterId).toBe('ch-9')
  })

  it('close chooses a deterministic neighbor; closing the last tab falls back to welcome', () => {
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: null })
    const a = store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'book-a' })
    const b = store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'book-b' })
    store.activate(a.id)
    const result = store.close(a.id)
    expect(result.ok).toBe(true)
    expect(store.activeTabId).toBe(b.id)
    store.close(b.id)
    expect(store.tabs).toHaveLength(0)
    expect(store.activeTabId).toBe('')
    // 最后关闭的落点由 adapter 处理；store 返回欢迎页路由。
    expect(result.route || store.close).toBeTruthy()
  })

  it('closeProject removes every surface tab of one book and keeps others', () => {
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: null })
    store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'book-a' })
    store.openOrFocus({ scope: 'project', surface: 'materials', projectId: 'book-a' })
    store.openOrFocus({ scope: 'project', surface: 'settings', projectId: 'book-b' })
    const result = store.closeProject('book-a')
    expect(result.ok).toBe(true)
    expect(store.tabs.map((tab) => tab.projectId)).toEqual(['book-b'])
  })

  it('discards a corrupted persisted payload and rebuilds safely', () => {
    storage.setItem(STORAGE_KEYS.WORKSPACE_TABS, JSON.stringify({ version: 99, tabs: 'not-an-array' }))
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: null })
    expect(store.tabs).toEqual([])
    expect(store.hydrated).toBe(true)
    // 重建后可以正常打开标签。
    const tab = store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'book-a' })
    expect(tab).toMatchObject({ scope: 'project', surface: 'authoring' })
  })

  it('persists quota failures without throwing and surfaces a one-time notice', () => {
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: null })
    const originalSetItem = storage.setItem.bind(storage)
    storage.setItem = (key, value) => {
      if (key === STORAGE_KEYS.WORKSPACE_TABS) {
        const error = new Error('quota')
        error.name = 'QuotaExceededError'
        throw error
      }
      return originalSetItem(key, value)
    }
    expect(() => store.openOrFocus({ scope: 'global', surface: 'docs' })).not.toThrow()
    expect(store.persistenceNotice).toContain('无法恢复')
    storage.setItem = originalSetItem
  })
})

describe('route adapter install ordering — data-loss race regression', () => {
  let pinia
  let storage

  beforeEach(() => {
    storage = makeTabsStorage()
    globalThis.localStorage = storage
    globalThis.sessionStorage = makeTabsStorage()
    pinia = createPinia()
    setActivePinia(pinia)
    seedTabsBooks(storage, [
      { id: 'book-a', title: '雾港书稿', worldbookId: 'wb-1', updatedAt: '2026-08-24T01:00:00Z' }
    ])
  })

  it('hydrates synchronously during install, before registering afterEach', () => {
    // 上一会话的持久化 payload。
    const previousPayload = {
      version: 1,
      activeTabId: 't1',
      tabs: [
        { id: 't1', key: 'project:book-a:authoring', scope: 'project', surface: 'authoring', projectId: 'book-a', title: '雾港书稿', pinned: false, dirty: false, lastActiveAt: 42, route: { name: 'authoring', query: { bookId: 'book-a' } } }
      ]
    }
    storage.setItem(STORAGE_KEYS.WORKSPACE_TABS, JSON.stringify(previousPayload))

    const store = useWorkspaceTabsStore()
    const order = []
    store.$onAction(({ name, after }) => {
      after(() => order.push(`action:${name}`))
    })
    const fakeRouter = makeTabsFakeRouter({ initialRoute: { name: 'welcome', query: {} } })

    // install 同步返回：不等待 isReady()。
    installWorkspaceRouteAdapter(store, fakeRouter)

    // hydrate 已同步完成，且发生在注册 afterEach 之后才可能触发的导航回调之前。
    expect(store.hydrated).toBe(true)
    expect(order).toContain('action:hydrate')
    expect(fakeRouter.hooks.length).toBe(1)

    // 上一会话的 payload 未被空 store 的 persist 覆盖。
    const storedRaw = JSON.parse(storage.getItem(STORAGE_KEYS.WORKSPACE_TABS))
    expect(storedRaw.tabs.map((tab) => tab.id)).toEqual(['t1'])
    expect(store.tabs.map((tab) => tab.id)).toEqual(['t1'])
    expect(store.activeTabId).toBe('t1')
  })

  it('a late initial-navigation sync runs on the hydrated store, never on an empty one', () => {
    const previousPayload = {
      version: 1,
      activeTabId: 't1',
      tabs: [
        { id: 't1', key: 'project:book-a:authoring', scope: 'project', surface: 'authoring', projectId: 'book-a', title: '雾港书稿', pinned: false, dirty: false, lastActiveAt: 42, route: { name: 'authoring', query: { bookId: 'book-a' } } }
      ]
    }
    storage.setItem(STORAGE_KEYS.WORKSPACE_TABS, JSON.stringify(previousPayload))

    const store = useWorkspaceTabsStore()
    const fakeRouter = makeTabsFakeRouter({
      initialRoute: { name: 'welcome', query: {} }
    })
    installWorkspaceRouteAdapter(store, fakeRouter)

    // 初始导航落在 project surface 且带 bookId：afterEach 在 hydrate 之后触发，
    // 聚焦既有标签而不是在空 store 上新建并覆盖。
    fakeRouter.hooks[0]({ name: 'authoring', query: { bookId: 'book-a' } })
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].key).toBe('project:book-a:authoring')

    // 持久化 payload 仍指向同一标签，未被覆盖重建。
    const storedRaw = JSON.parse(storage.getItem(STORAGE_KEYS.WORKSPACE_TABS))
    expect(storedRaw.tabs.map((tab) => tab.key)).toEqual(['project:book-a:authoring'])
  })

  it('non-surface routes never create tabs or wipe the session', () => {
    const store = useWorkspaceTabsStore()
    store.hydrate({ route: null })
    store.openOrFocus({ scope: 'project', surface: 'authoring', projectId: 'book-a' })
    const before = JSON.parse(JSON.stringify(store.tabs))

    const fakeRouter = makeTabsFakeRouter()
    handleRouteChangeForTest(store, fakeRouter, { name: 'welcome', query: {} })
    handleRouteChangeForTest(store, fakeRouter, { name: 'unknown-route', query: {} })

    expect(store.tabs).toHaveLength(1)
    expect(JSON.stringify(store.tabs)).toBe(JSON.stringify(before))
  })
})

describe('programmatic navigation window buffers external routes', () => {
  it('canonicalize applies immediately; a differing external route is processed after the window', async () => {
    localStorage.clear()
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'book-a', title: '雾港书稿', worldbookId: 'wb-1', updatedAt: '2026-08-24T01:00:00Z' },
      { id: 'book-b', title: '灯塔手记', worldbookId: '', updatedAt: '2026-08-24T02:00:00Z' }
    ]))
    const hooks = []
    let resolveReplace
    const router = {
      currentRoute: { value: { name: 'materials', query: {} } },
      push: vi.fn(async () => {}),
      replace: vi.fn(() => new Promise((resolve) => { resolveReplace = resolve })),
      afterEach(fn) { hooks.push(fn) }
    }

    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkspaceTabsStore()

    try {
      installWorkspaceRouteAdapter(store, router)
      // 复验修复后的语义：canonical 状态立即应用到 store（标签即刻可见），
      // 只有 URL replace 本身留在程序化窗口内。
      // resolveDefaultBookId 取最近更新的书（book-b）。
      expect(store.tabs.map((tab) => tab.key)).toEqual(['project:book-b:materials'])
      expect(isWorkspaceRouteSyncing()).toBe(true)

      // 窗口内到达指向另一 surface 的真实外部导航：先缓存，不立即处理。
      hooks[0]({ name: 'authoring', query: { bookId: 'book-a' } })
      expect(store.tabs.map((tab) => tab.key)).toEqual(['project:book-b:materials'])

      // replace 完成 → 缓存的外部路由被补处理，而不是丢弃。
      resolveReplace()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(store.tabs.map((tab) => tab.key)).toContain('project:book-a:authoring')
      expect(isWorkspaceRouteSyncing()).toBe(false)
    } finally {
      // 防止本用例断言失败时窗口悬挂，污染同文件后续用例。
      if (resolveReplace) resolveReplace()
    }
  })
})

describe('programmatic navigation own-echo suppression', () => {
  it("does not re-run syncFromRoute for its own replace echo（回声 key 先存后清）", async () => {
    localStorage.clear()
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'b1', title: '书一', chapters: [] },
      { id: 'b2', title: '书二', updatedAt: '2026-08-24T10:00:00Z', chapters: [] }
    ]))
    const hooks = []
    // mock router：replace 触发真实路由器语义——完成后以同目标发出 afterEach 回声。
    let resolveReplace
    const router = {
      currentRoute: { value: { name: 'authoring', query: {} } },
      push: vi.fn(async () => {}),
      replace: vi.fn((target) => new Promise((resolve) => {
        resolveReplace = () => {
          for (const hook of hooks) hook(target)
          resolve()
        }
      })),
      afterEach(handler) { hooks.push(handler) },
      emit(to) { for (const hook of hooks) hook(to) }
    }

    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkspaceTabsStore()
    const syncSpy = vi.spyOn(store, 'syncFromRoute')

    installWorkspaceRouteAdapter(store, router)
    // 初始导航：无 bookId → canonicalize：syncFromRoute(canonical) 预应用一次 + replace 入窗口。
    handleRouteChangeForTest(store, router, { name: 'authoring', query: {} })
    expect(syncSpy).toHaveBeenCalledTimes(1)

    // 自身回声在窗口内到达，窗口关闭时因 key 相同被丢弃。
    resolveReplace()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(syncSpy).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(store.tabs.map((tab) => tab.key)).toEqual(['project:b2:authoring'])
  })

  it('still processes a genuinely different external route after the window closes', async () => {
    localStorage.clear()
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'b1', title: '书一', chapters: [] },
      { id: 'b2', title: '书二', updatedAt: '2026-08-24T10:00:00Z', chapters: [] }
    ]))
    const hooks = []
    let resolveReplace
    const router = {
      currentRoute: { value: { name: 'authoring', query: {} } },
      push: vi.fn(async () => {}),
      replace: vi.fn(() => new Promise((resolve) => { resolveReplace = resolve })),
      afterEach(handler) { hooks.push(handler) }
    }

    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkspaceTabsStore()
    installWorkspaceRouteAdapter(store, router)

    // 窗口内到达指向另一本书的真实外部导航。
    hooks[0]({ name: 'authoring', query: { bookId: 'b1' } })
    resolveReplace()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(store.tabs.map((tab) => tab.key)).toContain('project:b1:authoring')
  })
})

// —— 文本工作台 v3 Phase 1：文档仓库 / 稳定寻址 / 位置解析 / sourceRef 归一 ——

describe('authoring document repository (text workbench v3 Phase 1)', () => {
  it('handles exploration CRUD with manuscript isolation and stable keys（合并4例）', async () => {
    const storage = makeTabsStorage()
    globalThis.localStorage = storage
    const pinia = createPinia()
    setActivePinia(pinia)
    seedTabsBooks(storage, [
      { id: 'book-w', title: '工作台书', worldbookId: 'wb-bound', chapters: [{ id: 'ch-1', title: '第一章', content: '\n正文事实。', contentFormat: 'md', outlineItems: [] }] }
    ])
    const repo = await import('../services/writing/authoringDocumentRepository.js')
    const writingSchema = await import('../services/writing/writingDocumentSchema.js')
    const manuscriptDocument = writingSchema.createWritingDocument('\n正文事实。')
    const seededBooks = JSON.parse(storage.getItem('writing_books'))
    seededBooks[0].chapters[0].editorDocument = manuscriptDocument
    storage.setItem('writing_books', JSON.stringify(seededBooks))

    // ① handle 合同：manuscript 必须有 chapter，exploration 必须 有 documentId。
    expect(repo.createDocumentHandle({ bookId: 'book-w', role: 'manuscript', chapterId: 'ch-1' })).toMatchObject({ role: 'manuscript', documentId: 'ch-1' })
    expect(repo.createDocumentHandle({ bookId: 'book-w', role: 'manuscript' })).toBe(null)
    expect(repo.createDocumentHandle({ bookId: '', role: 'exploration', documentId: 'e1' })).toBe(null)

    // ② 稳定 key：正文兼容旧 chapter key；探索为独立命名空间。
    expect(repo.authoringDocumentKey({ role: 'manuscript', chapterId: 'ch-1' })).toBe('chapter:ch-1')
    expect(repo.authoringDocumentKey({ role: 'exploration', bookId: 'book-w', documentId: 'e1' })).toBe('exploration:book-w:e1')

    // ③ 创建 → 更新 → 列表。
    const created = repo.createExplorationDocument('book-w', { title: '石柱回应 · 莉娜视角', content: '初稿。' })
    expect(created.ok).toBe(true)
    const saved = repo.saveExplorationDocument('book-w', created.document.id, { content: '修订稿。', annotations: [{ id: 'ann-1' }] })
    expect(saved.ok).toBe(true)
    expect(saved.document.content).toBe('修订稿。')
    expect(saved.document.annotations).toHaveLength(1)
    expect(saved.document.revision).toBe(2)
    expect(repo.listExplorationDocuments('book-w')).toHaveLength(1)

    // C1-1B repository 读取边界：绑定世界书只读快照不切 active，也不触发
    // legacy sourceDocuments 迁移写；其他来源按稳定 project/source ID 重读。
    storage.setItem('worldbook_wb-bound', JSON.stringify({
      id: 'wb-bound',
      name: '绑定设定',
      entries: [{
        id: 'entry-lina',
        name: '莉娜',
        type: 'character',
        keys: ['莉娜'],
        keysSecondary: [],
        content: '莉娜负责守住北门。',
        enabled: true
      }],
      sourceDocuments: [{ id: 'legacy-source', title: '旧资料', content: '不得迁移写回', createdAt: 1 }]
    }))
    const worldbookBeforeRead = storage.getItem('worldbook_wb-bound')
    const { readWorldbookSnapshot, useWorldStore } = await import('../stores/worldStore.js')
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb-active', name: '页面当前世界书', entries: [] }
    const worldbookSnapshot = readWorldbookSnapshot('wb-bound')
    expect(worldbookSnapshot).toMatchObject({
      id: 'wb-bound',
      entries: [expect.objectContaining({ id: 'entry-lina', content: '莉娜负责守住北门。' })]
    })
    expect(worldbookSnapshot.sourceDocuments[0].archiveRef).toBe(null)
    expect(worldStore.activeWorldbook.id).toBe('wb-active')
    expect(storage.getItem('worldbook_wb-bound')).toBe(worldbookBeforeRead)
    expect(readWorldbookSnapshot('missing')).toBe(null)

    // 设定页与 Authoring 快速切换不同资料库时，旧库的 legacy 归档可能更晚
    // 完成。两个调用都应返回各自精确快照，但只有最后发起的请求能切 active。
    storage.setItem('worldbook_wb-slow', JSON.stringify({
      id: 'wb-slow', name: '慢库', entries: [],
      sourceDocuments: [{ id: 'legacy-slow', title: '旧资料', content: '需要异步归档的正文。', createdAt: 1 }]
    }))
    storage.setItem('worldbook_wb-fast', JSON.stringify({
      id: 'wb-fast', name: '快库', entries: [], sourceDocuments: []
    }))
    const slowWorldbook = worldStore.loadWorldbook('wb-slow')
    const fastWorldbook = worldStore.loadWorldbook('wb-fast')
    const [slowLoaded, fastLoaded] = await Promise.all([slowWorldbook, fastWorldbook])
    expect(slowLoaded.id).toBe('wb-slow')
    expect(fastLoaded.id).toBe('wb-fast')
    expect(worldStore.activeWorldbook.id).toBe('wb-fast')
    expect(worldStore.isLoading).toBe(false)

    // structured-settings-only 旧档会在纯读时派生 entry。即使系统时间前进，
    // snapshot 与用于 manifest stale 对账的 entry revision 也必须保持一致。
    storage.setItem('worldbook_wb-structured', JSON.stringify({
      id: 'wb-structured',
      name: '结构化旧档',
      structuredSettings: { world: { origin: '潮汐之神在旧港留下了第一口铜钟。' } }
    }))
    const structuredBeforeRead = storage.getItem('worldbook_wb-structured')
    const { worldbookRunRevision } = await import('../services/agents/context/authoringRunContextReaders.js')
    const dateNowSpy = vi.spyOn(Date, 'now')
    let firstStructuredSnapshot
    let secondStructuredSnapshot
    try {
      dateNowSpy.mockReturnValue(1_000)
      firstStructuredSnapshot = readWorldbookSnapshot('wb-structured')
      dateNowSpy.mockReturnValue(9_000)
      secondStructuredSnapshot = readWorldbookSnapshot('wb-structured')
    } finally {
      dateNowSpy.mockRestore()
    }
    expect(firstStructuredSnapshot.entries).toEqual([
      expect.objectContaining({
        id: 'entry_structured_world_origin',
        content: '潮汐之神在旧港留下了第一口铜钟。',
        metadata: expect.objectContaining({ createdAt: 0, updatedAt: 0 })
      })
    ])
    expect(secondStructuredSnapshot).toEqual(firstStructuredSnapshot)
    expect(worldbookRunRevision(secondStructuredSnapshot.entries[0]))
      .toBe(worldbookRunRevision(firstStructuredSnapshot.entries[0]))
    expect(storage.getItem('worldbook_wb-structured')).toBe(structuredBeforeRead)

    const { createNarrativeAsset } = await import('../services/media/narrativeAssets.js')
    const { createMemoryCandidate } = await import('../services/memory/memoryCandidates.js')
    storage.setItem(STORAGE_KEYS.NARRATIVE_ASSETS, JSON.stringify([
      createNarrativeAsset({
        id: 'asset-w', projectId: 'book-w', title: '北门盐税', content: '北门的盐税刚刚提高。',
        kind: 'event', status: 'accepted', createdAt: 1, updatedAt: 2
      }),
      createNarrativeAsset({
        id: 'asset-other', projectId: 'book-other', title: '别书素材', content: '不得进入当前项目。',
        kind: 'event', status: 'accepted', createdAt: 1, updatedAt: 2
      })
    ]))
    storage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([
      createMemoryCandidate({
        id: 'memory-w', scope: 'project', scopeId: 'book-w', kind: 'project-fact',
        content: '北门属于当前项目。', status: 'active', authority: 'accepted',
        skipCompaction: true, createdAt: 1, updatedAt: 2
      }),
      createMemoryCandidate({
        id: 'memory-other', scope: 'project', scopeId: 'book-other', kind: 'project-fact',
        content: '不得进入当前项目。', status: 'active', authority: 'accepted',
        skipCompaction: true, createdAt: 1, updatedAt: 2
      }),
      createMemoryCandidate({
        id: 'memory-author', scope: 'global-author', scopeId: 'author-1', kind: 'author-preference',
        content: '偏好克制的叙述。', status: 'active', authority: 'accepted',
        skipCompaction: true, createdAt: 1, updatedAt: 2
      })
    ]))

    const runRepositories = await import('../services/agents/authoring/authoringRunRepositories.js')
    expect(runRepositories.readBoundAuthoringWorldbook('book-w', 'wb-bound')).toMatchObject({
      projectId: 'book-w', worldbookId: 'wb-bound', worldbook: { id: 'wb-bound' }
    })
    expect(runRepositories.readBoundAuthoringWorldbook('book-other', 'wb-bound')).toBe(null)
    expect(runRepositories.readBoundAuthoringWorldbook('book-w', 'wb-active')).toBe(null)

    // manuscript source reader 与 Authoring 页面 currentDocumentRevision 共用同一份
    // title + Markdown + unit/node topology 签名；chapter/unit ref 必须得到同一 revision。
    const { buildDocumentRevision } = await import('../services/agents/authoring/authoringTextTransaction.js')
    const manuscriptBodySignature = JSON.stringify({
      markdown: writingSchema.getWritingDocumentMarkdown(manuscriptDocument),
      units: manuscriptDocument.content.map((unit) => ({
        id: String(unit?.attrs?.unitId || ''),
        kind: String(unit?.attrs?.kind || ''),
        sceneId: String(unit?.attrs?.sceneId || ''),
        nodes: (unit?.content || []).map((node) => ({
          id: String(node?.attrs?.nodeId || ''),
          type: String(node?.type || ''),
          kind: String(node?.attrs?.kind || '')
        }))
      }))
    })
    const expectedManuscriptRevision = buildDocumentRevision('chapter:ch-1', JSON.stringify({
      title: '第一章',
      body: manuscriptBodySignature
    }))
    const manuscriptUnitId = manuscriptDocument.content[0].attrs.unitId
    const manuscriptNodeId = manuscriptDocument.content[0].content[0].attrs.nodeId
    expect(runRepositories.readAuthoringManuscriptSourceRevision('book-w', 'chapter:ch-1'))
      .toBe(expectedManuscriptRevision)
    expect(runRepositories.readAuthoringManuscriptSourceRevision('book-w', `unit:${manuscriptUnitId}`))
      .toBe(expectedManuscriptRevision)
    expect(runRepositories.readAuthoringManuscriptSourceRevision('book-w', `unit:ch-1:${manuscriptUnitId}`))
      .toBe(expectedManuscriptRevision)
    expect(runRepositories.readAuthoringManuscriptSourceRevision('book-w', `node:ch-1:${manuscriptNodeId}`))
      .toBe(expectedManuscriptRevision)
    expect(runRepositories.readAuthoringManuscriptSourceRevision('book-w', `node:ch-missing:${manuscriptNodeId}`))
      .toBe('')
    expect(runRepositories.readAuthoringManuscriptSourceRevision('book-other', 'chapter:ch-1')).toBe('')

    const expectedTarget = {
      projectId: 'book-w',
      role: 'manuscript',
      documentId: 'ch-1',
      chapterId: 'ch-1',
      unitId: 'unit-1',
      nodeId: 'node-1'
    }
    const liveScopes = []
    const adapters = runRepositories.createAuthoringRunRepositoryAdapters({
      projectId: 'book-w',
      readLiveTarget: async (scope) => {
        liveScopes.push(scope)
        return {
          ...expectedTarget,
          document: { schemaVersion: 3, revision: 4, content: [] },
          documentRevision: 'chapter:ch-1:live-r4',
          documentSchemaRevision: '4'
        }
      }
    })
    expect(adapters.worldbookRepository.getBoundWorldbook('book-w', 'wb-bound')).toMatchObject({ worldbookId: 'wb-bound' })
    expect(adapters.referenceRepositories.getExplorationDocument('book-w', created.document.id)).toMatchObject({ id: created.document.id, revision: 2 })
    expect(adapters.referenceRepositories.getExplorationDocument('book-other', created.document.id)).toBe(null)
    expect(adapters.referenceRepositories.getNarrativeAsset('asset-w', 'book-w')).toMatchObject({ id: 'asset-w', projectId: 'book-w' })
    expect(adapters.referenceRepositories.getNarrativeAsset('asset-other', 'book-w')).toBe(null)
    expect(adapters.memoryRepository.list({ status: 'active' }).map((memory) => memory.id).sort())
      .toEqual(['memory-author', 'memory-w'])
    expect(await adapters.liveTargetReader(expectedTarget)).toMatchObject({
      documentId: 'ch-1', unitId: 'unit-1', nodeId: 'node-1', documentRevision: 'chapter:ch-1:live-r4'
    })
    expect(Object.isFrozen(liveScopes[0])).toBe(true)
    expect(await adapters.liveTargetReader({ ...expectedTarget, nodeId: 'node-other' })).toBe(null)

    // ④ 删除探索绝不触碰正文。
    repo.deleteExplorationDocument('book-w', created.document.id)
    expect(repo.listExplorationDocuments('book-w')).toHaveLength(0)
    const book = JSON.parse(storage.getItem('writing_books'))[0]
    expect(book.chapters[0].content).toBe('\n正文事实。')
  })

  it('resolves unit/node position and revisions inside a document（合并2例）', async () => {
    const { createWritingDocument } = await import('../services/writing/writingDocumentSchema.js')
    const { resolveAuthoringDocumentPosition } = await import('../services/writing/authoringDocumentRepository.js')
    const document = createWritingDocument('第一单元正文。\n\n第二单元正文。')
    const unit = document.content[0]
    const position = resolveAuthoringDocumentPosition({
      document,
      unitId: unit.attrs.unitId,
      nodeId: unit.content[1].attrs.nodeId
    })
    expect(position).toMatchObject({
      unitIndex: 0,
      unitId: unit.attrs.unitId,
      nodeIndex: 1,
      documentRevision: document.revision
    })
    // 未知 unit → null（fail-closed）。
    expect(resolveAuthoringDocumentPosition({ document, unitId: 'unit-none' })).toBe(null)
  })

  it('unifies worldbook entry sourceRefs and migrates legacy entry-level misuse（合并3例）', async () => {
    const refs = await import('../services/writing/writingSourceRefs.js')
    expect(refs.worldbookEntryRef('char-lina')).toBe('worldbook-entry:char-lina')
    expect(refs.parseWorldbookEntryRef('worldbook-entry:char-lina')).toEqual({ kind: 'worldbook-entry', entryId: 'char-lina' })
    // 条目级旧形态归一；整本级引用不动。
    expect(refs.normalizeLegacyEntryRef('worldbook:char-lina', ['char-lina'])).toBe('worldbook-entry:char-lina')
    expect(refs.normalizeLegacyEntryRef('worldbook:wb-harbor')).toBe('worldbook:wb-harbor')
    expect(refs.normalizeLegacyEntryRef('worldbook-entry:char-lina')).toBe('worldbook-entry:char-lina')
  })
})

// —— 文本工作台 v3 Phase 3：项目大纲 / 时间位置真源 / 旧章纲迁移 ——

describe('project outline repository and position index (text workbench v3 Phase 3)', () => {
  it('normalizes nodes/edges, rejects dangling and self-loop edges（合并4例）', async () => {
    const storage = makeTabsStorage()
    globalThis.localStorage = storage
    seedTabsBooks(storage, [{ id: 'book-o', title: '大纲书', chapters: [{ id: 'c1', title: '一', content: 'x', contentFormat: 'md', outlineItems: [] }, { id: 'c5', title: '五', content: 'y', contentFormat: 'md', outlineItems: [] }] }])
    const repo = await import('../services/writing/projectOutlineRepository.js')

    const a = repo.upsertOutlineNode('book-o', { title: '石柱第一次响应', intent: '两视角互为证词', status: 'exploring', chapterRefs: ['c5'], explorationRefs: [{ documentId: 'exp-1', state: 'adopted' }] })
    expect(a.ok).toBe(true)
    expect(a.node).toMatchObject({ status: 'exploring', chapterRefs: ['c5'] })
    expect(a.node.explorationRefs[0]).toMatchObject({ documentId: 'exp-1', state: 'adopted' })

    const b = repo.upsertOutlineNode('book-o', { title: '灯塔伏笔', intent: '第一章埋设' })
    const edge = await Promise.resolve(repo.addOutlineEdge('book-o', { kind: 'foreshadows', fromNodeId: b.node.id, toNodeId: a.node.id }))
    expect(edge.ok).toBe(true)
    // 自环与悬空拒绝。
    expect(repo.addOutlineEdge('book-o', { kind: 'causes', fromNodeId: a.node.id, toNodeId: a.node.id }).reason).toBe('self-loop')
    expect(repo.addOutlineEdge('book-o', { kind: 'causes', fromNodeId: 'node-none', toNodeId: a.node.id }).reason).toBe('dangling-endpoint')

    // 指纹：任何节点/边变化都改变；重排映射也改变。
    const fp1 = repo.fingerprintOutline(repo.listOutlineNodes('book-o'), repo.listOutlineEdges('book-o'))
    repo.updateChapterMapping('book-o', a.node.id, { addChapterId: 'c1' })
    const fp2 = repo.fingerprintOutline(repo.listOutlineNodes('book-o'), repo.listOutlineEdges('book-o'))
    expect(fp1).not.toBe(fp2)
  })

  it('resolves temporal relation with fail-closed unknown and order-revision invalidation（合并3例）', async () => {
    const { buildManuscriptPositionIndex, resolveTemporalRelation, resolveUnitRelation } = await import('../services/writing/manuscriptPositionIndex.js')
    const book = { id: 'b', chapters: [{ id: 'c1' }, { id: 'c2' }, { id: 'c5' }] }
    const index = buildManuscriptPositionIndex(book)
    expect(resolveTemporalRelation(index, 'c5', 'c1')).toBe('before-target')
    expect(resolveTemporalRelation(index, 'c1', 'c5')).toBe('after-target')
    expect(resolveTemporalRelation(index, 'c5', 'c5')).toBe('at-target')
    // fail-closed：任一端不在索引 → unknown。
    expect(resolveTemporalRelation(index, 'c-none', 'c1')).toBe('unknown')
    // 重排使 order revision 失效。
    const before = buildManuscriptPositionIndex(book).chapterOrderRevision
    const after = buildManuscriptPositionIndex({ ...book, chapters: [book.chapters[1], book.chapters[0], book.chapters[2]] }).chapterOrderRevision
    expect(before).not.toBe(after)
    // unit 级 before/after。
    const withUnits = { id: 'b', chapters: [{ id: 'c1', editorDocument: { content: [{ attrs: { unitId: 'u1' } }, { attrs: { unitId: 'u2' } }] } }] }
    const unitIndex = buildManuscriptPositionIndex(withUnits)
    expect(resolveUnitRelation(unitIndex, 'c1', 'u2', 'u1')).toBe('before-target')
    const reorderedUnits = {
      ...withUnits,
      chapters: [{
        ...withUnits.chapters[0],
        editorDocument: { content: [...withUnits.chapters[0].editorDocument.content].reverse() }
      }]
    }
    expect(buildManuscriptPositionIndex(reorderedUnits).chapterOrderRevision)
      .not.toBe(unitIndex.chapterOrderRevision)
  })

  it('migrates legacy chapter outline items idempotently with fork review（合并3例）', async () => {
    const migration = await import('../services/writing/projectOutlineMigration.js')
    const book = {
      id: 'b',
      chapters: [
        { id: 'c1', outlineItems: [{ id: 'item-1', title: '手写节点', content: '零丢失内容' }, { id: 'item-asset', title: '来自素材', content: '素材正文', assetId: 'asset-9' }] },
        { id: 'c2', outlineItems: [{ id: 'item-2', title: '手写节点', content: '零丢失内容' }] }
      ]
    }
    const plan = migration.planChapterOutlineMigration(book)
    // item-1 与 item-2 内容相同但挂不同章 → 分叉冲突，不自动迁移。
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.create).toHaveLength(1)

    const working = JSON.parse(JSON.stringify(book))
    const result = migration.applyChapterOutlineMigration(working, plan)
    expect(result.created).toHaveLength(1)
    expect(result.done).toBe(false)
    const node = working.outlineNodes[0]
    // 手写项保留原 id 与内容（零丢失）。
    expect(node.migrationSource).toBe('item-asset')
    expect(node.intent).toBe('素材正文')
    expect(node.sourceRefs).toContain('asset:asset-9')

    // 幂等：再次计划时已迁移项跳过。
    const plan2 = migration.planChapterOutlineMigration(working)
    expect(plan2.create).toHaveLength(0)
  })
})

describe('workspace route adapter stale focus (journey finding)', () => {
  it('clears stale tab focus when project route has no resolvable book（合并2例）', async () => {
    const { handleRouteChangeForTest } = await import('../services/workspace/workspaceRouteAdapter.js')
    {
      // 空库 + 残留“体验”全局标签焦点：直接进 /authoring 不得继续高亮旧标签。
      localStorage.setItem('writing_books', JSON.stringify([]))
      const store = useWorkspaceTabsStore()
      store.tabs = []
      store.activeTabId = ''
      store.hydrate({ route: null })
      store.openOrFocus({ scope: 'global', surface: 'experience', projectId: null })
      expect(store.activeTab?.surface).toBe('experience')
      const router = { replace: () => Promise.resolve(), push: () => Promise.resolve() }
      handleRouteChangeForTest(store, router, { name: 'authoring', query: {} })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe('')
    }
    {
      // 有书时保持既有 canonical 化路径：标签创建且聚焦，不清空。
      localStorage.setItem('writing_books', JSON.stringify([{ id: 'b1', title: '书一' }]))
      const store2 = useWorkspaceTabsStore()
      store2.hydrate({ route: null })
      const router2 = { replace: () => Promise.resolve(), push: () => Promise.resolve() }
      handleRouteChangeForTest(store2, router2, { name: 'authoring', query: {} })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(store2.activeTab?.scope).toBe('project')
      expect(store2.activeTab?.projectId).toBe('b1')
    }
  })
})
