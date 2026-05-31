<template>
  <Teleport to="body">
    <div class="memory-shell">
      <Transition name="memory-fade">
        <button
          v-if="showIndicator"
          class="memory-indicator"
          type="button"
          @click="togglePanel"
          :aria-expanded="panelOpen"
          title="打开记忆面板"
        >
          <div class="memory-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 2v12M2 8h12"/>
              <circle cx="8" cy="8" r="6" stroke-dasharray="4 2"/>
            </svg>
          </div>
          <span class="memory-text">{{ message }}</span>
        </button>
      </Transition>

      <Transition name="memory-panel-fade">
        <section v-if="panelOpen" class="memory-panel">
          <header class="memory-panel-header">
            <div class="memory-panel-title">
              <strong>{{ getPanelModeTitle(panelMode) }}</strong>
              <span>{{ visibleCandidates.length }} 条{{ getPanelModeCountLabel(panelMode) }}</span>
            </div>
            <div class="memory-panel-actions">
              <button
                class="memory-panel-btn"
                type="button"
                :class="{ active: panelMode === 'pending' }"
                @click="setPanelMode('pending')"
              >待确认</button>
              <button
                class="memory-panel-btn"
                type="button"
                :class="{ active: panelMode === 'active' }"
                @click="setPanelMode('active')"
              >已确认</button>
              <button
                class="memory-panel-btn"
                type="button"
                :class="{ active: panelMode === 'stale' }"
                @click="setPanelMode('stale')"
              >已归档</button>
              <button class="memory-panel-btn" type="button" @click="refreshCandidates">刷新</button>
              <button class="memory-panel-btn" type="button" @click="closePanel">收起</button>
            </div>
          </header>
          <div class="memory-panel-filters">
            <button
              v-for="scope in scopeFilters"
              :key="scope.value"
              class="memory-panel-filter"
              :class="{ active: activeScopeFilter === scope.value }"
              type="button"
              @click="setScopeFilter(scope.value)"
            >
              {{ scope.label }}
            </button>
          </div>
          <div v-if="panelMode === 'pending' && visibleCandidates.length" class="memory-batch-bar">
            <span class="memory-batch-count">{{ selectedVisibleCandidates.length }} / {{ visibleCandidates.length }} 已选</span>
            <div class="memory-batch-controls">
              <label class="memory-batch-field">
                <span>目标作用域</span>
                <select v-model="batchScopeDraft.scope">
                  <option v-for="scope in MEMORY_SCOPES" :key="scope.value" :value="scope.value">
                    {{ scope.label }}
                  </option>
                </select>
              </label>
              <label v-if="batchScopeDraft.scope !== 'global-author'" class="memory-batch-field">
                <span>Scope ID</span>
                <input
                  v-model="batchScopeDraft.scopeId"
                  type="text"
                  placeholder="请输入作品或会话 ID"
                />
              </label>
              <button
                class="memory-panel-btn primary"
                type="button"
                :disabled="batchBusy || !selectedVisibleCandidates.length || !canBatchChangeScope"
                @click="changeSelectedCandidatesScope"
              >批量改 scope</button>
            </div>
            <div class="memory-batch-actions">
              <button class="memory-panel-btn" type="button" :disabled="batchBusy" @click="selectVisibleCandidates">全选可见</button>
              <button class="memory-panel-btn" type="button" :disabled="batchBusy || !selectedVisibleCandidates.length" @click="clearSelection">清空选择</button>
              <button class="memory-panel-btn primary" type="button" :disabled="batchBusy || !selectedVisibleCandidates.length" @click="confirmSelectedCandidates">批量确认</button>
              <button class="memory-panel-btn" type="button" :disabled="batchBusy || !selectedVisibleCandidates.length" @click="archiveSelectedCandidates">批量归档</button>
              <button class="memory-panel-btn" type="button" :disabled="batchBusy || !selectedVisibleCandidates.length" @click="rejectSelectedCandidates">批量拒绝</button>
            </div>
          </div>
          <div v-if="visibleCandidates.length" class="memory-panel-list">
            <article
              v-for="candidate in visibleCandidates"
              :key="candidate.id"
              class="memory-panel-item"
              :class="{ editing: editingCandidateId === candidate.id, selected: panelMode === 'pending' && isCandidateSelected(candidate.id) }"
            >
              <template v-if="editingCandidateId === candidate.id">
                <div class="memory-edit-grid">
                  <label class="memory-edit-field">
                    <span>类型</span>
                    <select v-model="editDraft.kind">
                      <option v-for="kind in MEMORY_KINDS" :key="kind.value" :value="kind.value">
                        {{ kind.label }}
                      </option>
                    </select>
                  </label>
                  <label class="memory-edit-field">
                    <span>作用域</span>
                    <select v-model="editDraft.scope">
                      <option v-for="scope in MEMORY_SCOPES" :key="scope.value" :value="scope.value">
                        {{ scope.label }}
                      </option>
                    </select>
                  </label>
                </div>
                <label class="memory-edit-field">
                  <span>Scope ID</span>
                  <input v-model="editDraft.scopeId" type="text" placeholder="留空表示全局或稍后补齐" />
                </label>
                <textarea
                  v-model="editDraft.content"
                  class="memory-panel-textarea"
                  rows="4"
                  placeholder="整理后再确认进入记忆..."
                ></textarea>
                <div class="memory-panel-actions">
                  <button class="memory-panel-btn primary" type="button" @click="saveCandidateEdit(candidate.id)">保存</button>
                  <button class="memory-panel-btn primary" type="button" @click="confirmEditedCandidate(candidate.id)">保存并确认</button>
                  <button class="memory-panel-btn" type="button" @click="cancelEdit">取消</button>
                </div>
              </template>
              <template v-else>
                <div class="memory-panel-top">
                  <label v-if="panelMode === 'pending'" class="memory-panel-check">
                    <input
                      type="checkbox"
                      :checked="isCandidateSelected(candidate.id)"
                      :disabled="batchBusy"
                      @change="toggleCandidateSelection(candidate.id, $event.target.checked)"
                    />
                  </label>
                  <div class="memory-panel-meta">
                    <span class="memory-panel-kind">{{ getMemoryKindLabel(candidate.kind) }}</span>
                    <span class="memory-panel-scope">{{ getMemoryScopeLabel(candidate.scope) }}</span>
                    <span v-if="candidate.scopeId" class="memory-panel-scope-id">{{ candidate.scopeId }}</span>
                    <span v-if="candidate.status === 'stale'" class="memory-archive-badge">已归档</span>
                    <span v-else-if="candidate.duplicateOf" class="memory-duplicate-badge">疑似重复</span>
                    <span v-else-if="candidate.similarTo" class="memory-similar-badge">相似重复</span>
                    <span v-else-if="candidate.conflictsWith && candidate.conflictsWith.length" class="memory-conflict-badge">可能冲突</span>
                  </div>
                </div>
                <p v-if="candidate.status === 'stale'" class="memory-panel-warning">
                  已归档，可恢复后继续处理。
                </p>
                <p v-else-if="candidate.duplicateOf" class="memory-panel-warning">
                  已存在相同 scope、类型和内容的记忆，可确认保留或拒绝此候选。
                </p>
                <p v-else-if="candidate.similarTo" class="memory-panel-warning">
                  已存在同 scope、类型且内容高度相似的记忆，建议编辑后确认或拒绝此候选。
                </p>
                <p v-else-if="candidate.conflictsWith && candidate.conflictsWith.length" class="memory-panel-warning">
                  已有 {{ candidate.conflictsWith.length }} 条同 scope、类型的已确认记忆内容不同，可合并旧记忆或替换旧记忆。
                </p>
                <div v-if="panelMode === 'active'" class="memory-panel-state">
                  <span class="memory-sync-badge" :class="candidate.syncStatus || 'local-only'">
                    {{ getMemorySyncStatusLabel(candidate.syncStatus || 'local-only') }}
                  </span>
                  <span v-if="candidate.lastSyncedAt" class="memory-sync-time">
                    最近 {{ formatSyncTime(candidate.lastSyncedAt) }}
                  </span>
                </div>
                <p class="memory-panel-text">{{ candidate.content }}</p>
                <p v-if="panelMode === 'active' && candidate.lastSyncError && candidate.syncStatus === 'failed'" class="memory-panel-error">
                  {{ candidate.lastSyncError }}
                </p>
                <div class="memory-panel-actions">
                  <button v-if="panelMode === 'pending'" class="memory-panel-btn primary" type="button" @click="confirmCandidate(candidate.id)">确认</button>
                  <button
                    v-if="panelMode === 'pending' && candidate.conflictsWith && candidate.conflictsWith.length"
                    class="memory-panel-btn primary"
                    type="button"
                    @click="mergeCandidateConflicts(candidate)"
                  >合并旧记忆</button>
                  <button
                    v-if="panelMode === 'pending' && candidate.conflictsWith && candidate.conflictsWith.length"
                    class="memory-panel-btn primary"
                    type="button"
                    @click="replaceCandidateConflicts(candidate)"
                  >替换旧记忆</button>
                  <button v-if="panelMode !== 'stale'" class="memory-panel-btn" type="button" @click="startEdit(candidate)">编辑</button>
                  <button
                    v-if="panelMode !== 'stale'"
                    class="memory-panel-btn"
                    type="button"
                    @click="archiveCandidate(candidate.id)"
                  >归档</button>
                  <button
                    v-if="panelMode === 'pending'"
                    class="memory-panel-btn"
                    type="button"
                    @click="rejectCandidate(candidate.id)"
                  >拒绝</button>
                  <button
                    v-else-if="panelMode === 'stale'"
                    class="memory-panel-btn primary"
                    type="button"
                    @click="restoreCandidate(candidate.id)"
                  >{{ getRestoreButtonLabel(candidate) }}</button>
                  <button
                    v-else
                    class="memory-panel-btn primary"
                    type="button"
                    :disabled="candidate.syncStatus === 'syncing'"
                    @click="retryCandidateSync(candidate.id)"
                  >{{ getSyncActionLabel(candidate) }}</button>
                </div>
              </template>
            </article>
          </div>
          <div v-else class="memory-panel-empty">{{ getPanelModeEmptyLabel(panelMode) }}</div>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  archiveMemoryCandidate,
  batchUpdateMemoryCandidateScope,
  batchArchiveMemoryCandidates,
  confirmMemoryCandidate,
  getMemoryKindLabel,
  getMemorySyncStatusLabel,
  getMemoryScopeLabel,
  MEMORY_KINDS,
  MEMORY_SCOPES,
  listMemoryCandidates,
  rejectMemoryCandidate,
  mergeMemoryCandidateConflicts,
  replaceMemoryCandidateConflicts,
  restoreMemoryCandidate,
  updateMemoryCandidate
} from '../services/memoryCandidates'
import { describeMem0SyncResult, syncConfirmedMemoryCandidateToMem0 } from '../services/memorySync'

const showIndicator = ref(false)
const message = ref('')
const panelOpen = ref(false)
const pendingCandidates = ref([])
const activeCandidates = ref([])
const staleCandidates = ref([])
const activeScopeFilter = ref('all')
const panelMode = ref('pending')
const selectedCandidateIds = ref([])
const batchScopeDraft = ref({
  scope: 'session',
  scopeId: ''
})
const batchBusy = ref(false)
const editingCandidateId = ref('')
const editDraft = ref({
  content: '',
  kind: 'project-fact',
  scope: 'session',
  scopeId: ''
})
const panelModeLabels = {
  pending: {
    title: '记忆候选',
    countLabel: '待确认',
    emptyLabel: '暂无待确认记忆'
  },
  active: {
    title: '已确认记忆',
    countLabel: '已确认',
    emptyLabel: '暂无已确认记忆'
  },
  stale: {
    title: '已归档记忆',
    countLabel: '已归档',
    emptyLabel: '暂无已归档记忆'
  }
}
let hideTimer = null

function handleMemoryRecorded(event) {
  const { text, type, kind, scope, kindLabel } = event.detail || {}

  const typeLabels = {
    'location_discovery': '发现新地点',
    'item_acquisition': '获得物品',
    'dialogue': '记录对话',
    'decision': '记录决策',
    'general': '记录记忆'
  }

  const prefix = scope === 'session' ? '待确认记忆' : '记忆候选'
  const label = kindLabel || typeLabels[type] || '记录记忆'
  message.value = `${prefix} · ${label}${kind ? ` · ${kind}` : ''}：${text || ''}`
  showIndicator.value = true

  refreshCandidates()
  scheduleIndicatorHide()
}

function handleMemoryCandidateCreated(event) {
  const { text, kind, scope, kindLabel } = event.detail || {}
  const prefix = scope === 'session' ? '待确认记忆' : '记忆候选'
  const label = kindLabel || kind || '记录记忆'
  message.value = `${prefix} · ${label}：${text || ''}`
  showIndicator.value = true

  refreshCandidates()
  scheduleIndicatorHide()
}

function refreshCandidates() {
  pendingCandidates.value = listMemoryCandidates({ status: 'pending' })
  activeCandidates.value = listMemoryCandidates({ status: 'active' })
  staleCandidates.value = listMemoryCandidates({ status: 'stale' })
  pruneSelection()
  if (hasMemoryCandidates()) {
    showIndicator.value = true
  }
}

const currentCandidates = computed(() => {
  if (panelMode.value === 'active') return activeCandidates.value
  if (panelMode.value === 'stale') return staleCandidates.value
  return pendingCandidates.value
})

const visibleCandidates = computed(() => {
  if (activeScopeFilter.value === 'all') {
    return currentCandidates.value
  }
  return currentCandidates.value.filter((candidate) => candidate.scope === activeScopeFilter.value)
})

const selectedVisibleCandidates = computed(() => (
  visibleCandidates.value.filter((candidate) => selectedCandidateIds.value.includes(candidate.id))
))

const canBatchChangeScope = computed(() => {
  const scope = String(batchScopeDraft.value.scope || '').trim()
  if (!scope) return false
  if (scope === 'global-author') return true
  return Boolean(String(batchScopeDraft.value.scopeId || '').trim())
})

const scopeFilters = computed(() => {
  const scopeCounts = currentCandidates.value.reduce((acc, candidate) => {
    acc[candidate.scope] = (acc[candidate.scope] || 0) + 1
    return acc
  }, {})

  return [
    { value: 'all', label: `全部 (${currentCandidates.value.length})` },
    ...MEMORY_SCOPES.map((scope) => ({
      value: scope.value,
      label: `${scope.label} (${scopeCounts[scope.value] || 0})`
    }))
  ]
})

function setPanelMode(mode) {
  if (panelMode.value === mode) return
  panelMode.value = mode
  activeScopeFilter.value = 'all'
  clearSelection()
  refreshCandidates()
}

function setScopeFilter(scope) {
  if (activeScopeFilter.value === scope) return
  activeScopeFilter.value = scope
  clearSelection()
}

function togglePanel() {
  panelOpen.value = !panelOpen.value
  if (panelOpen.value) {
    refreshCandidates()
  }
}

function closePanel() {
  panelOpen.value = false
  cancelEdit()
  clearSelection()
}

function buildSyncPatch(syncResult) {
  if (syncResult?.success) {
    return {
      syncStatus: 'synced',
      remoteId: extractRemoteId(syncResult),
      lastSyncedAt: syncResult.syncedAt || Date.now(),
      lastSyncError: ''
    }
  }

  if (syncResult?.skipped) {
    if (syncResult.reason === 'invalid-candidate') {
      return {
        syncStatus: 'failed',
        lastSyncError: '无效记忆，无法同步'
      }
    }
    return {
      syncStatus: 'local-only',
      lastSyncError: ''
    }
  }

  return {
    syncStatus: 'failed',
    lastSyncError: syncResult?.error || 'mem0 同步失败'
  }
}

async function syncCandidate(candidateId, candidate, options = {}) {
  const { note = '', announce = true } = options
  const syncingCandidate = updateMemoryCandidate(candidateId, {
    syncStatus: 'syncing',
    lastSyncError: ''
  }) || candidate
  refreshCandidates()

  const syncResult = await syncConfirmedMemoryCandidateToMem0(syncingCandidate)
  const patchedCandidate = updateMemoryCandidate(candidateId, buildSyncPatch(syncResult)) || syncingCandidate
  refreshCandidates()

  if (announce) {
    showConfirmationNotice(patchedCandidate, syncResult, note)
  }
  return { candidate: patchedCandidate, syncResult }
}

function startEdit(candidate) {
  editingCandidateId.value = candidate.id
  editDraft.value = {
    content: candidate.content || '',
    kind: candidate.kind || 'project-fact',
    scope: candidate.scope || 'session',
    scopeId: candidate.scopeId || ''
  }
}

function cancelEdit() {
  editingCandidateId.value = ''
  editDraft.value = {
    content: '',
    kind: 'project-fact',
    scope: 'session',
    scopeId: ''
  }
}

function saveCandidateEdit(candidateId) {
  const content = String(editDraft.value.content || '').trim()
  if (!content) return false

  const current = pendingCandidates.value.find((item) => item.id === candidateId) || null
  updateMemoryCandidate(candidateId, {
    content,
    kind: editDraft.value.kind,
    scope: editDraft.value.scope,
    scopeId: String(editDraft.value.scopeId || current?.scopeId || '').trim()
  })
  refreshCandidates()
  cancelEdit()
  return true
}

async function confirmCandidate(candidateId) {
  const confirmed = confirmMemoryCandidate(candidateId)
  if (!confirmed) {
    refreshCandidates()
    return
  }
  if (editingCandidateId.value === candidateId) {
    cancelEdit()
  }
  await syncCandidate(candidateId, confirmed, { note: '已确认' })
}

async function mergeCandidateConflicts(candidate) {
  if (!candidate) return

  const result = mergeMemoryCandidateConflicts(candidate.id, {
    note: '已合并到新记忆'
  })

  if (!result.success) {
    refreshCandidates()
    return
  }

  if (editingCandidateId.value === candidate.id) {
    cancelEdit()
  }

  await syncCandidate(candidate.id, result.candidate, {
    note: `合并旧记忆 ${result.mergedCount} 条`
  })
}

async function replaceCandidateConflicts(candidate) {
  if (!candidate) return

  const result = replaceMemoryCandidateConflicts(candidate.id, {
    note: '已被新记忆替换'
  })

  if (!result.success) {
    refreshCandidates()
    return
  }

  if (editingCandidateId.value === candidate.id) {
    cancelEdit()
  }

  await syncCandidate(candidate.id, result.candidate, {
    note: `替换旧记忆 ${result.replacedCount} 条`
  })
}

async function confirmEditedCandidate(candidateId) {
  if (!saveCandidateEdit(candidateId)) return
  await confirmCandidate(candidateId)
}

async function retryCandidateSync(candidateId) {
  const candidate = activeCandidates.value.find((item) => item.id === candidateId) || null
  if (!candidate) return
  await syncCandidate(candidateId, candidate, { note: '重试同步' })
}

function archiveCandidate(candidateId) {
  const archived = archiveMemoryCandidate(candidateId, { note: '已归档' })
  if (!archived.success) {
    refreshCandidates()
    return
  }

  if (editingCandidateId.value === candidateId) {
    cancelEdit()
  }

  refreshCandidates()
  showStatusNotice(buildArchiveNotice(1))
}

function restoreCandidate(candidateId) {
  const restored = restoreMemoryCandidate(candidateId)
  if (!restored.success) {
    refreshCandidates()
    return
  }

  if (editingCandidateId.value === candidateId) {
    cancelEdit()
  }

  refreshCandidates()
  showStatusNotice(buildRestoreNotice(restored.candidate))
}

function showConfirmationNotice(candidate, syncResult, prefix = '') {
  const suffix = describeMem0SyncResult(syncResult)
  const preview = String(candidate?.content || '').trim().slice(0, 60)
  const scopeLabel = candidate ? getMemoryScopeLabel(candidate.scope) : '记忆'
  const head = prefix ? `${prefix} · ` : ''
  message.value = `${head}${scopeLabel} · ${preview}${suffix ? ` · ${suffix}` : ''}`
  showIndicator.value = true

  scheduleIndicatorHide()
}

function rejectCandidate(candidateId) {
  rejectMemoryCandidate(candidateId)
  if (editingCandidateId.value === candidateId) {
    cancelEdit()
  }
  refreshCandidates()
}

async function confirmSelectedCandidates() {
  if (batchBusy.value || !selectedVisibleCandidates.value.length) return
  const targets = selectedVisibleCandidates.value
  if (!targets.length) return

  batchBusy.value = true
  let syncedCount = 0
  let localOnlyCount = 0
  let failedCount = 0

  try {
    for (const candidate of targets) {
      const confirmed = confirmMemoryCandidate(candidate.id)
      if (!confirmed) {
        failedCount++
        continue
      }

      const result = await syncCandidate(candidate.id, confirmed, { announce: false })
      if (result.syncResult?.success) {
        syncedCount++
      } else if (result.syncResult?.skipped) {
        localOnlyCount++
      } else {
        failedCount++
      }
    }

    refreshCandidates()
    clearSelection()
    showStatusNotice(buildBatchNotice('批量确认', targets.length, syncedCount, localOnlyCount, failedCount))
  } finally {
    batchBusy.value = false
  }
}

async function rejectSelectedCandidates() {
  if (batchBusy.value || !selectedVisibleCandidates.value.length) return
  const targets = selectedVisibleCandidates.value
  if (!targets.length) return

  batchBusy.value = true
  try {
    for (const candidate of targets) {
      rejectMemoryCandidate(candidate.id)
    }

    refreshCandidates()
    clearSelection()
    showStatusNotice(`批量拒绝 ${targets.length} 条记忆`)
  } finally {
    batchBusy.value = false
  }
}

function isCandidateSelected(candidateId) {
  return selectedCandidateIds.value.includes(candidateId)
}

function toggleCandidateSelection(candidateId, checked) {
  const next = new Set(selectedCandidateIds.value)
  if (checked) {
    next.add(candidateId)
  } else {
    next.delete(candidateId)
  }
  selectedCandidateIds.value = Array.from(next)
}

function selectVisibleCandidates() {
  selectedCandidateIds.value = visibleCandidates.value.map((candidate) => candidate.id)
  if (visibleCandidates.value.length) {
    resetBatchScopeDraft(visibleCandidates.value[0])
  }
}

function clearSelection() {
  selectedCandidateIds.value = []
  resetBatchScopeDraft()
}

function pruneSelection() {
  if (!selectedCandidateIds.value.length) return
  const allowedIds = new Set(currentCandidates.value.map((candidate) => candidate.id))
  selectedCandidateIds.value = selectedCandidateIds.value.filter((id) => allowedIds.has(id))
}

function getSyncActionLabel(candidate) {
  if (!candidate) return '同步'
  if (candidate.syncStatus === 'syncing') return '同步中...'
  if (candidate.syncStatus === 'synced') return '重新同步'
  if (candidate.syncStatus === 'failed') return '重试同步'
  if (candidate.syncStatus === 'local-only') return '同步到 mem0'
  return '同步到 mem0'
}

function formatSyncTime(value) {
  const time = Number(value)
  if (!Number.isFinite(time) || time <= 0) return ''
  return new Date(time).toLocaleString('zh-CN')
}

function extractRemoteId(syncResult) {
  if (!syncResult) return ''
  if (syncResult.remoteId) return String(syncResult.remoteId).trim()
  const data = syncResult.data || {}
  return String(data.id || data.memory_id || data.memoryId || '').trim()
}

function hasMemoryCandidates() {
  return pendingCandidates.value.length > 0 || activeCandidates.value.length > 0 || staleCandidates.value.length > 0
}

function showStatusNotice(text) {
  message.value = String(text || '').trim()
  if (!message.value) return
  showIndicator.value = true
  scheduleIndicatorHide()
}

function buildBatchNotice(actionLabel, total, synced, localOnly, failed) {
  const parts = [`${actionLabel} ${total} 条记忆`]
  if (synced) parts.push(`${synced} 条已同步`)
  if (localOnly) parts.push(`${localOnly} 条仅本地`)
  if (failed) parts.push(`${failed} 条失败`)
  return parts.join(' · ')
}

function buildArchiveNotice(total) {
  return `归档 ${total} 条记忆`
}

function buildRestoreNotice(candidate) {
  const statusLabel = candidate?.status === 'active' ? '已确认' : '待确认'
  return `已恢复为${statusLabel}记忆`
}

function buildScopeBatchNotice(total, scope, scopeId) {
  const parts = [`批量改 scope ${total} 条记忆`, getMemoryScopeLabel(scope)]
  if (scope !== 'global-author' && scopeId) {
    parts.push(scopeId)
  }
  return parts.join(' · ')
}

function resetBatchScopeDraft(candidate = null) {
  batchScopeDraft.value = {
    scope: candidate?.scope || 'session',
    scopeId: candidate?.scope === 'global-author' ? '' : candidate?.scopeId || ''
  }
}

async function changeSelectedCandidatesScope() {
  if (batchBusy.value || !selectedVisibleCandidates.value.length) return

  const scope = String(batchScopeDraft.value.scope || 'session').trim() || 'session'
  const scopeId = scope === 'global-author' ? '' : String(batchScopeDraft.value.scopeId || '').trim()
  if (scope !== 'global-author' && !scopeId) {
    showStatusNotice('批量改 scope 需要填写 Scope ID')
    return
  }

  batchBusy.value = true
  try {
    const result = batchUpdateMemoryCandidateScope(
      selectedVisibleCandidates.value.map((candidate) => candidate.id),
      {
        scope,
        scopeId
      }
    )

    if (!result.success) {
      showStatusNotice(result.reason === 'missing-scope-id'
        ? '批量改 scope 需要填写 Scope ID'
        : '批量改 scope 失败')
      return
    }

    cancelEdit()
    refreshCandidates()
    clearSelection()
    showStatusNotice(buildScopeBatchNotice(result.updatedCount, result.scope, result.scopeId))
  } finally {
    batchBusy.value = false
  }
}

async function archiveSelectedCandidates() {
  if (batchBusy.value || !selectedVisibleCandidates.value.length) return

  batchBusy.value = true
  try {
    const result = batchArchiveMemoryCandidates(
      selectedVisibleCandidates.value.map((candidate) => candidate.id),
      { note: '批量归档' }
    )

    if (!result.success) {
      showStatusNotice('批量归档失败')
      return
    }

    cancelEdit()
    refreshCandidates()
    clearSelection()
    showStatusNotice(buildArchiveNotice(result.archivedCount))
  } finally {
    batchBusy.value = false
  }
}

function getPanelModeTitle(mode = panelMode.value) {
  return panelModeLabels[mode]?.title || panelModeLabels.pending.title
}

function getPanelModeCountLabel(mode = panelMode.value) {
  return panelModeLabels[mode]?.countLabel || panelModeLabels.pending.countLabel
}

function getPanelModeEmptyLabel(mode = panelMode.value) {
  return panelModeLabels[mode]?.emptyLabel || panelModeLabels.pending.emptyLabel
}

function getRestoreButtonLabel(candidate) {
  return candidate?.metadata?.previousStatus === 'active' ? '恢复为已确认' : '恢复为待确认'
}

function scheduleIndicatorHide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    showIndicator.value = hasMemoryCandidates()
  }, 2500)
}

onMounted(() => {
  window.addEventListener('memory-recorded', handleMemoryRecorded)
  window.addEventListener('memory-candidate-created', handleMemoryCandidateCreated)
  refreshCandidates()
})

onUnmounted(() => {
  window.removeEventListener('memory-recorded', handleMemoryRecorded)
  window.removeEventListener('memory-candidate-created', handleMemoryCandidateCreated)
  if (hideTimer) clearTimeout(hideTimer)
})
</script>

<style scoped>
.memory-shell {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  pointer-events: none;
}

.memory-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--accent) 90%, #000);
  color: #fff;
  border-radius: 20px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
  border: none;
  cursor: pointer;
  text-align: left;
}

.memory-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.memory-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-panel {
  width: min(520px, calc(100vw - 32px));
  max-height: min(68vh, 560px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 94%, #ffffff 6%);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--accent) 10%, transparent);
  pointer-events: auto;
}

.memory-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.memory-panel-title {
  display: grid;
  gap: 2px;
}

.memory-panel-title strong {
  font-size: 12px;
  color: var(--text-primary);
}

.memory-panel-title span {
  font-size: 10px;
  color: var(--text-secondary);
}

.memory-panel-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.memory-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px 0;
}

.memory-batch-count {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.memory-batch-controls {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.memory-batch-field {
  display: grid;
  gap: 4px;
  font-size: 10px;
  color: var(--text-secondary);
}

.memory-batch-field select,
.memory-batch-field input {
  min-width: 120px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 11px;
  padding: 5px 8px;
  outline: none;
}

.memory-batch-field select:focus,
.memory-batch-field input:focus {
  border-color: var(--accent);
}

.memory-batch-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.memory-panel-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px 0;
}

.memory-panel-filter {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.memory-panel-filter.active {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-tertiary));
}

.memory-panel-btn {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 10px;
  padding: 4px 8px;
  cursor: pointer;
}

.memory-panel-btn.active {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-primary));
  color: var(--accent);
}

.memory-panel-btn.primary {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-primary));
}

.memory-panel-list {
  overflow: auto;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.memory-panel-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 8px;
}

.memory-panel-item.editing {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-primary));
}

.memory-panel-item.selected {
  border-color: color-mix(in srgb, var(--accent) 46%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-primary));
}

.memory-panel-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 4px;
}

.memory-panel-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

.memory-panel-check input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
}

.memory-panel-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.memory-panel-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.memory-panel-kind,
.memory-panel-scope {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text-secondary);
}

.memory-panel-scope-id {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 20%, transparent);
  color: var(--text-secondary);
}

.memory-duplicate-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, #d8a300 18%, transparent);
  color: #b88300;
}

.memory-similar-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, #4a7cc9 16%, transparent);
  color: #4a7cc9;
}

.memory-archive-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 18%, transparent);
  color: var(--text-secondary);
}

.memory-conflict-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, #c94a4a 16%, transparent);
  color: #c94a4a;
}

.memory-sync-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.memory-sync-badge.pending,
.memory-sync-badge.local-only {
  background: color-mix(in srgb, var(--border) 20%, transparent);
  color: var(--text-secondary);
}

.memory-sync-badge.syncing {
  background: color-mix(in srgb, #d8a300 16%, transparent);
  color: #b88300;
}

.memory-sync-badge.synced {
  background: color-mix(in srgb, #1a8f5c 16%, transparent);
  color: #1a8f5c;
}

.memory-sync-badge.failed {
  background: color-mix(in srgb, #c94a4a 16%, transparent);
  color: #c94a4a;
}

.memory-sync-time,
.memory-panel-error,
.memory-panel-warning {
  font-size: 10px;
  color: var(--text-secondary);
}

.memory-panel-error {
  margin: 4px 0 0;
  color: #c94a4a;
}

.memory-panel-warning {
  margin: 4px 0;
  color: #b88300;
}

.memory-panel-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
}

.memory-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.memory-edit-field {
  display: grid;
  gap: 5px;
  font-size: 10px;
  color: var(--text-secondary);
}

.memory-edit-field select,
.memory-edit-field input,
.memory-panel-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 11px;
  padding: 6px 8px;
  outline: none;
}

.memory-edit-field select:focus,
.memory-edit-field input:focus,
.memory-panel-textarea:focus {
  border-color: var(--accent);
}

.memory-panel-textarea {
  min-height: 88px;
  resize: vertical;
}

.memory-panel-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
}

@media (max-width: var(--bp-mobile)) {
  .memory-panel {
    width: min(520px, calc(100vw - 20px));
    max-height: min(76vh, 620px);
  }

  .memory-edit-grid {
    grid-template-columns: 1fr;
  }
}

.memory-fade-enter-active,
.memory-fade-leave-active {
  transition: all 0.3s ease;
}

.memory-fade-enter-from,
.memory-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.memory-panel-fade-enter-active,
.memory-panel-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.memory-panel-fade-enter-from,
.memory-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
