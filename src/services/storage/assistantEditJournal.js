import { createJournaledWriteStore } from '@pinax/core'
import { getItem, setItem, removeItem } from '../../composables/useStorage.js'
import { sha256HexOfText } from './backupHash.js'

const journal = createJournaledWriteStore({ getItem, setItem, removeItem, hashText: sha256HexOfText, journalKey: 'pinax_assistant_edit_journal' })
export const recoverAssistantEdits = journal.recover
export const persistAssistantEdits = journal.commit
