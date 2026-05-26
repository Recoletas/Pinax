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
              <span>{{ pendingCandidates.length }} 条待确认</span>
            </div>
            <div class="memory-panel-actions">
              <button class="memory-panel-btn" type="button" @click="refreshCandidates">刷新</button>
              <button class="memory-panel-btn" type="button" @click="closePanel">收起</button>
            </div>
          </header>
          <div v-if="pendingCandidates.length" class="memory-panel-list">
            <article v-for="candidate in pendingCandidates" :key="candidate.id" class="memory-panel-item">
              <div class="memory-panel-meta">
                <span class="memory-panel-kind">{{ getMemoryKindLabel(candidate.kind) }}</span>
                <span class="memory-panel-scope">{{ getMemoryScopeLabel(candidate.scope) }}</span>
              </div>
              <p class="memory-panel-text">{{ candidate.content }}</p>
              <div class="memory-panel-actions">
                <button class="memory-panel-btn primary" type="button" @click="confirmCandidate(candidate.id)">确认</button>
                <button class="memory-panel-btn" type="button" @click="rejectCandidate(candidate.id)">拒绝</button>
              </div>
            </article>
          </div>
          <div v-else class="memory-panel-empty">暂无待确认记忆</div>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  confirmMemoryCandidate,
  getMemoryKindLabel,
  getMemoryScopeLabel,
  listMemoryCandidates,
  rejectMemoryCandidate
} from '../services/memoryCandidates'

const showIndicator = ref(false)
const message = ref('')
const panelOpen = ref(false)
const pendingCandidates = ref([])
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

function togglePanel() {
  panelOpen.value = !panelOpen.value
  if (panelOpen.value) {
    refreshCandidates()
  }
}

function closePanel() {
  panelOpen.value = false
}

function confirmCandidate(candidateId) {
  confirmMemoryCandidate(candidateId)
  refreshCandidates()
}

function rejectCandidate(candidateId) {
  rejectMemoryCandidate(candidateId)
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
  width: min(340px, calc(100vw - 32px));
  max-height: min(56vh, 460px);
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

.memory-panel-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
}

.memory-panel-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
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
