import { createWritingNotesRepository } from '@pinax/core/usecases/writingNotesRepository'
import { getItem, setItem, STORAGE_KEYS } from '../../../composables/useStorage'
export const { listWritingNotes, buildWritingNoteTitle, createWritingNote, createWritingNoteFromAsset, prependWritingNote, replaceWritingNotes } = createWritingNotesRepository({ getItem, setItem, writingNotesKey: STORAGE_KEYS.WRITING_NOTES })
