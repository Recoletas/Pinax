<template>
  <Teleport to="body">
    <div v-if="isOpen" class="advisor-overlay" @click.self="$emit('close')">
      <div
        ref="panelRef"
        class="advisor-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="advisor-panel-title"
      >
        <!-- Header -->
        <div class="advisor-header">
          <div class="advisor-title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="5"></circle>
              <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"/>
            </svg>
            <span id="advisor-panel-title">智能顾问</span>
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
          <p v-if="notice" class="advisor-notice" role="status">{{ notice }}</p>
          <p v-if="contextLabel" class="advisor-context" :title="contextLabel">
            <span>本次上下文</span>
            {{ contextLabel }}
          </p>
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
            <div class="message-bubble" :class="{ 'is-markdown': msg.role === 'advisor' }" v-html="msg.role === 'advisor' ? sanitizeHtml(marked(msg.content)) : sanitizeHtml(msg.content)"></div>
          </div>
          <AgentResultTray
            v-for="result in visibleResults"
            :key="result.id || `${result.task}-${result.summary}`"
            :result="result"
            @apply="$emit('apply-result', $event)"
            @undo="$emit('undo-result', $event)"
            @undo-domain="$emit('undo-domain-result', $event)"
            @dismiss="$emit('dismiss-result', $event)"
            @convert="$emit('convert-result', $event)"
          />
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
import { sanitizeHtml } from '../utils/sanitize'
import { useTransientLayer } from '../composables/useTransientLayer'
import AgentResultTray from './agent/AgentResultTray.vue'

const props = defineProps({
  isOpen: Boolean,
  messages: { type: Array, default: () => [] },
  results: { type: Array, default: () => [] },
  loading: Boolean,
  quickQuestions: { type: Array, default: () => [] },
  notice: { type: String, default: '' },
  contextLabel: { type: String, default: '' },
  returnFocus: { type: Function, default: null },
  placeholder: { type: String, default: '输入你的问题... (Ctrl+Enter 发送)' },
  emptyText: { type: String, default: '统一智能顾问可帮助你分析当前创作状态，提供建议和灵感。' }
})

const emit = defineEmits([
  'close',
  'ask',
  'apply-result',
  'undo-result',
  'undo-domain-result',
  'dismiss-result',
  'convert-result'
])

const localInput = ref('')
const messagesRef = ref(null)
const inputRef = ref(null)
const panelRef = ref(null)
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
  const hasReplacement = String(result.replacement || '').trim().length > 0
  const hasSuggestions = Array.isArray(result.suggestions) && result.suggestions.length > 0
  const hasActions = Array.isArray(result.actions) && result.actions.length > 0
  const hasSummary = String(result.summary || '').trim().length > 0
  return hasReplacement || hasSuggestions || hasActions || hasSummary
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

useTransientLayer({
  id: 'advisor-review',
  isOpen: computed(() => props.isOpen),
  onClose: () => emit('close'),
  initialFocus: () => inputRef.value,
  returnFocus: () => props.returnFocus?.()
})

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
  z-index: var(--z-modal-backdrop, 800);
  background: transparent;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 20px 20px;
}

.advisor-panel {
  position: relative;
  z-index: var(--z-modal, 810);
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

:global(.theme-legacy .advisor-overlay) {
  background: color-mix(in srgb, var(--surface-overlay) 28%, transparent);
}

:global(.theme-legacy .advisor-panel) {
  width: min(430px, calc(100vw - 32px));
  max-height: min(720px, calc(var(--app-viewport-height, 100vh) - 32px));
  border-radius: 4px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-elevated);
}

:global(.theme-legacy .advisor-header) {
  padding: 13px 16px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 7%, var(--bg-secondary)), var(--bg-secondary) 52%);
  border-top: 3px solid color-mix(in srgb, var(--accent-steel, var(--accent)) 70%, var(--border));
}

:global(.theme-legacy .advisor-title) {
  color: var(--text-primary);
  font-size: 13px;
}

:global(.theme-legacy .message.advisor .message-bubble),
:global(.theme-legacy .message-bubble.is-markdown p) {
  padding: 0;
  border-radius: 0;
  background: transparent;
}

:global(.theme-legacy .message.user .message-bubble) {
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
  color: var(--text-primary);
}

:global(.theme-legacy .quick-btn) {
  border-radius: 3px;
}

@media (max-width: 640px) {
  .advisor-overlay {
    padding: 0;
  }

  :global(.theme-legacy .advisor-panel) {
    width: 100%;
    max-height: min(78vh, 680px);
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
  }
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

.advisor-notice {
  margin: 0;
  padding: 9px 10px;
  border-top: 2px solid var(--signal-warning, var(--accent-amber, var(--accent)));
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--signal-warning, var(--accent)));
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.advisor-context {
  margin: 0;
  padding: 2px 0 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.advisor-context span {
  margin-right: 8px;
  color: var(--text-primary);
  font-weight: 650;
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
  opacity: 0.7;
}

.advisor-result-card.stale,
.advisor-result-card.failed {
  border-color: color-mix(in srgb, #d44 45%, var(--border));
}

.advisor-result-card.applying {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
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
  flex-shrink: 0;
}

.result-status.success {
  color: color-mix(in srgb, var(--accent) 80%, #6c6);
}

.result-status.error {
  color: #d44;
}

.result-status.info {
  color: var(--accent);
}

.result-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.result-summary.is-markdown :deep(p) {
  margin: 0 0 6px;
}

.result-summary.is-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.result-summary.is-markdown :deep(ul),
.result-summary.is-markdown :deep(ol) {
  margin: 4px 0;
  padding-left: 18px;
}

.result-summary.is-markdown :deep(li) {
  margin: 2px 0;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-section-label {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.85;
}

.result-suggestion-list,
.result-action-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
}

.result-suggestion-list li,
.result-action-list li {
  margin: 2px 0;
}

.result-action-label {
  font-size: 11px;
  color: var(--accent);
  opacity: 0.85;
}

.result-action-content {
  margin: 2px 0 0;
  padding: 0;
  background: transparent;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
}

.result-detail {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.result-detail.error {
  color: #d44;
}

.result-detail.info {
  color: var(--accent);
  opacity: 0.9;
}

.result-replacement {
  margin: 0;
  max-height: 140px;
  overflow: auto;
  padding: 8px 0 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
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
  transition: all 0.15s;
}

.result-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.result-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.result-btn.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.result-btn.primary:disabled {
  background: color-mix(in srgb, var(--accent) 30%, var(--bg-secondary));
  border-color: transparent;
  color: var(--text-secondary);
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
