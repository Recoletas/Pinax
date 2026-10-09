<script setup>
import { tr } from '../../i18n/index.js'
import { computed } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ activeTool: { type: String, default: 'annotations' }, dual: Boolean, collaborationVisible: Boolean })
const emit = defineEmits(['before-select', 'select'])

// pointerdown 发生在浏览器把焦点从 ProseMirror 移到 rail 按钮之前。
// 页面借这个时机冻结活动写作窗的 selection/scroll；这里不 preventDefault，
// 保留按钮原生的焦点、键盘与 click 行为。
function emitBeforeSelect(toolId, event) {
  if (event?.button != null && event.button !== 0) return
  emit('before-select', toolId)
}
// 写作、参考、辅助分组保留可见文字，切换仍由页面唯一 owner 处理。
const assistantTool = { id: 'ai', label: '助手' }
const baseTools = Object.freeze([
  { ...assistantTool, icon: 'assistant', group: 'writing' },
  { id: 'rehearsal', label: '推演', icon: 'rehearsal', group: 'writing' },
  { id: 'annotations', label: '批注', icon: 'annotation', group: 'writing' },
  { id: 'outline', label: '大纲', icon: 'outline', group: 'reference' },
  { id: 'characters', label: '角色', icon: 'character', group: 'reference' },
  { id: 'worldbook', label: '设定', icon: 'worldbook', group: 'reference' },
  { id: 'scene', label: '现场', icon: 'scene', group: 'reference' },
  { id: 'history', label: '记忆', icon: 'history', group: 'utility' },
  { id: 'dual', label: '双栏', icon: 'columns', group: 'utility' }
])
const tools = computed(() => props.collaborationVisible
  ? [...baseTools.slice(0, 3), { id: 'collaboration', label: '协作', icon: 'collaboration', group: 'writing' }, ...baseTools.slice(3)]
  : baseTools)

</script>

<template>
  <nav class="writing-tool-rail" :aria-label="tr('写作工具')">
    <button v-for="(tool, index) in tools" :key="tool.id" type="button" :data-authoring-tool="tool.id" :data-group-start="index > 0 && tools[index - 1].group !== tool.group ? 'true' : undefined"
      :aria-label="tr(tool.label)" :aria-pressed="(tool.id === 'dual' ? dual : activeTool === tool.id)" :title="tr(tool.label)"
      @pointerdown="emitBeforeSelect(tool.id, $event)" @click="$emit('select', tool.id)">
      <WorkbenchIcon :name="tool.icon" :size="19" />
      <span class="writing-tool-rail__label">{{ tr(tool.label) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.writing-tool-rail { box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; width: var(--writing-tool-rail-width, 60px); min-width: var(--writing-tool-rail-width, 60px); padding: 12px 5px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; border: 0; background: transparent; }
.writing-tool-rail button { display: flex; flex: none; flex-direction: column; align-items: center; justify-content: center; gap: 5px; width: 100%; min-height: 52px; padding: 5px 2px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.writing-tool-rail__label { font-family: var(--font-interface, var(--font-sans)); font-size: 13px; line-height: 1.3; white-space: normal; overflow-wrap: anywhere; max-width: 100%; text-align: center; }
.writing-tool-rail button[aria-pressed="true"] { color: var(--accent); background: var(--nav-primary-selected); }
.writing-tool-rail button[aria-pressed="true"] .writing-tool-rail__label { font-weight: 500; }
.writing-tool-rail button:hover { background: var(--nav-hover); color: var(--text-primary); }
.writing-tool-rail button[aria-pressed="true"]:hover { background: var(--nav-focused); color: var(--accent); }
.writing-tool-rail button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.writing-tool-rail button:active { background: var(--nav-focused); }
@media (min-width: 721px) { .writing-tool-rail button[data-group-start="true"] { margin-top: 14px; } }
@media (prefers-reduced-motion: reduce) { .writing-tool-rail button { transition: none; } }
/* 与 Authoring 的全宽 sheet 同时切为底部工具带，避免 641–720px 留下被稿面遮住的竖栏。 */
@media (max-width: 720px) { .writing-tool-rail { position: fixed; z-index: 30; inset-inline: 0; inset-block-end: 0; width: auto; flex-direction: row; gap: 2px; padding: 0 4px env(safe-area-inset-bottom, 0px); overflow-x: auto; overflow-y: hidden; border-top: 1px solid var(--hairline-soft); background: var(--surface-workbench-muted); } .writing-tool-rail button { flex: 1 0 var(--writing-tool-rail-width, 60px); min-height: 48px; } }
</style>
