import { loadWritingBooks, saveWritingBooksDurable } from '../services/writing/writingBooksRepository'

// Owns the book-level activation transaction. Chapter hydration and editor DOM
// work remain adapters supplied by Authoring because they belong to the editor.
export function useAuthoringBookActivation({
  route,
  books,
  chapters,
  selectedBookId,
  selectedChapterId,
  pendingBackJump,
  pendingInsertBack,
  pendingGhostAdoption,
  blockPreview,
  activeExplorationDocument,
  persistExplorationBeforeLeaving,
  buildOutgoingBoundary,
  saveCurrentChapter,
  dispatchChapterBoundary,
  setAuthoringProjectId,
  synchronizeWorldbook,
  shouldRefreshAssetInbox,
  refreshAssetInbox,
  selectChapter,
  clearEditorDocument,
  cancelWritingAgent,
  dismissAuxiliary,
  clearPendingPersist,
  closeBlockComposer,
  closeChapterDrawer,
  markSaved,
  notify
}) {
  let pendingActivationBoundary = false

  function saveBooks({ preserveOutlineBookId = '' } = {}) {
    const freshBooks = loadWritingBooks()
    for (const pageBook of books.value) {
      const freshBook = freshBooks.find((item) => String(item.id) === String(pageBook.id))
      if (!freshBook) continue
      if (Array.isArray(freshBook.explorationDocuments) || pageBook.explorationDocuments === undefined) {
        pageBook.explorationDocuments = Array.isArray(freshBook.explorationDocuments) ? freshBook.explorationDocuments : []
      }
      const preservePageOutline = String(pageBook.id) === String(preserveOutlineBookId || '')
      if (!preservePageOutline && (Array.isArray(freshBook.outlineNodes) || pageBook.outlineNodes === undefined)) {
        pageBook.outlineNodes = Array.isArray(freshBook.outlineNodes) ? freshBook.outlineNodes : []
      }
      if (Array.isArray(freshBook.outlineEdges) || pageBook.outlineEdges === undefined) {
        pageBook.outlineEdges = Array.isArray(freshBook.outlineEdges) ? freshBook.outlineEdges : []
      }
    }
    return saveWritingBooksDurable(books.value).ok
  }

  function loadBooks() {
    books.value = loadWritingBooks()
    ensureInitialBookSelection()
  }

  function ensureInitialBookSelection() {
    if (selectedBookId.value || books.value.length === 0) return
    const queryBookId = typeof route.query.bookId === 'string' ? route.query.bookId.trim() : ''
    const preferred = (queryBookId && books.value.find((book) => String(book.id) === queryBookId)) || books.value[0]
    openBook(preferred.id, { fromInitialLoad: true })
    const queryChapterId = typeof route.query.chapterId === 'string' ? route.query.chapterId.trim() : ''
    if (queryChapterId && !pendingBackJump.value && !pendingInsertBack.value) {
      const chapter = chapters.value.find((item) => item && item.id === queryChapterId)
      if (chapter) selectChapter(chapter.id)
    }
  }

  function activateBook(bookId, { savePrevious = true } = {}) {
    if (pendingGhostAdoption.value) {
      notify('推演正文尚未保存，请先重试保存或留在当前章节')
      return null
    }
    if (blockPreview.value) {
      notify('推演草稿尚未处理，请先采用或丢弃')
      return null
    }
    const nextBook = books.value.find((item) => item.id === bookId) || null
    if (bookId != null && !nextBook) return null
    if (activeExplorationDocument.value && !persistExplorationBeforeLeaving()?.ok) return null

    const outgoingBoundary = savePrevious ? buildOutgoingBoundary() : null
    if (savePrevious) {
      if (selectedChapterId.value && !saveCurrentChapter()) {
        notify('当前章节保存失败，未切换书籍')
        return null
      }
      if (outgoingBoundary) dispatchChapterBoundary(outgoingBoundary)
      pendingActivationBoundary = Boolean(selectedChapterId.value)
    }

    selectedBookId.value = bookId
    dismissAuxiliary()
    clearPendingPersist()
    setAuthoringProjectId(bookId || '')
    void synchronizeWorldbook(nextBook, bookId)
    if (shouldRefreshAssetInbox()) refreshAssetInbox()
    return nextBook
  }

  function openBook(bookId, { fromInitialLoad = false } = {}) {
    const book = activateBook(bookId)
    if (!book) {
      if (fromInitialLoad) clearEditorDocument()
      return false
    }
    chapters.value = book.chapters || []
    if (chapters.value.length > 0) {
      if (!selectChapter(chapters.value[0].id)) return false
    } else {
      pendingActivationBoundary = false
      clearEditorDocument()
    }
    markSaved()
    return true
  }

  function selectBook(bookId) {
    if (pendingGhostAdoption.value) {
      notify('推演正文尚未保存，请先重试保存或留在当前章节')
      return false
    }
    if (blockPreview.value) {
      notify('推演草稿尚未处理，请先采用或丢弃')
      return false
    }
    cancelWritingAgent()
    dismissAuxiliary()
    closeBlockComposer()
    if (!openBook(bookId)) return false
    closeChapterDrawer()
    return true
  }

  function consumeActivationBoundary() {
    if (!pendingActivationBoundary) return false
    pendingActivationBoundary = false
    return true
  }

  return {
    loadBooks,
    saveBooks,
    ensureInitialBookSelection,
    activateBook,
    openBook,
    selectBook,
    consumeActivationBoundary
  }
}
