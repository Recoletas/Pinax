<template>
  <div class="session-picker">
    <div class="picker-header">
      <span class="picker-title">选择会话</span>
      <button class="new-btn" :disabled="busy" @click="handleCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        新建会话
      </button>
    </div>

    <div class="session-list" v-if="sessions.length > 0">
      <div
        v-for="session in sortedSessions"
        :key="session.id"
        :class="['session-item', { active: session.id === currentSessionId, 'is-busy': busy }]"
        @click="handleSelect(session)"
      >
        <div class="item-body">
          <div class="item-title">{{ session.title || '未命名会话' }}</div>
          <div class="item-preview" v-if="getPreview(session)">{{ getPreview(session) }}</div>
          <div class="item-meta">
            <span v-if="session.worldState?.character?.name">{{ session.worldState.character.name }}</span>
            <span v-if="session.worldState?.time?.eraName"> · {{ session.worldState.time.eraName }}</span>
            <span class="item-date">{{ formatDate(session.updatedAt) }}</span>
          </div>
        </div>
        <button class="item-delete" :disabled="busy" @click.stop="handleDelete(session)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>暂无保存的会话</p>
      <button class="new-btn" :disabled="busy" @click="handleCreate">创建第一个会话</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const emit = defineEmits(['select', 'create', 'delete'])
const props = defineProps({
  busy: { type: Boolean, default: false },
})

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

function getPreview(session) {
  if (!session.messages || session.messages.length === 0) return ''
  const lastMsg = session.messages[session.messages.length - 1]
  if (!lastMsg) return ''
  const content = lastMsg.content || ''
  return content.length > 60 ? content.slice(0, 60) + '...' : content
}

function handleSelect(session) {
  if (props.busy) return
  emit('select', session)
}

function handleCreate() {
  if (props.busy) return
  emit('create')
}

function handleDelete(session) {
  if (props.busy) return
  if (confirm(`删除"${session.title || '未命名会话'}"？`)) {
    emit('delete', session)
  }
}
</script>

<style scoped>
.session-picker {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  background: var(--bg-primary);
  min-width: 0;
  overflow-y: auto;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.picker-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.new-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.new-btn:hover {
  background: var(--accent-hover);
}

.session-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.session-item:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.session-item.active {
  background: var(--accent-light);
  border-color: var(--accent);
}

.session-item.is-busy {
  pointer-events: none;
  opacity: 0.5;
  cursor: wait;
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.item-preview {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-date {
  margin-left: auto;
}

.item-delete {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.session-item:hover .item-delete {
  opacity: 1;
}

.item-delete:hover {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  padding: 60px;
}

.empty-state p {
  font-size: 15px;
  margin-bottom: 20px;
}
</style>
