<template>
  <section class="online-room" aria-label="联机房间">
    <div class="online-room__header">
      <div class="online-room__title-row">
        <h1 class="online-room__slug" v-if="roomSlug">{{ roomSlug }}</h1>
        <span class="online-room__state" :data-state="connectionState">
          {{ stateLabel }}
        </span>
      </div>
      <div class="online-room__actions">
        <button
          class="online-room__action-btn"
          title="复制房间链接"
          aria-label="复制房间链接"
          @click="copyLink"
        >复制链接</button>
        <button
          class="online-room__action-btn online-room__action-btn--leave"
          aria-label="离开房间"
          @click="leaveRoom"
        >离开</button>
      </div>
    </div>

    <div v-if="error" class="online-room__error" role="alert">{{ error }}</div>

    <div class="online-room__body">
      <aside class="online-room__sidebar">
        <div class="online-room__section">
          <h2 class="online-room__section-title">成员 ({{ members.length }})</h2>
          <ul class="online-room__member-list" aria-label="在线成员">
            <li
              v-for="m in members"
              :key="m.id"
              class="online-room__member"
            >
              <span class="online-room__member-name">{{ m.nickname }}</span>
              <span v-if="m.role === 'host'" class="online-room__member-badge">房主</span>
            </li>
          </ul>
        </div>

        <div class="online-room__section" v-if="proposals.length">
          <h2 class="online-room__section-title">动作提议</h2>
          <ul class="online-room__proposal-list" aria-label="动作提议">
            <li
              v-for="p in proposals"
              :key="p.id"
              class="online-room__proposal"
              :class="{ 'is-selected': p.selected }"
            >
              <span class="online-room__proposal-text">{{ p.text }}</span>
              <div class="online-room__proposal-votes" v-if="votes[p.id]?.length">
                <span class="online-room__proposal-vote-count">{{ votes[p.id].length }} 票</span>
              </div>
              <div class="online-room__proposal-actions">
                <button
                  v-if="!p.selected"
                  class="online-room__proposal-btn"
                  aria-label="投票支持此提议"
                  @click="castVote(p.id)"
                >投票</button>
                <button
                  v-if="isHost && !p.selected"
                  class="online-room__proposal-btn online-room__proposal-btn--host"
                  aria-label="选择此动作为当前执行项"
                  @click="selectAction(p.id)"
                >选定</button>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <main class="online-room__chat">
        <div class="online-room__chat-messages" aria-label="聊天消息">
          <div
            v-for="(msg, i) in chatMessages"
            :key="i"
            class="online-room__chat-msg"
          >
            <span class="online-room__chat-author">{{ msg.nickname || msg.actorId }}:</span>
            <span class="online-room__chat-text">{{ msg.text }}</span>
          </div>
          <div v-if="!chatMessages.length" class="online-room__chat-empty">
            房间已建立，在这里发言
          </div>
        </div>
        <form class="online-room__chat-input" @submit.prevent="onSendChat" aria-label="发送消息">
          <label for="online-chat-input" class="sr-only">消息输入</label>
          <input
            id="online-chat-input"
            v-model="draftChat"
            class="online-room__chat-field"
            placeholder="输入消息..."
            maxlength="1000"
            :disabled="!isConnected"
            aria-label="消息内容"
          />
          <button
            type="submit"
            class="online-room__chat-send"
            :disabled="!isConnected || !draftChat.trim()"
            aria-label="发送消息"
          >发送</button>
        </form>
      </main>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  roomSlug: { type: String, default: '' },
  connectionState: { type: String, default: 'idle' },
  error: { type: String, default: null },
  members: { type: Array, default: () => [] },
  chatMessages: { type: Array, default: () => [] },
  proposals: { type: Array, default: () => [] },
  votes: { type: Object, default: () => ({}) },
  isHost: { type: Boolean, default: false },
  isConnected: { type: Boolean, default: false }
})

const emit = defineEmits(['send-chat', 'vote', 'select-action', 'leave', 'copy-link'])

const draftChat = ref('')

const stateLabel = computed(() => {
  switch (props.connectionState) {
    case 'connecting': return '连接中...'
    case 'connected': return '已连接'
    case 'reconnecting': return '重新连接...'
    case 'disconnected': return '已断开'
    default: return '未连接'
  }
})

function onSendChat() {
  const text = draftChat.value.trim()
  if (!text) return
  emit('send-chat', text)
  draftChat.value = ''
}

function copyLink() {
  emit('copy-link')
}

function castVote(proposalId) {
  emit('vote', proposalId)
}

function selectAction(proposalId) {
  emit('select-action', proposalId)
}

function leaveRoom() {
  emit('leave')
}
</script>

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

.online-room {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg-primary);
}

.online-room__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 18%, transparent));
  min-height: 48px;
}

.online-room__title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.online-room__slug {
  font-family: var(--font-display, var(--font-sans));
  font-size: 18px;
  font-weight: 400;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-room__state {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--hairline-soft, currentColor);
  color: var(--text-muted);
  white-space: nowrap;
}

.online-room__state[data-state="connected"] {
  color: var(--accent-emerald, #2d9978);
  border-color: color-mix(in srgb, var(--accent-emerald, #2d9978) 40%, transparent);
}

.online-room__state[data-state="connecting"],
.online-room__state[data-state="reconnecting"] {
  color: var(--accent-amber, #c7891f);
  border-color: color-mix(in srgb, var(--accent-amber, #c7891f) 40%, transparent);
}

.online-room__state[data-state="disconnected"] {
  color: var(--accent, #b84b35);
  border-color: color-mix(in srgb, var(--accent, #b84b35) 40%, transparent);
}

.online-room__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.online-room__action-btn {
  font-family: var(--font-sans);
  font-size: 12px;
  padding: 6px 12px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 22%, transparent));
  cursor: pointer;
  transition: color 0.18s ease, border-color 0.18s ease;
}

.online-room__action-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent-gold, var(--text-secondary));
}

.online-room__action-btn--leave {
  color: var(--accent-rose, #b95567);
  border-color: color-mix(in srgb, var(--accent-rose, #b95567) 36%, transparent);
}

.online-room__action-btn--leave:hover {
  color: var(--accent, #b84b35);
  border-color: var(--accent, #b84b35);
}

.online-room__error {
  margin: 0;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--accent-rose, #b95567);
  background: var(--accent-rose-light, rgba(185, 85, 103, 0.12));
  border-bottom: 1px solid color-mix(in srgb, var(--accent-rose, #b95567) 22%, transparent);
}

.online-room__body {
  display: grid;
  grid-template-columns: 260px 1fr;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.online-room__sidebar {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  background: var(--bg-secondary);
  border-right: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 14%, transparent));
  overflow-y: auto;
}

.online-room__section {
  padding: 16px;
  border-bottom: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 14%, transparent));
}

.online-room__section-title {
  font-family: var(--font-display, var(--font-sans));
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
  margin: 0 0 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.online-room__member-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.online-room__member {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.online-room__member-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-room__member-badge {
  font-size: 10px;
  padding: 1px 6px;
  color: var(--archive-gold, #b78a34);
  border: 1px solid color-mix(in srgb, var(--archive-gold, #b78a34) 22%, transparent);
  white-space: nowrap;
}

.online-room__proposal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.online-room__proposal {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 16%, transparent));
  background: var(--bg-primary);
}

.online-room__proposal.is-selected {
  border-color: var(--accent-gold, var(--archive-gold));
  background: color-mix(in srgb, var(--archive-gold, var(--accent-amber)) 8%, var(--bg-primary));
}

.online-room__proposal-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

.online-room__proposal-votes {
  display: flex;
  align-items: center;
}

.online-room__proposal-vote-count {
  font-size: 11px;
  color: var(--text-muted);
}

.online-room__proposal-actions {
  display: flex;
  gap: 6px;
}

.online-room__proposal-btn {
  font-family: var(--font-sans);
  font-size: 11px;
  padding: 3px 10px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 22%, transparent));
  cursor: pointer;
  transition: color 0.18s ease, border-color 0.18s ease;
}

.online-room__proposal-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent, var(--text-secondary));
}

.online-room__proposal-btn--host {
  color: var(--archive-gold, #b78a34);
  border-color: color-mix(in srgb, var(--archive-gold, #b78a34) 36%, transparent);
}

.online-room__chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.online-room__chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.online-room__chat-msg {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
  word-break: break-word;
}

.online-room__chat-author {
  font-weight: 600;
  margin-right: 6px;
  color: var(--text-secondary);
}

.online-room__chat-empty {
  font-size: 13px;
  color: var(--text-muted);
  font-style: italic;
  padding: 24px 0;
}

.online-room__chat-input {
  display: flex;
  gap: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 14%, transparent));
  background: var(--bg-secondary);
}

.online-room__chat-field {
  flex: 1;
  font-family: var(--font-sans);
  font-size: 13px;
  padding: 8px 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 22%, transparent));
  outline: none;
  min-width: 0;
}

.online-room__chat-field:focus {
  border-color: var(--accent-teal, #0d8b7b);
}

.online-room__chat-field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.online-room__chat-send {
  font-family: var(--font-sans);
  font-size: 12px;
  padding: 8px 16px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 22%, transparent));
  border-left: none;
  cursor: pointer;
  transition: background 0.18s ease;
}

.online-room__chat-send:hover:not(:disabled) {
  background: var(--bg-hover);
}

.online-room__chat-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .online-room__body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .online-room__sidebar {
    border-right: none;
    border-bottom: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 14%, transparent));
    max-height: 40vh;
  }
}
</style>
