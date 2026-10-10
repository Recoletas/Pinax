<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

// W-B 创作台外壳重构：右轨（AuthoringWorkspaceToolRail）退役后，八个工具入口
// 迁入顶栏。本组件只负责入口呈现（图标/角标/aria/冻结时机），选中态的 owner
// 仍是页面的 useAuthoringInspectorState 状态机——与原右轨完全同一套事件契约
// （before-select 在 pointerdown 冻结写作面，select 触发切换）。
const props = defineProps({
  activeTool: { type: String, default: 'ai' },
  inspectorOpen: { type: Boolean, default: false },
  pending: { type: Object, default: () => ({}) },
  collaborationVisible: Boolean
})
const emit = defineEmits(['before-select', 'select'])

// pointerdown 发生在浏览器把焦点从 ProseMirror 移到顶栏按钮之前。
// 页面借这个时机冻结活动写作窗的 selection/scroll；这里不 preventDefault，
// 保留按钮原生的焦点、键盘与 click 行为。
function emitBeforeSelect(toolId, event) {
  if (event?.button != null && event.button !== 0) return
  emit('before-select', toolId)
}

// 记忆沿用右轨语义：入口只发事件，由页面决定打开设置的记忆页。
const tools = Object.freeze([
  { id: 'rehearsal', label: '推演', icon: 'rehearsal' },
  { id: 'annotations', label: '批注', icon: 'annotation' },
  { id: 'outline', label: '大纲', icon: 'outline' },
  { id: 'characters', label: '角色', icon: 'character' },
  { id: 'worldbook', label: '设定', icon: 'worldbook' },
  { id: 'scene', label: '现场', icon: 'scene' },
  { id: 'history', label: '记忆', icon: 'history' }
])
const visibleTools = computed(() => (props.collaborationVisible
  ? [...tools.slice(0, 2), { id: 'collaboration', label: '协作', icon: 'collaboration' }, ...tools.slice(2)]
  : tools))

function pressedState(tool) {
  return props.inspectorOpen && props.activeTool === tool.id
}

function toolTitle(tool) {
  const count = Number(props.pending?.[tool.id] || 0)
  return count > 0
    ? tr('{label} · {count} 处待审修改', { label: tr(tool.label), count })
    : tr(tool.label)
}
</script>

<template>
  <div class="authoring-inspector-toolbar" :aria-label="tr('写作工具')">
    <button v-for="tool in visibleTools" :key="tool.id" type="button" :data-authoring-tool="tool.id"
      :aria-label="toolTitle(tool)" :aria-pressed="pressedState(tool).toString()" :title="toolTitle(tool)"
      @pointerdown="emitBeforeSelect(tool.id, $event)" @click="$emit('select', tool.id)">
      <WorkbenchIcon :name="tool.icon" :size="15" />
      <span class="authoring-inspector-toolbar__label">{{ tr(tool.label) }}</span>
      <span v-if="pending[tool.id]" class="authoring-inspector-toolbar__pending" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.authoring-inspector-toolbar { display: flex; flex: none; align-items: stretch; gap: 2px; }
.authoring-inspector-toolbar button { position: relative; display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border: 0; border-radius: var(--radius-control, 6px); background: transparent; color: var(--text-secondary); font: 13px/1.4 var(--font-interface, var(--font-sans)); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.authoring-inspector-toolbar__label { white-space: nowrap; }
.authoring-inspector-toolbar__pending { position: absolute; top: 4px; inset-inline-end: 4px; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.authoring-inspector-toolbar button[aria-pressed="true"] { color: var(--accent); background: var(--nav-primary-selected); }
.authoring-inspector-toolbar button[aria-pressed="true"] .authoring-inspector-toolbar__label { font-weight: 500; }
.authoring-inspector-toolbar button:hover { background: var(--nav-hover); color: var(--text-primary); }
.authoring-inspector-toolbar button[aria-pressed="true"]:hover { background: var(--nav-focused); color: var(--accent); }
.authoring-inspector-toolbar button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.authoring-inspector-toolbar button:active { background: var(--nav-focused); }
@media (max-width: 720px) { .authoring-inspector-toolbar__label { display: none; } .authoring-inspector-toolbar button { min-width: 32px; justify-content: center; padding: 6px 8px; } }
@media (prefers-reduced-motion: reduce) { .authoring-inspector-toolbar button { transition: none; } }
</style>
