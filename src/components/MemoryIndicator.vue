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
          title="打开记忆候选"
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
              <strong>记忆候选</strong>
              <span>{{ visibleCandidates.length }} 条待确认</span>
            </div>
            <div class="memory-panel-actions">
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
              @click="activeScopeFilter = scope.value"
            >
              {{ scope.label }}
            </button>
          </div>
          <div v-if="visibleCandidates.length" class="memory-panel-list">
            <article
              v-for="candidate in visibleCandidates"
              :key="candidate.id"
              class="memory-panel-item"
              :class="{ editing: editingCandidateId === candidate.id }"
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
                <div class="memory-panel-meta">
                  <span class="memory-panel-kind">{{ getMemoryKindLabel(candidate.kind) }}</span>
                  <span class="memory-panel-scope">{{ getMemoryScopeLabel(candidate.scope) }}</span>
                  <span v-if="candidate.scopeId" class="memory-panel-scope-id">{{ candidate.scopeId }}</span>
                </div>
                <p class="memory-panel-text">{{ candidate.content }}</p>
                <div class="memory-panel-actions">
                  <button class="memory-panel-btn primary" type="button" @click="confirmCandidate(candidate.id)">确认</button>
                  <button class="memory-panel-btn" type="button" @click="startEdit(candidate)">编辑</button>
                  <button class="memory-panel-btn" type="button" @click="rejectCandidate(candidate.id)">拒绝</button>
                </div>
              </template>
            </article>
          </div>
          <div v-else class="memory-panel-empty">暂无待确认记忆</div>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  confirmMemoryCandidate,
  getMemoryKindLabel,
  getMemoryScopeLabel,
  MEMORY_KINDS,
  MEMORY_SCOPES,
  listMemoryCandidates,
  rejectMemoryCandidate,
  updateMemoryCandidate
} from '../services/memoryCandidates'
import { describeMem0SyncResult, syncConfirmedMemoryCandidateToMem0 } from '../services/memorySync'

const showIndicator = ref(false)
const message = ref('')
const panelOpen = ref(false)
const pendingCandidates = ref([])
const activeScopeFilter = ref('all')
const editingCandidateId = ref('')
const editDraft = ref({
  content: '',
  kind: 'project-fact',
  scope: 'session',
  scopeId: ''
})
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

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    showIndicator.value = false
  }, 2500)
  refreshCandidates()
}

function handleMemoryCandidateCreated(event) {
  const { text, kind, scope, kindLabel } = event.detail || {}
  const prefix = scope === 'session' ? '待确认记忆' : '记忆候选'
  const label = kindLabel || kind || '记录记忆'
  message.value = `${prefix} · ${label}：${text || ''}`
  showIndicator.value = true

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    showIndicator.value = false
  }, 2500)
  refreshCandidates()
}

function refreshCandidates() {
  pendingCandidates.value = listMemoryCandidates({ status: 'pending' })
}

const visibleCandidates = computed(() => {
  if (activeScopeFilter.value === 'all') {
    return pendingCandidates.value
  }
  return pendingCandidates.value.filter((candidate) => candidate.scope === activeScopeFilter.value)
})

const scopeFilters = computed(() => {
  const scopeCounts = pendingCandidates.value.reduce((acc, candidate) => {
    acc[candidate.scope] = (acc[candidate.scope] || 0) + 1
    return acc
  }, {})

  return [
    { value: 'all', label: `全部 (${pendingCandidates.value.length})` },
    ...MEMORY_SCOPES.map((scope) => ({
      value: scope.value,
      label: `${scope.label} (${scopeCounts[scope.value] || 0})`
    }))
  ]
})

function togglePanel() {
  panelOpen.value = !panelOpen.value
  if (panelOpen.value) {
    refreshCandidates()
  }
}

function closePanel() {
  panelOpen.value = false
  cancelEdit()
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
  refreshCandidates()
  const syncResult = await syncConfirmedMemoryCandidateToMem0(confirmed)
  showConfirmationNotice(confirmed, syncResult)
}

async function confirmEditedCandidate(candidateId) {
  if (!saveCandidateEdit(candidateId)) return
  await confirmCandidate(candidateId)
}

function showConfirmationNotice(candidate, syncResult) {
  const suffix = describeMem0SyncResult(syncResult)
  const preview = String(candidate?.content || '').trim().slice(0, 60)
  const scopeLabel = candidate ? getMemoryScopeLabel(candidate.scope) : '记忆'
  message.value = `${scopeLabel} · ${preview}${suffix ? ` · ${suffix}` : ''}`
  showIndicator.value = true

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    showIndicator.value = false
  }, 2500)
}

function rejectCandidate(candidateId) {
  rejectMemoryCandidate(candidateId)
  if (editingCandidateId.value === candidateId) {
    cancelEdit()
  }
  refreshCandidates()
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

.memory-panel-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
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

@media (max-width: 700px) {
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
