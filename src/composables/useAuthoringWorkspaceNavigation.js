import { nextTick, unref, watch } from 'vue'
import { openOrFocusWorkspaceTab } from '../services/workspace/workspaceRouteAdapter.js'

const SETTINGS_ROUTES = Object.freeze({
  settings: 'settings-structured',
  map: 'settings-world-map',
  entries: 'settings-worldbook-advanced'
})

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
  selectBook,
  selectChapter,
  openBookAtChapter,
  getDocumentRevision,
  captureScrollState,
  restoreScrollState
}) {
  let pendingReturnRestore = null
  let pendingReturnKey = ''

  function captureReturnState() {
    const bookId = text(selectedValue(selectedBookId))
    if (!bookId) return null
    const selection = selectedValue(notebookEditorRef)?.getSelection?.() || null
    const snapshot = {
      projectId: bookId,
      chapterId: text(selectedValue(selectedChapterId)),
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
    await openOrFocusWorkspaceTab(workspaceTabsStore, router, {
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
    return true
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
    Object.assign(query, extraQuery)
    return openWorkspaceRoute({
      surface,
      route: { name: routeName, query },
      projectId: bookId,
      worldbookId,
      objectId: entryId || placeId,
      chapterId: selectedValue(selectedChapterId)
    })
  }

  function reportTabContext(bookId, chapterId) {
    const key = authoringTabKey(bookId)
    if (!key) return
    const book = selectedValue(books).find((item) => text(item.id) === text(bookId))
    workspaceTabsStore.updateContextByKey(key, {
      chapterId: chapterId ? text(chapterId) : '',
      worldbookId: book ? (book.worldbookId || '') : '',
      title: book?.title || '',
      restoreState: { chapterId: chapterId ? text(chapterId) : '' },
      route: {
        name: 'authoring',
        query: {
          bookId: text(bookId),
          ...(chapterId ? { chapterId: text(chapterId) } : {})
        }
      }
    })
  }

  watch(
    [selectedBookId, selectedChapterId, writingDocument, notebookEditorRef],
    ([bookId, chapterId]) => {
      if (!bookId || !chapterId || !selectedValue(notebookEditorRef) || !selectedValue(writingDocument)) return
      const key = authoringTabKey(bookId)
      if (!pendingReturnRestore && key !== pendingReturnKey) {
        pendingReturnKey = key
        pendingReturnRestore = workspaceTabsStore.consumeVolatileRestoreStateByKey(key)
      }
      const snapshot = pendingReturnRestore
      if (!snapshot) return
      if (text(snapshot.projectId) !== text(bookId) || text(snapshot.chapterId) !== text(chapterId)) return
      pendingReturnRestore = null
      if (text(snapshot.documentRevision) !== text(getDocumentRevision?.())) return
      nextTick(() => requestAnimationFrame(() => {
        if (snapshot.selection) {
          selectedValue(notebookEditorRef)?.setSelection?.(snapshot.selection.from, snapshot.selection.to)
        }
        restoreScrollState?.(snapshot.scroll)
      }))
    },
    { flush: 'post' }
  )

  watch(
    [selectedBookId, selectedChapterId],
    ([bookId, chapterId]) => {
      reportTabContext(bookId, chapterId)
      if (!bookId || route.name !== 'authoring') return
      if (selectedValue(pendingBackJump) || selectedValue(pendingInsertBack)) return
      const nextQuery = { ...route.query, bookId: text(bookId) }
      if (chapterId) nextQuery.chapterId = text(chapterId)
      const currentQuery = route.query || {}
      const unchanged = text(currentQuery.bookId) === nextQuery.bookId
        && text(currentQuery.chapterId) === (nextQuery.chapterId || '')
      if (!unchanged) router.replace({ query: nextQuery })
    },
    { flush: 'post' }
  )

  watch(saveStatus, (status) => {
    const key = authoringTabKey(selectedValue(selectedBookId))
    if (!key) return
    const dirty = status === 'unsaved' || status === 'saving' || status === 'error'
    workspaceTabsStore.updateContextByKey(key, { dirty })
  })

  watch(
    () => route.query.bookId,
    (rawBookId) => {
      const bookId = typeof rawBookId === 'string' ? rawBookId.trim() : ''
      if (!bookId || route.name !== 'authoring') return
      if (bookId === text(selectedValue(selectedBookId))) return
      if (!selectedValue(books).some((book) => text(book.id) === bookId)) return
      selectBook(bookId)
    }
  )

  watch(
    () => route.query.chapterId,
    (rawChapterId) => {
      const chapterId = typeof rawChapterId === 'string' ? rawChapterId.trim() : ''
      if (!chapterId || route.name !== 'authoring') return
      if (chapterId === text(selectedValue(selectedChapterId))) return
      if (selectedValue(chapters).some((item) => item && text(item.id) === chapterId)) {
        selectChapter(chapterId)
        return
      }
      const found = selectedValue(books).find((book) => (Array.isArray(book.chapters) ? book.chapters : [])
        .some((chapter) => chapter && text(chapter.id) === chapterId))
      if (found && text(found.id) !== text(selectedValue(selectedBookId))) {
        openBookAtChapter(found.id, chapterId)
      }
    }
  )

  return Object.freeze({
    captureReturnState,
    openProjectSettingsSurface,
    openWorkspaceRoute,
    reportTabContext
  })
}
