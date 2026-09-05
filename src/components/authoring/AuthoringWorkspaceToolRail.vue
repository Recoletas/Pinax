<template>
  <nav class="writing-tool-rail" aria-label="写作工具">
    <button v-for="tool in tools" :key="tool.id" type="button" :data-authoring-tool="tool.id"
      :aria-label="tool.label" :aria-pressed="(tool.id === 'dual' ? dual : activeTool === tool.id)" :title="tool.label"
      @pointerdown="emitBeforeSelect(tool.id, $event)" @click="$emit('select', tool.id)">
      <WorkbenchIcon :name="tool.icon" :size="16" />
      <span class="writing-tool-rail__label">{{ tool.label }}</span>
    </button>
  </nav>
</template>

<script setup>
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
defineProps({ activeTool: { type: String, default: 'annotations' }, dual: Boolean })
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
const tools = Object.freeze([
  { id: 'annotations', label: '批注', icon: 'message-square' },
  { id: 'outline', label: '大纲', icon: 'book' },
  { id: 'characters', label: '角色', icon: 'users' },
  { id: 'worldbook', label: '设定', icon: 'archive' },
  { id: 'scene', label: '现场', icon: 'storyboard' },
  { id: 'dual', label: '双栏', icon: 'panel-left' },
  { ...assistantTool, icon: 'sparkles' },
  { id: 'history', label: '历史', icon: 'undo-extension' }
])
</script>

<style scoped>
.writing-tool-rail { box-sizing: border-box; display: flex; flex-direction: column; width: 52px; min-width: 52px; padding-block: 6px; border-inline: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--surface-primary) 94%, transparent); }
.writing-tool-rail button { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 51px; min-height: 46px; padding: 0; border: 0; background: transparent; color: color-mix(in srgb, var(--text-secondary) 84%, transparent); cursor: pointer; }
.writing-tool-rail__label { font-size: 10px; line-height: 1; white-space: nowrap; }
.writing-tool-rail button::before { position: absolute; inset-block: 8px; inset-inline-start: -1px; width: 3px; content: ''; background: transparent; }
.writing-tool-rail button[aria-pressed="true"] { color: var(--text-primary); background: color-mix(in srgb, var(--accent-primary) 7%, transparent); }
.writing-tool-rail button[aria-pressed="true"]::before { background: var(--accent-primary); }
.writing-tool-rail button:hover, .writing-tool-rail button:focus-visible { background: color-mix(in srgb, var(--accent-primary) 6%, transparent); color: var(--text-primary); outline: none; }
@media (max-width: 640px) { .writing-tool-rail { position: fixed; z-index: 30; inset-inline: 0; inset-block-end: 0; flex-direction: row; overflow-x: auto; border-top: 1px solid var(--border-subtle); } .writing-tool-rail button { flex: 1 0 48px; min-height: 44px; } }
</style>
