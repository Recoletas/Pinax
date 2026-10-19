<script setup>
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { tr } from '../../i18n/index.js'
defineProps({ parts: { type: Array, default: () => [] }, state: { type: Object, default: null }, actionsOnly: Boolean, titleField: Boolean, label: { type: String, default: '' } })
defineEmits(['action'])
</script>
<template>
  <div v-if="actionsOnly && state" class="object-inline-actions">
    <button type="button" :disabled="state.busy" :title="tr(state.pending ? '采用修改' : '完成')" :aria-label="tr(state.pending ? '采用修改' : '完成')" @click="$emit('action', state.pending ? 'adopt' : 'done')"><WorkbenchIcon name="check" :size="15" /></button>
    <button type="button" :disabled="state.busy" :title="tr(state.pending ? '忽略修改' : '撤销本轮修改')" :aria-label="tr(state.pending ? '忽略修改' : '撤销本轮修改')" @click="$emit('action', state.pending ? 'discard' : 'undo')"><WorkbenchIcon :name="state.pending ? 'close' : 'history'" :size="15" /></button>
    <span v-if="state.error" class="object-inline-error" role="alert">{{ state.error }}</span>
  </div>
  <div v-else class="object-inline-diff" :class="{ 'is-title': titleField }" :aria-label="label || tr('助手修改')"><template v-for="(part, index) in parts" :key="index"><del v-if="part.type === 'remove'" :aria-label="tr('删除内容')">{{ part.text }}</del><ins v-else-if="part.type === 'add'" :aria-label="tr('新增内容')">{{ part.text }}</ins><span v-else>{{ part.text }}</span></template></div>
</template>
<style scoped>
.object-inline-diff { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: var(--authoring-catalog-body-size,14px)/1.8 var(--font-body); color: var(--text-primary); }
.object-inline-diff.is-title { flex: 1; font: 600 var(--authoring-catalog-title-size,17px)/1.5 var(--font-body); }
.object-inline-diff ins { color: var(--text-primary); background: color-mix(in srgb,var(--success) 16%,transparent); text-decoration: underline; text-decoration-color: var(--success); text-underline-offset: 3px; }
.object-inline-diff del { color: var(--text-secondary); background: color-mix(in srgb,var(--danger) 12%,transparent); text-decoration-color: var(--danger); }
.object-inline-actions { position: relative; display: flex; flex: none; align-items: center; gap: 2px; }
.object-inline-actions button { display: inline-grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); cursor: pointer; }
.object-inline-actions button:first-child { color: var(--success); }
.object-inline-actions button:hover { background: var(--nav-hover); color: var(--text-primary); }
.object-inline-actions button:disabled { opacity: .5; cursor: default; }
.object-inline-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.object-inline-error { position: absolute; z-index: 2; top: 100%; inset-inline-end: 0; width: min(280px,65vw); padding: 8px 10px; background: var(--surface-workbench-overlay,var(--surface-workbench)); color: var(--text-secondary); font: 12px/1.6 var(--font-sans); box-shadow: var(--shadow-workbench-float); }
@media(pointer:coarse) { .object-inline-actions button { min-width: 44px; min-height: 44px; } }
</style>
