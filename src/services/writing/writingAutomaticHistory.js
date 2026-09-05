import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import {
  countWritingWords,
  createWritingSnapshot,
  getWritingSnapshotContentHash
} from '../../../shared/writingSnapshotContract.js'
import {
  listWritingSnapshots,
  saveWritingSnapshot
} from './writingSnapshots.js'

export const WRITING_HISTORY_PREFERENCES_SCHEMA_VERSION = 1
export const WRITING_HISTORY_INTERVAL_OPTIONS = Object.freeze([500, 1000, 2000])

// 500 字来自《雾港纪事》现有长文 fixture 的实测：3,070 字章节产生 6 个
// 里程碑、全书 5,349 字产生 8 个，约占 108 KiB。它不是作家助手未公开的默认值。
export const DEFAULT_WRITING_HISTORY_INTERVAL_WORDS = 500

export const DEFAULT_WRITING_HISTORY_PREFERENCES = Object.freeze({
  schemaVersion: WRITING_HISTORY_PREFERENCES_SCHEMA_VERSION,
  enabled: true,
  intervalWords: DEFAULT_WRITING_HISTORY_INTERVAL_WORDS
})

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function normalizedInterval(value) {
  const interval = Number(value)
  return WRITING_HISTORY_INTERVAL_OPTIONS.includes(interval)
    ? interval
    : DEFAULT_WRITING_HISTORY_INTERVAL_WORDS
}

export function normalizeWritingHistoryPreferences(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.freeze({
    schemaVersion: WRITING_HISTORY_PREFERENCES_SCHEMA_VERSION,
    enabled: source.enabled === undefined ? true : source.enabled === true,
    intervalWords: normalizedInterval(source.intervalWords)
  })
}

export function loadWritingHistoryPreferences() {
  return normalizeWritingHistoryPreferences(getItem(STORAGE_KEYS.WRITING_HISTORY_PREFERENCES))
}

export function saveWritingHistoryPreferences(value) {
  const preferences = normalizeWritingHistoryPreferences(value)
  const ok = setItem(STORAGE_KEYS.WRITING_HISTORY_PREFERENCES, preferences)
  return ok
    ? { ok: true, preferences }
    : { ok: false, reason: 'storage-write-failed', preferences }
}

function recordedMilestoneBoundaries(snapshots, intervalWords) {
  return new Set((Array.isArray(snapshots) ? snapshots : [])
    .filter((snapshot) => (
      snapshot?.reason === 'word-milestone'
      && Number(snapshot?.milestone?.intervalWords) === intervalWords
    ))
    .flatMap((snapshot) => snapshot.milestone.coveredBoundaries || snapshot.milestone.crossedBoundaries || [])
    .map(Number)
    .filter((boundary) => Number.isSafeInteger(boundary) && boundary > 0))
}

export function getRecordedWritingMilestoneBoundaries(snapshots, intervalWords) {
  return [...recordedMilestoneBoundaries(snapshots, normalizedInterval(intervalWords))]
    .sort((left, right) => left - right)
}

function noMilestone(reason, detail = {}) {
  return Object.freeze({ shouldRecord: false, reason, ...detail })
}

/**
 * Plan one automatic history write from an already successful manuscript save.
 * Callers must pass persisted=true only after their repository write succeeds.
 * One save may cross several boundaries, but always maps to one full snapshot.
 */
export function planWritingMilestoneSnapshot({
  persisted = false,
  chapterId = '',
  chapterTitle = '',
  previousDocument = null,
  previousMarkdown = '',
  persistedDocument = null,
  persistedMarkdown = '',
  annotations = [],
  preferences = null,
  snapshots = null,
  createdAt = null
} = {}) {
  const settings = normalizeWritingHistoryPreferences(preferences || loadWritingHistoryPreferences())
  if (!settings.enabled) return noMilestone('disabled', { preferences: settings })
  if (persisted !== true) return noMilestone('not-persisted', { preferences: settings })
  const normalizedChapterId = String(chapterId || '').trim()
  if (!normalizedChapterId || !previousDocument || !persistedDocument) {
    return noMilestone('missing-document', { preferences: settings })
  }
  const previousRevision = Number(previousDocument.revision)
  const persistedRevision = Number(persistedDocument.revision)
  if (!Number.isSafeInteger(previousRevision) || !Number.isSafeInteger(persistedRevision)) {
    return noMilestone('invalid-revision', { preferences: settings })
  }
  if (persistedRevision <= previousRevision) {
    return noMilestone('revision-not-advanced', { preferences: settings })
  }

  const previousWordCount = countWritingWords(previousMarkdown)
  const persistedWordCount = countWritingWords(persistedMarkdown)
  if (persistedWordCount <= previousWordCount) {
    return noMilestone(
      persistedWordCount === previousWordCount ? 'word-count-unchanged' : 'word-count-decreased',
      { preferences: settings, previousWordCount, persistedWordCount }
    )
  }

  const intervalWords = settings.intervalWords
  const previousBucket = Math.floor(previousWordCount / intervalWords)
  const persistedBucket = Math.floor(persistedWordCount / intervalWords)
  if (persistedBucket <= previousBucket) {
    return noMilestone('interval-not-crossed', {
      preferences: settings,
      previousWordCount,
      persistedWordCount
    })
  }

  const allCrossedBoundaries = []
  for (let bucket = previousBucket + 1; bucket <= persistedBucket; bucket += 1) {
    allCrossedBoundaries.push(bucket * intervalWords)
  }
  const currentSnapshots = Array.isArray(snapshots)
    ? snapshots
    : listWritingSnapshots(normalizedChapterId)
  const persistedContentHash = getWritingSnapshotContentHash(persistedMarkdown)
  if (currentSnapshots.some((snapshot) => (
    Number(snapshot?.documentRevision) === persistedRevision
    && String(snapshot?.contentHash || '') === persistedContentHash
  ))) {
    return noMilestone('persisted-revision-already-snapshotted', {
      preferences: settings,
      previousWordCount,
      persistedWordCount,
      persistedDocumentRevision: persistedRevision,
      persistedContentHash
    })
  }
  const recorded = recordedMilestoneBoundaries(currentSnapshots, intervalWords)
  const crossedBoundaries = allCrossedBoundaries.filter((boundary) => !recorded.has(boundary))
  if (!crossedBoundaries.length) {
    return noMilestone('milestones-already-recorded', {
      preferences: settings,
      previousWordCount,
      persistedWordCount,
      allCrossedBoundaries
    })
  }

  return Object.freeze({
    shouldRecord: true,
    reason: 'word-milestone',
    chapterId: normalizedChapterId,
    chapterTitle: String(chapterTitle || ''),
    previousWordCount,
    persistedWordCount,
    intervalWords,
    allCrossedBoundaries: Object.freeze(allCrossedBoundaries),
    crossedBoundaries: Object.freeze(crossedBoundaries),
    persistedDocumentRevision: persistedRevision,
    persistedContentHash,
    document: clone(persistedDocument),
    markdown: String(persistedMarkdown || ''),
    annotations: clone(Array.isArray(annotations) ? annotations : []),
    createdAt
  })
}

export function recordWritingMilestoneSnapshot(plan) {
  if (!plan?.shouldRecord || plan.reason !== 'word-milestone') {
    return { ok: false, reason: plan?.reason || 'invalid-plan', recorded: false }
  }

  // 主、副栏可能在相邻任务中跨过同一边界。写入前重读一次现有 store，
  // 让第二个 recorder 幂等退出，而不是依赖页面时序。
  const currentSnapshots = listWritingSnapshots(plan.chapterId)
  const recorded = recordedMilestoneBoundaries(currentSnapshots, plan.intervalWords)
  if (currentSnapshots.some((snapshot) => (
    Number(snapshot?.documentRevision) === Number(plan.persistedDocumentRevision)
    && String(snapshot?.contentHash || '') === String(plan.persistedContentHash || '')
  ))) {
    return { ok: true, reason: 'persisted-revision-already-snapshotted', recorded: false, snapshot: null }
  }
  const crossedBoundaries = plan.crossedBoundaries.filter((boundary) => !recorded.has(boundary))
  if (!crossedBoundaries.length) {
    return { ok: true, reason: 'milestones-already-recorded', recorded: false, snapshot: null }
  }

  const boundary = crossedBoundaries[crossedBoundaries.length - 1]
  const snapshot = createWritingSnapshot({
    chapterId: plan.chapterId,
    chapterTitle: plan.chapterTitle,
    label: `字数里程碑 · ${boundary.toLocaleString('zh-CN')} 字`,
    reason: 'word-milestone',
    document: plan.document,
    markdown: plan.markdown,
    annotations: plan.annotations,
    milestone: {
      intervalWords: plan.intervalWords,
      crossedBoundaries,
      fromWordCount: plan.previousWordCount,
      toWordCount: plan.persistedWordCount,
      persistedDocumentRevision: plan.persistedDocumentRevision
    },
    createdAt: plan.createdAt
  })
  if (!snapshot) return { ok: false, reason: 'invalid-snapshot', recorded: false }
  const result = saveWritingSnapshot(snapshot)
  return result.ok
    ? { ...result, recorded: true }
    : { ...result, recorded: false }
}

export function recordWritingProtectionSnapshot({
  chapterId = '',
  chapterTitle = '',
  reason = 'before-adoption',
  label = '',
  document = null,
  markdown = '',
  annotations = [],
  operation = '',
  transactionId = '',
  createdAt = null
} = {}) {
  if (!['before-rewrite', 'before-adoption', 'before-restore'].includes(reason)) {
    return { ok: false, reason: 'invalid-protection-reason', recorded: false }
  }
  const snapshot = createWritingSnapshot({
    chapterId,
    chapterTitle,
    label: label || `${reason === 'before-adoption' ? '采纳前' : reason === 'before-rewrite' ? '改写前' : '恢复前'} · 修订 ${Number(document?.revision || 0)}`,
    reason,
    document,
    markdown,
    annotations,
    protection: { operation, transactionId },
    createdAt
  })
  if (!snapshot) return { ok: false, reason: 'invalid-snapshot', recorded: false }

  const duplicate = listWritingSnapshots(chapterId).find((item) => (
    item.reason === reason
    && item.documentRevision === snapshot.documentRevision
    && item.contentHash === snapshot.contentHash
    && String(item.protection?.transactionId || '') === String(snapshot.protection?.transactionId || '')
  ))
  if (duplicate) {
    return { ok: true, reason: 'protection-already-recorded', recorded: false, snapshot: duplicate }
  }
  const result = saveWritingSnapshot(snapshot)
  return result.ok
    ? { ...result, recorded: true }
    : { ...result, recorded: false }
}
