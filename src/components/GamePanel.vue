<template>
  <div class="chat-container" ref="scrollContainer">
    <div v-for="(msg, index) in gameStore.messages" :key="index" :class="['msg-item', msg.role]">

      <!-- 头像列 -->
      <div class="avatar-column">
        <template v-if="msg.role === 'assistant'">
          <img v-if="gameStore.aiCharacter?.avatar" :src="gameStore.aiCharacter.avatar" class="tavern-avatar" />
          <div v-else class="tavern-avatar ai-icon">
            {{ (msg.name || 'A')[0] }}
          </div>
        </template>

        <template v-else>
          <img v-if="gameStore.playerCharacter?.avatar" :src="gameStore.playerCharacter.avatar" class="tavern-avatar" />
          <div v-else class="tavern-avatar user-icon">
            {{ (msg.name || 'U')[0] }}
          </div>
        </template>
      </div>

      <!-- 内容列 -->
      <div class="msg-column">
        <div class="msg-header">
          <span class="display-name">
            {{ msg.name || (msg.role === 'user' ? (gameStore.playerCharacter?.name || 'User') : (gameStore.aiCharacter?.name || 'Assistant')) }}
          </span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>

          <div class="msg-actions">
            <span v-if="msg.role === 'user'" class="icon-btn execute" @click="gameStore.regenerateFrom(index)" title="重写后续">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 1l9 5-9 5V1z"/>
              </svg>
            </span>
            <span class="icon-btn" @click="startEdit(index, msg.content)" title="编辑内容">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M8.5 1.5l2 2-7 7-2.5.5.5-2.5 7-7z"/>
              </svg>
            </span>
            <span class="icon-btn delete" @click="gameStore.deleteMessage(index)" title="删除">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 2h8v8H2V2zM4 0h4v2H4V0z"/>
              </svg>
            </span>
          </div>
        </div>

        <!-- 思考框 -->
        <div v-if="msg.reasoning_content" class="thought-wrapper">
          <details :open="index === gameStore.messages.length - 1">
            <summary>思考过程 <span class="arrow">▾</span></summary>
            <div class="thought-body">{{ msg.reasoning_content }}</div>
          </details>
        </div>

        <!-- 正文区域 -->
        <div class="text-wrapper">
          <div v-if="editingIndex === index" class="edit-area">
            <textarea v-model="editText" class="tavern-textarea" ref="editTextarea"></textarea>
            <div class="edit-footer">
              <button class="tavern-btn primary" @click="saveEdit(index)">保存修改</button>
              <button class="tavern-btn" @click="editingIndex = -1">取消</button>
            </div>
          </div>
          <div v-else class="text-main" v-html="formatRPText(msg.content)"></div>
        </div>
      </div>
    </div>
    <div ref="bottomAnchor" style="height: 1px; width: 100%"></div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const scrollContainer = ref(null)
const bottomAnchor = ref(null)
const editingIndex = ref(-1)
const editText = ref('')
const editTextarea = ref(null)

const startEdit = (index, text) => {
  editingIndex.value = index
  editText.value = text
  nextTick(() => {
    editTextarea.value?.focus()
  })
}

const saveEdit = (index) => {
  if (editText.value.trim()) {
    gameStore.updateMessage(index, editText.value)
  }
  editingIndex.value = -1
}

const formatRPText = (text) => {
  if (!text) return ''
  const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return safeText
    .replace(/\*([^*]+)\*/g, '<em class="rp-action">*$1*</em>')
    .replace(/"([^"]+)"/g, '<span class="rp-dialogue">"$1"</span>')
    .replace(/\n/g, '<br>')
}

const formatTime = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const scroll = () => {
  nextTick(() => {
    if (bottomAnchor.value) {
      bottomAnchor.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  })
}

watch(() => gameStore.messages.length, scroll)
onMounted(scroll)
</script>

<style scoped>
.chat-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.msg-item {
  display: flex;
  gap: 14px;
  width: 100%;
}

.avatar-column {
  flex-shrink: 0;
}

.tavern-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border);
  font-size: 18px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-icon {
  background: var(--accent-light);
  color: var(--accent);
}

.user-icon {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.msg-column {
  flex: 1;
  min-width: 0;
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.display-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.msg-time {
  font-size: 11px;
  color: var(--text-muted);
}

.msg-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: 0.2s;
}

.msg-item:hover .msg-actions {
  opacity: 1;
}

.icon-btn {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.icon-btn.execute:hover {
  color: var(--success);
}

.icon-btn.delete:hover {
  color: var(--danger);
}

.thought-wrapper {
  margin-bottom: 10px;
  max-width: 90%;
}

details {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

summary {
  padding: 8px 12px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  list-style: none;
  outline: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

summary .arrow {
  font-size: 10px;
}

.thought-body {
  padding: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  border-top: 1px solid var(--border);
  font-style: italic;
  line-height: 1.6;
}

.text-main {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

:deep(.rp-dialogue) {
  color: var(--accent);
}

:deep(.rp-action) {
  font-style: italic;
  opacity: 0.8;
}

.edit-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tavern-textarea {
  width: 100%;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.tavern-textarea:focus {
  border-color: var(--accent);
}

.edit-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.tavern-btn {
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  transition: all 0.15s;
}

.tavern-btn:hover {
  background: var(--bg-hover);
}

.tavern-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.tavern-btn.primary:hover {
  background: var(--accent-hover);
}
</style>
