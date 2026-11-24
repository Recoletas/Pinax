import { createJournaledWriteStore } from '@pinax/core'
import { getItem, getTextItem, setItem, removeItem } from '../../composables/useStorage.js'
import { sha256HexOfText } from './backupHash.js'
import { ownsWritingBooksLock, withWritingBooksLock } from './writingBooksLock.js'

const journalKey = 'pinax_assistant_edit_journal'
const ports = { getItem, setItem, removeItem, hashText: sha256HexOfText, journalKey }
const journal = createJournaledWriteStore(ports)
let insideIdbWriter = false
let committing = false
let recovery = null

const ownsLock = () => ownsWritingBooksLock() || insideIdbWriter
const lockUnavailable = () => Object.assign(new Error('当前浏览器暂时无法协调助手写入，请重试。'), { code: 'ASSISTANT_STORAGE_LOCK_UNAVAILABLE' })

// Non-secure origins can still use IndexedDB. A read-write transaction on a
// single empty store provides cross-tab exclusion for this synchronous commit.
// The transaction is released by the browser when its tab exits.
function withIdbWriter(action) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(lockUnavailable()); return }
    const open = indexedDB.open('pinax-assistant-write-lock', 1)
    let cancelled = false
    open.onblocked = () => { cancelled = true; reject(lockUnavailable()) }
    open.onerror = () => reject(open.error || lockUnavailable())
    open.onupgradeneeded = () => open.result.createObjectStore('writer')
    open.onsuccess = () => {
      const db = open.result
      if (cancelled) { db.close(); return }
      let tx
      try { tx = db.transaction('writer', 'readwrite') }
      catch (error) { db.close(); reject(error); return }
      tx.oncomplete = () => db.close()
      tx.onabort = () => { db.close(); reject(tx.error || lockUnavailable()) }
      const acquire = tx.objectStore('writer').get('lock')
      acquire.onsuccess = () => {
        insideIdbWriter = true
        try {
          const result = action()
          if (result?.then) throw new Error('助手落盘必须同步完成')
          resolve(result)
        } catch (error) { reject(error) }
        finally { insideIdbWriter = false }
      }
    }
  })
}

function withJournalOwnership(action) {
  if (ownsLock()) return action()
  if (globalThis.navigator?.locks?.request) return withWritingBooksLock(action)
  return withIdbWriter(action)
}

export function withAssistantJournalLock(action) {
  return withJournalOwnership(() => {
    if (!committing) journal.recover()
    return action()
  })
}

export function recoverAssistantEditsBeforeOpen() {
  if (committing || !getTextItem(journalKey)) return
  if (ownsLock()) { journal.recover(); return }
  if (!recovery) {
    recovery = Promise.resolve(withJournalOwnership(() => journal.recover()))
      .finally(() => { recovery = null })
  }
  return recovery
}

// A synchronous read cannot wait for a writer in another tab. Schedule actual
// crash recovery behind that writer. Readers use the committed projection below.
export function recoverAssistantEdits() {
  const pending = recoverAssistantEditsBeforeOpen()
  pending?.catch(() => {}) // data and journal remain available for the next retry
}

function pendingWrite(key) {
  const live = getItem(journalKey)
  if (live?.committed || !Array.isArray(live?.writes)) return null
  const write = live.writes.find(item => item.key === key)
  return write ? { ...live, writes: [write] } : null
}

// Reuse Core's inverse-patch and hash validation with memory-only storage
// ports. A live transaction and an interrupted one expose the same last
// committed record until the physical writer or the recovery owner finishes.
function projectCommittedValue(pending, key) {
  let value = getItem(key)
  createJournaledWriteStore({
    ...ports,
    getItem: name => name === journalKey ? pending : value,
    setItem: (_name, prior) => { value = prior; return true },
    removeItem: name => { if (name !== journalKey) value = null }
  }).recover()
  return value
}

export function readCommittedItem(key, readPhysical = () => getItem(key), project = value => value) {
  // Retry when the owner publishes or removes the journal between our reads.
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = getTextItem(journalKey)
    if (!before) {
      const value = readPhysical()
      if (!getTextItem(journalKey)) return value
      continue
    }
    const current = JSON.parse(before)
    const write = !current?.committed && current?.writes?.find(item => item.key === key)
    try {
      const value = write ? project(projectCommittedValue({ ...current, writes: [write] }, key)) : readPhysical()
      if (getTextItem(journalKey) === before) return value
    } catch (error) {
      if (getTextItem(journalKey) === before) throw error
    }
  }
  throw new Error('助手正在更新这份数据，请重试。')
}

export function writeCommittedItem(key, value) {
  if (pendingWrite(key)) {
    recoverAssistantEdits()
    if (pendingWrite(key)) return false
  }
  return setItem(key, value)
}

export function removeCommittedItem(key) {
  if (pendingWrite(key)) {
    recoverAssistantEdits()
    if (pendingWrite(key)) throw lockUnavailable()
  }
  return removeItem(key)
}

export function persistAssistantEdits(...args) {
  return withAssistantJournalLock(() => {
    committing = true
    try { return journal.commit(...args) }
    finally { committing = false }
  })
}
