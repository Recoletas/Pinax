<template>
  <Teleport to="body">
    <div v-if="isOpen" class="advisor-overlay" @click.self="$emit('close')">
      <div class="advisor-panel">
        <!-- Header -->
        <div class="advisor-header">
          <div class="advisor-title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="5"></circle>
              <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"/>
            </svg>
            <span>统一智能顾问</span>
          </div>
          <div class="advisor-actions">
            <button class="close-btn" @click="$emit('close')" title="关闭">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 3L13 13M13 3L3 13" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div class="advisor-messages" ref="messagesRef">
          <div v-if="messages.length === 0" class="advisor-empty">
            <p>{{ emptyText }}</p>
          </div>
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="message"
            :class="msg.role"
          >
            <div class="message-label">{{ msg.role === 'user' ? '你' : '顾问' }}</div>
            <div class="message-bubble" :class="{ 'is-markdown': msg.role === 'advisor' }" v-html="msg.role === 'advisor' ? marked(msg.content) : msg.content"></div>
          </div>
          <div
            v-for="result in visibleResults"
            :key="result.id || `${result.task}-${result.summary}`"
            class="advisor-result-card"
            :class="result.status"
          >
            <div class="result-card-header">
              <span class="result-card-title">{{ getResultTitle(result) }}</span>
              <span v-if="result.status === 'applied'" class="result-status">已应用</span>
              <span v-else-if="result.status === 'stale'" class="result-status error">已过期</span>
            </div>
            <p v-if="result.summary" class="result-summary">{{ result.summary }}</p>
            <pre class="result-replacement">{{ result.replacement }}</pre>
            <p v-if="result.statusDetail" class="result-detail">{{ result.statusDetail }}</p>
            <div class="result-actions" v-if="result.status === 'pending'">
              <button class="result-btn primary" type="button" @click="$emit('apply-result', result)">应用修改</button>
              <button class="result-btn" type="button" @click="$emit('dismiss-result', result)">忽略</button>
            </div>
          </div>
          <div v-if="loading" class="message advisor">
            <div class="message-label">顾问</div>
            <div class="message-bubble loading">
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
            </div>
          </div>
        </div>

        <!-- Quick questions -->
        <div class="advisor-quick" v-if="messages.length === 0 && normalizedQuickQuestions.length">
          <button
            v-for="(q, idx) in normalizedQuickQuestions"
            :key="`${q.label || idx}-${idx}`"
            class="quick-btn"
            :disabled="q.disabled"
            @click="$emit('ask', q.payload)"
          >
            {{ q.label }}
          </button>
        </div>

        <!-- Input -->
        <div class="advisor-input-row">
          <textarea
            v-model="localInput"
            class="advisor-input"
            :placeholder="placeholder"
            rows="1"
            @keydown="handleInputKeydown"
            ref="inputRef"
          ></textarea>
          <button
            class="send-btn"
            :disabled="!localInput.trim() || loading"
            @click="sendInput"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2L7 9M14 2L9 14L7 9M14 2L2 7L7 9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  isOpen: Boolean,
  messages: { type: Array, default: () => [] },
  results: { type: Array, default: () => [] },
  loading: Boolean,
  quickQuestions: { type: Array, default: () => [] },
  placeholder: { type: String, default: '输入你的问题... (Ctrl+Enter 发送)' },
  emptyText: { type: String, default: '统一智能顾问可帮助你分析当前创作状态，提供建议和灵感。' }
})

const emit = defineEmits(['close', 'ask', 'apply-result', 'dismiss-result'])

const localInput = ref('')
const messagesRef = ref(null)
const inputRef = ref(null)
const normalizedQuickQuestions = computed(() => (props.quickQuestions || []).map((item) => {
  if (typeof item === 'string') {
    return {
      label: item,
      payload: item,
      disabled: false
    }
  }

  if (!item || typeof item !== 'object') {
    return {
      label: '',
      payload: '',
      disabled: true
    }
  }

  const label = String(item.label || item.question || '').trim()
  return {
    label,
    payload: item,
    disabled: Boolean(item.disabled) || !label
  }
}))

const visibleResults = computed(() => (props.results || []).filter((result) => {
  if (!result || typeof result !== 'object') return false
  if (result.status === 'dismissed') return false
  if (result.mode !== 'replace') return false
  if (!String(result.replacement || '').trim()) return false
  return Boolean(result.targetRange && Number.isFinite(Number(result.targetRange.start)) && Number.isFinite(Number(result.targetRange.end)))
}))

watch(() => props.isOpen, (open) => {
  if (open) {
    nextTick(() => inputRef.value?.focus())
  }
})

watch(() => props.messages, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}, { deep: true })

watch(() => props.results, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}, { deep: true })

function getResultTitle(result) {
  if (result.task === 'advisor.fix.selection') return '选区修改'
  if (result.task === 'advisor.fix.paragraph') return '段落修改'
  return '可应用修改'
}

function handleInputKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    sendInput()
  }
}

function sendInput() {
  const text = localInput.value.trim()
  if (!text || props.loading) return
  emit('ask', text)
  localInput.value = ''
}
</script>

<style scoped>
.advisor-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: transparent;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 20px 20px;
}

.advisor-panel {
  position: relative;
  z-index: 901;
  width: 380px;
  max-height: 560px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.advisor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-secondary));
  flex-shrink: 0;
}

.advisor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

.advisor-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.close-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.advisor-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.advisor-empty {
  text-align: center;
  padding: 20px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.advisor-empty p {
  margin: 0;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message.user {
  align-items: flex-end;
}

.message.advisor {
  align-items: flex-start;
}

.message-label {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 0 4px;
}

.message-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message.advisor .message-bubble {
  background: var(--bg-tertiary, #2a2a2a);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.message-bubble.is-markdown {
  padding: 0;
  background: transparent;
}

.message-bubble.is-markdown :deep(p) {
  margin: 0 0 8px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg-tertiary, #2a2a2a);
  border-bottom-left-radius: 4px;
}

.message-bubble.is-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.message-bubble.is-markdown :deep(ul),
.message-bubble.is-markdown :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.message-bubble.is-markdown :deep(li) {
  margin: 2px 0;
}

.message-bubble.is-markdown :deep(code) {
  background: rgba(0,0,0,0.2);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}

.message-bubble.is-markdown :deep(pre) {
  background: rgba(0,0,0,0.15);
  padding: 8px 10px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 6px 0;
}

.message-bubble.is-markdown :deep(pre code) {
  background: none;
  padding: 0;
}

.message-bubble.loading {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
}

.advisor-result-card {
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-secondary));
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.advisor-result-card.applied {
  opacity: 0.75;
}

.advisor-result-card.stale {
  border-color: color-mix(in srgb, #d44 45%, var(--border));
}

.result-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.result-card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.result-status {
  font-size: 11px;
  color: var(--text-secondary);
}

.result-status.error {
  color: #d44;
}

.result-summary,
.result-detail {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.result-replacement {
  margin: 0;
  max-height: 140px;
  overflow: auto;
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
}

.result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.result-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
}

.result-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.result-btn.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-secondary);
  animation: bounce 1.2s infinite;
}

.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.advisor-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.quick-btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.quick-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.advisor-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.advisor-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  resize: none;
  min-height: 36px;
  max-height: 80px;
  font-family: inherit;
  line-height: 1.4;
}

.advisor-input:focus {
  outline: none;
  border-color: var(--accent);
}

.send-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  filter: brightness(1.1);
}
</style>
