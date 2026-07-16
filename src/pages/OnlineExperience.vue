<template>
  <div class="online-page">
    <div class="online-page__body">
      <div v-if="!roomSlug" class="online-page__lobby">
        <div class="online-page__lobby-card">
          <h1 class="online-page__lobby-title">联机体验</h1>
          <p class="online-page__lobby-desc">创建或加入一个房间，与朋友一起进行文字冒险</p>

          <form class="online-page__lobby-form" @submit.prevent="onEnterRoom">
            <div class="online-page__field">
              <label for="online-nickname" class="online-page__label">昵称</label>
              <input
                id="online-nickname"
                v-model.trim="lobbyNickname"
                class="online-page__input"
                placeholder="您的显示名称"
                maxlength="32"
                aria-label="昵称"
              />
            </div>
            <div class="online-page__field">
              <label for="online-room-slug" class="online-page__label">房间码</label>
              <input
                id="online-room-slug"
                v-model.trim="lobbyRoomSlug"
                class="online-page__input"
                placeholder="输入房间码加入已有房间；留空创建新房间"
                maxlength="64"
                aria-label="房间码"
              />
            </div>
            <div class="online-page__lobby-actions">
              <button
                type="submit"
                class="online-page__btn online-page__btn--primary"
                :disabled="!lobbyNickname"
                aria-label="加入房间"
              >加入</button>
              <button
                type="button"
                class="online-page__btn"
                :disabled="!lobbyNickname"
                aria-label="创建新房间"
                @click="onCreateRoom"
              >创建新房间</button>
            </div>
          </form>

          <p v-if="lobbyError" class="online-page__lobby-error" role="alert">{{ lobbyError }}</p>
          <p class="online-page__lobby-note">房间断开或服务器重启后失效。</p>
        </div>
      </div>

      <div v-else-if="roomSlug" class="online-page__room">
        <OnlineRoomPanel
          :room-slug="roomSlug"
          :connection-state="connectionState"
          :error="error"
          :members="members"
          :chat-messages="chatMessages"
          :proposals="proposals"
          :votes="votes"
          :is-host="isHost"
          :is-connected="isConnected"
          @send-chat="onRoomSendChat"
          @vote="onRoomVote"
          @select-action="onRoomSelectAction"
          @leave="onRoomLeave"
          @copy-link="onCopyRoomLink"
        />
        <div v-if="connectionState === 'connecting'" class="online-page__overlay">
          <span class="online-page__spinner" aria-label="连接中">连接中...</span>
        </div>
        <div v-else-if="connectionState === 'reconnecting'" class="online-page__overlay">
          <span class="online-page__spinner" aria-label="重新连接中">重新连接...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnlineRoom } from '../composables/useOnlineRoom'
import OnlineRoomPanel from '../components/experience/OnlineRoomPanel.vue'

const route = useRoute()
const router = useRouter()

const roomSlug = computed(() => route.params.roomSlug || '')

const {
  members,
  chatMessages,
  proposals,
  votes,
  connectionState,
  error,
  nickname,
  isHost,
  isConnected,
  joinRoom,
  leaveRoom,
  sendChat,
  castVote,
  selectAction
} = useOnlineRoom()

const lobbyNickname = ref(nickname.value || '')
const lobbyRoomSlug = ref('')
const lobbyError = ref('')

function generateSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

function onEnterRoom() {
  lobbyError.value = ''
  if (!lobbyNickname.value) {
    lobbyError.value = '请输入昵称'
    return
  }
  const targetSlug = lobbyRoomSlug.value || generateSlug()
  router.push({ name: 'online-experience', params: { roomSlug: targetSlug } })
}

function onCreateRoom() {
  lobbyError.value = ''
  if (!lobbyNickname.value) {
    lobbyError.value = '请输入昵称'
    return
  }
  const targetSlug = generateSlug()
  router.push({ name: 'online-experience', params: { roomSlug: targetSlug } })
}

function onRoomSendChat(text) {
  sendChat(text)
}

function onRoomVote(proposalId) {
  castVote(proposalId)
}

function onRoomSelectAction(proposalId) {
  selectAction(proposalId)
}

function onRoomLeave() {
  leaveRoom()
  router.push({ name: 'online-experience' })
}

function onCopyRoomLink() {
  const url = window.location.href
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).catch(() => {})
  }
}

watch(roomSlug, (newSlug) => {
  if (newSlug && lobbyNickname.value) {
    joinRoom(newSlug, lobbyNickname.value)
  }
}, { immediate: true })

onMounted(() => {
  if (!nickname.value && roomSlug.value) {
    router.push({ name: 'online-experience' })
  }
})
</script>

<style scoped>
.online-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.online-page__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.online-page__lobby {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.online-page__lobby-card {
  max-width: 420px;
  width: 100%;
  padding: 32px;
  background: var(--bg-secondary);
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 14%, transparent));
}

.online-page__lobby-title {
  font-family: var(--font-display, var(--font-sans));
  font-size: 22px;
  font-weight: 400;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: 0.04em;
}

.online-page__lobby-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.online-page__lobby-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.online-page__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.online-page__label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.online-page__input {
  font-family: var(--font-sans);
  font-size: 14px;
  padding: 10px 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 22%, transparent));
  outline: none;
}

.online-page__input:focus {
  border-color: var(--accent-teal, #0d8b7b);
}

.online-page__lobby-actions {
  display: flex;
  gap: 10px;
  padding-top: 4px;
}

.online-page__btn {
  font-family: var(--font-sans);
  font-size: 13px;
  padding: 10px 20px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 22%, transparent));
  cursor: pointer;
  transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.online-page__btn:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.online-page__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.online-page__btn--primary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--text-secondary);
  font-weight: 600;
}

.online-page__btn--primary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.online-page__lobby-error {
  margin: 16px 0 0;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--accent-rose, #b95567);
  background: var(--accent-rose-light, rgba(185, 85, 103, 0.12));
}

.online-page__lobby-note {
  margin: 16px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.7;
}

.online-page__room {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.online-page__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  z-index: 10;
}

.online-page__spinner {
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
