<template>
  <div class="session-manager">
    <div class="panel-header">
      <span>会话</span>
      <button class="add-btn" @click="createNewSession" title="新建会话">+</button>
    </div>

    <div class="session-list" v-if="sessions.length > 0">
      <div
        v-for="session in sortedSessions"
        :key="session.id"
        :class="['session-item', { active: session.id === currentSessionId }]"
        @click="selectSession(session)"
      >
        <div class="session-info">
          <div class="session-title">{{ session.title || '未命名会话' }}</div>
          <div class="session-meta">{{ formatDate(session.updatedAt) }}</div>
        </div>
        <button class="delete-btn" @click.stop="confirmDelete(session)" title="删除">×</button>
      </div>
    </div>
    <div v-else class="empty-state" @click="createNewSession">
      点击创建第一个会话
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

const emit = defineEmits(['select', 'create', 'delete'])

const sessions = computed(() => gameStore.sessions || [])
const currentSessionId = computed(() => gameStore.currentSessionId)

const sortedSessions = computed(() => {
  return [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt)
})

function formatDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}月${day}日`
}

function selectSession(session) {
  emit('select', session)
}

function createNewSession() {
  emit('create')
}

function confirmDelete(session) {
  if (confirm(`删除"${session.title || '未命名会话'}"？`)) {
    emit('delete', session)
  }
}
</script>

<style scoped>
.session-manager {
  color: var(--text-primary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}

.add-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
}

.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-item.active {
  background: var(--accent-light);
  border: 1px solid var(--accent);
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.delete-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s;
}

.session-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.empty-state {
  text-align: center;
  padding: 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border: 1px dashed var(--border);
  border-radius: 6px;
  transition: all 0.15s;
}

.empty-state:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>