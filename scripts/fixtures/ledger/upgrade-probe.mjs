import Dexie from 'dexie'

import { LEDGER_V4_TABLES } from '../../../src/services/memory/ledger/ledgerDb.js'

// Seed the last released shape for the real blocked v4 → v5 upgrade.
export async function openVersion4(name) {
  const db = new Dexie(name)
  db.version(4).stores(LEDGER_V4_TABLES)
  await db.open()
  return db
}

// A raw IndexedDB connection holder simulating an OLD tab that keeps an
// older schema version alive and refuses versionchange.
export function holdOldConnection(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('revisions')) {
        db.createObjectStore('revisions', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { /* old tab ignores the upgrade request */ }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })
}

export function closeConnection(db) {
  if (db) db.close()
}

export function deleteDatabase(name) {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
}

export function countRevisionsRaw(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => {
      const db = request.result
      try {
        const tx = db.transaction('revisions', 'readonly')
        const countRequest = tx.objectStore('revisions').count()
        countRequest.onsuccess = () => { db.close(); resolve(countRequest.result) }
        countRequest.onerror = () => { db.close(); reject(countRequest.error) }
      } catch (error) {
        db.close()
        reject(error)
      }
    }
    request.onerror = () => reject(request.error)
  })
}

// Read through an EXISTING raw connection — while an upgrade request is
// blocked, NEW open requests queue indefinitely, so blocked-state data
// checks must ride the already-open connection.
export function readViaConnection(db, storeName, key) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).get(key)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    } catch (error) { reject(error) }
  })
}

export function countViaConnection(db, storeName) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    } catch (error) { reject(error) }
  })
}
