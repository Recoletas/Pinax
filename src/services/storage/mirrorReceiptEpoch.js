// Written only by an explicit bookshelf restore. A delayed mirror response
// carries its original epoch and cannot grant a restored copy a newer baseline.
import { canonicalJson } from '../../../shared/collaboration/canonicalJson.js'
import { STORAGE_KEYS } from '../../composables/useStorage.js'

const prefix = STORAGE_KEYS.LOCAL_MIRROR_RECEIPTS + ':shelf:'
export const mirrorEpochKey = bookId => prefix + String(bookId)
export const isMirrorDeviceKey = key => key === STORAGE_KEYS.LOCAL_MIRROR_RECEIPTS || key.startsWith(prefix)
export const getMirrorEpoch = (bookId, storage = localStorage) => storage.getItem(mirrorEpochKey(bookId)) || ''

function booksById(raw) {
  try {
    const books = JSON.parse(raw)
    const byId = new Map()
    for (const book of Array.isArray(books) ? books : []) {
      const id = String(book?.id ?? '').trim()
      if (!id) continue
      if (!byId.has(id)) byId.set(id, [])
      byId.get(id).push(book)
    }
    return byId
  } catch {
    return new Map()
  }
}

export function mirrorRestoreBookIds(storage, before, after) {
  const restored = booksById(after)
  const previous = before === after ? restored : booksById(before)
  return [...new Set([...previous.keys(), ...restored.keys()])].filter(id => {
    // An explicit retry of a completed shelf write can settle its interrupted
    // receipt transition even if all of the book values already match.
    if (getMirrorEpoch(id, storage).startsWith('pending:')) return true
    if (previous === restored) return false
    return !previous.has(id) || !restored.has(id) || canonicalJson(previous.get(id)) !== canonicalJson(restored.get(id))
  })
}
