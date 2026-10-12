<script setup>
import { tr } from '../../i18n/index.js'
import { WORKSPACE_VIEW_TYPES } from '../../services/workspace/workspaceViewContract.js'
import WorkbenchIcon from './WorkbenchIcon.vue'
const props = defineProps({ views: { type: Array, required: true }, activeId: { type: String, default: '' }, titles: { type: Object, default: () => ({}) }, group: { type: String, required: true }, label: { type: String, required: true } })
const emit = defineEmits(['activate', 'close', 'reorder'])
function title(view) { return props.titles[view.id] || view.title || WORKSPACE_VIEW_TYPES[view.resource.type]?.title || '内容' }
function navigate(event, index) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.views.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + props.views.length) % props.views.length
  event.currentTarget.closest('.workspace-content-tabs')?.querySelectorAll('.workspace-content-tab')[next]?.focus()
  emit('activate', props.views[next].id)
}
function startDrag(event, view) {
  event.dataTransfer.setData('application/x-pinax-view', view.id)
  event.dataTransfer.effectAllowed = 'move'
}
function drop(event, beforeId = '') {
  const id = event.dataTransfer.getData('application/x-pinax-view')
  if (!id) return
  event.preventDefault(); event.stopPropagation()
  emit('reorder', { id, beforeId, group: props.group })
}
function dragOver(event) { if ([...event.dataTransfer.types].includes('application/x-pinax-view')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }
</script>

<template>
  <div class="workspace-content-tabs" :aria-label="tr(label)" @dragover="dragOver" @drop="drop($event)">
    <div v-for="(view, index) in views" :key="view.id" class="workspace-content-tab-slot" @dragover="dragOver" @drop="drop($event, view.id)">
      <button type="button" class="workspace-content-tab" draggable="true" @dragstart="startDrag($event, view)" :class="{ 'is-active': view.id === activeId }" :aria-current="view.id === activeId ? 'true' : undefined" :title="title(view)" @click="emit('activate', view.id)" @keydown="navigate($event, index)"><WorkbenchIcon :name="WORKSPACE_VIEW_TYPES[view.resource.type].icon" :size="15" /><span>{{ title(view) }}</span></button>
      <button type="button" class="workspace-content-close" :aria-label="tr('关闭 {value0}', { value0: title(view) })" @click="emit('close', view)"><WorkbenchIcon name="close" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.workspace-content-tabs { display: flex; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
.workspace-content-tab-slot { display: flex; flex: none; align-items: center; max-width: 220px; border-inline-end: 1px solid var(--hairline-soft); }
.workspace-content-tab { display: flex; align-items: center; gap: 7px; min-width: 0; height: 44px; padding: 0 10px; border: 0; background: transparent; color: var(--text-secondary); font: 13px var(--font-sans); cursor: pointer; }
.workspace-content-tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-content-tab.is-active { color: var(--text-primary); background: var(--nav-focused); }
.workspace-content-close { display: grid; place-items: center; flex: none; width: 30px; height: 36px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; opacity: 0; }
.workspace-content-tab-slot:is(:hover, :focus-within) .workspace-content-close, .workspace-content-tab.is-active + .workspace-content-close { opacity: 1; }
button:hover { background: var(--nav-hover); color: var(--text-primary); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 900px), (pointer: coarse) { .workspace-content-close { min-width: 40px; min-height: 44px; opacity: 1; } }
</style>
