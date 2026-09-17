import { computed, ref } from 'vue'
import { loadWritingBooks } from '../../services/writing/writingBooksRepository'
import {
  adoptComicPageProject,
  listComicPagesInOrder
} from '../../services/media/comicPageStore'
import {
  resolveSettingsProjectContext
} from '../../services/workspace/settingsProjectContext'

// 漫画工作区唯一 selection owner（B04/B05/B02）：
// - 作品归属只认 route query bookId -> book（复用设定页项目上下文合同），
//   无 bookId 为显式全局模式，不自动回落 activeWorldbook（G-B03）。
// - 页目录按 sequence/pageNumber 稳定排序，编辑旧页不重排（G-B05）。
// - 书内目录只列 projectId === book.id 的页；旧世界书归属与未归属旧页
//   只在全局模式分组只读展示，由作者显式迁移，不自动挂到当前书（G-B01/02）。
// - 页/格选择只有一个 owner；换页前先 flush 未保存草稿（G-B08）。
export function useComicWorkspaceSelection({ route } = {}) {
  const books = ref([])
  const catalogVersion = ref(0)
  const activePageId = ref('')
  const activePanelId = ref('')
  const inspectorCollapsed = ref(false)
  const sequenceFilter = ref('all')
  let flushHooks = []

  const bookId = computed(() => String(route?.query?.bookId || ''))
  const context = computed(() => resolveSettingsProjectContext({
    books: books.value,
    bookId: bookId.value,
    worldbookId: String(route?.query?.worldbookId || ''),
    fallbackWorldbookId: ''
  }))
  const mode = computed(() => context.value?.mode || 'global')
  const activeBook = computed(() => context.value?.book || null)
  const scopeReady = computed(() => mode.value === 'global' || Boolean(activeBook.value))
  const scopeNotice = computed(() => {
    if (mode.value === 'project' && !activeBook.value) return '这本书已不存在，漫画目录已锁定为只读。请从作品列表重新进入。'
    if (mode.value === 'global') return '未选择作品：以下是全部未归属旧漫画。要继续制作，请从作品列表选择一本书进入。'
    return ''
  })

  const allPages = computed(() => {
    void catalogVersion.value
    return listComicPagesInOrder()
  })
  const bookPages = computed(() => {
    const book = activeBook.value
    if (!book) return []
    return allPages.value.filter((page) => page.projectId === book.id)
  })
  // 旧版把 projectId 存成 activeWorldbook ID 的页：永不进入书内主目录，
  // 只在隔离区只读展示、由作者显式迁移（G-B01/02/03）。
  const legacyWorldbookPages = computed(() => {
    const worldbookIds = new Set(books.value.map((book) => book.worldbookId).filter(Boolean))
    return allPages.value.filter((page) => page.projectId && worldbookIds.has(page.projectId))
  })
  const unownedPages = computed(() => {
    const ownedBookIds = new Set(books.value.map((book) => book.id))
    const worldbookIds = new Set(books.value.map((book) => book.worldbookId).filter(Boolean))
    return allPages.value.filter((page) => !page.projectId || (!ownedBookIds.has(page.projectId) && !worldbookIds.has(page.projectId)))
  })

  const sequences = computed(() => {
    const map = new Map()
    for (const page of bookPages.value) {
      if (!page.sequenceId) continue
      if (!map.has(page.sequenceId)) {
        map.set(page.sequenceId, {
          id: page.sequenceId,
          title: page.sequenceTitle || page.title || '未命名序列',
          pages: []
        })
      }
      map.get(page.sequenceId).pages.push(page)
    }
    return [...map.values()]
  })
  const standalonePages = computed(() => bookPages.value.filter((page) => !page.sequenceId))
  const filteredPages = computed(() => {
    if (sequenceFilter.value === 'all') return bookPages.value
    if (sequenceFilter.value === 'standalone') return standalonePages.value
    return sequences.value.find((sequence) => sequence.id === sequenceFilter.value)?.pages || []
  })
  const catalog = computed(() => {
    let standaloneIndex = 0
    return filteredPages.value.map((page) => {
      let label
      if (page.sequenceId) {
        label = `P${String(page.pageNumber).padStart(2, '0')}`
      } else {
        standaloneIndex += 1
        label = `S${String(standaloneIndex).padStart(2, '0')}`
      }
      return {
        page,
        label,
        title: page.title || '未命名漫画页',
        panelCount: page.panels.length
      }
    })
  })

  const activePage = computed(() => bookPages.value.find((page) => page.id === activePageId.value) || null)
  const activePanel = computed(() => activePage.value?.panels.find((panel) => panel.id === activePanelId.value) || null)

  function refreshBooks() {
    books.value = loadWritingBooks()
  }

  function touchCatalog() {
    catalogVersion.value += 1
    const current = bookPages.value.find((page) => page.id === activePageId.value)
    if (!current && bookPages.value.length) {
      activePageId.value = bookPages.value[0].id
    }
    if (activePage.value && !activePage.value.panels.some((panel) => panel.id === activePanelId.value)) {
      activePanelId.value = activePage.value.panels[0]?.id || ''
    }
  }

  function registerFlush(hook) {
    flushHooks = [...flushHooks, hook]
    return () => { flushHooks = flushHooks.filter((item) => item !== hook) }
  }

  function flushPendingEdits() {
    // 失焦触发原生 change 事件，让未 blur 的输入先走 @change 保存。
    const element = typeof document !== 'undefined' ? document.activeElement : null
    if (element && (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') && typeof element.blur === 'function') {
      element.blur()
    }
    for (const hook of flushHooks) {
      try {
        hook()
      } catch {
        // flush 失败不阻断导航；草稿仍在输入框内存中，由调用方提示。
      }
    }
  }

  function selectPage(pageId, { flush = true } = {}) {
    if (flush && pageId !== activePageId.value) flushPendingEdits()
    const page = bookPages.value.find((item) => item.id === pageId)
    if (!page) return false
    activePageId.value = page.id
    activePanelId.value = page.panels[0]?.id || ''
    return true
  }

  function selectPanel(panelId) {
    if (!activePage.value?.panels.some((panel) => panel.id === panelId)) return false
    activePanelId.value = panelId
    return true
  }

  function startNewPage() {
    flushPendingEdits()
    activePageId.value = ''
    activePanelId.value = ''
  }

  function adoptLegacyPage(pageId, targetBookId) {
    const book = books.value.find((item) => item.id === targetBookId)
    if (!book) return null
    return adoptComicPageProject(pageId, book.id)
  }

  function unknownRequestSummaries() {
    const summaries = []
    const inScope = mode.value === 'project'
      ? bookPages.value
      : allPages.value
    for (const page of inScope) {
      for (const panel of page.panels) {
        if (panel.pendingGeneration) {
          summaries.push({ pageId: page.id, panelId: panel.id, stage: '', kind: 'panel', sentAt: panel.pendingGeneration.sentAt })
        }
        for (const [stage, state] of Object.entries(panel.production || {})) {
          if (state?.pendingRequest) {
            summaries.push({ pageId: page.id, panelId: panel.id, stage, kind: 'stage', sentAt: state.pendingRequest.sentAt })
          }
        }
      }
    }
    return summaries
  }

  return {
    books,
    bookId,
    context,
    mode,
    activeBook,
    scopeReady,
    scopeNotice,
    bookPages,
    catalog,
    sequences,
    standalonePages,
    legacyWorldbookPages,
    unownedPages,
    sequenceFilter,
    activePageId,
    activePage,
    activePanelId,
    activePanel,
    inspectorCollapsed,
    refreshBooks,
    touchCatalog,
    registerFlush,
    flushPendingEdits,
    selectPage,
    selectPanel,
    startNewPage,
    adoptLegacyPage,
    unknownRequestSummaries
  }
}
