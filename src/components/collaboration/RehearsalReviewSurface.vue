<script setup>
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps({
  mode: { type: String, default: 'reviewer' },
  connectionState: { type: String, default: 'idle' },
  members: { type: Array, default: () => [] },
  artifacts: { type: Object, default: () => ({}) },
  proposals: { type: Array, default: () => [] },
  votes: { type: Object, default: () => ({}) },
  generation: { type: Object, default: () => ({ requests: {} }) },
  inviteUrl: { type: String, default: '' },
  busyAction: { type: String, default: '' },
  error: { type: String, default: '' },
  stale: Boolean
})
const emit = defineEmits(['copy-invite', 'propose', 'vote', 'select-generate', 'promote', 'leave', 'close'])
const inviteField = ref(null)
const draft = reactive({ directionId: '', body: '', gain: '', cost: '' })
const artifactList = computed(() => Object.values(props.artifacts || {}))
const intervention = computed(() => artifactList.value.find(item => item.kind === 'intervention') || null)
const directionSet = computed(() => artifactList.value.find(item => item.kind === 'direction-set') || null)
const impactGroups = computed(() => artifactList.value.filter(item => item.kind === 'impact-group'))
const branches = computed(() => Object.values(props.generation?.requests || {}).map(item => item.artifact).filter(item => item?.kind === 'rehearsal-branch'))
const directions = computed(() => directionSet.value?.visiblePayload?.directions || [])
const interventionTitle = computed(() => intervention.value?.visiblePayload?.after || '等待作者分享范围')
const actionsDisabled = computed(() => props.stale || Boolean(props.error) || Boolean(props.busyAction) || props.connectionState !== 'connected')
const canPropose = computed(() => !actionsDisabled.value && Boolean(draft.directionId) && Boolean(draft.body.trim()))
const statusCopy = computed(() => {
  if (props.error) return props.error
  if (props.stale) return '原文、房主或排演范围已经变化；当前内容只读。'
  if (props.connectionState === 'connected') return '已连接 · 建议不会直接修改作者正文'
  if (['configuring', 'joining', 'handshaking'].includes(props.connectionState)) return '正在进入排演房间…'
  if (['backoff', 'disconnected'].includes(props.connectionState)) return '连接中断，正在等待恢复。'
  return '尚未连接'
})
const busyCopy = computed(() => {
  if (props.busyAction === 'proposal') return '正在提交建议…'
  if (props.busyAction?.startsWith('vote:')) return '正在提交投票…'
  if (props.busyAction?.startsWith('generation:')) return '正在生成只读排演草稿…'
  if (props.busyAction?.startsWith('promote:')) return '正在转为本地草稿…'
  return ''
})

watch(directions, value => {
  if (!value.some(item => item.directionId === draft.directionId)) draft.directionId = value[0]?.directionId || ''
}, { immediate: true })

function directionLabel(proposal) {
  const id = proposal.binding?.directionId || proposal.directionId
  return directions.value.find(item => item.directionId === id)?.label || '协作方向'
}

function voteCount(proposalId) {
  return Object.values(props.votes?.[proposalId] || {}).filter(value => (value?.value || value) === 'up').length
}

function completedRequest(proposalId) {
  return Object.values(props.generation?.requests || {}).find(item => item.proposalId === proposalId && item.status === 'completed' && item.artifact)
}

function submitProposal() {
  if (!canPropose.value) return
  emit('propose', { directionId: draft.directionId, body: draft.body.trim(), gain: draft.gain.trim(), cost: draft.cost.trim() })
  draft.body = ''
  draft.gain = ''
  draft.cost = ''
}

function copyInvite() {
  inviteField.value?.focus({ preventScroll: true })
  inviteField.value?.select()
  emit('copy-invite')
}
</script>

<template>
  <section class="rehearsal-review" aria-label="共同排演" :aria-busy="Boolean(busyAction)" @keydown.esc="mode === 'host' && emit('close')">
    <header class="rehearsal-review__head">
      <div>
        <span>共同排演</span>
        <strong>{{ interventionTitle }}</strong>
      </div>
    </header>

    <p class="rehearsal-review__status" :class="{ 'is-alert': stale || error }" :role="error ? 'alert' : 'status'">
      <span class="rehearsal-review__signal" aria-hidden="true"></span>
      {{ statusCopy }}
    </p>
    <p v-if="busyCopy" class="rehearsal-review__busy" role="status">{{ busyCopy }}</p>

    <div v-if="mode === 'host' && inviteUrl" class="rehearsal-review__invite">
      <span>邀请链接只包含本房间密钥，不会分享整本作品。</span>
      <input ref="inviteField" :value="inviteUrl" readonly spellcheck="false" aria-label="共同排演邀请链接">
      <button type="button" @click="copyInvite">复制邀请</button>
    </div>

    <section v-if="intervention" class="rehearsal-review__section">
      <header><strong>这次改变</strong><span>作者冻结</span></header>
      <dl class="rehearsal-review__change">
        <div><dt>原先</dt><dd>{{ intervention.visiblePayload.before }}</dd></div>
        <div><dt>改为</dt><dd>{{ intervention.visiblePayload.after }}</dd></div>
        <div v-if="intervention.visiblePayload.rationale"><dt>目的</dt><dd>{{ intervention.visiblePayload.rationale }}</dd></div>
      </dl>
    </section>

    <section v-if="impactGroups.length" class="rehearsal-review__section">
      <header><strong>已确认的牵动</strong><span>{{ impactGroups.length }} 处</span></header>
      <ul class="rehearsal-review__lines">
        <li v-for="artifact in impactGroups" :key="artifact.artifactId">
          <strong>{{ artifact.visiblePayload.title }}</strong>
          <p>{{ artifact.visiblePayload.reason }}</p>
        </li>
      </ul>
    </section>

    <section v-if="directions.length" class="rehearsal-review__section">
      <header><strong>可讨论的方向</strong><span>正文尚未修改</span></header>
      <div class="rehearsal-review__directions">
        <button
          v-for="direction in directions"
          :key="direction.directionId"
          type="button"
          :aria-pressed="draft.directionId === direction.directionId"
          :disabled="actionsDisabled"
          @click="draft.directionId = direction.directionId"
        >
          <strong>{{ direction.label }}</strong>
          <span>{{ direction.intent }}</span>
        </button>
      </div>
      <form class="rehearsal-review__proposal-form" @submit.prevent="submitProposal">
        <label>你的建议<textarea v-model="draft.body" maxlength="4000" :disabled="actionsDisabled" placeholder="说明人物会怎样行动，或这条方向应如何推进"></textarea></label>
        <div>
          <label>所得<input v-model="draft.gain" maxlength="600" :disabled="actionsDisabled" placeholder="这条路会获得什么"></label>
          <label>代价<input v-model="draft.cost" maxlength="600" :disabled="actionsDisabled" placeholder="必须承受什么"></label>
        </div>
        <button type="submit" :disabled="!canPropose">提出方向</button>
      </form>
    </section>

    <section class="rehearsal-review__section">
      <header><strong>房间建议</strong><span>{{ proposals.length }} 条</span></header>
      <ol v-if="proposals.length" class="rehearsal-review__proposals">
        <li v-for="proposal in proposals" :key="proposal.id" :class="{ 'is-selected': proposal.status === 'selected' }">
          <div>
            <strong>{{ directionLabel(proposal) }}</strong>
            <span>{{ proposal.status === 'selected' ? '已选定' : '待讨论' }}</span>
          </div>
          <p>{{ proposal.body }}</p>
          <dl v-if="proposal.gain || proposal.cost">
            <div v-if="proposal.gain"><dt>所得</dt><dd>{{ proposal.gain }}</dd></div>
            <div v-if="proposal.cost"><dt>代价</dt><dd>{{ proposal.cost }}</dd></div>
          </dl>
          <div class="rehearsal-review__proposal-actions">
            <button type="button" :disabled="actionsDisabled" @click="emit('vote', { proposalId: proposal.id, value: 'up' })">赞同 {{ voteCount(proposal.id) }}</button>
            <button v-if="mode === 'host' && proposal.status === 'open'" type="button" :disabled="actionsDisabled" @click="emit('select-generate', proposal.id)">选定并排演</button>
            <button v-if="mode === 'host' && completedRequest(proposal.id)" type="button" :disabled="actionsDisabled" @click="emit('promote', { proposalId: proposal.id, generationRequestId: completedRequest(proposal.id).requestId })">转为本地草稿</button>
          </div>
        </li>
      </ol>
      <p v-else class="rehearsal-review__empty">还没有建议。先从一个方向说起。</p>
    </section>

    <section v-if="branches.length" class="rehearsal-review__section">
      <header><strong>只读排演草稿</strong><span>由房主设备生成</span></header>
      <article v-for="branch in branches" :key="branch.artifactId" class="rehearsal-review__branch">
        <div v-for="draftItem in branch.visiblePayload.preview" :key="`${branch.artifactId}:${draftItem.title}`">
          <strong>{{ draftItem.title }}</strong>
          <p class="is-before">{{ draftItem.before }}</p>
          <p>{{ draftItem.after }}</p>
        </div>
      </article>
    </section>

    <footer class="rehearsal-review__foot">
      <span>{{ members.length }} 人在房间</span>
      <button type="button" @click="emit('leave')">离开房间</button>
    </footer>
  </section>
</template>

<style scoped>
.rehearsal-review { display: flex; flex-direction: column; min-width: 0; min-height: 100%; max-width: 100%; overflow-x: hidden; color: var(--text-primary); background: var(--authoring-chrome-surface, var(--surface-primary)); }
.rehearsal-review__head, .rehearsal-review__section > header, .rehearsal-review__foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rehearsal-review__head { padding: 14px 16px 12px; border-bottom: 1px solid var(--border-subtle); }
.rehearsal-review__head > div { min-width: 0; }
.rehearsal-review__head span, .rehearsal-review__section header span, .rehearsal-review__foot, dt { color: var(--text-secondary); font-size: 12px; }
.rehearsal-review__head strong { display: block; overflow: hidden; margin-top: 3px; text-overflow: ellipsis; white-space: nowrap; }
button { border: 0; background: transparent; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
button:disabled { cursor: not-allowed; opacity: .48; }
.rehearsal-review__status { display: flex; align-items: center; gap: 7px; margin: 0; padding: 9px 16px; color: var(--text-secondary); font-size: 12px; border-bottom: 1px solid var(--border-subtle); overflow-wrap: anywhere; }
.rehearsal-review__busy { margin: 0; padding: 8px 16px; color: var(--text-secondary); font-size: 12px; border-bottom: 1px solid var(--border-subtle); }
.rehearsal-review__signal { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-primary); }
.rehearsal-review__status.is-alert { color: var(--signal-danger); }
.rehearsal-review__status.is-alert .rehearsal-review__signal { background: currentColor; }
.rehearsal-review__invite { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 10px; padding: 10px 16px; background: var(--surface-workbench-muted, var(--surface-raised)); font-size: 12px; }
.rehearsal-review__invite span { flex: 1; color: var(--text-secondary); }
.rehearsal-review__invite input { grid-column: 1 / -1; box-sizing: border-box; width: 100%; min-width: 0; height: 34px; padding: 0 8px; border: 1px solid var(--border-subtle); background: var(--surface-raised); color: var(--text-secondary); font: inherit; }
.rehearsal-review__invite button, .rehearsal-review__proposal-form > button, .rehearsal-review__proposal-actions button { min-height: 32px; padding: 0 9px; border-bottom: 1px solid var(--accent-primary); }
.rehearsal-review__section { padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); }
.rehearsal-review__section > header { margin-bottom: 10px; }
.rehearsal-review__change { margin: 0; }
.rehearsal-review__change > div { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 7px 0; }
dd { margin: 0; white-space: pre-wrap; }
.rehearsal-review dd, .rehearsal-review p, .rehearsal-review strong, .rehearsal-review span { min-width: 0; overflow-wrap: anywhere; }
.rehearsal-review__lines, .rehearsal-review__proposals { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.rehearsal-review__lines li, .rehearsal-review__proposals li { padding: 10px 0; border-top: 1px solid var(--border-subtle); }
.rehearsal-review__lines p, .rehearsal-review__proposals p { margin: 5px 0 0; color: var(--text-secondary); line-height: 1.55; white-space: pre-wrap; }
.rehearsal-review__directions { display: grid; gap: 6px; }
.rehearsal-review__directions button { display: grid; gap: 3px; padding: 9px 10px; text-align: left; border-inline-start: 2px solid transparent; background: var(--surface-workbench-muted, var(--surface-raised)); }
.rehearsal-review__directions button[aria-pressed="true"] { border-inline-start-color: var(--accent-primary); }
.rehearsal-review__directions span { color: var(--text-secondary); font-size: 12px; }
.rehearsal-review__proposal-form { display: grid; gap: 9px; margin-top: 12px; }
.rehearsal-review__proposal-form > div { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rehearsal-review__proposal-form label { display: grid; gap: 5px; color: var(--text-secondary); font-size: 12px; }
.rehearsal-review__proposal-form textarea, .rehearsal-review__proposal-form input { box-sizing: border-box; width: 100%; border: 1px solid var(--border-subtle); background: var(--surface-raised); color: var(--text-primary); font: inherit; }
.rehearsal-review__proposal-form textarea { min-height: 82px; padding: 9px; resize: vertical; }
.rehearsal-review__proposal-form input { height: 34px; padding: 0 8px; }
.rehearsal-review__proposal-form > button { justify-self: end; }
.rehearsal-review__proposals li.is-selected { border-inline-start: 2px solid var(--accent-primary); padding-inline-start: 9px; }
.rehearsal-review__proposals li > div:first-child, .rehearsal-review__proposal-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rehearsal-review__proposals li > div:first-child span { color: var(--text-secondary); font-size: 12px; }
.rehearsal-review__proposals dl { margin: 7px 0 0; }
.rehearsal-review__proposals dl div { display: grid; grid-template-columns: 38px 1fr; gap: 6px; }
.rehearsal-review__proposal-actions { justify-content: flex-end; margin-top: 8px; }
.rehearsal-review__branch > div { padding: 10px 0; }
.rehearsal-review__branch p { margin: 6px 0; line-height: 1.6; white-space: pre-wrap; }
.rehearsal-review__branch .is-before { color: var(--text-secondary); text-decoration: line-through; }
.rehearsal-review__empty { color: var(--text-secondary); }
.rehearsal-review__foot { margin-top: auto; padding: 11px 16px; }
@media (max-width: 520px), (pointer: coarse) {
  .rehearsal-review button { min-height: 44px; }
  .rehearsal-review__proposal-form input, .rehearsal-review__invite input { height: 44px; }
}
@media (max-width: 520px) {
  .rehearsal-review__proposal-form > div { grid-template-columns: 1fr; }
  .rehearsal-review__section { padding-inline: 14px; }
}
</style>
