import { randomUUID } from '../../../shared/randomId.js'
import { getItem, setItem, STORAGE_KEYS } from '../../composables/useStorage'
import Dexie from 'dexie'

// The synchronous candidate owner commits its snapshot and history outbox in
// ONE localStorage write. IndexedDB owns archived revisions, never candidates.
// Outbox removal happens only after the IDB transaction completes. Retrying an
// interrupted drain is safe because event IDs are immutable and unique.
export const MEMORY_HISTORY_DB = 'pinax-memory-history'
const STORE = 'revisions'
let draining = null
let lastError = ''
const clone = value => JSON.parse(JSON.stringify(value))

function snapshot(item) {
  if (!item) return null
  const value = { ...item }
  delete value._historyPending
  delete value._historyHead
  return clone(value)
}

function semantic(item) {
  if (!item) return 'null'
  const value = snapshot(item)
  for (const key of ['updatedAt', 'recallCount', 'lastRecalledAt', 'syncStatus', 'remoteId', 'lastSyncedAt', 'lastSyncError']) delete value[key]
  return JSON.stringify(value)
}

function revision(item, previous, operation, parentId = null) {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    candidateId: String(item.id),
    parentId,
    recordedAt: Date.now(),
    operation,
    // Missing story dates stay unknown. A browser timestamp is NOT story time.
    storyTime: clone(item.metadata?.storyTime || { precision: 'unknown' }),
    before: snapshot(previous),
    after: snapshot(item)
  }
}

export function commitMemorySnapshot(items) {
  const current = getItem(STORAGE_KEYS.MEMORY_CANDIDATES) || []
  const prior = new Map((Array.isArray(current) ? current : []).map(item => [item.id, item]))
  const next = items.map(item => {
    const old = prior.get(item.id)
    const pending = [...(old?._historyPending || [])]
    let head = old?._historyHead || null
    if (old && !head) {
      const baseline = revision({ ...item, ...old, scope: item.scope, status: old.status || item.status }, null, 'legacy-baseline')
      pending.push(baseline)
      head = baseline.id
    }
    if (!old || semantic(old) !== semantic(item)) {
      const event = revision(item, old, old ? 'revision' : 'created', head)
      pending.push(event)
      head = event.id
    }
    return { ...item, _historyHead: head, _historyPending: pending }
  })
  if (!setItem(STORAGE_KEYS.MEMORY_CANDIDATES, next)) return false
  // Failure leaves the durable outbox intact and is exposed in the history UI.
  void flushMemoryHistory().catch(() => {})
  return true
}

async function transact(mode, run) {
  if (!globalThis.indexedDB) throw new Error('历史数据库不可用；新修订暂存于本地恢复队列')
  const db = new Dexie(MEMORY_HISTORY_DB)
  db.version(1).stores({ revisions: 'id, candidateId' })
  try {
    return await db.transaction(mode, STORE, () => run(db.table(STORE)))
  } finally { db.close() }
}

export function validateMemoryHistory(records) {
  if (!Array.isArray(records)) throw new Error('记忆历史必须是数组')
  const ids = new Set()
  for (const row of records) {
    if (!row || row.schemaVersion !== 1 || typeof row.id !== 'string' || !row.id
      || ids.has(row.id) || typeof row.candidateId !== 'string' || !row.candidateId
      || !Number.isFinite(row.recordedAt) || !row.after || row.after.id !== row.candidateId
      || !['created', 'legacy-baseline', 'revision'].includes(row.operation)
      || (row.parentId !== null && typeof row.parentId !== 'string')
      || !['global-author', 'project', 'session'].includes(row.after.scope)
      || !['pending', 'active', 'stale', 'rejected'].includes(row.after.status)
      || typeof row.after.content !== 'string') throw new Error('记忆历史格式损坏或版本不受支持')
    ids.add(row.id)
  }
  return records
}

export async function readMemoryHistory({ candidateId, scope, scopeId } = {}) {
  const records = await transact('r', store => candidateId
    ? store.where('candidateId').equals(candidateId).toArray() : store.toArray())
  return records.filter(row => (!scope || row.after.scope === scope)
    && (scopeId === undefined || row.after.scopeId === scopeId))
    .sort((a, b) => b.recordedAt - a.recordedAt || a.id.localeCompare(b.id))
}

export async function importMemoryHistory(records) {
  validateMemoryHistory(records)
  if (!records.length) return []
  const inserted = []
  // Immutable same-ID collisions must not overwrite history on import/retry.
  await transact('rw', async store => {
    for (const row of records) {
      const existing = await store.get(row.id)
      if (existing && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error('同一历史版本的内容不一致，已取消整批导入')
      if (!existing) { await store.add(clone(row)); inserted.push(row.id) }
    }
  })
  return inserted
}

// Compensation is restricted to IDs inserted by this restore, never a clear().
export async function rollbackImportedMemoryHistory(ids) {
  if (!ids.length) return
  await transact('rw', store => store.bulkDelete(ids))
}

export async function collectMemoryHistory(storage = localStorage) {
  const records = globalThis.indexedDB ? await readMemoryHistory() : []
  const byId = new Map(records.map(row => [row.id, row]))
  const items = JSON.parse(storage.getItem(STORAGE_KEYS.MEMORY_CANDIDATES) || '[]')
  for (const row of items.flatMap(item => item._historyPending || [])) {
    if (byId.has(row.id) && JSON.stringify(byId.get(row.id)) !== JSON.stringify(row)) throw new Error('记忆历史存在冲突版本')
    byId.set(row.id, row)
  }
  return validateMemoryHistory([...byId.values()])
}

export async function flushMemoryHistory() {
  if (draining) return draining
  draining = (async () => {
    for (;;) {
      const items = getItem(STORAGE_KEYS.MEMORY_CANDIDATES) || []
      const pending = items.flatMap(item => item._historyPending || [])
      if (!pending.length) { lastError = ''; return }
      await importMemoryHistory(pending)
      const archived = new Set(pending.map(row => row.id))
      // Re-read after await: never replace newer candidate edits with old data.
      const latest = getItem(STORAGE_KEYS.MEMORY_CANDIDATES) || []
      const next = latest.map(item => ({ ...item,
        _historyPending: (item._historyPending || []).filter(row => !archived.has(row.id)) }))
      if (!setItem(STORAGE_KEYS.MEMORY_CANDIDATES, next)) throw new Error('历史已归档，本地恢复队列清理失败；可重试')
    }
  })().catch(error => { lastError = error.message; throw error }).finally(() => { draining = null })
  return draining
}

export function memoryHistoryHealth() {
  const items = getItem(STORAGE_KEYS.MEMORY_CANDIDATES) || []
  return { error: lastError, pending: items.reduce((n, item) => n + (item._historyPending?.length || 0), 0) }
}

// Historical versions are review material, never automatic model context.
// Restoring old content must go through the candidate owner as a NEW pending revision.
export function historicalCandidatePatch(row) {
  return { content: row.after.content, status: 'pending', authority: 'derived',
    sourceRefs: row.after.sourceRefs || [], sourceRef: row.after.sourceRef || '',
    sourceRevision: row.after.sourceRevision || '',
    metadata: { ...row.after.metadata, restoredFromHistory: row.id },
    syncStatus: 'local-only' }
}

export const publicMemoryCandidate = snapshot
