<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnlineRoom } from '../composables/useOnlineRoom'
import { createExperienceSessionAdapter } from '../services/experience/experienceSessionAdapter'
import { scrubCollaborationInviteFragment } from '../services/collaboration/endpoint'
import OnlineChatOverlay from '../components/experience/OnlineChatOverlay.vue'
import OnlineRoomPanel from '../components/experience/OnlineRoomPanel.vue'
import Experience from './Experience.vue'

const route = useRoute()
const router = useRouter()

const roomSlug = computed(() => route.params.roomSlug || '')
const inviteCredentials = import.meta.env.VITE_COLLABORATION_V2_ENABLED === 'true' && /^#(?:invite|secret|contentKey)=/.test(window.location.hash)
  ? scrubCollaborationInviteFragment()
  : null

const {
  members,
  events,
  chatMessages,
  proposals,
  votes,
  connectionState,
  error,
  nickname,
  isHost,
  isConnected,
  shareInviteUrl,
  refreshShareInviteState,
  joinRoom,
  createRoom,
  leaveRoom,
  sendChat,
  proposeAction,
  sendCommand,
  castVote,
  selectAction
} = useOnlineRoom({ inviteCredentials })

const sessionAdapter = createExperienceSessionAdapter({
  events,
  isHost,
  sendCommand
})
const onlineSession = {
  adapter: sessionAdapter,
  isHost,
  isConnected,
  proposeAction
}
const dispatchedEventIds = new Set()

const lobbyNickname = ref(nickname.value || '')
const lobbyRoomSlug = ref(roomSlug.value || '')
const lobbyError = ref('')
const copyError = ref('')
const copyNotice = ref('')
const copyFallbackUrl = ref('')
const roomPanelOpen = ref(false)
const hasEnteredRoom = ref(false)
let pendingCreateSlug = ''
let pendingJoinSlug = ''

function generateSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

async function onEnterRoom() {
  lobbyError.value = ''
  if (!lobbyNickname.value) {
    lobbyError.value = '请输入昵称'
    return
  }
  const targetSlug = lobbyRoomSlug.value || generateSlug()
  pendingJoinSlug = targetSlug
  if (roomSlug.value !== targetSlug) await router.push({ name: 'online-experience', params: { roomSlug: targetSlug } })
  pendingJoinSlug = ''
  hasEnteredRoom.value = true
  await joinRoom(targetSlug, lobbyNickname.value)
}

function onCreateRoom() {
  lobbyError.value = ''
  if (!lobbyNickname.value) {
    lobbyError.value = '请输入昵称'
    return
  }
  const targetSlug = generateSlug()
  pendingCreateSlug = targetSlug
  hasEnteredRoom.value = true
  router.push({ name: 'online-experience', params: { roomSlug: targetSlug } }).then(() => createRoom(targetSlug, lobbyNickname.value))
}

function onRoomSendChat(text) {
  sendChat(text)
}

function onRoomVote(proposalId) {
  castVote(proposalId)
}

function onRoomSelectAction(proposalId) {
  selectAction(proposalId)
  const proposal = proposals.find((item) => item.id === proposalId)
  if (proposal) {
    sessionAdapter.requestNarrative({ proposalId, text: proposal.text })
  }
}

function onRoomLeave() {
  copyFallbackUrl.value = ''
  copyNotice.value = ''
  copyError.value = ''
  roomPanelOpen.value = false
  leaveRoom()
  hasEnteredRoom.value = false
  router.push({ name: 'online-experience' })
}

async function onCopyRoomLink() {
  copyError.value = ''
  copyNotice.value = ''
  copyFallbackUrl.value = ''
  const sourceRoom = roomSlug.value
  let url = ''
  if (import.meta.env.VITE_COLLABORATION_V2_ENABLED === 'true') {
    refreshShareInviteState()
    url = shareInviteUrl.value
    if (!url) {
      copyError.value = '分享邀请已过期或尚未生成，请由房主重新创建邀请'
      return
    }
  } else {
    url = new URL(router.resolve({ name: 'online-experience', params: { roomSlug: sourceRoom } }).href, window.location.href).href
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable')
    await navigator.clipboard.writeText(url)
    if (roomSlug.value === sourceRoom && hasEnteredRoom.value) copyNotice.value = '房间链接已复制'
  } catch {
    if (roomSlug.value !== sourceRoom || !hasEnteredRoom.value) return
    copyError.value = '浏览器未能复制，请选中下方链接手动复制。'
    copyFallbackUrl.value = url
  }
}

watch(roomSlug, (newSlug) => {
  if (newSlug && lobbyNickname.value) {
    if (pendingCreateSlug === newSlug) { pendingCreateSlug = ''; return }
    if (pendingJoinSlug === newSlug) return
    hasEnteredRoom.value = true
    if (connectionState.value === 'idle') joinRoom(newSlug, lobbyNickname.value)
  }
}, { immediate: true })

watch(() => events.length, () => {
  for (const event of events) {
    if (!event?.id || dispatchedEventIds.has(event.id)) continue
    dispatchedEventIds.add(event.id)
    sessionAdapter.handleEvent(event)
  }
})

</script>

<template>
  <div class="online-page">
    <div class="online-page__body">
      <div v-if="!roomSlug || !hasEnteredRoom" class="online-page__lobby">
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

      <div v-else-if="roomSlug" class="online-page__room" :class="{ 'is-room-panel-open': roomPanelOpen }">
        <button type="button" class="online-page__room-toggle control-quiet" :aria-expanded="roomPanelOpen" aria-controls="online-room-panel" @click="roomPanelOpen = !roomPanelOpen">
          <span>房间 · {{ members.length }} 人<template v-if="proposals.length"> · {{ proposals.length }} 项提议</template></span>
          <span>{{ roomPanelOpen ? '收起' : '查看' }}</span>
        </button>
        <div class="online-page__stage">
          <Experience class="online-page__experience" :online-session="onlineSession" />
          <OnlineChatOverlay
            :messages="chatMessages"
            :is-connected="isConnected"
            @send="onRoomSendChat"
          />
        </div>
        <div id="online-room-panel" class="online-page__room-panel">
        <OnlineRoomPanel
          compact
          :room-slug="roomSlug"
          :connection-state="connectionState"
          :error="copyError || error"
          :members="members"
          :proposals="proposals"
          :votes="votes"
          :is-host="isHost"
          @vote="onRoomVote"
          @select-action="onRoomSelectAction"
          @leave="onRoomLeave"
          @copy-link="onCopyRoomLink"
        />
        <p v-if="copyNotice" class="online-page__copy-notice" role="status">{{ copyNotice }}</p>
        <input v-if="copyFallbackUrl" class="online-page__copy-fallback" :value="copyFallbackUrl" readonly aria-label="手动复制房间链接" @focus="$event.target.select()" />
        </div>
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
  display: block;
  position: relative;
}

.online-page__experience {
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.online-page__stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.online-page__room-toggle { display: none; }
.online-page__copy-notice { margin: 0; padding: 8px 12px; color: var(--text-secondary); background: var(--bg-primary); font-size: 12px; }
.online-page__copy-fallback { width: 100%; box-sizing: border-box; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 18%, transparent)); padding: 10px; font-size: 12px; }

.online-page__room-panel {
  position: absolute;
  top: 54px;
  right: 12px;
  z-index: 9;
  width: min(220px, calc(100% - 24px));
}

@media (max-width: 900px) {
  .online-page__room-panel {
    top: 52px;
    right: 10px;
    width: min(210px, calc(100% - 20px));
  }
}

@media (max-width: 760px) {
  .online-page__room { display: flex; flex-direction: column; }
  .online-page__room-toggle { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; min-height: 44px; width: 100%; padding: 8px 18px; color: var(--text-secondary); background: var(--bg-primary); border-bottom: 1px solid var(--hairline-soft, color-mix(in srgb, var(--text-muted) 18%, transparent)); font-size: 12px; }
  .online-page__room-panel { display: none; position: static; order: 1; flex: 0 0 auto; width: auto; max-height: 38vh; overflow: auto; margin: 0 10px 8px; }
  .is-room-panel-open .online-page__room-panel { display: block; }
  .online-page__stage { order: 2; flex: 1 1 0; height: auto; }
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
