import { loadWritingBooks, loadWritingChapter, persistWritingChapterChange, publishWritingBooks, saveWritingBooksDurable } from '../services/writing/writingBooksRepository'
import { desktopManuscript, manuscriptText } from '../services/writing/desktopManuscript.js'
import { tr } from '../i18n/index.js'
import { chapterRevision } from '@pinax/core'
import { mergeWritingBookChanges } from '../services/writing/mergeWritingBookChanges.js'
import { publishAcceptedAuthoringBookId } from '../services/writing/acceptedAuthoringBook.js'
import { getExplorationDocument } from '../services/writing/authoringDocumentRepository.js'

// Owns the book-level activation transaction. Chapter hydration and editor DOM
// work remain adapters supplied by Authoring because they belong to the editor.
export function useAuthoringBookActivation({
  route,
  canSwitchProject = () => true,
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
  persistDualBeforeBookChange,
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

  let pageBaseline = []
  const manuscriptFiles = new Map()
  const fileKey = (bookId, chapterId) => JSON.stringify([bookId, chapterId])
  function acceptPageBooks(nextBooks) {
    books.value = nextBooks
    pageBaseline = JSON.parse(JSON.stringify(nextBooks))
  }

  function rejectConcurrentChange() {
    notify?.(tr('其他页面已修改这份稿件，当前输入保留在稿面。请导出或保留恢复稿后重新打开。'))
    return false
  }

  // Accept only the chapter about to be opened. Other rows still belong to
  // the page's current view (a second editor can be working on one of them).
  function refreshChapterForSelection(bookId, chapterId) {
    const findBook = list => list.find(book => String(book.id) === String(bookId))
    const matches = chapter => String(chapter.id) === String(chapterId)
    let stored = loadWritingChapter(bookId, chapterId)
    const original = findBook(pageBaseline)?.chapters
    const local = findBook(books.value)?.chapters
    const baseIndex = original?.findIndex(matches) ?? -1
    const localIndex = local?.findIndex(matches) ?? -1
    if (!stored || baseIndex < 0 || localIndex < 0) return null
    const before = JSON.stringify(original[baseIndex])
    const key = fileKey(bookId, chapterId)
    try {
      const file = desktopManuscript({ action: 'read', bookId, chapterId })
      if (!file && manuscriptFiles.has(key)) { notify?.(tr('请先重新打开此作品的项目文件夹。')); return null }
      if (file) {
        if (manuscriptText(stored).replace(/\n+$/, '') !== file.text.replace(/\n+$/, '')) {
          // Keep the editor metadata whenever its text still matches. External
          // text must replace old node data before the editor reads the chapter.
          const edited = JSON.stringify(local[localIndex])
          if (edited !== before && edited !== JSON.stringify(stored)) { rejectConcurrentChange(); return null }
          const changed = { ...stored, content: file.text, contentFormat: 'md', revision: chapterRevision(stored) + 1 }
          delete changed.editorDocument
          delete changed.editorDocumentSchemaVersion
          if (!persistWritingChapterChange({ bookId, original: stored, chapter: changed, updatedAt: findBook(books.value)?.updatedAt })) {
            const fresh = loadWritingBooks()
            const target = findBook(fresh)
            const index = target?.chapters.findIndex(matches) ?? -1
            if (index < 0 || JSON.stringify(target.chapters[index]) !== JSON.stringify(stored)) { rejectConcurrentChange(); return null }
            target.chapters[index] = changed
            if (!saveWritingBooksDurable(fresh).ok) { notify?.(tr('无法更新本机章节索引。')); return null }
          }
          stored = changed
        }
        manuscriptFiles.set(key, file)
      }
    } catch (error) {
      notify?.(error.message)
      return null
    }
    const latest = JSON.stringify(stored)
    if (before !== latest) {
      const edited = JSON.stringify(local[localIndex])
      if (edited !== before && edited !== latest) { rejectConcurrentChange(); return null }
      local[localIndex] = stored
      original[baseIndex] = JSON.parse(latest)
    }
    chapters.value = local
    return local[localIndex]
  }

  function saveChapterChange(fresh, { bookId, chapterId, method, expectedRevision }) {
    const findBook = list => list.find(book => String(book.id) === String(bookId))
    const indexOfChapter = book => book.chapters.findIndex(chapter => String(chapter.id) === String(chapterId))
    const storedBook = findBook(fresh)
    const baseBook = findBook(pageBaseline)
    const pageBook = findBook(books.value)
    if (!storedBook || !baseBook || !pageBook) return rejectConcurrentChange()
    const storedIndex = indexOfChapter(storedBook)
    const baseIndex = indexOfChapter(baseBook)
    const stored = storedBook.chapters[storedIndex]
    const original = baseBook.chapters[baseIndex]
    if (method === 'create') {
      if (stored || original) return rejectConcurrentChange()
    } else if (!stored || !original || chapterRevision(stored) !== expectedRevision || JSON.stringify(stored) !== JSON.stringify(original)) {
      return rejectConcurrentChange()
    }
    const edited = pageBook.chapters[indexOfChapter(pageBook)]
    if (method !== 'remove' && !edited) return false
    const apply = (list, index, value) => {
      if (method === 'create') list.push(value)
      else if (method === 'remove') list.splice(index, 1)
      else list[index] = value
    }
    if (method === 'create' || (method === 'update' && manuscriptText(original) !== manuscriptText(edited))) {
      const key = fileKey(bookId, chapterId)
      try {
        const file = manuscriptFiles.get(key)
        if (method === 'create') {
          const result = desktopManuscript({ action: 'create', bookId, chapterId, title: edited.title || '', text: manuscriptText(edited) })
          if (result) manuscriptFiles.set(key, result)
        } else if (file) {
          const result = desktopManuscript({
            action: 'write', bookId, chapterId, projectId: file.projectId,
            revision: file.revision, contentHash: file.contentHash, text: manuscriptText(edited)
          })
          manuscriptFiles.set(key, { ...file, ...result })
        } else if (desktopManuscript({ action: 'read', bookId, chapterId })) {
          notify?.(tr('请先从项目文件重新打开这章，再保存修改。'))
          return false
        }
      } catch (error) {
        notify?.(error.code === 'DESKTOP_STALE_REVISION'
          ? tr('章节文件已在外部修改。当前输入保留，请对照文件后再保存。')
          : error.message)
        return false
      }
    }
    apply(storedBook.chapters, storedIndex, edited)
    storedBook.updatedAt = pageBook.updatedAt
    const incremental = method === 'update' && persistWritingChapterChange({ bookId, original, chapter: edited, updatedAt: pageBook.updatedAt })
    if (incremental) publishWritingBooks(fresh)
    else if (!saveWritingBooksDurable(fresh).ok) return false
    apply(baseBook.chapters, baseIndex, edited && JSON.parse(JSON.stringify(edited)))
    baseBook.updatedAt = pageBook.updatedAt
    return true
  }

  function saveBooks({ preserveOutlineBookId = '', chapterChange } = {}) {
    const fresh = loadWritingBooks()
    if (chapterChange) return saveChapterChange(fresh, chapterChange)
    const merged = mergeWritingBookChanges(pageBaseline, books.value, fresh, preserveOutlineBookId)
    if (!merged) return rejectConcurrentChange()
    if (!saveWritingBooksDurable(merged).ok) return false
    // An open editor still reflects its own page view. Do not advance its
    // baseline to remote content it has not loaded.
    pageBaseline = JSON.parse(JSON.stringify(books.value))
    return true
  }

  function loadBooks() {
    acceptPageBooks(loadWritingBooks())
    ensureInitialBookSelection()
  }

  function ensureInitialBookSelection() {
    if (selectedBookId.value) return
    const queryBookId = typeof route.query.bookId === 'string' ? route.query.bookId.trim() : ''
    const queryChapterId = typeof route.query.chapterId === 'string' ? route.query.chapterId.trim() : ''
    const queryExplorationId = typeof route.query.explorationId === 'string' ? route.query.explorationId.trim() : ''
    const returning = pendingBackJump.value || pendingInsertBack.value
    const requested = books.value.find((book) => String(book.id) === queryBookId)
    if (queryBookId && !requested && !returning) {
      clearEditorDocument()
      notify('指定作品已不存在，请从作品列表重新选择。')
      return
    }
    const legacyChapterBook = !queryBookId && queryChapterId && !returning
      ? books.value.find(book => book.chapters?.some(chapter => String(chapter.id) === queryChapterId))
      : null
    const preferred = requested || legacyChapterBook || books.value[0]
    if (!preferred) return
    if (returning) { openBook(preferred.id, { fromInitialLoad: true }); return }
    const validChapter = preferred.chapters?.some(chapter => String(chapter.id) === queryChapterId)
    const validExploration = queryExplorationId && getExplorationDocument(preferred.id, queryExplorationId)
    if ((queryExplorationId && !validExploration) || (!queryExplorationId && queryChapterId && !validChapter)) {
      openBook(preferred.id, { fromInitialLoad: true, empty: true })
      notify(queryExplorationId ? '指定速记已不存在或不属于这本书，请从目录重新选择。' : '指定章节已不存在或不属于这本书，请从目录重新选择。')
      return
    }
    openBook(preferred.id, { fromInitialLoad: true, chapterId: validChapter ? queryChapterId : '' })
  }

  function activateBook(bookId, { savePrevious = true } = {}) {
    if (!canSwitchProject(bookId)) { notify('请先完成或停止当前任务再切换作品'); return null }
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
    if (selectedBookId.value && selectedBookId.value !== bookId && persistDualBeforeBookChange?.() === false) return null
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
    publishAcceptedAuthoringBookId(bookId)
    dismissAuxiliary()
    clearPendingPersist()
    setAuthoringProjectId(bookId || '')
    void synchronizeWorldbook(nextBook, bookId)
    if (shouldRefreshAssetInbox()) refreshAssetInbox()
    return nextBook
  }

  function openBook(bookId, { fromInitialLoad = false, chapterId = '', empty = false } = {}) {
    const book = activateBook(bookId)
    if (!book) {
      if (fromInitialLoad) clearEditorDocument()
      return false
    }
    chapters.value = book.chapters || []
    const requestedChapter = chapterId ? chapters.value.find(chapter => String(chapter.id) === String(chapterId)) : null
    if (!empty && (requestedChapter || (!chapterId && chapters.value.length > 0))) {
      if (!selectChapter(requestedChapter?.id || chapters.value[0].id)) return false
    } else {
      pendingActivationBoundary = false
      clearEditorDocument()
      if (chapterId && !requestedChapter && !empty) notify('指定章节已不存在或不属于这本书，请从目录重新选择。')
    }
    markSaved()
    return true
  }

  function selectBook(bookId, options = {}) {
    if (!canSwitchProject(bookId)) { notify('请先完成或停止当前任务再切换作品'); return false }
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
    if (!openBook(bookId, options)) return false
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
    acceptPageBooks,
    refreshChapterForSelection,
    saveBooks,
    ensureInitialBookSelection,
    activateBook,
    openBook,
    selectBook,
    consumeActivationBoundary
  }
}
