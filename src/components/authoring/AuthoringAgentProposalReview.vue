<script setup>
import { tr } from '../../i18n/index.js'
import { computed, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ proposal: { type: Object, required: true }, busy: Boolean, compact: Boolean, kind: String, error: String })
const emit = defineEmits(['adopt', 'discard', 'undo', 'close', 'locate', 'adopt-change', 'discard-change'])
const visibleChanges = computed(() => props.proposal.changes.filter(change => !props.kind || change.kind === props.kind))
const pending = computed(() => props.proposal.changes.filter(change => !change.status || change.status === 'pending'))
const activeId = ref('')
const active = computed(() => visibleChanges.value.find(change => keyOf(change) === activeId.value) || visibleChanges.value[0])
const copyLabel = ref('复制草稿')
const operations = { create: '新建', append: '补充', insert: '插入', replace: '修改', delete: '删除' }
const statuses = { adopted: '已采用', discarded: '已忽略', undone: '已撤销' }
const titleOf = change => change.label || change.title || tr('未命名')
const keyOf = change => change.changeId || `${change.kind}:${change.targetId}:${change.field}`
const iconOf = change => change.kind === 'chapter' ? 'chapter' : change.kind === 'outline' ? 'outline' : change.entryType === 'character' ? 'character-file' : 'setting-file'
const pendingChange = change => !change.status || change.status === 'pending'
const canLocate = change => change.operation !== 'create' || change.status === 'adopted'
watch(() => props.proposal.id, () => { activeId.value = ''; copyLabel.value = '复制草稿' })
function locate(change) { if (!change || !canLocate(change)) return; emit('locate', change); if (!props.compact) emit('close') }
async function copyDraft() {
  try { await navigator.clipboard.writeText(visibleChanges.value.map(change => change.after).join('\n\n')); copyLabel.value = '已复制' }
  catch { copyLabel.value = '复制失败，请展开建议后手动复制' }
}
</script>
<template>
  <section :class="{ 'is-compact': compact }" class="assistant-edit-review" data-test="assistant-edit-review" :aria-label="tr('助手修改建议')">
    <header class="assistant-edit-head"><strong>{{ tr('修改建议') }}</strong><span>{{ tr('{count} 处修改', { count: proposal.changes.length }) }}</span><div class="assistant-edit-head__actions"><button type="button" :title="tr(copyLabel)" :aria-label="tr(copyLabel)" @click="copyDraft"><WorkbenchIcon name="copy" :size="15" /></button><button type="button" :title="tr('返回编辑')" :aria-label="tr('返回编辑')" @click="$emit('close')"><WorkbenchIcon name="close" :size="16" /></button></div></header>
    <nav v-if="!compact && visibleChanges.length > 1" class="assistant-edit-tabs" :aria-label="tr('待审阅的修改')"><button v-for="change in visibleChanges" :key="keyOf(change)" type="button" :aria-pressed="change === active" :title="titleOf(change)" @click="activeId = keyOf(change)"><WorkbenchIcon :name="iconOf(change)" :size="14" /><span>{{ titleOf(change) }}</span><WorkbenchIcon v-if="change.status === 'adopted'" name="check" :size="12" /></button></nav>
    <div v-if="!compact || visibleChanges.some(change => change.field !== 'content')" class="assistant-edit-body">
      <article v-for="change in compact ? visibleChanges.filter(item => item.field !== 'content') : active ? [active] : []" :key="keyOf(change)">
        <div class="assistant-edit-target-row"><button v-if="canLocate(change)" type="button" class="assistant-edit-target" :title="tr('查看位置')" @click="locate(change)"><strong>{{ titleOf(change) }}</strong><WorkbenchIcon name="arrow-right" :size="14" /></button><strong v-else class="assistant-edit-new-title">{{ titleOf(change) }}</strong><span>{{ tr(statuses[change.status] || operations[change.operation] || '修改') }}</span></div>
        <p v-if="change.reason && !compact" class="assistant-edit-reason">{{ change.reason }}</p>
        <div v-if="change.before && !compact" class="assistant-edit-before"><span>{{ tr('修改前') }}</span><p>{{ change.before }}</p></div>
        <div v-if="change.after" class="assistant-edit-after"><span v-if="!compact">{{ tr(['append', 'insert', 'create'].includes(change.operation) ? '新增内容' : '修改后') }}</span><p>{{ change.after }}</p></div>
        <div v-if="!compact && visibleChanges.length > 1 && pendingChange(change)" class="assistant-edit-actions"><button type="button" :disabled="busy" @click="$emit('adopt-change', change.changeId)"><WorkbenchIcon name="check" :size="14" />{{ tr('采用这处') }}</button><button type="button" :disabled="busy" @click="$emit('discard-change', change.changeId)"><WorkbenchIcon name="close" :size="14" />{{ tr('忽略这处') }}</button></div>
      </article>
      <button v-if="!compact && proposal.changes.length !== visibleChanges.length" type="button" class="assistant-edit-other" @click="$emit('locate', proposal.changes.find(change => !kind || change.kind !== kind))">{{ tr('查看其他位置的修改') }}<WorkbenchIcon name="arrow-right" :size="13" /></button>
    </div>
    <p v-if="error" class="assistant-edit-error" role="alert">{{ error }}</p>
    <footer v-if="['pending', 'partial'].includes(proposal.status) && pending.length" class="assistant-edit-footer"><button type="button" class="control-primary" :disabled="busy" @click="$emit('adopt')">{{ tr(pending.length > 1 ? '全部采用' : '采用修改') }}</button><button type="button" :disabled="busy" @click="$emit('discard')">{{ tr(pending.length > 1 ? '全部忽略' : '忽略') }}</button><button v-if="proposal.receipt?.changes?.length" type="button" :disabled="busy" @click="$emit('undo')">{{ tr('撤销') }}</button></footer>
    <footer v-else-if="proposal.receipt?.changes?.length" class="assistant-edit-footer"><span>{{ tr('已保存') }}</span><button type="button" @click="locate(visibleChanges[0])">{{ tr('查看位置') }}</button><button type="button" :disabled="busy" @click="$emit('undo')">{{ tr('撤销这次修改') }}</button></footer>
    <p v-else-if="['undone', 'discarded'].includes(proposal.status)" class="assistant-edit-status" role="status">{{ tr(proposal.status === 'undone' ? '已撤销' : '已忽略') }}</p>
  </section>
</template>
<style scoped>
.assistant-edit-review { display: flex; flex-direction: column; min-width: 0; min-height: 0; margin: 12px 0 20px; color: var(--text-primary); background: var(--surface-workbench); font: 13px/1.5 var(--font-sans); border-block: 1px solid var(--hairline-soft); }
.assistant-edit-review button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: var(--radius-control); padding: 6px 9px; background: transparent; color: var(--text-secondary); cursor: pointer; font: inherit; }
.assistant-edit-review button:hover { background: var(--nav-hover); color: var(--text-primary); }
.assistant-edit-review button:disabled { opacity: .5; cursor: default; }
.assistant-edit-review button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.assistant-edit-head { display: flex; flex: none; align-items: center; gap: 9px; min-height: 48px; padding: 6px 16px; }
.assistant-edit-head strong { font-weight: 600; }
.assistant-edit-head > span { color: var(--text-muted); font-size: 11px; }
.assistant-edit-head__actions { display: flex; gap: 2px; margin-inline-start: auto; }
.assistant-edit-head__actions button { width: 30px; padding: 4px; }
.assistant-edit-tabs { display: flex; flex: none; gap: 4px; overflow-x: auto; padding: 0 16px 10px; border-bottom: 1px solid var(--hairline-soft); scrollbar-width: thin; }
.assistant-edit-tabs button { flex: 0 0 auto; max-width: 180px; gap: 6px; padding-inline: 9px; font-size: 12px; }
.assistant-edit-tabs button[aria-pressed=true] { background: var(--nav-primary-selected); color: var(--text-primary); }
.assistant-edit-tabs button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-edit-tabs svg { flex: none; }
.assistant-edit-body { flex: 1; min-height: 0; max-height: 56vh; overflow-y: auto; overscroll-behavior: contain; padding: 18px 20px 24px; }
.assistant-edit-target-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.assistant-edit-review .assistant-edit-target { min-width: 0; justify-content: start; padding: 0; color: var(--text-primary); }
.assistant-edit-target strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 600; }
.assistant-edit-new-title { font-size: 15px; font-weight: 600; }
.assistant-edit-target svg { flex: none; color: var(--text-muted); }
.assistant-edit-target-row > span { margin-inline-start: auto; flex: none; font-size: 11px; color: var(--text-secondary); }
.assistant-edit-reason { margin: 0 0 20px; color: var(--text-secondary); font-size: 12px; line-height: 1.65; }
.assistant-edit-before, .assistant-edit-after { margin-top: 18px; }
.assistant-edit-before > span,.assistant-edit-after > span { display: block; margin-bottom: 7px; color: var(--text-muted); font-size: 11px; }
.assistant-edit-before p,.assistant-edit-after p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 14px/1.8 var(--font-sans); }
.assistant-edit-before p { color: var(--text-secondary); padding-inline-start: 12px; border-inline-start: 2px solid var(--hairline-soft); }
.assistant-edit-after p { color: var(--text-primary); }
.assistant-edit-actions { display: flex; gap: 4px; margin-top: 22px; }
.assistant-edit-actions button:first-child { color: var(--text-primary); }
.assistant-edit-review .assistant-edit-other { margin-top: 22px; font-size: 12px; }
.assistant-edit-footer { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 7px; padding: 12px 16px; border-top: 1px solid var(--hairline-soft); background: var(--surface-workbench); }
.assistant-edit-footer > span { margin-inline-end: auto; color: var(--text-secondary); font-size: 12px; }
.assistant-edit-review .control-primary { min-height: 34px; padding-inline: 14px; background: var(--accent); color: var(--accent-text); }
.assistant-edit-review .control-primary:hover { filter: brightness(.95); }
.assistant-edit-error { margin: 0; padding: 8px 16px; color: var(--text-primary); font-size: 12px; }
.assistant-edit-status { padding: 12px 16px; color: var(--text-secondary); }
.assistant-edit-review.is-compact { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 20px; padding: 4px 0; background: transparent; }
.is-compact .assistant-edit-head { flex: 1; min-height: 34px; padding: 0; }
.is-compact .assistant-edit-head__actions button:first-child { display: none; }
.is-compact .assistant-edit-footer { border: 0; padding: 0; background: transparent; }
.is-compact .assistant-edit-body,.is-compact .assistant-edit-error { flex-basis: 100%; padding: 8px 0; }
@media(max-width:720px) {
  .assistant-edit-review button { min-height: 44px; }
  .assistant-edit-head { padding-inline: 12px; }
  .assistant-edit-body { padding-inline: 16px; }
  .assistant-edit-footer { padding-inline: 12px; }
}
</style>
