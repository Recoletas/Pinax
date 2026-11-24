import { createWritingRecoveryRepository } from '@pinax/core/usecases/writingRecoveryRepository'
import { normalizeStoredWritingSnapshots } from '@pinax/core/usecases/writingSnapshotRepository'
import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult.js'

const recoveryKey = STORAGE_KEYS.WRITING_RECOVERY_DRAFTS
const editorPrefix = recoveryKey + ':editor:'
const shared = createWritingRecoveryRepository({ getItem, setItem, recoveryKey, mutationFailure, mutationSuccess, storageWriteFailure })
export const saveWritingRecoveryDraft = shared.saveWritingRecoveryDraft

function tabDrafts() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(recoveryKey) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch { return [] }
}

function changeTabDrafts(matches, draft = null) {
  try {
    const rows = tabDrafts()
    const next = rows.filter(row => !matches(row))
    if (draft) next.unshift(draft)
    else if (rows.length === next.length) return true
    if (next.length) sessionStorage.setItem(recoveryKey, JSON.stringify(next))
    else sessionStorage.removeItem(recoveryKey)
    return true
  } catch { return false }
}

function editorDrafts() {
  const drafts = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(editorPrefix)) continue
      const draft = getItem(key)
      if (draft?.id && key === editorPrefix + draft.id) drafts.push(draft)
    }
  } catch { /* The session copy is still readable if local storage is unavailable. */ }
  return drafts
}

function matchesDocument(row, chapterId, bookId) {
  return (chapterId == null || String(row.chapterId) === String(chapterId))
    && (bookId == null || !row.bookId || String(row.bookId) === String(bookId))
}

function removeEditorDraft(id) {
  try { localStorage.removeItem(editorPrefix + id); return true } catch { return false }
}

export function listWritingRecoveryDrafts(chapterId = null, bookId = null) {
  const old = shared.listWritingRecoveryDrafts(chapterId)
  const candidates = [...tabDrafts(), ...editorDrafts()].filter(row => matchesDocument(row, chapterId, bookId))
  const current = normalizeStoredWritingSnapshots(candidates, chapterId)
  const rows = new Map()
  for (const row of [...old, ...current]) {
    const prior = rows.get(row.id)
    if (!prior || Date.parse(prior.createdAt) <= Date.parse(row.createdAt)) rows.set(row.id, row)
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function clearWritingRecoveryDraft(chapterId, bookId = null) {
  const result = shared.clearWritingRecoveryDraft(chapterId)
  if (result.ok) {
    const matches = row => matchesDocument(row, chapterId, bookId)
    for (const row of editorDrafts().filter(matches)) removeEditorDraft(row.id)
    changeTabDrafts(matches)
  }
  return result
}

// Single-key writes remain atomic even when two tabs are being terminated and
// the browser cannot wait for an asynchronous transaction.
export function createEditorRecoverySession(getBookId = () => '') {
  const session = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  const idFor = key => `draft:${session}:${JSON.stringify([getBookId(), key])}`
  function clear(id) {
    const removed = removeEditorDraft(id)
    const removedTab = changeTabDrafts(row => row.id === id)
    return removed && removedTab ? mutationSuccess() : storageWriteFailure({ resource: 'writing-recovery-drafts' })
  }
  return {
    save(draft) {
      const id = idFor(draft.chapterId)
      const record = { ...draft, id, bookId: getBookId() }
      const matches = row => row.id === id
      if (setItem(editorPrefix + id, record)) changeTabDrafts(matches)
      else if (!changeTabDrafts(matches, record)) return storageWriteFailure({ resource: 'writing-recovery-drafts' })
      return mutationSuccess({ snapshot: record })
    },
    clear(key) { return clear(idFor(key)) },
    discard(draft) {
      if (!draft?.id) return mutationSuccess()
      const rows = getItem(recoveryKey)
      if (Array.isArray(rows) && rows.some(row => row.id === draft.id)
        && !setItem(recoveryKey, rows.filter(row => row.id !== draft.id))) {
        return storageWriteFailure({ resource: 'writing-recovery-drafts' })
      }
      return clear(draft.id)
    }
  }
}
