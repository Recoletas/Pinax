import { randomUUID } from '../../../shared/randomId.js'
import { getItem, setItem, STORAGE_KEYS } from '../../composables/useStorage'
import { openLedgerDb, closeLedgerDb } from './ledger/ledgerDb'
import { createMemoryHistoryRepository } from '@pinax/core/memory/memoryHistoryStore'
export { MEMORY_HISTORY_DB } from '@pinax/core/memory/ledgerSchema'
async function transact(mode, run) {
  const opened = await openLedgerDb()
  if (!opened.ok) throw new Error(opened.detail || '历史数据库不可用；新修订暂存于本地恢复队列')
  try { return await opened.db.transaction(mode, 'revisions', () => run(opened.db.table('revisions'))) }
  finally { closeLedgerDb(opened.db) }
}
export const { commitMemorySnapshot, validateMemoryHistory, readMemoryHistory, importMemoryHistory, rollbackImportedMemoryHistory, collectMemoryHistory, flushMemoryHistory, memoryHistoryHealth, historicalCandidatePatch, publicMemoryCandidate } = createMemoryHistoryRepository({ randomUUID, getItem, setItem, memoryKey: STORAGE_KEYS.MEMORY_CANDIDATES, transact, defaultStorage: () => globalThis.localStorage, hasArchive: () => Boolean(globalThis.indexedDB) })
