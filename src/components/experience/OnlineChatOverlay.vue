<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useTransientLayer } from '../../composables/useTransientLayer'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  isConnected: { type: Boolean, default: false }
})

const emit = defineEmits(['send'])

const rootRef = ref(null)
const inputRef = ref(null)
const toggleRef = ref(null)
const opened = ref(false)
const expanded = ref(false)
const draft = ref('')
const feedRef = ref(null)
const showPanel = computed(() => props.messages.length > 0 || opened.value)
const visibleMessages = computed(() => {
  const limit = expanded.value ? 30 : 4
  return props.messages.slice(-limit)
})

watch(() => props.messages.length, (count) => {
  if (count > 0) opened.value = true
  scrollToLatest()
})
watch(expanded, scrollToLatest)

function scrollToLatest() {
  nextTick(() => {
    if (feedRef.value) feedRef.value.scrollTop = feedRef.value.scrollHeight
  })
}

function sendMessage() {
  const text = draft.value.trim()
  if (!text || !props.isConnected) return
  emit('send', text)
  draft.value = ''
}

function openChat() {
  opened.value = true
  nextTick(() => inputRef.value?.focus())
}

function handleFocusOut() {
  setTimeout(() => {
    if (props.messages.length || draft.value.trim()) return
    if (rootRef.value?.contains(document.activeElement)) return
    opened.value = false
    expanded.value = false
  }, 0)
}

function collapseChat() {
  expanded.value = false
}

useTransientLayer({
  id: 'online-chat',
  isOpen: expanded,
  onClose: collapseChat,
  initialFocus: () => inputRef.value,
  returnFocus: () => toggleRef.value
})
</script>

<template>
  <button
    v-if="!showPanel"
    type="button"
    class="online-chat-launcher"
    title="打开房间聊天"
    aria-label="打开房间聊天"
    @click="openChat"
  >
    <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="M3 3.5h12v8H8l-3.5 3v-3H3z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
  <section
    v-else
    ref="rootRef"
    class="online-chat"
    :class="{ 'is-expanded': expanded }"
    aria-label="房间聊天"
    @focusout="handleFocusOut"
  >
    <header class="online-chat__header">
      <span class="online-chat__presence" :class="{ 'is-connected': isConnected }" aria-hidden="true"></span>
      <span class="online-chat__title">房间聊天</span>
      <span v-if="messages.length" class="online-chat__count">{{ messages.length }}</span>
      <button
        ref="toggleRef"
        type="button"
        class="online-chat__toggle"
        :title="expanded ? '收起聊天记录' : '展开聊天记录'"
        :aria-label="expanded ? '收起聊天记录' : '展开聊天记录'"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path :d="expanded ? 'M4 6l4 4 4-4' : 'M4 10l4-4 4 4'" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </header>

    <div ref="feedRef" class="online-chat__feed" role="log" aria-live="polite" aria-relevant="additions">
      <p
        v-for="(message, index) in visibleMessages"
        :key="message.id || `${message.actorId || 'member'}-${index}`"
        class="online-chat__line"
      >
        <strong>{{ message.nickname || message.actorId || '成员' }}</strong>
        <span>{{ message.text }}</span>
      </p>
      <p v-if="!visibleMessages.length" class="online-chat__empty">还没有消息</p>
    </div>

    <form class="online-chat__composer" aria-label="发送房间消息" @submit.prevent="sendMessage">
      <label for="online-chat-overlay-input" class="sr-only">消息内容</label>
      <input
        id="online-chat-overlay-input"
        ref="inputRef"
        v-model="draft"
        class="online-chat__input"
        maxlength="1000"
        :disabled="!isConnected"
        :placeholder="isConnected ? '输入消息' : '等待连接'"
        @focus="expanded = true"
      />
      <button
        type="submit"
        class="online-chat__send"
        :disabled="!isConnected || !draft.trim()"
        title="发送消息"
        aria-label="发送消息"
      >
        <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M15.5 2.5L8 10M15.5 2.5l-4 13-3.5-5-5-3.5 12.5-4.5z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </form>
  </section>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.online-chat {
  position: absolute;
  left: 18px;
  bottom: 68px;
  z-index: var(--z-popover, 400);
  width: min(390px, calc(100% - 36px));
  display: grid;
  grid-template-rows: 30px minmax(0, 88px) 36px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 62%, transparent);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--bg-primary) 20%, transparent);
  backdrop-filter: blur(8px);
  color: var(--text-primary);
  transition: grid-template-rows 0.18s ease, border-color 0.18s ease;
}

.online-chat-launcher {
  position: absolute;
  left: 16px;
  bottom: 68px;
  z-index: var(--z-popover, 400);
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 58%, transparent);
  color: var(--text-secondary);
  box-shadow: 0 5px 14px color-mix(in srgb, var(--bg-primary) 18%, transparent);
  backdrop-filter: blur(7px);
  cursor: pointer;
}

.online-chat-launcher:hover {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--archive-gold, var(--text-secondary)) 42%, transparent);
}

.online-chat-launcher:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-gold, var(--text-secondary)) 60%, transparent);
  outline-offset: 2px;
}

.online-chat.is-expanded {
  grid-template-rows: 30px minmax(0, 220px) 38px;
  border-color: color-mix(in srgb, var(--archive-gold, var(--text-secondary)) 32%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 76%, transparent);
}

.online-chat__header {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 7px 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 14%, transparent);
}

.online-chat__presence {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.55;
}

.online-chat__presence.is-connected {
  background: var(--accent-emerald, var(--accent));
  opacity: 1;
}

.online-chat__title {
  min-width: 0;
  flex: 1;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.online-chat__count {
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.online-chat__toggle,
.online-chat__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.online-chat__toggle {
  width: 26px;
  height: 26px;
  padding: 0;
}

.online-chat__toggle:hover,
.online-chat__send:hover:not(:disabled) {
  color: var(--text-primary);
}

.online-chat__toggle:focus-visible,
.online-chat__send:focus-visible,
.online-chat__input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-gold, var(--text-secondary)) 60%, transparent);
  outline-offset: -2px;
}

.online-chat__feed {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 11px;
  scrollbar-width: thin;
}

.online-chat__line {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 7px;
  margin: 0 0 4px;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.45;
}

.online-chat__line strong {
  max-width: 96px;
  overflow: hidden;
  color: var(--archive-gold, var(--text-secondary));
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-chat__line span {
  min-width: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.online-chat__empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.online-chat__composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  border-top: 1px solid color-mix(in srgb, var(--text-muted) 16%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 40%, transparent);
}

.online-chat__input {
  min-width: 0;
  width: 100%;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 12px;
  outline: none;
}

.online-chat__input::placeholder {
  color: var(--text-muted);
}

.online-chat__input:disabled,
.online-chat__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.online-chat__send {
  width: 36px;
  height: 100%;
  padding: 0;
  border-left: 1px solid color-mix(in srgb, var(--text-muted) 16%, transparent);
}

@media (max-width: 640px) {
  .online-chat {
    left: 10px;
    right: 10px;
    bottom: 68px;
    width: auto;
    grid-template-rows: 28px minmax(0, 66px) 34px;
  }

  .online-chat-launcher {
    left: 16px;
    bottom: 68px;
  }

  .online-chat.is-expanded {
    grid-template-rows: 28px minmax(0, 150px) 36px;
  }
}
</style>
