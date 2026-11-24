import { ownsWritingBooksLock, withWritingBooksLock } from './writingBooksLock.js'

// A large shelf keeps its full baseline in the existing key. Small chapter
// replacements are committed by one atomic setItem for this baseline's generation.
const shelfKey = 'writing_books'
const header = 'pinax:chapters:1:'
const changesPrefix = 'pinax:writing-changes:'
const largeShelf = 512 * 1024
const maxChanges = 192 * 1024
const cached = new WeakMap()
const sweepRequested = new WeakSet()
const corrupt = () => Object.assign(new Error('本机章节存储校验失败，原记录已保留。'), { code: 'WRITING_STORAGE_CORRUPT' })

export const isLargeBookShelf = raw => typeof raw === 'string' && (raw.length >= largeShelf || raw.startsWith('pinax:gzip:'))
export const isChapterShelf = raw => typeof raw === 'string' && raw.startsWith('pinax:chapters:')
export const isWritingChangesKey = key => typeof key === 'string' && key.startsWith(changesPrefix)

function changesKey(raw) {
  if (!raw?.startsWith(header)) return null
  const end = raw.indexOf('\n', header.length)
  const id = raw.slice(header.length, end)
  return end > 0 && /^[a-zA-Z0-9-]{1,64}$/.test(id) ? changesPrefix + id : null
}

// Activation stages the small record before publishing its generation. A
// crashed writer can leave it behind. Reclaim only under the same Web Lock
// used for staging, so an active writer never loses its unpublished record.
function sweepUnusedChanges(storage) {
  if (!ownsWritingBooksLock()) return
  const active = changesKey(storage.getItem(shelfKey))
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i)
    if (isWritingChangesKey(key) && key !== active) storage.removeItem(key)
  }
}

function scheduleSweep(storage) {
  if (!globalThis.navigator?.locks?.request || storage !== globalThis.localStorage || sweepRequested.has(storage)) return
  sweepRequested.add(storage)
  void withWritingBooksLock(() => sweepUnusedChanges(storage)).catch(() => sweepRequested.delete(storage))
}

// A restore must compare and retain both physical values. Reading the baseline
// again detects a whole-shelf replacement between the two storage reads.
export function captureStorageValue(storage, key) {
  let raw = storage.getItem(key)
  if (key !== shelfKey) return raw
  scheduleSweep(storage)
  for (let i = 0; i < 4; i++) {
    const keyForChanges = changesKey(raw)
    if (!keyForChanges) return raw
    const changes = storage.getItem(keyForChanges)
    const current = storage.getItem(key)
    if (current === raw) return { raw, keyForChanges, changes }
    raw = current
  }
  throw new Error('书架正在被其他页面修改，请重试')
}

export function storageValueMatches(storage, key, expected) {
  const current = captureStorageValue(storage, key)
  return current === expected || (current && expected && typeof current === 'object'
    && current.raw === expected.raw && current.changes === expected.changes)
}

// A successful full write invalidates the old generation. Restore retains it
// until all reviewed keys commit, so compensation can reinstate it verbatim.
export function releaseStorageValue(storage, key, previous) {
  if (key !== shelfKey || !previous?.keyForChanges) return
  cached.delete(storage)
  try {
    if (changesKey(storage.getItem(key)) !== previous.keyForChanges) storage.removeItem(previous.keyForChanges)
  } catch { /* The committed baseline is authoritative. A later locked sweep retries reclamation. */ }
}

export function reinstateStorageValue(storage, key, previous) {
  if (!previous || typeof previous !== 'object') {
    if (previous === null) storage.removeItem(key)
    else storage.setItem(key, previous)
    return
  }
  const current = storage.getItem(previous.keyForChanges)
  if (current !== previous.changes) {
    if (current !== null) throw new Error('恢复期间章节内容已变化')
    storage.setItem(previous.keyForChanges, previous.changes)
  }
  storage.setItem(key, previous.raw)
}

export function removeStoredValue(storage, key) {
  if (key !== shelfKey) return storage.removeItem(key)
  const previous = captureStorageValue(storage, key)
  storage.removeItem(key)
  releaseStorageValue(storage, key, previous)
  sweepRequested.delete(storage)
  scheduleSweep(storage)
}

function mergeChapters(books, edits) {
  // Books and chapters may contain legacy or user-defined fields. Copy only
  // the affected arrays and preserve every other value as stored.
  const merged = books.slice()
  const changedBooks = new Map()
  for (const edit of edits) {
    if (!Array.isArray(edit) || edit.length !== 3 || edit[1]?.id == null) throw corrupt()
    const [bookId, chapter, updatedAt] = edit
    let book = changedBooks.get(bookId)
    if (!book) {
      const i = merged.findIndex(row => String(row?.id) === bookId)
      if (i < 0) throw corrupt()
      book = { ...merged[i], chapters: [...merged[i].chapters] }
      merged[i] = book
      changedBooks.set(bookId, book)
    }
    const index = book.chapters.findIndex(row => String(row?.id) === String(chapter.id))
    if (index < 0) throw corrupt()
    book.chapters[index] = chapter
    book.updatedAt = updatedAt
  }
  return merged
}

// Parsed JSON has only scalar values, arrays and plain objects. Copy its
// containers so consumers can edit independently while sharing immutable
// strings, including the text of every chapter and structured writing unit.
function copyBooks(value) {
  const root = value.slice()
  const pending = [root]
  while (pending.length) {
    const container = pending.pop()
    for (const key of Object.keys(container)) {
      const child = container[key]
      if (!child || typeof child !== 'object') continue
      container[key] = Array.isArray(child) ? child.slice() : { ...child }
      pending.push(container[key])
    }
  }
  return root
}

// Workspace views share this snapshot. A new delta reuses most of the
// previous snapshot's frozen chapters; only new containers need a visit.
function freezeSnapshot(shelf) {
  const pending = [shelf]
  while (pending.length) {
    const node = pending.pop()
    if (Object.isFrozen(node)) continue
    Object.freeze(node)
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object' && !Object.isFrozen(child)) pending.push(child)
    }
  }
  return shelf
}

export function createBookReadViews(books) {
  let snapshot
  return {
    copy: () => copyBooks(books),
    snapshot(normalize) { return snapshot ??= freezeSnapshot(normalize(books)) }
  }
}

export function readChapterShelf(storage, state, decode) {
  if (!state?.keyForChanges || state.changes === null) throw corrupt()
  const prior = cached.get(storage)
  if (prior?.raw === state.raw && prior.changes === state.changes) return prior
  try {
    const books = prior?.raw === state.raw ? prior.books : JSON.parse(decode(state.raw.slice(state.raw.indexOf('\n') + 1)))
    const edits = JSON.parse(decode(state.changes))
    if (!Array.isArray(books) || !Array.isArray(edits) || !edits.length) throw corrupt()
    const merged = mergeChapters(books, edits)
    const entry = { raw: state.raw, changes: state.changes, books, edits, merged, views: createBookReadViews(merged) }
    cached.set(storage, entry)
    return entry
  } catch { throw corrupt() }
}

export function tryStoreChapter(storage, { bookId, original, chapter, updatedAt }, { decode, compact, normalizeBook }) {
  if (!ownsWritingBooksLock()) return false
  const state = captureStorageValue(storage, shelfKey)
  if (!state || !original || !chapter || String(original.id) !== String(chapter.id)) return false
  const active = typeof state === 'object'
  if (!active && (isChapterShelf(state) || !isLargeBookShelf(state))) return false
  const existing = active ? readChapterShelf(storage, state, decode) : null
  const books = existing?.merged ?? JSON.parse(decode(state))
  // The first full save of an older book also writes the normalized metadata
  // generated by the shared repository. Preserve that migration behavior.
  if (!active && (!Array.isArray(books) || books.some(book => {
    const normalized = normalizeBook(book)
    return !normalized || Object.keys(normalized).some(field => normalized[field] !== book[field])
  }))) return false
  const id = String(bookId)
  const matchingBooks = books.filter(row => String(row?.id) === id)
  const chapters = matchingBooks[0]?.chapters
  if (matchingBooks.length !== 1 || !Array.isArray(chapters)) return false
  const matches = chapters.filter(row => String(row?.id) === String(chapter.id))
  if (matches.length !== 1) return false
  if (JSON.stringify(matches[0]) !== JSON.stringify(original)) throw new Error('章节已被其他页面修改')
  const edits = (existing?.edits ?? []).filter(([owner, row]) => owner !== id || String(row.id) !== String(chapter.id))
  edits.push([id, chapter, updatedAt])
  const serialized = JSON.stringify(edits)
  if (serialized.length > maxChanges && edits.length > 1) return false
  const changes = serialized.length > maxChanges ? compact(serialized) : serialized
  if (changes.length > maxChanges) return false
  const generation = active ? null : globalThis.crypto?.randomUUID?.()
  if (!active && !generation) return false
  const keyForChanges = active ? state.keyForChanges : changesPrefix + generation
  const raw = active ? state.raw : header + generation + '\n' + compact(state)
  if (!active) sweepUnusedChanges(storage)
  if (!storageValueMatches(storage, shelfKey, state)) throw new Error('书架正在被其他页面修改，请重试')
  try {
    storage.setItem(keyForChanges, changes)
    if (!active) {
      if (storage.getItem(shelfKey) !== state) throw new Error('首次按章保存时书架已变化')
      storage.setItem(shelfKey, raw)
    }
  } catch (error) {
    if (!active) storage.removeItem(keyForChanges)
    if (error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014) return false
    throw error
  }
  if (storage.getItem(shelfKey) !== raw) throw new Error('保存期间书架已切换')
  return true
}
