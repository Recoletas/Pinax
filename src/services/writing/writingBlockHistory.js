import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import {
  MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER,
  MAX_WRITING_BLOCK_HISTORY_STORAGE_CHARS,
  getWritingBlockHistoryStorageSize,
  normalizeWritingBlockHistory,
  normalizeWritingBlockHistoryEntry
} from '../../../shared/writingBlockHistoryContract.js'

function readHistory() {
  return normalizeWritingBlockHistory(getItem(STORAGE_KEYS.WRITING_BLOCK_HISTORY))
}

function writeHistory(values) {
  const normalized = normalizeWritingBlockHistory(values)
  const candidate = [...normalized]
  while (candidate.length > 1 && getWritingBlockHistoryStorageSize(candidate) > MAX_WRITING_BLOCK_HISTORY_STORAGE_CHARS) {
    candidate.pop()
  }
  if (getWritingBlockHistoryStorageSize(candidate) > MAX_WRITING_BLOCK_HISTORY_STORAGE_CHARS) {
    return { ok: false, reason: 'storage-budget-exceeded' }
  }
  if (!setItem(STORAGE_KEYS.WRITING_BLOCK_HISTORY, candidate)) {
    return { ok: false, reason: 'storage-write-failed' }
  }
  return { ok: true, entries: candidate }
}

export function listWritingBlockHistory(chapterId) {
  return readHistory().filter((entry) => String(entry.chapterId) === String(chapterId || ''))
}

export function appendWritingBlockHistory(entries) {
  const incoming = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeWritingBlockHistoryEntry(entry))
    .filter(Boolean)
  if (!incoming.length) return { ok: true, entries: readHistory() }
  return writeHistory([...incoming, ...readHistory()])
}

export function deleteWritingBlockHistoryForChapter(chapterId) {
  const id = String(chapterId || '')
  if (!id) return { ok: false, reason: 'missing-chapter-id' }
  return writeHistory(readHistory().filter((entry) => entry.chapterId !== id))
}

export function getWritingBlockHistoryLimit() {
  return MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER
}
