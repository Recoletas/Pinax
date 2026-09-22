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
// 常用工具直接以“图标 + 文字”暴露，不让人猜图标含义；素材收进“更多”菜单，
// 不再占一格。顺序对齐高频动线：校对 → 结构 → 事实 → 助手 → 回溯。
const assistantTool = { id: 'ai', label: '助手' }
const baseTools = Object.freeze([
  { id: 'annotations', label: '批注', icon: 'annotation' },
  { id: 'outline', label: '大纲', icon: 'outline' },
  { id: 'characters', label: '角色', icon: 'character' },
  { id: 'worldbook', label: '设定', icon: 'worldbook' },
  { id: 'scene', label: '现场', icon: 'scene' },
  { id: 'rehearsal', label: '推演', icon: 'rehearsal' },
  { id: 'dual', label: '双栏', icon: 'columns' },
  { ...assistantTool, icon: 'assistant' },
  { id: 'history', label: '历史', icon: 'history' }
])
const tools = computed(() => props.collaborationVisible
  ? [
      ...baseTools.slice(0, 5),
      { id: 'collaboration', label: '协作', icon: 'collaboration' },
      ...baseTools.slice(5)
    ]
  : baseTools)
</script>

<template>
  <nav class="writing-tool-rail" :aria-label="tr('写作工具')">
    <button v-for="tool in tools" :key="tool.id" type="button" :data-authoring-tool="tool.id"
      :aria-label="tr(tool.label)" :aria-pressed="(tool.id === 'dual' ? dual : activeTool === tool.id)" :title="tr(tool.label)"
      @pointerdown="emitBeforeSelect(tool.id, $event)" @click="$emit('select', tool.id)">
      <WorkbenchIcon :name="tool.icon" :size="19" />
      <span class="writing-tool-rail__label">{{ tr(tool.label) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.writing-tool-rail { box-sizing: border-box; display: flex; flex-direction: column; width: var(--writing-tool-rail-width, 52px); min-width: var(--writing-tool-rail-width, 52px); padding-block: 6px; border-inline: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--surface-primary) 94%, transparent); }
.writing-tool-rail button { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 100%; min-height: 46px; padding: 0; border: 0; background: transparent; color: color-mix(in srgb, var(--text-secondary) 84%, transparent); cursor: pointer; }
.writing-tool-rail__label { font-family: var(--font-sans); font-size: 11px; line-height: 1.3; white-space: normal; overflow-wrap: anywhere; max-width: 100%; text-align: center; }
.writing-tool-rail button::before { position: absolute; inset-block: 8px; inset-inline-start: -1px; width: 3px; content: ''; background: transparent; }
.writing-tool-rail button[aria-pressed="true"] { color: var(--text-primary); background: color-mix(in srgb, var(--accent-primary) 7%, transparent); }
.writing-tool-rail button[aria-pressed="true"]::before { background: var(--accent-primary); }
.writing-tool-rail button:hover { background: color-mix(in srgb, var(--text-primary) 5%, transparent); color: var(--text-primary); }
.writing-tool-rail button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -4px; color: var(--text-primary); }
/* 与 Authoring 的全宽 sheet 同时切为底部工具带，避免 641–720px 留下被稿面遮住的竖栏。 */
@media (max-width: 720px) { .writing-tool-rail { position: fixed; z-index: 30; inset-inline: 0; inset-block-end: 0; width: auto; flex-direction: row; padding-block: 0 env(safe-area-inset-bottom, 0px); overflow-x: auto; border-top: 1px solid var(--border); } .writing-tool-rail button { flex: 1 0 var(--writing-tool-rail-width, 48px); min-height: 48px; } }
</style>
