<template>
  <div class="chat-container" ref="scrollContainer">
    <div
      v-for="(msg, index) in gameStore.messages"
      :key="index"
      :class="[
        'msg-item',
        msg.role,
        {
          'import-picked': gameStore.quickNoteImportMode && gameStore.quickNoteSelectedMessageIndexes.includes(index),
          'compression-complete': isCompressionCompleteMessage(msg)
        }
      ]"
    >

      <!-- 头像列 -->
      <div class="avatar-column">
        <template v-if="isCompressionCompleteMessage(msg)">
          <div class="tavern-avatar system-icon">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13 4.5L6.2 11.3 3 8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </template>

        <template v-else-if="msg.role === 'assistant'">
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
            {{ displayName(msg) }}
          </span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
          <div
            class="msg-actions"
            :class="{ 'import-mode': gameStore.quickNoteImportMode && (msg.role || msg.type) !== 'system' }"
          >
            <span
              v-if="gameStore.quickNoteImportMode && (msg.role || msg.type) !== 'system'"
              class="import-picker"
              @click="gameStore.toggleQuickNoteMessageSelection(index)"
              :title="gameStore.quickNoteSelectedMessageIndexes.includes(index) ? '取消导入' : '加入导入'"
            >
              <input
                type="checkbox"
                :checked="gameStore.quickNoteSelectedMessageIndexes.includes(index)"
                @click.stop
                @change="gameStore.toggleQuickNoteMessageSelection(index)"
              />
            </span>
            <div class="msg-actions-row">
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
        </div>

        <!-- 思考框 -->
        <div v-if="msg.reasoning_content" class="thought-wrapper">
          <details :open="index === gameStore.messages.length - 1">
            <summary>思考过程 <span class="arrow">▾</span></summary>
            <div class="thought-body">{{ msg.reasoning_content }}</div>
          </details>
        </div>

        <!-- 正文区域 -->
        <div
          class="text-wrapper"
          @click="onTextWrapperClick(index, msg, $event)"
        >
          <div v-if="editingIndex === index" class="edit-area">
            <textarea v-model="editText" class="tavern-textarea" ref="editTextarea"></textarea>
            <div class="edit-footer">
              <button class="tavern-btn primary" @click="saveEdit(index)">保存修改</button>
              <button class="tavern-btn" @click="editingIndex = -1">取消</button>
            </div>
          </div>
          <div v-else-if="isCompressionCompleteMessage(msg)" class="context-compression-complete">
            <span class="context-compression-pulse"></span>
            <span class="context-compression-text">{{ msg.content }}</span>
          </div>
          <div v-else class="text-main" v-html="renderMessageContent(msg, index)"></div>
        </div>
      </div>
    </div>
    <div ref="bottomAnchor" style="height: 1px; width: 100%"></div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { renderRPText } from '../services/rpTextRenderer'

const gameStore = useGameStore()
const scrollContainer = ref(null)
const bottomAnchor = ref(null)
const editingIndex = ref(-1)
const editText = ref('')
const editTextarea = ref(null)

const emit = defineEmits(['show-inline-detail'])

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

const isCompressionCompleteMessage = (msg) => {
  return (msg?.role || msg?.type) === 'system'
    && String(msg?.content || '').trim() === '【压缩完成】上下文已压缩完成'
}

const displayName = (msg) => {
  if (isCompressionCompleteMessage(msg)) return '系统'
  if (msg.name) return msg.name
  if (msg.role === 'user') return gameStore.playerCharacter?.name || 'User'
  if (msg.role === 'system' || msg.type === 'system') return '系统'
  return gameStore.aiCharacter?.name || 'Assistant'
}

const renderMessageContent = (msg, index) => {
  return renderRPText(msg.content, {
    mechanismTrigger: msg.mechanismTrigger || null,
    inlineEvents: gameStore.inlineEvents.filter((event) => event.messageId === index)
  })
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

const onTextWrapperClick = (index, msg, event) => {
  const mechanismTarget = event?.target?.closest?.('.mechanism-trigger')
  if (mechanismTarget && msg?.mechanismTrigger?.type) {
    gameStore.activateMechanism(msg.mechanismTrigger.type, msg.mechanismTrigger)
    return
  }

  const inlineTarget = event?.target?.closest?.('[data-inline-type]')
  if (inlineTarget) {
    const type = inlineTarget.dataset.inlineType || ''
    const content = inlineTarget.dataset.inlineContent || inlineTarget.textContent || ''
    emit('show-inline-detail', { type, content })
    return
  }

  if (!gameStore.quickNoteImportMode) return
  const role = msg.role || msg.type
  if (role === 'system') return
  if (event?.target?.closest('textarea,button,input,.icon-btn,.edit-area,.clickable')) return
  gameStore.toggleQuickNoteMessageSelection(index)
}

onMounted(() => {
  scroll()
})

watch(() => gameStore.messages.length, scroll)
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

.msg-item.import-picked .text-wrapper {
  outline: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 8px;
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

.system-icon {
  background: color-mix(in srgb, var(--accent-emerald) 14%, var(--bg-secondary));
  color: var(--accent-emerald);
  border-color: color-mix(in srgb, var(--accent-emerald) 28%, var(--border));
}

.msg-column {
  flex: 1;
  min-width: 0;
}

.msg-item.compression-complete {
  align-items: center;
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
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  opacity: 0;
  transition: 0.2s;
}

.msg-item:hover .msg-actions {
  opacity: 1;
}

.msg-actions.import-mode {
  opacity: 1;
}

.msg-actions-row {
  display: flex;
  gap: 8px;
}

.import-picker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.import-picker input {
  width: 13px;
  height: 13px;
  accent-color: var(--accent);
  cursor: pointer;
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
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.context-compression-complete {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: 100%;
  padding: 7px 11px;
  border: 1px solid color-mix(in srgb, var(--accent-emerald) 28%, var(--border));
  border-radius: 999px;
  background:
    linear-gradient(90deg,
      color-mix(in srgb, var(--accent-emerald) 12%, var(--bg-secondary)),
      color-mix(in srgb, var(--accent-teal) 8%, var(--bg-secondary)));
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent-emerald) 10%, transparent);
  color: color-mix(in srgb, var(--text-primary) 86%, var(--accent-emerald));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  white-space: normal;
}

.context-compression-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-emerald);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-emerald) 14%, transparent);
  flex-shrink: 0;
}

.context-compression-text {
  min-width: 0;
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

/* Kao record-book overrides — convert chat list into a "卷次条目流"
   (ledger entry stream). Avatar becomes a 0-radius square stamp, body
   moves to "manuscript line" with a role-stamp kicker header, and
   the whole entry gets a left marginalia 序号 (entry number) + a thin
   gold hairline divider. No template change — the avatar-column still
   holds the avatar element, the msg-column still holds the body; we
   only restyle the layout, sizes, fonts, and the dividers between
   entries. Scoped CSS specificity 0,2,1 (theme-kao .x[data-v-xxx])
   beats the default 0,1,1 of the tool-feel rules above. */
.theme-kao .chat-container {
  background: transparent;
  padding: 6px 0 12px;
  gap: 0;
}

.theme-kao .msg-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  padding: 14px 4px 16px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 18%, transparent);
}

.theme-kao .msg-item:last-child {
  border-bottom: none;
}

.theme-kao .msg-item::before {
  content: "#" counter(record-entry, decimal-leading-zero);
  counter-increment: record-entry;
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 400;
  font-style: italic;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, var(--archive-ink) 44%, transparent);
  text-align: right;
  padding-top: 4px;
  align-self: start;
  grid-column: 1;
  grid-row: 1 / span 2;
}

.theme-kao .chat-container {
  counter-reset: record-entry;
}

.theme-kao .avatar-column {
  display: none;
}

.theme-kao .tavern-avatar {
  display: none;
}

.theme-kao .msg-column {
  display: contents;
}

.theme-kao .msg-header {
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px dotted color-mix(in srgb, var(--archive-gold) 30%, transparent);
}

.theme-kao .display-name {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 10px;
  font-style: normal;
  letter-spacing: 0.22em;
  text-transform: none;
  color: color-mix(in srgb, var(--archive-ink) 64%, transparent);
}

.theme-kao .msg-time {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--archive-ink) 50%, transparent);
}

.theme-kao .text-main {
  font-family: var(--font-display);
  font-size: 14px;
  line-height: 1.85;
  color: var(--archive-ink);
  letter-spacing: 0.02em;
}

.theme-kao .thought-wrapper {
  max-width: 100%;
  margin: 8px 0 10px;
}

.theme-kao details {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 22%, transparent);
  border-radius: 0;
}

.theme-kao summary {
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.18em;
  color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 60%, transparent);
}

.theme-kao .thought-body {
  font-family: var(--font-display);
  font-size: 12px;
  line-height: 1.7;
  border-top: 1px dotted color-mix(in srgb, var(--archive-gold) 22%, transparent);
  color: color-mix(in srgb, var(--archive-ink) 70%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 40%, transparent);
}

.theme-kao .icon-btn {
  color: color-mix(in srgb, var(--archive-ink) 50%, transparent);
  border-radius: 0;
}

.theme-kao .icon-btn:hover {
  background: color-mix(in srgb, var(--archive-gold) 12%, transparent);
  color: var(--archive-olive-strong);
}
</style>
