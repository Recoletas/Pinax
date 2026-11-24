import { randomUUID } from '../../../shared/randomId.js'
import { getItem, setItem, STORAGE_KEYS } from '../../composables/useStorage'
import { openLedgerDb, closeLedgerDb, HISTORY_ACTIVITY_INDEX } from './ledger/ledgerDb'
import { createMemoryHistoryRepository } from '@pinax/core/memory/memoryHistoryStore'
export { MEMORY_HISTORY_DB } from '@pinax/core/memory/ledgerSchema'
async function transact(mode, run) {
  const opened = await openLedgerDb()
  if (!opened.ok) throw new Error(opened.detail || '历史数据库不可用；新修订暂存于本地恢复队列')
  try { return await opened.db.transaction(mode, 'revisions', () => run(opened.db.table('revisions'))) }
  finally { closeLedgerDb(opened.db) }
}
export const { commitMemorySnapshot, validateMemoryHistory, readMemoryHistory, importMemoryHistory, rollbackImportedMemoryHistory, collectMemoryHistory, flushMemoryHistory, memoryHistoryHealth, historicalCandidatePatch, publicMemoryCandidate } = createMemoryHistoryRepository({ randomUUID, getItem, setItem, memoryKey: STORAGE_KEYS.MEMORY_CANDIDATES, transact, defaultStorage: () => globalThis.localStorage, hasArchive: () => Boolean(globalThis.indexedDB) })

// IndexedDB orders equal timestamps by primary key. The original history
// orders them with localeCompare, so finish a boundary group once and carry
// its remaining rows into the next page. The cursor is local to this panel.
export async function readMemoryActivity({ scope, scopeId, limit = 30, cursor = null }) {
  if (typeof scope !== 'string' || typeof scopeId !== 'string' || !Number.isSafeInteger(limit) || limit < 1
    || (cursor && (cursor.scope !== scope || cursor.scopeId !== scopeId))) {
    throw new TypeError('无效的历史范围或条数')
  }
  const before = cursor?.before ?? Infinity
  const queued = cursor?.remaining || []
  const offset = cursor?.offset || 0
  function page(rows, nextCursor) {
    return { rows, hasMore: Boolean(nextCursor), nextCursor }
  }
  if (queued.length - offset > limit) {
    return page(queued.slice(offset, offset + limit), { ...cursor, offset: offset + limit })
  }
  const carried = queued.slice(offset)
  return transact('r', async table => {
    const index = table.where(HISTORY_ACTIVITY_INDEX)
    const room = limit - carried.length
    let batch = await index.between([scope, scopeId, -Infinity], [scope, scopeId, before], true, false)
      .reverse().limit(room + 1).toArray()
    const more = batch.length > room
    if (more && room === 0) return page(carried, { scope, scopeId, before, remaining: [] })
    const boundary = more ? batch[room - 1].recordedAt : null
    if (more && batch[room].recordedAt === boundary) {
      const tied = await index.equals([scope, scopeId, boundary]).toArray()
      batch = batch.filter(row => row.recordedAt > boundary).concat(tied)
    } else if (more) {
      batch.pop()
    }
    // The old full-table read used ascending primary keys before its stable
    // locale sort. Imported IDs can compare equal in a locale yet be distinct.
    batch.sort((a, b) => b.recordedAt - a.recordedAt || a.id.localeCompare(b.id) || indexedDB.cmp(a.id, b.id))
    const rows = carried.concat(batch.slice(0, room))
    return page(rows, more ? { scope, scopeId, before: boundary, remaining: batch.slice(room) } : null)
  })
}
