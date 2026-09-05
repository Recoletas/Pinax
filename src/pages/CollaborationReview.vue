<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import RehearsalReviewSurface from '../components/collaboration/RehearsalReviewSurface.vue'
import { createAuthoringRehearsalRoomController } from '../services/collaboration/authoringRehearsalRoom.js'
import { scrubAuthoringRehearsalInviteFragment } from '../services/collaboration/endpoint.js'

const enabled = import.meta.env.VITE_COLLABORATION_V2_ENABLED === 'true'
const router = useRouter()
const heading = ref(null)
const displayName = ref(sessionStorage.getItem('pinax.collaboration.reviewName') || '')
const joining = ref(false)
const busyAction = ref('')
const pageError = ref('')
let inviteCredentials = null

try {
  if (!enabled) throw new Error('共同排演当前未启用')
  inviteCredentials = scrubAuthoringRehearsalInviteFragment()
} catch (error) {
  pageError.value = error?.message || '邀请链接无效或已失效'
}

const controller = createAuthoringRehearsalRoomController({ enabled })
const roomState = shallowRef({ ...controller.state })
const unsubscribe = controller.subscribe(value => { roomState.value = value })
const joined = computed(() => Boolean(roomState.value.room?.roomId && roomState.value.role === 'reviewer'))

async function join() {
  if (joining.value || !inviteCredentials || !displayName.value.trim()) return
  joining.value = true
  pageError.value = ''
  const result = await controller.joinGuestRoom({ invite: inviteCredentials, displayName: displayName.value.trim() })
  joining.value = false
  if (!result.ok) {
    pageError.value = result.reason || '无法进入排演房间'
    return
  }
  sessionStorage.setItem('pinax.collaboration.reviewName', displayName.value.trim())
  inviteCredentials = null
  await nextTick()
  heading.value?.focus({ preventScroll: true })
}

async function run(action, task) {
  if (busyAction.value) return
  busyAction.value = action
  pageError.value = ''
  const result = await task()
  busyAction.value = ''
  if (!result?.ok) pageError.value = result?.reason || '操作未完成'
}

function propose(payload) { return run('proposal', () => controller.proposeDirection(payload)) }
function vote(payload) { return run(`vote:${payload.proposalId}`, () => controller.castVote(payload)) }
function leave() { controller.disconnect(); router.push({ name: 'welcome' }) }

onMounted(() => {
  if (inviteCredentials && displayName.value.trim()) join()
  else if (!inviteCredentials) nextTick(() => heading.value?.focus({ preventScroll: true }))
})
onUnmounted(() => { unsubscribe(); controller.destroy(); inviteCredentials = null })
</script>

<template>
  <main class="collaboration-review-page">
    <header class="collaboration-review-page__mast">
      <div>
        <span>Pinax · 受邀审阅</span>
        <h1 tabindex="-1" ref="heading">共同排演</h1>
      </div>
    </header>

    <section v-if="!joined" class="collaboration-review-page__join" aria-labelledby="join-title">
      <span>只读共享范围</span>
      <h2 id="join-title">进入作者邀请的排演房间</h2>
      <p>你只能看到作者明确分享的片段和依据；建议与投票不会直接修改正文。</p>
      <form @submit.prevent="join">
        <label for="collaboration-review-name">显示名称</label>
        <input id="collaboration-review-name" v-model="displayName" maxlength="60" autocomplete="nickname" :disabled="joining" autofocus>
        <button type="submit" :disabled="joining || !displayName.trim()">{{ joining ? '正在进入…' : '进入房间' }}</button>
      </form>
      <p v-if="pageError" class="collaboration-review-page__error" role="alert">{{ pageError }}</p>
    </section>

    <div v-else class="collaboration-review-page__surface">
      <RehearsalReviewSurface
        mode="reviewer"
        :connection-state="roomState.connectionState"
        :members="roomState.members"
        :artifacts="roomState.artifacts"
        :proposals="roomState.proposals"
        :votes="roomState.votes"
        :generation="roomState.generation"
        :busy-action="busyAction"
        :error="roomState.error || pageError"
        :stale="roomState.stale"
        @propose="propose"
        @vote="vote"
        @leave="leave"
      />
    </div>
  </main>
</template>

<style scoped>
.collaboration-review-page { box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 100%; height: 100%; background: var(--surface-primary); color: var(--text-primary); }
.collaboration-review-page__mast { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 58px; padding: 9px 24px; border-bottom: 1px solid var(--border-subtle); background: var(--authoring-chrome-surface, var(--surface-primary)); }
.collaboration-review-page__mast span { color: var(--text-secondary); font-size: 11px; }
.collaboration-review-page__mast h1 { margin: 2px 0 0; font-size: 17px; font-weight: 620; outline: none; }
.collaboration-review-page__surface { min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; }
.collaboration-review-page__join { align-self: start; width: min(520px, calc(100% - 32px)); margin: clamp(40px, 12vh, 120px) auto 0; }
.collaboration-review-page__join > span { color: var(--accent-primary); font-size: 12px; }
.collaboration-review-page__join h2 { margin: 7px 0 8px; font-size: clamp(22px, 3vw, 30px); }
.collaboration-review-page__join p { color: var(--text-secondary); line-height: 1.7; }
.collaboration-review-page__join form { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 24px; }
.collaboration-review-page__join label { grid-column: 1 / -1; color: var(--text-secondary); font-size: 12px; }
.collaboration-review-page__join input { min-width: 0; height: 42px; padding: 0 11px; border: 1px solid var(--border-subtle); background: var(--surface-raised); color: inherit; font: inherit; }
.collaboration-review-page__join button { min-height: 42px; padding: 0 18px; border: 0; border-bottom: 2px solid var(--accent-primary); background: var(--surface-workbench-muted, var(--surface-raised)); color: inherit; }
.collaboration-review-page__error { color: var(--signal-danger) !important; }
@media (max-width: 520px), (pointer: coarse) { .collaboration-review-page button, .collaboration-review-page input { min-height: 44px; } }
@media (max-width: 520px) { .collaboration-review-page__mast { min-height: 50px; padding-inline: 14px; } .collaboration-review-page__join { margin-top: 36px; } .collaboration-review-page__join form { grid-template-columns: 1fr; } }
</style>
