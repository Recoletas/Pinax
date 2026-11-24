// The logical value remains the exact JSON string. Only quota-constrained local
// writes use this representation. Backups, hashes and migration use logical text.
import { gzipSync, gunzipSync } from 'fflate'
import { captureStorageValue, createBookReadViews, isChapterShelf, isLargeBookShelf, readChapterShelf, releaseStorageValue, tryStoreChapter } from './writingChapterStorage.js'

const NAMESPACE = 'pinax:gzip:'
const PREFIX = NAMESPACE + '1:'
const MAX_BYTES = 256 * 1024 * 1024 // same bound as a desktop migration bundle
const eligible = key => key === 'writing_books' || key === 'pinax_assistant_edit_journal'
const cachedBooks = new WeakMap()
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value
})

function checksum(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8)
  return (~crc) >>> 0
}

function unpack(raw) {
  try {
    if (!raw.startsWith(PREFIX)) throw new Error('version')
    const binary = atob(raw.slice(PREFIX.length))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i)
    const trailer = new DataView(bytes.buffer, bytes.length - 8)
    const length = trailer.getUint32(4, true)
    if (length > MAX_BYTES) throw new Error('size')
    const inflated = gunzipSync(bytes)
    if (inflated.length !== length || checksum(inflated) !== trailer.getUint32(0, true)) throw new Error('checksum')
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(inflated)
  } catch (cause) {
    throw Object.assign(new Error('本机书稿压缩记录校验失败，原记录已保留。', { cause }), { code: 'WRITING_STORAGE_CORRUPT' })
  }
}

function pack(text) {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length > MAX_BYTES) return null
  const compressed = gzipSync(bytes, { level: 1, mtime: 0 })
  if (4 * Math.ceil(compressed.length / 3) + PREFIX.length >= text.length) return null
  const blocks = []
  for (let i = 0; i < compressed.length; i += 0x8000) {
    blocks.push(String.fromCharCode(...compressed.subarray(i, i + 0x8000)))
  }
  return PREFIX + btoa(blocks.join(''))
}

export function isPackedWritingText(key, raw) {
  return eligible(key) && typeof raw === 'string' && (raw.startsWith(NAMESPACE) || (key === 'writing_books' && isChapterShelf(raw)))
}

const decode = raw => raw.startsWith(NAMESPACE) ? unpack(raw) : raw

export function writeChapterChange(storage, change, normalizeBook) {
  return tryStoreChapter(storage, change, { decode, normalizeBook, compact(raw) {
    if (raw.startsWith(NAMESPACE)) return raw
    const packed = pack(raw)
    return packed && unpack(packed) === raw ? packed : raw
  } })
}

// Full-shelf consumers keep the historical JSON contract. Navigation can
// retrieve its target from a layered shelf without serializing every chapter.
export function readLayeredChapter(storage, bookId, chapterId) {
  const state = captureStorageValue(storage, 'writing_books')
  if (!state || typeof state !== 'object') return undefined
  const { merged } = readChapterShelf(storage, state, decode)
  const book = merged.find(row => String(row?.id).trim() === String(bookId))
  const chapter = book?.chapters?.find(row => String(row?.id) === String(chapterId))
  return chapter ? JSON.parse(JSON.stringify(chapter)) : null
}

function bookReadViews(storage, raw) {
  if (raw?.keyForChanges || isChapterShelf(raw)) {
    cachedBooks.delete(storage)
    return readChapterShelf(storage, raw, decode).views
  }
  if (!isLargeBookShelf(raw)) return null
  const prior = cachedBooks.get(storage)
  if (prior?.raw === raw && prior.views) return prior.views
  const text = readStoredText(storage, 'writing_books', raw)
  const books = JSON.parse(text)
  if (!Array.isArray(books)) return null
  const views = createBookReadViews(books)
  cachedBooks.set(storage, { raw, text, views })
  return views
}

export function readBookSnapshot(storage, normalize) {
  const raw = captureStorageValue(storage, 'writing_books')
  const views = bookReadViews(storage, raw)
  return views ? views.snapshot(normalize) : normalize(raw ? JSON.parse(readStoredText(storage, 'writing_books', raw)) : null)
}

// Object readers receive a private mutable shelf. A chapter autosave does
// not need to serialize all the unchanged UTF-8 text just to return objects.
export function readStoredJson(storage, key) {
  const raw = captureStorageValue(storage, key)
  const views = key === 'writing_books' && bookReadViews(storage, raw)
  if (views) return views.copy()
  const text = readStoredText(storage, key, raw)
  return text ? JSON.parse(text) : null
}

export function readStoredText(storage, key, raw = captureStorageValue(storage, key)) {
  if (key === 'writing_books' && (raw?.keyForChanges || isChapterShelf(raw))) {
    cachedBooks.delete(storage)
    const entry = readChapterShelf(storage, raw, decode)
    return entry.text ??= JSON.stringify(entry.merged)
  }
  if (!eligible(key)) return raw
  if (!raw?.startsWith(NAMESPACE)) {
    if (key === 'writing_books' && cachedBooks.get(storage)?.raw !== raw) cachedBooks.delete(storage)
    return raw
  }
  const cached = key === 'writing_books' && cachedBooks.get(storage)
  if (cached && cached.raw === raw) return cached.text
  const text = unpack(raw)
  if (key === 'writing_books') cachedBooks.set(storage, { raw, text })
  return text
}

// Restoring a reviewed backup can also repair a damaged local record. Keep
// its exact physical value as the conflict token until the replacement commits.
export function readRestoreComparison(storage, key) {
  try {
    return readStoredText(storage, key)
  } catch (error) {
    if (error?.code !== 'WRITING_STORAGE_CORRUPT') throw error
    const state = captureStorageValue(storage, key)
    return typeof state === 'string' ? state : 'pinax:damaged:' + JSON.stringify(state)
  }
}

export function writeStoredText(storage, key, text, { retainChapterChanges = false } = {}) {
  const previous = key === 'writing_books' ? captureStorageValue(storage, key) : null
  try {
    storage.setItem(key, text)
    if (key === 'writing_books') cachedBooks.delete(storage)
    if (!retainChapterChanges) releaseStorageValue(storage, key, previous)
    return text
  } catch (error) {
    if (!eligible(key) || text.length < 32768 || !(error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014)) throw error
    // A rejected setItem leaves the previous value intact. Replace that single
    // key only after an exact round trip, including on runtimes with UTF-8 quirks.
    const raw = pack(text)
    if (!raw || unpack(raw) !== text) throw error
    storage.setItem(key, raw)
    if (key === 'writing_books') cachedBooks.set(storage, { raw, text })
    if (!retainChapterChanges) releaseStorageValue(storage, key, previous)
    return raw
  }
}
