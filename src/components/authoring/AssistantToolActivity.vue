<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ tools: { type: Array, default: () => [] }, status: String })
const tools = computed(() => props.tools.map(tool => tool.status === 'running' && props.status !== 'running' ? { ...tool, status: props.status === 'cancelled' ? 'cancelled' : 'interrupted' } : tool))
const labels = { writing_methods: '查阅写作方法', knowledge: '检索知识库', generate_narrative_draft: '推演写作', workspace: '查阅作品目录', manuscript_search: '检索正文', manuscript_get: '读取章节', world_lookup: '查阅设定', notes_search: '检索构思', outline_lookup: '查阅大纲', calc_evaluate: '复算数值', submit_narrative_beat_plan: '规划场景', submit_edit_proposals: '整理修改建议', request_user_input: '询问作者', complete_assistant_task: '交付结果' }
const groups = computed(() => {
  const map = new Map()
  for (const tool of tools.value) { if (!map.has(tool.name)) map.set(tool.name, { name: tool.name, label: labels[tool.name] || tool.name, tools: [] }); map.get(tool.name).tools.push(tool) }
  return [...map.values()]
})
const running = computed(() => tools.value.some(tool => tool.status === 'running'))
const description = tool => tool.input?.q || tool.input?.query || tool.input?.title || tool.input?.id || tool.input?.action || labels[tool.name] || tool.name
const statusLabel = tool => ({ running: '处理中', failed: '失败', interrupted: '中断', cancelled: '已停止', completed: '完成' })[tool.status] || tool.status
</script>
<template>
  <details v-if="tools.length" class="assistant-activity">
    <summary><WorkbenchIcon name="chevron-down" :size="12" /><span>{{ tr(running ? '正在使用工具 · {count} 次调用' : '工具记录 · {count} 次调用', { count: tools.length }) }}</span></summary>
    <details v-for="group in groups" :key="group.name" class="assistant-activity__group"><summary><span>{{ tr(group.label) }}</span><small>×{{ group.tools.length }}</small><span v-if="group.tools.some(tool => tool.status === 'failed')">{{ tr('有失败') }}</span><WorkbenchIcon v-else-if="group.tools.every(tool => tool.status === 'completed')" name="check" :size="12" /></summary><ul><li v-for="(tool, index) in group.tools" :key="tool.callId || index"><span>{{ description(tool) }}</span><small>{{ tr(statusLabel(tool)) }}</small><p v-if="tool.error">{{ tool.error }}</p></li></ul></details>
  </details>
</template>
<style scoped>
.assistant-activity { color: var(--text-secondary); font: 12px/1.5 var(--font-sans); }
.assistant-activity summary { display: flex; align-items: center; gap: 7px; min-height: 30px; cursor: pointer; list-style: none; }
.assistant-activity summary::-webkit-details-marker { display: none; }
.assistant-activity > summary > svg { transform: rotate(-90deg); }
.assistant-activity[open] > summary > svg { transform: none; }
.assistant-activity__group { padding-inline-start: 18px; }
.assistant-activity__group summary small { color: var(--text-muted); }
.assistant-activity ul { margin: 0 0 8px; padding: 0 0 0 14px; border-inline-start: 1px solid var(--hairline-soft); list-style: none; }
.assistant-activity li { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0; overflow-wrap: anywhere; }
.assistant-activity li > span { flex: 1; min-width: 0; }
.assistant-activity li small { color: var(--text-muted); }
.assistant-activity p { flex-basis: 100%; margin: 0; }
</style>
