<script setup>
import { computed, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { assistantChangeDiff, assistantChangeGroup } from '../../services/agents/authoring/assistantChangeDiff.js'
import { pendingAssistantEdit } from '../../services/agents/authoring/assistantEditReviewState.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import AssistantConflictReview from './AssistantConflictReview.vue'
const props = defineProps({ proposals: { type: Array, default: () => [] }, busy: Boolean, working: Boolean, error: String, notice: String })
defineEmits(['adopt', 'undo', 'resolve', 'keep'])
const open = ref(false)
watch(() => props.error, error => { if (error) open.value = true }, { immediate: true })
const expandedFiles = ref(new Set())
const reviewingFiles = ref(new Set())
function toggleReview(key) { const next = new Set(reviewingFiles.value); next.has(key) ? next.delete(key) : next.add(key); reviewingFiles.value = next }
function toggleFile(key) { const next = new Set(expandedFiles.value); next.has(key) ? next.delete(key) : next.add(key); expandedFiles.value = next }
const edits = computed(() => props.proposals.flatMap(proposal => proposal.changes.filter(change => pendingAssistantEdit(proposal, change) || change.status === 'adopted' && proposal.receipt?.changes?.some(receipt => receipt.changeId === change.changeId)).map(change => ({ ...change, proposal, proposalId: proposal.id, pending: pendingAssistantEdit(proposal, change), key: `${proposal.id}:${change.changeId}`, group: assistantChangeGroup(change), diff: assistantChangeDiff(change) }))))
const totals = computed(() => edits.value.reduce((total, change) => ({ added: total.added + change.diff.added, removed: total.removed + change.diff.removed }), { added: 0, removed: 0 }))
const pendingCount = computed(() => edits.value.filter(change => change.pending).length)
const groups = computed(() => [...new Set(edits.value.map(change => change.group))].map(group => ({ label: group, edits: edits.value.filter(change => change.group === group) })))
const files = computed(() => {
  const map = new Map()
  for (const change of edits.value) {
    const key = `${change.kind}:${change.targetId}`
    if (!map.has(key)) map.set(key, { key, group: change.group, proposalId: change.proposalId, title: change.label || change.title || change.targetId, edits: [], added: 0, removed: 0 })
    const file = map.get(key); file.edits.push(change); file.added += change.diff.added; file.removed += change.diff.removed
  }
  return [...map.values()].sort((a, b) => Number(b.edits.some(change => change.pending)) - Number(a.edits.some(change => change.pending)))
})
const fileSelection = file => ({ group: file.group, selections: [...new Set(file.edits.map(change => change.proposalId))].map(proposalId => ({ proposalId, changeIds: file.edits.filter(change => change.proposalId === proposalId).map(change => change.changeId) })) })
</script>
<template>
  <section v-if="edits.length || notice || error" class="assistant-changes" :aria-label="tr('本次修改')">
    <div class="assistant-changes__bar">
      <button type="button" class="assistant-changes__toggle" :aria-expanded="open" @click="open = !open"><WorkbenchIcon :name="open ? 'chevron-down' : 'chevron-right'" :size="14" /><span>{{ tr(pendingCount ? '修改 {count} 处' : '已保存 {count} 处', { count: edits.length }) }}</span><span class="is-added">+{{ totals.added }}</span><span class="is-removed">−{{ totals.removed }}</span></button>
      <div class="assistant-changes__actions"><button v-if="pendingCount" type="button" :disabled="busy || working" @click="$emit('adopt', { group: '全部' })">{{ tr(working ? '正在保存…' : '全部采纳') }}</button><button v-if="pendingCount" type="button" :disabled="busy || working" @click="$emit('keep', { group: '全部' })">{{ tr('保留现有，忽略剩余') }}</button><button v-if="edits.length" type="button" :disabled="busy || working" @click="$emit('undo', { group: '全部' })">{{ tr('全部撤销') }}</button></div>
    </div>
    <div v-for="group in groups" :key="group.label" class="assistant-changes__category">
      <span>{{ tr(group.label) }} <small>{{ group.edits.length }}</small></span>
      <div class="assistant-changes__actions"><button v-if="group.edits.some(change => change.pending)" type="button" :disabled="busy || working" @click="$emit('adopt', { group: group.label })">{{ tr('采纳{group}', { group: tr(group.label) }) }}</button><button type="button" :disabled="busy || working" :title="tr('未采纳的建议会被拒绝，已保存的修改会被撤销')" @click="$emit('undo', { group: group.label })">{{ tr('撤销{group}', { group: tr(group.label) }) }}</button></div>
    </div>
    <div v-if="open && files.length" class="assistant-changes__diff">
      <article v-for="file in files" :key="file.key">
        <header><button class="assistant-changes__file-toggle" type="button" :aria-expanded="expandedFiles.has(file.key)" @click="toggleFile(file.key)"><WorkbenchIcon :name="expandedFiles.has(file.key) ? 'chevron-down' : 'chevron-right'" :size="12" /><span>{{ tr(file.group) }} / {{ file.title }}</span></button><small>{{ tr(file.edits.some(change => change.pending) ? '待采纳' : '已保存') }}</small><span class="is-added">+{{ file.added }}</span><span class="is-removed">−{{ file.removed }}</span><div class="assistant-changes__actions"><button v-if="file.edits.some(change => change.pending)" type="button" :disabled="busy || working" :aria-expanded="reviewingFiles.has(file.key)" @click="toggleReview(file.key)">{{ tr('对比处理') }}</button><button v-if="file.edits.some(change => change.pending)" type="button" :disabled="busy || working" @click="$emit('adopt', fileSelection(file))">{{ tr('采纳') }}</button><button type="button" :disabled="busy || working" @click="$emit('undo', fileSelection(file))">{{ tr('撤销') }}</button></div></header>
        <template v-if="reviewingFiles.has(file.key)"><AssistantConflictReview v-for="change in file.edits.filter(item => item.pending)" :key="change.key" :change="change" :proposal="change.proposal" :busy="busy || working" @resolve="$emit('resolve', $event)" @keep="$emit('keep', $event)" /></template>
        <template v-if="expandedFiles.has(file.key)"><template v-for="change in file.edits" :key="change.key"><p class="assistant-changes__field">{{ change.field === 'content' ? tr('内容') : change.field === 'intent' ? tr('大纲') : tr('标题') }} · {{ tr(change.pending ? '待采纳' : '已保存') }}</p><div v-for="(line, index) in change.diff.lines" :key="index" class="assistant-changes__line" :class="`is-${line.type}`"><span class="line-number" aria-hidden="true">{{ line.oldLine }}</span><span class="line-number" aria-hidden="true">{{ line.newLine }}</span><span aria-hidden="true">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' ' }}</span><span class="line-text">{{ line.text || ' ' }}</span></div></template></template>
      </article>
    </div>
    <p v-if="error" role="alert">{{ error }}</p><p v-else-if="notice" role="status">{{ notice }}</p><p v-else-if="busy && pendingCount" role="status">{{ tr('助手运行中，修改已保留。') }}</p>
  </section>
</template>
<style scoped>
.assistant-changes { flex: none; min-width: 0; border-top: 1px solid var(--hairline-soft); color: var(--text-primary); font: 12px/1.5 var(--font-sans); }
.assistant-changes button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 5px 8px; border: 0; border-radius: var(--radius-control); color: inherit; background: transparent; cursor: pointer; font: inherit; }
.assistant-changes button:hover, .assistant-changes button[aria-pressed=true] { background: var(--nav-hover); }
.assistant-changes button:disabled { opacity: .5; cursor: default; }
.assistant-changes button:focus-visible { outline: 2px solid var(--workbench-focus); outline-offset: -2px; }
.assistant-changes__bar { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 6px 8px; }
.assistant-changes__actions { display: flex; margin-inline-start: auto; }
.assistant-changes__actions button:first-child { font-weight: 600; }
.assistant-changes__category { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 12px; }
.assistant-changes__category > span { font-weight: 500; }
.assistant-changes__category small { margin-inline-start: 5px; }
.assistant-changes nav { display: flex; flex-wrap: wrap; padding: 4px 8px; }
.assistant-changes__diff { max-height: 45vh; overflow-y: auto; overscroll-behavior: contain; }
.assistant-changes article + article { border-top: 1px solid var(--hairline-soft); }
.assistant-changes article header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: var(--surface-workbench); overflow-wrap: anywhere; }
.assistant-changes__file-toggle { flex: 1; min-width: 0; text-align: start; }
.assistant-changes__file-toggle > span { overflow-wrap: anywhere; }
.assistant-changes small, .line-number { color: var(--text-muted); }
.assistant-changes .is-added { color: var(--success); }
.assistant-changes .is-removed { color: var(--danger); }
.assistant-changes__line { display: grid; grid-template-columns: 3ch 3ch 1ch minmax(0, 1fr); gap: 5px; padding: 1px 8px; font: 12px/1.7 var(--font-mono, monospace); }
.line-number { text-align: end; user-select: none; font-size: 10px; }
.line-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.assistant-changes__line.is-add { background: color-mix(in srgb, var(--success) 12%, transparent); }
.assistant-changes__line.is-remove { background: color-mix(in srgb, var(--danger) 12%, transparent); }
.assistant-changes p { margin: 0; padding: 4px 12px 8px; color: var(--text-secondary); overflow-wrap: anywhere; }
@media(max-width:720px) { .assistant-changes button { min-height: 44px; } }
</style>
