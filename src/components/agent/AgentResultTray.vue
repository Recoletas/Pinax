<template>
  <article class="agent-result" :class="`is-${result.status}`">
    <header class="agent-result__head">
      <div>
        <span class="agent-result__scope">{{ title }}</span>
        <strong>{{ result.summary || statusLabel }}</strong>
      </div>
      <span class="agent-result__status">{{ statusLabel }}</span>
    </header>

    <div v-if="preview" class="agent-result__diff" aria-label="修改预览">
      <div>
        <span>原文</span>
        <pre>{{ preview.before }}</pre>
      </div>
      <div>
        <span>修改后</span>
        <pre>{{ preview.after }}</pre>
      </div>
    </div>

    <ul v-else-if="domainActionPreview.length" class="agent-result__reviews" aria-label="领域修改预览">
      <li v-for="(line, index) in domainActionPreview" :key="index">{{ line }}</li>
    </ul>

    <ul v-else-if="result.suggestions?.length" class="agent-result__reviews">
      <li v-for="(suggestion, index) in result.suggestions" :key="index">
        <span>{{ suggestionText(suggestion) }}</span>
        <span v-if="result.status === 'completed' && supportsWritingConversion" class="agent-result__review-actions">
          <button
            type="button"
            title="将这条建议加入当前章节纲要"
            @click="$emit('convert', { result, suggestion, index, type: 'outline-item' })"
          >入纲要</button>
          <button
            type="button"
            title="将这条建议保存到素材收件箱"
            @click="$emit('convert', { result, suggestion, index, type: 'create-asset' })"
          >存素材</button>
        </span>
      </li>
    </ul>
    <p v-if="result.statusDetail" class="agent-result__detail">{{ result.statusDetail }}</p>

    <footer class="agent-result__actions">
      <button
        v-if="canApply"
        type="button"
        class="is-primary"
        @click="$emit('apply', result)"
      >应用修改</button>
      <button
        v-if="result.status === 'applied' && result.applyReceipt"
        type="button"
        @click="$emit('undo', result)"
      >撤销本次</button>
      <button
        v-if="result.domainReceipt"
        type="button"
        @click="$emit('undo-domain', result)"
      >撤销{{ result.domainReceipt.type === 'outline-item' ? '纲要' : '素材' }}</button>
      <button
        v-if="canDismiss"
        type="button"
        @click="$emit('dismiss', result)"
      >忽略</button>
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  result: { type: Object, required: true }
})

defineEmits(['apply', 'undo', 'undo-domain', 'dismiss', 'convert'])

const labels = {
  pending: '生成中',
  completed: '待审阅',
  applying: '应用中',
  applied: '已应用',
  stale: '已过期',
  failed: '失败'
}

const statusLabel = computed(() => labels[props.result.status] || props.result.status || '')
const title = computed(() => {
  const task = props.result._agentResult?.taskType || props.result.task || ''
  if (task === 'materials.refine') return '素材精简'
  if (task.startsWith('materials.')) return '素材分析'
  if (task.startsWith('canvas.')) return '画布局部分析'
  if (task === 'storyboard.review') return '镜头连续性'
  if (task === 'storyboard.video.prompt') return '视频生成请求'
  if (task.includes('selection')) return '选区修改'
  if (task.includes('paragraph')) return '段落修改'
  if (task.includes('health')) return '章节体检'
  if (task.includes('thread')) return '线索收束'
  return '专业任务'
})
const supportsWritingConversion = computed(() => {
  const task = props.result._agentResult?.taskType || props.result.taskType || props.result.task || ''
  return String(task).startsWith('writing.')
})
const patchAction = computed(() => props.result.actions?.find((action) =>
  ['text-patch', 'replace_range'].includes(action?.type)
))
const domainActions = computed(() => (props.result.actions || []).filter((action) =>
  [
    'material-classification',
    'material-split',
    'material-relations',
    'canvas-layout',
    'canvas-relations',
    'canvas-transition',
    'runtime-candidate',
    'storyboard-shot-patch',
    'generation-request'
  ].includes(action?.type)
))
const domainActionPreview = computed(() => domainActions.value.flatMap((action) => {
  if (action.type === 'material-classification') {
    return (action.payload?.changes || []).map((change) =>
      `分类为 ${change.kind}${change.reason ? `：${change.reason}` : ''}`
    )
  }
  if (action.type === 'material-split') {
    return (action.payload?.parts || []).map((part) => `拆分：${part.title} · ${part.kind}`)
  }
  if (action.type === 'material-relations') {
    return (action.payload?.links || []).map((link) =>
      `建立 ${link.relation} 关联${link.reason ? `：${link.reason}` : ''}`
    )
  }
  if (action.type === 'canvas-layout') {
    return (action.payload?.moves || []).map((move) =>
      `移动节点至 (${Math.round(Number(move.x) || 0)}, ${Math.round(Number(move.y) || 0)})${move.reason ? `：${move.reason}` : ''}`
    )
  }
  if (action.type === 'canvas-relations' || action.type === 'canvas-transition') {
    return (action.payload?.changes || []).map((change) =>
      `${change.operation === 'remove' ? '删除' : '设置'}${action.type === 'canvas-transition' ? '转场' : '关系'} ${change.edgeType || ''}${change.reason ? `：${change.reason}` : ''}`
    )
  }
  if (action.type === 'runtime-candidate' && action.payload?.kind === 'next-actions') {
    return (action.payload.options || []).map((option) =>
      `${option.label}${option.intent ? ` · ${option.intent}` : ''}${option.risk ? `；风险：${option.risk}` : ''}`
    )
  }
  if (action.type === 'runtime-candidate' && action.payload?.kind === 'emergence-review') {
    return [`候选 ${action.payload.candidateId}${action.payload.reason ? `：${action.payload.reason}` : ''}`]
  }
  if (action.type === 'storyboard-shot-patch') {
    return Object.entries(action.payload?.changes || {}).map(([field, value]) =>
      `修改 ${field}：${value}${action.payload?.reason ? ` · ${action.payload.reason}` : ''}`
    )
  }
  if (action.type === 'generation-request') {
    return [`确认镜头 ${action.payload?.shotId || ''} 的视频提示词：${action.payload?.prompt || ''}`]
  }
  return []
}))
const preview = computed(() => {
  const action = patchAction.value
  if (action) {
    return {
      before: action.baseText || '',
      after: action.content ?? action.text ?? action.replacement ?? ''
    }
  }
  if (props.result.replacement) {
    return {
      before: props.result.baseText || props.result._agentResult?.actions?.[0]?.baseText || '',
      after: props.result.replacement
    }
  }
  return null
})
const canApply = computed(() =>
  props.result.status === 'completed'
  && Boolean(
    patchAction.value
    || props.result.replacement
    || domainActions.value.some((action) => action.type !== 'runtime-candidate')
  )
)
const canDismiss = computed(() =>
  ['pending', 'completed', 'failed'].includes(props.result.status)
)

function suggestionText(suggestion) {
  if (typeof suggestion === 'string') return suggestion
  return suggestion?.label || suggestion?.content || ''
}
</script>

<style scoped>
.agent-result {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-left: 3px solid var(--signal-secondary, var(--accent));
  background: color-mix(in srgb, var(--bg-secondary) 97%, var(--accent));
}

.agent-result__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.agent-result__head > div {
  display: grid;
  min-width: 0;
}

.agent-result__scope,
.agent-result__status,
.agent-result__diff span {
  color: var(--text-muted);
  font-size: 11px;
}

.agent-result__head strong {
  color: var(--text-primary);
  font-size: 13px;
}

.agent-result__diff {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.agent-result__diff > div {
  min-width: 0;
  border-top: 2px solid var(--border);
  padding-top: 5px;
}

.agent-result__diff > div:last-child {
  border-top-color: var(--signal-secondary, var(--accent));
}

.agent-result__diff pre {
  max-height: 150px;
  margin-top: 3px;
  overflow: auto;
  color: var(--text-primary);
  font: 12px/1.65 var(--font-body, inherit);
  white-space: pre-wrap;
}

.agent-result__reviews {
  display: grid;
  gap: 6px;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 12px;
}

.agent-result__reviews li {
  display: grid;
  gap: 4px;
}

.agent-result__review-actions {
  display: flex;
  gap: 4px;
}

.agent-result__review-actions button {
  padding: 1px 5px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}

.agent-result__review-actions button:hover,
.agent-result__review-actions button:focus-visible {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  outline: none;
}

.agent-result__detail {
  color: var(--text-muted);
  font-size: 12px;
}

.agent-result__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.agent-result__actions button {
  min-height: var(--control-height-sm, 28px);
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: var(--control-radius, 3px);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.agent-result__actions button.is-primary {
  border-color: color-mix(in srgb, var(--accent) 46%, var(--border));
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
  color: var(--text-primary);
}

@media (max-width: 640px) {
  .agent-result__diff {
    grid-template-columns: 1fr;
  }
}
</style>
