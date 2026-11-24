import { SOURCE_ARCHIVE_DB_NAME, SOURCE_ARCHIVE_DB_VERSION, SOURCE_ARCHIVE_STORES } from '@pinax/core/worldbook/sourceArchiveSchema'
import { createMemorySourceArchiveStore } from '@pinax/core/adapters/memorySourceArchiveStore'

// Only an absent IndexedDB uses volatile memory. An available but failed database never silently falls back.
export function createBrowserSourceArchiveStore({ getIndexedDB = () => globalThis.indexedDB } = {}) {
  const memory = createMemorySourceArchiveStore()
  const names = Object.values(SOURCE_ARCHIVE_STORES)
  const available = () => typeof getIndexedDB()?.open === 'function'
  function aborted() { const error = new Error('资料归档已取消'); error.name = 'AbortError'; return error }
  function open() {
    return new Promise((resolve, reject) => {
      const request = getIndexedDB().open(SOURCE_ARCHIVE_DB_NAME, SOURCE_ARCHIVE_DB_VERSION)
      let settled = false
      request.onupgradeneeded = () => {
        for (const name of names) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' })
      }
      request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; resolve(request.result) } }
      request.onerror = () => { settled = true; reject(request.error || new Error('无法打开来源归档')) }
      request.onblocked = () => { settled = true; reject(new Error('来源归档被其他连接占用，请关闭旧页面后重试')) }
    })
  }
  async function transact(stores, mode, work, signal) {
    if (signal?.aborted) throw aborted()
    const database = await open()
    return new Promise((resolve, reject) => {
      let transaction, value, settled = false
      const finish = (callback, result) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', cancel)
        database.close()
        callback(result)
      }
      const cancel = () => {
        try { transaction?.abort() } catch { /* transaction already ended */ }
        finish(reject, aborted())
      }
      try {
        transaction = database.transaction(stores, mode)
        transaction.oncomplete = () => finish(resolve, value)
        transaction.onerror = () => finish(reject, transaction.error || new Error('来源归档事务失败'))
        transaction.onabort = () => finish(reject, signal?.aborted ? aborted() : transaction.error || new Error('来源归档事务中止'))
        if (signal?.aborted) { cancel(); return }
        signal?.addEventListener('abort', cancel, { once: true })
        value = work(transaction)
      } catch (error) {
        try { transaction?.abort() } catch { /* transaction already ended */ }
        finish(reject, error)
      }
    })
  }
  let memoryWrites = Promise.resolve()
  return {
    async readRestoreMatches(records, { signal } = {}) {
      const matches = Object.fromEntries(names.map(name => [name, new Map()]))
      const stores = names.filter(name => records[name]?.length)
      if (!stores.length) return matches
      if (!available()) {
        return memoryWrites.then(async () => {
          for (const name of stores) {
            const rows = await memory.readMany(name, records[name].map(row => row.id))
            for (const row of rows) if (row) matches[name].set(row.id, row)
          }
          return matches
        })
      }
      return transact(stores, 'readonly', transaction => {
        for (const name of stores) {
          const store = transaction.objectStore(name)
          const ids = records[name].map(row => row.id)
          const readOne = id => {
            const request = store.get(id)
            request.onsuccess = () => { if (request.result) matches[name].set(id, request.result) }
          }
          if (ids.length < 64) { ids.forEach(readOne); continue }
          const count = store.count()
          count.onsuccess = () => {
            if (!count.result) return
            if (ids.length < count.result) { ids.forEach(readOne); return }
            // Fetch all values only after the keys establish complete coverage
            // in this same transaction. An unrelated row must stay unloaded.
            const keys = store.getAllKeys()
            keys.onsuccess = () => {
              const wanted = new Set(ids)
              const common = keys.result.filter(id => wanted.has(id))
              if (common.length !== keys.result.length) { common.forEach(readOne); return }
              const rows = store.getAll()
              rows.onsuccess = () => { for (const row of rows.result) matches[name].set(row.id, row) }
            }
          }
        }
        return matches
      }, signal)
    },
    async countRecords() {
      if (!available()) {
        const records = await memory.snapshot()
        return Object.fromEntries(names.map(name => [name, records[name].length]))
      }
      return transact(names, 'readonly', transaction => {
        const counts = {}
        for (const name of names) {
          const request = transaction.objectStore(name).count()
          request.onsuccess = () => { counts[name] = request.result }
        }
        return counts
      })
    },
    async readReferencedArtifacts(ids) {
      const keys = [...new Set(ids.map(String))].sort()
      const artifacts = [], chunks = new Map()
      if (!keys.length) return { artifacts, chunks }
      if (!available()) {
        const snapshot = memoryWrites.then(async () => {
          const found = await memory.readMany(SOURCE_ARCHIVE_STORES.artifacts, keys)
          artifacts.push(...found.filter(Boolean))
          const chunkIds = [...new Set(artifacts.flatMap(artifact => artifact.chunkIds || []).map(String))]
          const records = await memory.readMany(SOURCE_ARCHIVE_STORES.chunks, chunkIds)
          records.forEach(chunk => { if (chunk) chunks.set(String(chunk.id), chunk) })
          return { artifacts, chunks }
        })
        memoryWrites = snapshot.catch(() => {})
        return snapshot
      }
      return transact([SOURCE_ARCHIVE_STORES.artifacts, SOURCE_ARCHIVE_STORES.chunks], 'readonly', transaction => {
        const sources = transaction.objectStore(SOURCE_ARCHIVE_STORES.artifacts)
        const pieces = transaction.objectStore(SOURCE_ARCHIVE_STORES.chunks)
        const requested = new Set()
        for (const key of keys) {
          const source = sources.get(key)
          source.onsuccess = () => {
            const artifact = source.result
            if (!artifact) return
            artifacts.push(artifact)
            for (const id of (artifact.chunkIds || []).map(String)) {
              if (requested.has(id)) continue
              requested.add(id)
              const piece = pieces.get(id)
              piece.onsuccess = () => { if (piece.result) chunks.set(id, piece.result) }
            }
          }
        }
        return { artifacts, chunks }
      })
    },
    async readAll(name) {
      if (!available()) return memory.readAll(name)
      const result = await transact([name], 'readonly', transaction => {
        const output = { records: [] }
        const request = transaction.objectStore(name).getAll()
        request.onsuccess = () => { output.records = request.result }
        return output
      })
      return result.records
    },
    async readMany(name, ids) {
      if (!available()) return memory.readMany(name, ids)
      return transact([name], 'readonly', transaction => {
        const records = []
        ids.forEach((id, index) => {
          const request = transaction.objectStore(name).get(String(id))
          request.onsuccess = () => { records[index] = request.result }
        })
        return records
      })
    },
    async snapshot() {
      if (!available()) return memory.snapshot()
      return transact(names, 'readonly', transaction => {
        const records = {}
        for (const name of names) {
          const request = transaction.objectStore(name).getAll()
          request.onsuccess = () => { records[name] = request.result }
        }
        return records
      })
    },
    async write(changes, options = {}) {
      const { expected, skipConflicts, signal } = options
      const matches = (name, id, current) => !expected || JSON.stringify(current ?? null) === JSON.stringify(expected[name].get(id) ?? null)
      if (!available()) {
        const next = memoryWrites.then(async () => {
          if (!expected) return memory.write(changes, options)
          const guarded = {}, result = { ok: true, conflicts: 0 }
          for (const [name, change] of Object.entries(changes)) {
            guarded[name] = { put: [], delete: [] }
            for (const [id, record] of [...(change.put || []).map(record => [record.id, record]), ...(change.delete || []).map(id => [id, null])]) {
              const [current] = await memory.readMany(name, [id])
              if (matches(name, id, current)) {
                if (record) guarded[name].put.push(record)
                else guarded[name].delete.push(id)
              } else if (skipConflicts) result.conflicts++
              else throw new Error('来源归档在恢复期间已变化')
            }
          }
          await memory.write(guarded, { signal })
          return result
        })
        memoryWrites = next.catch(() => {})
        return next
      }
      const stores = Object.keys(changes)
      if (!stores.length) return { ok: true, durable: true }
      return transact(stores, 'readwrite', transaction => {
        const result = { ok: true, durable: true, conflicts: 0 }
        for (const [name, change] of Object.entries(changes)) {
          const store = transaction.objectStore(name)
          if (change.clear) store.clear()
          const write = (id, record) => {
            const apply = () => record ? store.put(record) : store.delete(id)
            if (!expected) { apply(); return }
            const request = store.get(id)
            request.onsuccess = () => {
              if (matches(name, id, request.result)) {
                try { apply() } catch { transaction.abort() }
              }
              else if (skipConflicts) result.conflicts++
              else transaction.abort()
            }
          }
          for (const record of change.put || []) write(record.id, record)
          for (const id of change.delete || []) write(String(id), null)
        }
        return result
      }, signal)
    }
  }
}
