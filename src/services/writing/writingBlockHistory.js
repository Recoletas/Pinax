import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import {
  MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER,
  MAX_WRITING_BLOCK_HISTORY_STORAGE_CHARS,
  getWritingBlockHistoryStorageSize,
  mergeWritingBlockHistoryEntries,
  normalizeWritingBlockHistory,
  normalizeWritingBlockHistoryEntry
} from '../../../shared/writingBlockHistoryContract.js'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult.js'

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
    return mutationFailure('storage-budget-exceeded')
  }
  if (!setItem(STORAGE_KEYS.WRITING_BLOCK_HISTORY, candidate)) {
    return storageWriteFailure({ resource: 'writing-block-history' })
  }
  return mutationSuccess({ entries: candidate })
}

export function listWritingBlockHistory(chapterId) {
  return readHistory().filter((entry) => String(entry.chapterId) === String(chapterId || ''))
}

// NC03：默认把同章同块、窗口内的连续 manual-save 合并为一条编辑会话，
// 保留起点 previousText 与最新 currentText；离章/恢复等边界用
// closeWritingBlockHistorySessions 显式封组，封组后的下一次保存另起新条。
export function appendWritingBlockHistory(entries, options = {}) {
  const mergeSessions = options.mergeSessions !== false
  const windowMs = Number.isFinite(Number(options.windowMs)) ? Number(options.windowMs) : undefined
  const incoming = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeWritingBlockHistoryEntry(entry))
    .filter(Boolean)
  if (!incoming.length) return mutationSuccess({ entries: readHistory() })
  if (!mergeSessions) return writeHistory([...incoming, ...readHistory()])

  const merged = [...readHistory()]
  for (const entry of incoming) {
    const index = merged.findIndex((candidate) => (
      candidate.source === 'manual-save'
      && entry.source === 'manual-save'
      && !candidate.sessionClosedAt
      && String(candidate.chapterId) === String(entry.chapterId)
      && String(candidate.unitId || '') === String(entry.unitId || '')
      && String(candidate.nodeId) === String(entry.nodeId)
      && Boolean(mergeWritingBlockHistoryEntries(candidate, entry, windowMs === undefined ? {} : { windowMs }))
    ))
    if (index === -1) {
      merged.unshift(entry)
      continue
    }
    merged[index] = mergeWritingBlockHistoryEntries(
      merged[index],
      entry,
      windowMs === undefined ? {} : { windowMs }
    )
  }
  return writeHistory(merged)
}

// NC03：边界封组（切章/新建章/换书）。封组条目不再接受合并；只影响
// 后续保存的新会话，不改动任何既有文本内容。
export function closeWritingBlockHistorySessions({ chapterId = '' } = {}) {
  const current = readHistory()
  let changed = 0
  const next = current.map((entry) => {
    if (entry.source !== 'manual-save' || entry.sessionClosedAt) return entry
    if (chapterId && String(entry.chapterId) !== String(chapterId)) return entry
    changed += 1
    return { ...entry, sessionClosedAt: new Date().toISOString() }
  })
  if (!changed) return mutationSuccess({ entries: current, closed: 0 })
  const result = writeHistory(next)
  if (result.ok) return { ...result, closed: changed }
  return result
}

export function deleteWritingBlockHistoryForChapter(chapterId) {
  const id = String(chapterId || '')
  if (!id) return mutationFailure('missing-chapter-id')
  return writeHistory(readHistory().filter((entry) => entry.chapterId !== id))
}

export function getWritingBlockHistoryLimit() {
  return MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER
}
