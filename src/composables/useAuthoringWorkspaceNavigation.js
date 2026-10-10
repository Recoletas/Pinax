import { nextTick, onMounted, onScopeDispose, unref, watch } from 'vue'
import { openOrFocusWorkspaceTab } from '../services/workspace/workspaceRouteAdapter.js'
import { recordWorkspaceRecentLocation } from '../services/workspace/workspaceRecentHistory.js'
import { getExplorationDocument } from '../services/writing/authoringDocumentRepository.js'

const SETTINGS_ROUTES = Object.freeze({
  sources: 'settings-sources',
  settings: 'settings-knowledge',
  map: 'settings-world-map',
  entries: 'settings-worldbook-advanced',
  materials: 'materials',
  canvas: 'prose-essay',
  comics: 'comics'
})

// W2-A-2b：调用方仍说 'settings'（右栏「设定」按钮、地点/条目回程等），但页面身份已折进
// 知识控制台——标签 surface 归 'knowledge'，并用视图参数落到结构化设定视图，避免同书开出两个标签。
const SURFACE_TAB_ALIAS = Object.freeze({ settings: 'knowledge' })
const SURFACE_EXTRA_QUERY = Object.freeze({ settings: { view: 'settings' } })

export function authoringTabKey(bookId) {
  return bookId ? `project:${String(bookId)}:authoring` : ''
}

function text(value) {
  return String(value || '')
}

function selectedValue(source) {
  return unref(source)
}

export function useAuthoringWorkspaceNavigation({
  router,
  route,
  workspaceTabsStore,
  books,
  chapters,
  selectedBookId,
  selectedChapterId,
  selectedWorldbookId,
  activeWritingUnitId,
  writingDocument,
  notebookEditorRef,
  saveStatus,
  pendingBackJump,
  pendingInsertBack,
  activeDocument,
  openExplorationDocument,
  notify,
  selectBook,
  selectChapter,
  openBookAtChapter,
  getDocumentRevision,
  captureScrollState,
  restoreScrollState
}) {
  let pendingReturnRestore = null
  let pendingReturnKey = ''
  let disposed = false
  let initialized = false
  let applyingRoute = false
  let syncRevision = 0
  let blockedRouteKey = ''
  let blockedOwnerKey = ''
  let reportedLocationKey = ''
  let lastAcceptedRoute = null
  let lastAcceptedOwnerKey = ''
  onScopeDispose(() => { disposed = true; syncRevision += 1 })

  const returningToSource = () => Boolean(selectedValue(pendingBackJump) || selectedValue(pendingInsertBack))
  const ownerKey = () => JSON.stringify([text(selectedValue(selectedBookId)), text(selectedValue(selectedChapterId)), text(selectedValue(activeDocument)?.id)])
  const routeKey = () => JSON.stringify([route.name, text(route.query.bookId), text(route.query.chapterId), text(route.query.explorationId), text(route.query.view)])

  function captureReturnState() {
    const bookId = text(selectedValue(selectedBookId))
    if (!bookId) return null
    const selection = selectedValue(notebookEditorRef)?.getSelection?.() || null
    const snapshot = {
      projectId: bookId,
      chapterId: text(selectedValue(selectedChapterId)),
      explorationId: text(selectedValue(activeDocument)?.id),
      writingUnitId: text(selectedValue(activeWritingUnitId)),
      documentRevision: text(getDocumentRevision?.()),
      selection: selection ? { from: selection.from, to: selection.to } : null,
      scroll: captureScrollState?.() || null
    }
    workspaceTabsStore.setVolatileRestoreStateByKey(authoringTabKey(bookId), snapshot)
    return snapshot
  }

  async function openWorkspaceRoute({
    surface,
    route: targetRoute,
    projectId = selectedValue(selectedBookId),
    worldbookId = selectedValue(selectedWorldbookId),
    objectId = '',
    chapterId = selectedValue(selectedChapterId)
  } = {}) {
    const normalizedProjectId = text(projectId)
    if (!normalizedProjectId || !surface || !targetRoute) return false
    captureReturnState()
    const opened = await openOrFocusWorkspaceTab(workspaceTabsStore, router, {
      scope: 'project',
      surface,
      projectId: normalizedProjectId,
      worldbookId: text(worldbookId)
    }, {
      route: targetRoute,
      restoreState: {
        chapterId: text(chapterId),
        objectId: text(objectId)
      }
    })
    return Boolean(opened)
  }

  async function openProjectSettingsSurface(surface, {
    entryId = '',
    placeId = '',
    historyNodeId = '',
    extraQuery = {}
  } = {}) {
    const bookId = text(selectedValue(selectedBookId))
    const routeName = SETTINGS_ROUTES[surface]
    if (!bookId || !routeName) return false
    const worldbookId = text(selectedValue(selectedWorldbookId))
    const query = { bookId }
    if (worldbookId) query.worldbookId = worldbookId
    if (entryId) query.entryId = text(entryId)
    if (placeId) query.placeId = text(placeId)
    if (historyNodeId) query.historyNodeId = text(historyNodeId)
    Object.assign(query, SURFACE_EXTRA_QUERY[surface] || {}, extraQuery)
    return openWorkspaceRoute({
      surface: SURFACE_TAB_ALIAS[surface] || surface,
      route: { name: routeName, query },
      projectId: bookId,
      worldbookId,
      objectId: entryId || placeId,
      chapterId: selectedValue(selectedChapterId)
    })
  }

  function currentLocation(bookId = selectedValue(selectedBookId), chapterId = selectedValue(selectedChapterId)) {
    if (text(bookId) !== text(selectedValue(selectedBookId))) return null
    const book = selectedValue(books).find(item => text(item.id) === text(bookId))
    if (!book) return null
    const document = selectedValue(activeDocument)
    if (document) {
      const stored = getExplorationDocument(book.id, document.id)
      if (!stored) return null
      return { book, object: { kind: 'exploration', id: text(stored.id), title: document.title || stored.title || '' } }
    }
    const chapter = book.chapters?.find(item => text(item.id) === text(chapterId))
    if (chapterId && !chapter) return null
    return { book, object: chapter ? { kind: 'chapter', id: text(chapter.id), title: chapter.title || '' } : null }
  }

  function locationQuery(location) {
    const query = { bookId: text(location.book.id) }
    if (location.object) query[location.object.kind === 'exploration' ? 'explorationId' : 'chapterId'] = location.object.id
    if (route.query.view === 'assistant') query.view = 'assistant'
    return query
  }

  function routeMatches(location) {
    const query = locationQuery(location)
    return route.name === 'authoring' && ['bookId', 'chapterId', 'explorationId', 'view']
      .every(key => text(route.query[key]) === text(query[key]))
  }

  function reportTabContext(bookId, chapterId) {
    if (disposed || returningToSource() || blockedRouteKey === routeKey()) return
    const location = currentLocation(bookId, chapterId)
    if (!location || !routeMatches(location)) return
    const { book, object } = location
    const query = locationQuery(location)
    lastAcceptedRoute = { name: 'authoring', query: { ...query } }
    lastAcceptedOwnerKey = ownerKey()
    const key = authoringTabKey(book.id)
    const view = route.query.view === 'assistant' ? 'assistant' : ''
    workspaceTabsStore.updateContextByKey(key, {
      chapterId: query.chapterId || '',
      worldbookId: book.worldbookId || '',
      title: book.title || '',
      restoreState: { chapterId: query.chapterId || '', explorationId: query.explorationId || '' },
      route: { name: 'authoring', query }
    })
    const locationKey = JSON.stringify([book.id, object?.kind || '', object?.id || '', view])
    const recorded = recordWorkspaceRecentLocation({
      bookId: text(book.id), surface: 'authoring', route: { name: 'authoring', query },
      ...(object ? { object } : {}),
      mode: reportedLocationKey === locationKey ? 'context' : 'visit'
    })
    if (recorded.ok) reportedLocationKey = locationKey
  }

  async function syncAcceptedLocation() {
    if (!initialized || disposed || applyingRoute || returningToSource() || route.name !== 'authoring') return
    if (blockedRouteKey === routeKey()) {
      if (blockedOwnerKey === ownerKey()) return
      // An explicit directory selection may recover from an invalid deep link.
      blockedRouteKey = ''
    }
    const location = currentLocation()
    if (!location) return
    const revision = ++syncRevision
    const acceptedOwner = ownerKey()
    if (!routeMatches(location)) {
      const nextQuery = { ...route.query, ...locationQuery(location) }
      delete nextQuery.chapterId
      delete nextQuery.explorationId
      if (nextQuery.view !== 'assistant') delete nextQuery.view
      if (location.object) nextQuery[location.object.kind === 'exploration' ? 'explorationId' : 'chapterId'] = location.object.id
      if (text(route.query.bookId) !== text(location.book.id)) {
        delete nextQuery.worldbookId
        delete nextQuery.focus
      }
      try {
        const failure = await router.replace({ name: 'authoring', query: nextQuery })
        if (failure) return
      } catch {
        if (!disposed && revision === syncRevision) notify?.('打开位置未能更新，请保留当前文档并重试。')
        return
      }
    }
    if (!disposed && revision === syncRevision && acceptedOwner === ownerKey()) {
      reportTabContext(selectedValue(selectedBookId), selectedValue(selectedChapterId))
    }
  }

  function rejectRouteLocation(message, book = null) {
    if (book && (text(selectedValue(selectedBookId)) !== text(book.id) || selectedValue(selectedChapterId) || selectedValue(activeDocument))) {
      selectBook(book.id, { empty: true })
    }
    const failedKey = routeKey()
    if (blockedRouteKey !== failedKey) notify?.(message)
    blockedRouteKey = failedKey
    blockedOwnerKey = ownerKey()
    return false
  }

  async function rejectOwnerTransition(message) {
    rejectRouteLocation(message)
    const actual = currentLocation()
    // A compound book → exploration switch can accept the book before the
    // document owner refuses. Keep that actual draft instead of leaving it
    // again, or labelling it as the exploration that failed to open.
    const target = lastAcceptedRoute && lastAcceptedOwnerKey === ownerKey()
      ? lastAcceptedRoute
      : actual ? { name: 'authoring', query: locationQuery(actual) } : null
    if (!target) return
    const rejectedRouteKey = routeKey()
    const rejectedOwnerKey = ownerKey()
    const revision = ++syncRevision
    try {
      const failure = await router.replace(target)
      if (failure && !disposed && revision === syncRevision
        && rejectedRouteKey === routeKey() && rejectedOwnerKey === ownerKey()) {
        notify?.('当前文档仍保留，但网址未能恢复。请先解决保存问题，再从目录重新选择。')
      }
    } catch {
      if (!disposed && revision === syncRevision && rejectedOwnerKey === ownerKey()) {
        notify?.('当前文档仍保留，但网址未能恢复。请先解决保存问题，再从目录重新选择。')
      }
    }
    // A refusal is never retried from this promise. The route watcher accepts
    // a successful rollback; a failed rollback stays blocked until selection.
  }

  function acceptRouteLocation() {
    if (!initialized || disposed || returningToSource() || route.name !== 'authoring') return
    syncRevision += 1
    applyingRoute = true
    let accepted = false
    try {
      const requestedBook = text(route.query.bookId).trim()
      const chapterId = text(route.query.chapterId).trim()
      const explorationId = text(route.query.explorationId).trim()
      const availableBooks = selectedValue(books)
      // A legacy chapter-only link may still identify its book. An explicit
      // bookId always owns the lookup and never follows a foreign chapter.
      const book = requestedBook
        ? availableBooks.find(item => text(item.id) === requestedBook)
        : (!explorationId && chapterId ? availableBooks.find(item => item.chapters?.some(chapter => text(chapter.id) === chapterId)) : null)
          || availableBooks.find(item => text(item.id) === text(selectedValue(selectedBookId)))
      if (!book) {
        if (requestedBook || chapterId || explorationId) rejectRouteLocation('指定作品已不存在，请从作品列表重新选择。')
        return
      }
      if (explorationId && !getExplorationDocument(book.id, explorationId)) {
        rejectRouteLocation('指定速记已不存在或不属于这本书，请从目录重新选择。', book)
        return
      }
      if (!explorationId && chapterId && !book.chapters?.some(chapter => text(chapter.id) === chapterId)) {
        rejectRouteLocation('指定章节已不存在或不属于这本书，请从目录重新选择。', book)
        return
      }
      if (text(book.id) !== text(selectedValue(selectedBookId))) {
        const opened = chapterId && !explorationId ? openBookAtChapter(book.id, chapterId) : selectBook(book.id)
        if (opened === false || text(selectedValue(selectedBookId)) !== text(book.id)) {
          void rejectOwnerTransition('未能切换作品，当前文档仍保留。')
          return
        }
      }
      if (explorationId) {
        if (text(selectedValue(activeDocument)?.id) !== explorationId) openExplorationDocument?.(explorationId)
        if (text(selectedValue(activeDocument)?.id) !== explorationId) {
          void rejectOwnerTransition('未能打开指定速记，当前文档仍保留。')
          return
        }
      } else if (chapterId && (selectedValue(activeDocument) || text(selectedValue(selectedChapterId)) !== chapterId)) {
        selectChapter(chapterId)
        if (selectedValue(activeDocument) || text(selectedValue(selectedChapterId)) !== chapterId) {
          void rejectOwnerTransition('未能打开指定章节，当前文档仍保留。')
          return
        }
      }
      blockedRouteKey = ''
      blockedOwnerKey = ''
      accepted = true
    } finally {
      applyingRoute = false
    }
    if (accepted) void syncAcceptedLocation()
  }

  watch(
    [selectedBookId, selectedChapterId, writingDocument, notebookEditorRef, () => selectedValue(activeDocument)?.id],
    ([bookId, chapterId]) => {
      if (!bookId || (!chapterId && !selectedValue(activeDocument)) || !selectedValue(notebookEditorRef) || !selectedValue(writingDocument)) return
      const key = authoringTabKey(bookId)
      if (!pendingReturnRestore && key !== pendingReturnKey) {
        pendingReturnKey = key
        pendingReturnRestore = workspaceTabsStore.consumeVolatileRestoreStateByKey(key)
      }
      const snapshot = pendingReturnRestore
      if (!snapshot) return
      if (text(snapshot.projectId) !== text(bookId)) return
      if (text(snapshot.explorationId) !== text(selectedValue(activeDocument)?.id)) return
      if (!snapshot.explorationId && text(snapshot.chapterId) !== text(chapterId)) return
      pendingReturnRestore = null
      if (text(snapshot.documentRevision) !== text(getDocumentRevision?.())) return
      nextTick(() => requestAnimationFrame(() => {
        if (disposed || route.name !== 'authoring' || text(snapshot.projectId) !== text(selectedValue(selectedBookId))
          || (!snapshot.explorationId && text(snapshot.chapterId) !== text(selectedValue(selectedChapterId)))
          || text(snapshot.explorationId) !== text(selectedValue(activeDocument)?.id)
          || text(snapshot.documentRevision) !== text(getDocumentRevision?.())) return
        if (snapshot.selection) {
          selectedValue(notebookEditorRef)?.setSelection?.(snapshot.selection.from, snapshot.selection.to)
        }
        restoreScrollState?.(snapshot.scroll)
      }))
    },
    { flush: 'post' }
  )

  watch(
    [selectedBookId, selectedChapterId, () => selectedValue(activeDocument)?.id,
      () => selectedValue(activeDocument)?.title,
      () => selectedValue(chapters).find(chapter => text(chapter.id) === text(selectedValue(selectedChapterId)))?.title,
      () => selectedValue(pendingBackJump), () => selectedValue(pendingInsertBack)],
    () => { void syncAcceptedLocation() },
    { flush: 'post' }
  )

  watch(saveStatus, (status) => {
    const key = authoringTabKey(selectedValue(selectedBookId))
    if (!key) return
    const dirty = status === 'unsaved' || status === 'saving' || status === 'error'
    workspaceTabsStore.updateContextByKey(key, { dirty })
  })

  watch([() => route.name, () => route.query.bookId, () => route.query.chapterId,
    () => route.query.explorationId, () => route.query.view], (current, previous) => {
    if (blockedRouteKey && blockedOwnerKey === ownerKey()
      && current.slice(0, 4).every((value, index) => value === previous[index])) {
      // Expanding the assistant is not permission to retry a failed document
      // switch. Keep the rejected locator blocked until a new target/owner.
      blockedRouteKey = routeKey()
      return
    }
    acceptRouteLocation()
  })
  onMounted(() => {
    initialized = true
    acceptRouteLocation()
  })

  return Object.freeze({
    captureReturnState,
    openProjectSettingsSurface,
    openWorkspaceRoute,
    reportTabContext
  })
}
