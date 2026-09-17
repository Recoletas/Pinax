import { computed, ref } from 'vue'
import {
  createWritingSnapshot,
  getWritingSnapshotReasonLabel,
  getWritingSnapshotRestoreGuard
} from '../../shared/writingSnapshotContract.js'
import {
  cloneWritingSnapshotDocument,
  deleteWritingSnapshotsForChapter,
  deleteWritingSnapshot,
  listWritingSnapshots,
  saveWritingSnapshot
} from '../services/writing/writingSnapshots.js'
import {
  WRITING_HISTORY_INTERVAL_OPTIONS,
  loadWritingHistoryPreferences,
  planWritingMilestoneSnapshot,
  recordWritingMilestoneSnapshot,
  saveWritingHistoryPreferences,
  recordWritingProtectionSnapshot
} from '../services/writing/writingAutomaticHistory.js'
import {
  appendWritingBlockHistory,
  closeWritingBlockHistorySessions,
  deleteWritingBlockHistoryForChapter,
  listWritingBlockHistory
} from '../services/writing/writingBlockHistory.js'
import {
  clearWritingRecoveryDraft,
  listWritingRecoveryDrafts,
  saveWritingRecoveryDraft
} from '../services/writing/writingRecovery.js'
import { normalizeWritingAnnotations } from '../services/writing/writingAnnotations.js'
import { buildWritingBlockHistoryEntries } from '../../shared/writingBlockHistoryContract.js'

export function useAuthoringHistoryWorkflow(host) {
  const snapshots = ref([])
  const blockHistory = ref([])
  const recoveryDraft = ref(null)
  const label = ref('')
  const status = ref('')
  const preferences = ref(loadWritingHistoryPreferences())
  const intervalOptions = WRITING_HISTORY_INTERVAL_OPTIONS
  const recentSnapshots = computed(() => snapshots.value.slice(0, 3))
  const recentBlockHistory = computed(() => blockHistory.value.slice(0, 4))

  function updatePreference(patch = {}) {
    const result = saveWritingHistoryPreferences({ ...preferences.value, ...patch })
    preferences.value = result.preferences
    status.value = result.ok
      ? (result.preferences.enabled
          ? `自动历史已开启 · 每 ${result.preferences.intervalWords.toLocaleString()} 字`
          : '自动历史已关闭；手动与保护快照仍会保留。')
      : '自动历史设置保存失败，已保留原设置。'
    if (!result.ok) preferences.value = loadWritingHistoryPreferences()
    return result.ok
  }

  function setLabel(value) {
    label.value = String(value ?? '')
  }

  function recordAutomatic(payload = {}) {
    const plan = planWritingMilestoneSnapshot({
      ...payload,
      persisted: true,
      preferences: preferences.value,
      snapshots: listWritingSnapshots(payload.chapterId)
    })
    if (!plan.shouldRecord) return plan
    const result = recordWritingMilestoneSnapshot(plan)
    if (result.recorded && String(payload.chapterId) === String(host.chapterId())) refreshSnapshots(payload.chapterId)
    if (!result.ok && host.historyVisible()) status.value = '正文已保存，但自动历史空间不足；请清理较旧版本。'
    return result
  }

  function refreshSnapshots(chapterId = host.chapterId()) {
    snapshots.value = chapterId ? listWritingSnapshots(chapterId) : []
    return snapshots.value
  }

  function load(chapterId = host.chapterId()) {
    snapshots.value = chapterId ? listWritingSnapshots(chapterId) : []
    blockHistory.value = chapterId ? listWritingBlockHistory(chapterId) : []
    const draft = chapterId ? listWritingRecoveryDrafts(chapterId)[0] : null
    if (draft) {
      const guard = getWritingSnapshotRestoreGuard(draft, {
        chapterId,
        documentRevision: host.document()?.revision || 0,
        markdown: host.markdown()
      })
      if (!guard) {
        clearWritingRecoveryDraft(chapterId)
        recoveryDraft.value = null
      } else recoveryDraft.value = draft
    } else recoveryDraft.value = null
    status.value = ''
  }

  function formatTime(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '未知时间'
    return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function formatPreview(value) {
    const preview = String(value || '').replace(/\s+/g, ' ').trim()
    if (!preview) return '空片段'
    return preview.length > 96 ? `${preview.slice(0, 96)}…` : preview
  }

  function create({ snapshotLabel = label.value, reason = 'manual', quiet = false } = {}) {
    const chapterId = host.chapterId()
    if (!chapterId) return null
    if (!host.persistCurrent()) {
      status.value = '当前正文保存失败，未创建快照。'
      return null
    }
    const snapshot = createWritingSnapshot({
      chapterId,
      chapterTitle: host.chapterTitle(),
      label: snapshotLabel || (reason === 'manual' ? `修订 ${host.document()?.revision || 0}` : ''),
      reason,
      document: host.document(),
      markdown: host.markdown(),
      annotations: host.annotations()
    })
    if (!snapshot) {
      status.value = '当前章节过大或结构无效，未能创建快照。'
      return null
    }
    const result = saveWritingSnapshot(snapshot)
    if (!result.ok) {
      status.value = result.reason === 'storage-budget-exceeded'
        ? '快照空间已达到上限，请删除旧版本后重试。'
        : '快照保存失败，当前正文未受影响。'
      return null
    }
    refreshSnapshots(chapterId)
    label.value = ''
    if (!quiet) status.value = `已保存「${snapshot.label}」`
    return snapshot
  }

  function restore(snapshot) {
    if (host.rejectMutation() || !snapshot || !host.chapterId()) return false
    const dual = host.dualSource()
    const dualShowsChapter = dual?.kind === 'chapter' && String(dual.id || '') === String(host.chapterId())
    if (dualShowsChapter && host.prepareDualClose() === false) {
      status.value = '恢复已停止：副栏正文尚未保存。'
      return false
    }
    const guard = getWritingSnapshotRestoreGuard(snapshot, {
      chapterId: host.chapterId(), documentRevision: host.document()?.revision || 0, markdown: host.markdown()
    })
    if (guard === 'chapter-mismatch') {
      status.value = '这个快照不属于当前章节，未执行恢复。'
      return false
    }
    if (guard && !host.confirmRestore()) return false
    const checkpoint = create({ snapshotLabel: `恢复前 · 修订 ${host.document()?.revision || 0}`, reason: 'before-restore', quiet: true })
    if (!checkpoint) {
      status.value = '恢复已停止：无法先保存当前正文的恢复前检查点。'
      return false
    }
    const document = cloneWritingSnapshotDocument(snapshot)
    const chapter = host.findChapter(host.chapterId())
    if (!document || !chapter) {
      status.value = '快照结构无效，未执行恢复。'
      return false
    }
    document.revision = Math.max(Number(host.document()?.revision || 0), Number(document.revision || 0)) + 1
    document.meta = { ...(document.meta || {}), historyRestoreEpoch: `restore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }
    chapter.editorDocument = document
    chapter.editorDocumentSchemaVersion = document.schemaVersion
    chapter.content = snapshot.markdown
    chapter.contentFormat = 'md'
    chapter.annotations = normalizeWritingAnnotations(snapshot.annotations, chapter.id)
    if (!host.persistChapters()) {
      status.value = '恢复失败：章节正文无法写入，原正文仍保留在当前页面。'
      return false
    }
    host.selectChapter(host.chapterId())
    if (dualShowsChapter) host.reloadDual({ sourceKind: 'chapter', sourceId: chapter.id, title: chapter.title, document, markdown: snapshot.markdown })
    status.value = `已恢复「${snapshot.label}」 · 当前修订 ${document.revision}`
    host.markSaved()
    return true
  }

  function restoreRecovery() {
    if (!recoveryDraft.value || !restore(recoveryDraft.value)) return false
    clearWritingRecoveryDraft(host.chapterId())
    recoveryDraft.value = null
    status.value = '已恢复未保存草稿，并保留恢复前检查点。'
    return true
  }

  function discardRecovery() {
    if (!host.chapterId()) return false
    clearWritingRecoveryDraft(host.chapterId())
    recoveryDraft.value = null
    status.value = '已丢弃未保存草稿，当前正文未改变。'
    return true
  }

  function canRestoreBlock(entry) {
    if (!entry?.nodeId) return false
    const unit = host.unitByNode(entry.nodeId)
    return Boolean(unit && (!entry.unitId || unit.attrs?.unitId === entry.unitId))
  }

  function restoreBlock(entry) {
    if (host.rejectMutation()) {
      status.value = '正文事务正在提交，暂不能恢复片段历史。'
      return false
    }
    if (!canRestoreBlock(entry)) {
      status.value = '这个片段已经不存在或已移到其他写作单元，无法单独恢复。'
      return false
    }
    if (!host.editorActive() || !host.editor()) {
      status.value = '片段恢复请先切回所见即所得编辑面。'
      return false
    }
    if (!create({ snapshotLabel: `片段恢复前 · 修订 ${host.document()?.revision || 0}`, reason: 'before-restore', quiet: true })) {
      status.value = '恢复已停止：无法保存片段恢复前检查点。'
      return false
    }
    if (!host.editor().replaceNodeText(entry.nodeId, entry.previousText)) {
      status.value = '编辑器未接受这次片段恢复。'
      return false
    }
    status.value = `已恢复片段历史 · 修订 ${entry.fromDocumentRevision}`
    return true
  }

  function remove(snapshot) {
    if (!snapshot?.id || !host.confirmDelete(snapshot)) return false
    const result = deleteWritingSnapshot(snapshot.id)
    if (!result.ok) {
      status.value = '删除快照失败。'
      return false
    }
    refreshSnapshots()
    status.value = `已删除「${snapshot.label}」`
    return true
  }

  function recordProtection(payload = {}) {
    const result = recordWritingProtectionSnapshot(payload)
    if (result.ok && String(payload.chapterId || '') === String(host.chapterId() || '')) refreshSnapshots(payload.chapterId)
    return result
  }

  function recordBlockChanges(payload = {}) {
    const entries = buildWritingBlockHistoryEntries(payload)
    if (entries.length) appendWritingBlockHistory(entries)
    if (String(payload.chapterId || '') === String(host.chapterId() || '')) {
      blockHistory.value = listWritingBlockHistory(payload.chapterId)
    }
    return entries
  }

  function appendBlockEntries(entries = []) {
    if (entries.length) appendWritingBlockHistory(entries)
    return entries.length
  }

  // NC03：离章/换书等边界封组微改会话，下一条 manual-save 另起新历史。
  function closeBlockHistorySessions(options = {}) {
    return closeWritingBlockHistorySessions(options)
  }

  function refreshBlockHistory(chapterId = host.chapterId()) {
    blockHistory.value = chapterId ? listWritingBlockHistory(chapterId) : []
    return blockHistory.value
  }

  function readRecovery(key) {
    const drafts = key ? listWritingRecoveryDrafts(key) : []
    return drafts.length ? drafts[drafts.length - 1] : null
  }

  function writeRecovery(payload = {}) {
    const draft = createWritingSnapshot({ ...payload, label: '未保存草稿', reason: 'crash-recovery' })
    if (!draft) return null
    const result = saveWritingRecoveryDraft(draft)
    if (!result.ok) return null
    // 本次会话的防崩溃写入不是“发现旧恢复稿”。保持入口安静；只有 load()
    // 在打开文稿时读到与已保存正文不同的旧副本，才设置 recoveryDraft。
    return draft
  }

  function clearRecovery(key) {
    const result = clearWritingRecoveryDraft(key)
    if (String(key || '') === String(host.chapterId() || '')) recoveryDraft.value = null
    return result
  }

  function removeChapter(chapterId) {
    deleteWritingSnapshotsForChapter(chapterId)
    deleteWritingBlockHistoryForChapter(chapterId)
    clearWritingRecoveryDraft(chapterId)
    if (String(chapterId || '') === String(host.chapterId() || '')) {
      snapshots.value = []
      blockHistory.value = []
      recoveryDraft.value = null
    }
  }

  return {
    snapshots, blockHistory, recoveryDraft, label, status, preferences, intervalOptions,
    recentSnapshots, recentBlockHistory, reasonLabel: getWritingSnapshotReasonLabel,
    setLabel, updatePreference, recordAutomatic, refreshSnapshots, load, formatTime, formatPreview,
    create, restore, restoreRecovery, discardRecovery, canRestoreBlock, restoreBlock, remove,
    recordProtection, recordBlockChanges, appendBlockEntries, closeBlockHistorySessions, refreshBlockHistory, readRecovery, writeRecovery,
    clearRecovery, removeChapter
  }
}

export default useAuthoringHistoryWorkflow
