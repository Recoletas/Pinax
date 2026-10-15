<script setup>
import { tr } from '../../i18n/index.js'
import { computed, watch, onScopeDispose } from 'vue'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { vWorkbenchTooltip } from '../workbench/workbenchTooltip.js'
const props = defineProps({ activeTool: { type: String, default: 'annotations' }, pending: { type: Object, default: () => ({}) }, dual: Boolean, collaborationVisible: Boolean, workspaceHidden: Boolean })
const emit = defineEmits(['before-select', 'select'])
const workspace = useComposableWorkspace()
const docked = computed(() => Boolean(workspace?.railTarget.value && !props.workspaceHidden && !workspace.state.narrow && workspace.state.primaryVisible && !workspace.state.hidden && !workspace.state.expanded && (!workspace.state.mainModuleId || workspace.state.views.find(view => view.id === workspace.state.mainModuleId)?.resource.type === 'chapter') && workspace.state.sideActiveId))
watch(docked, value => { if (workspace) workspace.railDocked.value = value }, { immediate: true })
onScopeDispose(() => { if (workspace) workspace.railDocked.value = false })

// pointerdown 发生在浏览器把焦点从 ProseMirror 移到 rail 按钮之前。
// 页面借这个时机冻结活动写作窗的 selection/scroll；这里不 preventDefault，
// 保留按钮原生的焦点、键盘与 click 行为。
function emitBeforeSelect(toolId, event) {
  if (event?.button != null && event.button !== 0) return
  emit('before-select', toolId)
}
// 分组保持原顺序；名称由浮层与可访问名称提供。
const assistantTool = { id: 'ai', label: '助手' }
const baseTools = Object.freeze([
  { ...assistantTool, icon: 'assistant', group: 'writing' },
  { id: 'rehearsal', label: '推演', icon: 'rehearsal', group: 'writing' },
  { id: 'annotations', label: '批注', icon: 'annotation', group: 'writing' },
  { id: 'outline', label: '大纲', icon: 'outline', group: 'reference' },
  { id: 'characters', label: '角色', icon: 'character', group: 'reference' },
  { id: 'worldbook', label: '设定', icon: 'worldbook', group: 'reference' },
  { id: 'history', label: '记忆', icon: 'history', group: 'utility' },
  { id: 'dual', label: '双栏', icon: 'columns', group: 'utility' }
])
const tools = computed(() => props.collaborationVisible
  ? [...baseTools.slice(0, 3), { id: 'collaboration', label: '协作', icon: 'collaboration', group: 'writing' }, ...baseTools.slice(3)]
  : baseTools)

</script>

<template>
  <Teleport :to="workspace?.railTarget.value || 'body'" :disabled="!docked">
  <nav class="writing-tool-rail" :aria-label="tr('写作工具')">
    <button v-for="(tool, index) in tools" :key="tool.id" type="button" :data-authoring-tool="tool.id" :data-group-start="index > 0 && tools[index - 1].group !== tool.group ? 'true' : undefined"
      :aria-label="tr(tool.label)" :data-selected="(tool.id === 'dual' ? dual : activeTool === tool.id)" :aria-pressed="!docked && (tool.id === 'dual' ? dual : activeTool === tool.id)" v-workbench-tooltip="pending[tool.id] ? tr('{label} · {count} 处待审修改', { label: tr(tool.label), count: pending[tool.id] }) : tr(tool.label)"
      @pointerdown="emitBeforeSelect(tool.id, $event)" @click="$emit('select', tool.id)">
      <WorkbenchIcon :name="tool.icon" :size="19" />
      <span v-if="pending[tool.id]" class="writing-tool-rail__pending" aria-hidden="true" />
    </button>
  </nav>
  </Teleport>
</template>

<style scoped>
.writing-tool-rail { box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; width: var(--writing-tool-rail-width, 60px); min-width: var(--writing-tool-rail-width, 60px); padding: 12px 5px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; border: 0; background: transparent; }
.writing-tool-rail__pending { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); position: absolute; inset-inline-end: 9px; top: 9px; }
.writing-tool-rail button { position: relative; display: flex; flex: none; flex-direction: column; align-items: center; justify-content: center; gap: 5px; width: 100%; min-height: 40px; padding: 5px 2px; border: 0; border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.writing-tool-rail button[aria-pressed="true"] { color: var(--text-primary); background: var(--workbench-selected); }
.writing-tool-rail button:hover { background: var(--nav-hover); color: var(--text-primary); }
.writing-tool-rail button[aria-pressed="true"]:hover { background: var(--workbench-selected-hover); color: var(--text-primary); }
.writing-tool-rail button:focus-visible { outline: 2px solid var(--workbench-focus); outline-offset: -2px; }
.writing-tool-rail button:active { background: var(--nav-focused); }
@media (min-width: 721px) { .writing-tool-rail button[data-group-start="true"] { margin-top: 14px; } }
@media (prefers-reduced-motion: reduce) { .writing-tool-rail button { transition: none; } }
/* 与 Authoring 的全宽 sheet 同时切为底部工具带，避免 641–720px 留下被稿面遮住的竖栏。 */
@media (max-width: 720px) { .writing-tool-rail { position: fixed; z-index: 30; inset-inline: 0; inset-block-end: 0; width: auto; flex-direction: row; gap: 2px; padding: 0 4px env(safe-area-inset-bottom, 0px); overflow-x: auto; overflow-y: hidden; border-top: 1px solid var(--hairline-soft); background: var(--surface-workbench-muted); } .writing-tool-rail button { flex: 1 0 var(--writing-tool-rail-width, 60px); min-height: 48px; } }
</style>
