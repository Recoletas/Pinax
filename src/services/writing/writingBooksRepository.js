import { recoverAssistantEdits } from '../storage/assistantEditJournal.js'
import { createWritingBookRepository } from '@pinax/core/usecases/writingBookRepository'
import { normalizeManuscriptLanguage } from '../../../shared/writingLanguage.js'
import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult'
export const { normalizeWritingBook, loadWritingBooks, saveWritingBooksDurable, publishWritingBooks, saveWritingBooks, findWritingBook, createWritingBookRecord, updateWritingBook, renameWritingBook, deleteWritingBook, subscribeWritingBooks, currentWritingBooksRevision } = createWritingBookRepository({ getItem, setItem, writingBooksKey: STORAGE_KEYS.WRITING_BOOKS, normalizeManuscriptLanguage, mutationFailure, mutationSuccess, storageWriteFailure, recoverAssistantEdits })
