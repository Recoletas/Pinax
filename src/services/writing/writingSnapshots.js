import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import {
  MAX_WRITING_SNAPSHOT_STORAGE_CHARS,
  MAX_WRITING_SNAPSHOTS_PER_CHAPTER,
  getWritingSnapshotStorageSize,
  normalizeWritingSnapshot
} from '../../../shared/writingSnapshotContract.js'
import {
  migrateWritingDocumentToV3,
  getWritingDocumentMarkdown,
  validateWritingDocument
} from './writingDocumentSchema.js'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult.js'

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function mergeMilestoneCoverage(target, source) {
  if (
    target?.reason !== 'word-milestone'
    || source?.reason !== 'word-milestone'
    || Number(target.milestone?.intervalWords) !== Number(source.milestone?.intervalWords)
  ) return target
  const coveredBoundaries = [...new Set([
    ...(target.milestone.coveredBoundaries || target.milestone.crossedBoundaries || []),
    ...(source.milestone.coveredBoundaries || source.milestone.crossedBoundaries || [])
  ].map(Number).filter((item) => Number.isSafeInteger(item) && item > 0))]
    .sort((left, right) => left - right)
  return {
    ...target,
    milestone: { ...target.milestone, coveredBoundaries }
  }
}

export function normalizeStoredWritingSnapshot(value, chapterId = null) {
  const snapshot = normalizeWritingSnapshot(value, chapterId)
  if (!snapshot) return null
  const editorDocument = migrateWritingDocumentToV3(snapshot.editorDocument, snapshot.markdown)
  if (!validateWritingDocument(editorDocument).valid) return null
  // editorDocument 是快照真源。早期 rollout fixture 曾把不存在的
  // `chapter.markdown` 传进来，造成结构化正文完整但 markdown/wordCount 为 0；
  // 读取时统一重建投影，避免历史面和字数里程碑继续继承损坏的派生字段。
  return normalizeWritingSnapshot({
    ...snapshot,
    editorDocument,
    documentRevision: Number(editorDocument.revision || 0),
    markdown: getWritingDocumentMarkdown(editorDocument)
  }, chapterId)
}

export function normalizeStoredWritingSnapshots(values, chapterId = null) {
  const normalized = (Array.isArray(values) ? values : [])
    .map((value) => normalizeStoredWritingSnapshot(value, chapterId))
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  const byChapter = new Map()
  for (const snapshot of normalized) {
    if (!byChapter.has(snapshot.chapterId)) byChapter.set(snapshot.chapterId, [])
    byChapter.get(snapshot.chapterId).push(snapshot)
  }
  const retained = []
  for (const snapshots of byChapter.values()) {
    // 字数里程碑数量会随长篇增长；手动与介入前保护版本必须优先保留，
    // 不能被自动版本悄悄挤出每章 20 份的既有预算。
    const protectedSnapshots = snapshots.filter((snapshot) => snapshot.reason !== 'word-milestone')
    const milestoneSnapshots = snapshots.filter((snapshot) => snapshot.reason === 'word-milestone')
    const milestoneSlots = Math.max(0, MAX_WRITING_SNAPSHOTS_PER_CHAPTER - protectedSnapshots.length)
    const retainedMilestones = milestoneSnapshots.slice(0, milestoneSlots)
    for (const discarded of milestoneSnapshots.slice(milestoneSlots)) {
      const coverageIndex = retainedMilestones.findIndex((snapshot) => (
        Number(snapshot.milestone?.intervalWords) === Number(discarded.milestone?.intervalWords)
      ))
      if (coverageIndex >= 0) {
        retainedMilestones[coverageIndex] = mergeMilestoneCoverage(retainedMilestones[coverageIndex], discarded)
      }
    }
    retained.push(
      ...protectedSnapshots.slice(0, MAX_WRITING_SNAPSHOTS_PER_CHAPTER),
      ...retainedMilestones
    )
  }
  return retained
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

export function cloneWritingSnapshotDocument(snapshot) {
  const normalized = normalizeStoredWritingSnapshot(snapshot)
  return normalized ? clone(normalized.editorDocument) : null
}

function readSnapshots() {
  return normalizeStoredWritingSnapshots(getItem(STORAGE_KEYS.WRITING_SNAPSHOTS))
}

function writeSnapshots(values) {
  const normalized = normalizeStoredWritingSnapshots(values)
  let candidate = [...normalized]
  while (candidate.length > 1 && getWritingSnapshotStorageSize(candidate) > MAX_WRITING_SNAPSHOT_STORAGE_CHARS) {
    // 总预算同样先淘汰最旧自动里程碑；只有没有自动版本可回收时，
    // 才回退到既有的“删除全局最旧版本”策略。
    let evictionIndex = -1
    for (let index = candidate.length - 1; index >= 0; index -= 1) {
      if (candidate[index].reason === 'word-milestone') {
        evictionIndex = index
        break
      }
    }
    const selectedIndex = evictionIndex >= 0 ? evictionIndex : candidate.length - 1
    const evicted = candidate[selectedIndex]
    if (evicted?.reason === 'word-milestone') {
      const coverageIndex = candidate.findIndex((snapshot, index) => (
        index !== selectedIndex
        && snapshot.chapterId === evicted.chapterId
        && snapshot.reason === 'word-milestone'
        && Number(snapshot.milestone?.intervalWords) === Number(evicted.milestone?.intervalWords)
      ))
      if (coverageIndex >= 0) {
        candidate[coverageIndex] = mergeMilestoneCoverage(candidate[coverageIndex], evicted)
      }
    }
    candidate.splice(selectedIndex, 1)
  }
  if (getWritingSnapshotStorageSize(candidate) > MAX_WRITING_SNAPSHOT_STORAGE_CHARS) {
    return mutationFailure('storage-budget-exceeded')
  }
  if (!setItem(STORAGE_KEYS.WRITING_SNAPSHOTS, candidate)) {
    return storageWriteFailure({ resource: 'writing-snapshots' })
  }
  return mutationSuccess({ snapshots: candidate })
}

export function listWritingSnapshots(chapterId) {
  return readSnapshots().filter((snapshot) => String(snapshot.chapterId) === String(chapterId || ''))
}

export function saveWritingSnapshot(snapshot) {
  const normalized = normalizeStoredWritingSnapshot(snapshot)
  if (!normalized) return mutationFailure('invalid-snapshot')
  const existing = readSnapshots().filter((item) => item.id !== normalized.id)
  const sameChapter = existing.filter((item) => item.chapterId === normalized.chapterId)
  const otherChapters = existing.filter((item) => item.chapterId !== normalized.chapterId)
  const result = writeSnapshots([
    normalized,
    // writeSnapshots 统一执行“手动/保护优先 + 自动覆盖边界折叠”。这里若先按
    // 时间截成 19 份，会在策略看到旧里程碑前就丢失其去重边界。
    ...sameChapter,
    ...otherChapters
  ])
  if (!result.ok) return result
  const retained = result.snapshots.some((item) => item.id === normalized.id)
  return retained
    ? mutationSuccess({ snapshots: result.snapshots, snapshot: normalized, retained: true })
    : mutationFailure('snapshot-retention-exhausted', { snapshots: result.snapshots, retained: false })
}

export function deleteWritingSnapshot(snapshotId) {
  const id = String(snapshotId || '')
  if (!id) return mutationFailure('missing-id')
  return writeSnapshots(readSnapshots().filter((snapshot) => snapshot.id !== id))
}

export function deleteWritingSnapshotsForChapter(chapterId) {
  const id = String(chapterId || '')
  if (!id) return mutationFailure('missing-chapter-id')
  return writeSnapshots(readSnapshots().filter((snapshot) => snapshot.chapterId !== id))
}
