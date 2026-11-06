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
  return {
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
      if (!available()) return memory.write(changes, options)
      const stores = Object.keys(changes)
      if (!stores.length) return { ok: true, durable: true }
      return transact(stores, 'readwrite', transaction => {
        for (const [name, change] of Object.entries(changes)) {
          const store = transaction.objectStore(name)
          if (change.clear) store.clear()
          for (const record of change.put || []) store.put(record)
          for (const id of change.delete || []) store.delete(String(id))
        }
        return { ok: true, durable: true }
      }, options.signal)
    }
  }
}
