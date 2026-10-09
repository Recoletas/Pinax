<script setup>
import { tr } from '../../i18n/index.js'
import { computed } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ proposal: { type: Object, required: true }, busy: Boolean, kind: String, error: String })
defineEmits(['adopt', 'discard', 'undo', 'close', 'locate'])
const visibleChanges = computed(() => props.proposal.changes.filter(change => !props.kind || change.kind === props.kind))
const names = { chapter: '正文', worldbook: '角色与设定', outline: '大纲' }
</script>
<template>
  <section class="assistant-edit-review" data-test="assistant-edit-review" :aria-label="tr('助手修改建议')">
    <header><strong>{{ tr('修改建议') }}</strong><span>{{ tr('{count} 处修改', { count: proposal.changes.length }) }}</span><button type="button" :title="tr('收起建议')" @click="$emit('close')"><WorkbenchIcon name="close" :size="16" /></button></header>
    <article v-for="change in visibleChanges" :key="`${change.kind}:${change.targetId}:${change.field}`">
      <button type="button" class="assistant-edit-target" @click="$emit('locate', change)">{{ tr(names[change.kind]) }} · {{ change.label || change.title || change.targetId }}<WorkbenchIcon name="arrow-right" :size="13" /></button>
      <p class="assistant-edit-reason">{{ change.reason }}</p>
      <details v-if="change.before"><summary>{{ tr('查看原文') }}</summary><p class="assistant-edit-original">{{ change.before }}</p></details>
      <p class="assistant-edit-content">{{ change.after }}</p>
    </article>
    <p v-if="proposal.changes.length !== visibleChanges.length" class="assistant-edit-reason">{{ tr('这组修改还包含其他位置，采用时一起保存。') }}</p>
    <p v-if="error" class="assistant-edit-error" role="alert">{{ error }}</p>
    <footer v-if="proposal.status === 'pending'"><button type="button" class="control-primary" :disabled="busy" @click="$emit('adopt')">{{ tr('采用这组修改') }}</button><button type="button" :disabled="busy" @click="$emit('discard')">{{ tr('放弃') }}</button></footer>
    <footer v-else-if="proposal.status === 'adopted'"><span>{{ tr('已采用') }}</span><button type="button" :disabled="busy" @click="$emit('undo')">{{ tr('撤销这次修改') }}</button></footer>
    <p v-else class="assistant-edit-reason">{{ tr(proposal.status === 'undone' ? '已撤销' : '已放弃') }}</p>
  </section>
</template>
<style scoped>
.assistant-edit-review { margin: 16px 0 24px; padding: 16px 12px; border-block: 1px solid var(--hairline-soft); color: var(--text-primary); background: transparent; }
.assistant-edit-review header, .assistant-edit-review footer { display: flex; align-items: center; gap: 12px; font: 13px/1.5 var(--font-sans); }
.assistant-edit-review header span, .assistant-edit-reason { color: var(--text-secondary); }
.assistant-edit-review header > button { margin-inline-start: auto; }
.assistant-edit-review button { border: 0; padding: 6px 8px; background: transparent; color: var(--text-secondary); cursor: pointer; font: inherit; }
.assistant-edit-review button:disabled { opacity: .5; cursor: default; }
.assistant-edit-review button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.assistant-edit-review button.control-primary { background: var(--accent); color: var(--accent-text); border-radius: var(--radius-control); padding: 8px 14px; }
.assistant-edit-error { font: 13px/1.6 var(--font-sans); color: var(--text-primary); }
.assistant-edit-review article { margin-block: 16px; }
.assistant-edit-target { display: inline-flex; gap: 6px; align-items: center; }
.assistant-edit-reason, .assistant-edit-review summary { font: 12px/1.6 var(--font-sans); }
.assistant-edit-content, .assistant-edit-original { margin: 12px 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: inherit; }
.assistant-edit-original { color: var(--text-secondary); }
@media(max-width:720px) { .assistant-edit-review button { min-height: 44px; } }
</style>
