import { readCommittedItem, recoverAssistantEdits, writeCommittedItem } from '../storage/assistantEditJournal.js'
import { readBookSnapshot, readLayeredChapter, writeChapterChange } from '../storage/writingStorageCodec.js'
import { createWritingBookRepository } from '@pinax/core/usecases/writingBookRepository'
import { normalizeManuscriptLanguage } from '../../../shared/writingLanguage.js'
import { STORAGE_KEYS } from '../../composables/useStorage'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult'
export const { normalizeWritingBook, loadWritingBooks, saveWritingBooksDurable, publishWritingBooks, saveWritingBooks, findWritingBook, createWritingBookRecord, updateWritingBook, renameWritingBook, deleteWritingBook, subscribeWritingBooks, currentWritingBooksRevision } = createWritingBookRepository({ getItem: readCommittedItem, setItem: writeCommittedItem, writingBooksKey: STORAGE_KEYS.WRITING_BOOKS, normalizeManuscriptLanguage, mutationFailure, mutationSuccess, storageWriteFailure, recoverAssistantEdits })

const normalizeBooks = rows => Array.isArray(rows) ? rows.map(normalizeWritingBook).filter(Boolean) : []

// For views that only inspect books. Writers use loadWritingBooks() for a
// private mutable copy. Both paths observe the last committed assistant edit.
export function loadWritingBooksSnapshot() {
  recoverAssistantEdits()
  return readCommittedItem(STORAGE_KEYS.WRITING_BOOKS, () => {
    try { return readBookSnapshot(localStorage, normalizeBooks) }
    catch (error) {
      if (error?.code === 'WRITING_STORAGE_CORRUPT') throw error
      return []
    }
  }, normalizeBooks)
}

export function loadWritingChapter(bookId, chapterId) {
  recoverAssistantEdits()
  const select = books => findWritingBook(books, bookId)?.chapters?.find(row => String(row.id) === String(chapterId)) || null
  return readCommittedItem(STORAGE_KEYS.WRITING_BOOKS, () => {
    const chapter = readLayeredChapter(localStorage, bookId, chapterId)
    return chapter === undefined ? select(loadWritingBooks()) : chapter
  }, select)
}

export function persistWritingChapterChange(change) {
  return writeChapterChange(localStorage, change, normalizeWritingBook)
}
