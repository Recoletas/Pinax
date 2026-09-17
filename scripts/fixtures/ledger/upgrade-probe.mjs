import Dexie from 'dexie'

// Test fixture (AX04/XA-G05): declares a FUTURE schema version (v3) of the
// ledger database so a real two-connection blocked-upgrade can be exercised
// in the browser. Served by the dev server under /scripts/fixtures/; never
// imported by production code.
export function openFutureVersion(name) {
  const db = new Dexie(name)
  db.version(1).stores({ revisions: 'id, candidateId' })
  db.version(2).stores({
    revisions: 'id, candidateId',
    evidenceSnapshots: 'id, scopeKey, sourceId, [scopeKey+sourceId]',
    factProposals: 'id, scopeKey, status, fingerprint, [scopeKey+status]',
    factVersions: 'id, scopeKey, factKey, [scopeKey+factKey], [scopeKey+subjectKey], [scopeKey+recordedSeq]',
    factDecisions: 'id, scopeKey, commandId, [scopeKey+recordedSeq]',
    rejectionMarks: 'id, scopeKey, fingerprint, [scopeKey+fingerprint]',
    ledgerMeta: 'id',
    turnReceipts: 'receiptId, scopeKey, commandId, [scopeKey+archivedSeq]'
  })
  db.version(3).stores({
    revisions: 'id, candidateId',
    probeFuture: 'id'
  })
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
