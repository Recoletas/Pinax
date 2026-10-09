<template>
  <div class="authoring-run-log" data-test="authoring-run-log" :aria-label="tr('运行记录')">
    <div class="authoring-run-log__bar">
      <strong>{{ tr('运行记录') }}</strong>
      <button type="button" class="authoring-run-log__refresh" :aria-label="tr('刷新列表')" :title="tr('刷新列表')" @click="refresh"><WorkbenchIcon name="refresh" :size="14" /></button>
    </div>

    <p v-if="!entries.length" class="authoring-run-log__empty" data-test="authoring-run-log-empty">{{ tr('本作品还没有运行记录。助手对话或写作 Agent 跑完后会在这里留档。') }}</p>

    <ol v-else class="authoring-run-log__list">
      <li v-for="entry in entries" :key="entry.requestId">
        <details class="authoring-run-log__entry" :data-kind="kindOf(entry)" :data-status="entry.status">
          <summary>
            <WorkbenchIcon :name="kindOf(entry) === 'agent' ? 'assistant' : 'search'" :size="13" />
            <span class="authoring-run-log__kind">{{ tr(kindOf(entry) === 'agent' ? '写作 Agent' : taskLabel(entry)) }}</span>
            <span class="authoring-run-log__status" :class="'is-' + (entry.status || 'unknown')">{{ tr(statusLabel(entry)) }}</span>
            <span v-if="formatDuration(entry)" class="authoring-run-log__duration">{{ formatDuration(entry) }}</span>
            <time :title="fullTime(entry.startedAt)">{{ formatClock(entry.startedAt) }}</time>
          </summary>

          <div v-if="kindOf(entry) === 'advisor'" class="authoring-run-log__detail">
            <p v-if="entry.taskType" class="authoring-run-log__meta">{{ tr('任务类型 {type}', { type: entry.taskType }) }}</p>
            <p v-if="entry.context?.budget" class="authoring-run-log__meta">{{ tr('上下文用量') }} · {{ tr('{used} / {max} 字符', { used: entry.context.budget.usedChars || 0, max: entry.context.budget.maxChars || 0 }) }}</p>
            <ul v-if="entry.context?.blocks?.length" class="authoring-run-log__blocks">
              <li v-for="block in entry.context.blocks" :key="block.order + ':' + block.kind">
                <span class="authoring-run-log__kind">{{ tr(blockLabel(block.kind)) }}</span>
                <span>{{ tr('{count} 字符', { count: block.chars ?? block.retainedChars ?? 0 }) }}</span>
                <span v-if="block.truncated" class="authoring-run-log__badge">{{ tr('已截断') }}</span>
                <span v-if="block.sourceRefs?.length">{{ tr('{count} 处来源', { count: block.sourceRefs.length }) }}</span>
              </li>
            </ul>
            <p v-if="entry.context?.dropped?.length" class="authoring-run-log__meta">{{ tr('被丢弃 {count} 块', { count: entry.context.dropped.length }) }}</p>
            <p v-if="errorText(entry)" class="authoring-run-log__error">{{ tr('错误：{detail}', { detail: errorText(entry) }) }}</p>
          </div>

          <div v-else class="authoring-run-log__detail">
            <p v-if="entry.taskId" class="authoring-run-log__meta">{{ tr('任务号 {id}', { id: entry.taskId }) }}<template v-if="entry.resumed"> · {{ tr('续跑') }}</template></p>
            <p v-if="entry.model" class="authoring-run-log__meta">{{ tr('模型 {model}', { model: entry.model }) }}</p>
            <p v-if="entry.usage?.totalTokens" class="authoring-run-log__meta">{{ tr('用量 {n}', { n: entry.usage.totalTokens }) }} · {{ tr('输入 {in} · 输出 {out}', { in: entry.usage.inputTokens ?? 0, out: entry.usage.outputTokens ?? 0 }) }}</p>
            <p v-if="entry.toolCalls?.length" class="authoring-run-log__meta">{{ tr('工具调用 {count} 次', { count: entry.totalCalls ?? entry.toolCalls.length }) }}<template v-if="entry.toolRounds != null"> · {{ tr('工具轮 {count}', { count: entry.toolRounds }) }}</template></p>
            <ul v-if="entry.toolCalls?.length" class="authoring-run-log__tools">
              <li v-for="(call, index) in entry.toolCalls" :key="index"><code>{{ call.name }}</code><span v-if="call.action">{{ call.action }}</span></li>
            </ul>
            <p v-if="entry.reasoningChars" class="authoring-run-log__meta">{{ tr('思考 {count} 字符', { count: entry.reasoningChars }) }}</p>
            <p v-if="entry.terminalMode" class="authoring-run-log__meta">{{ tr('终端模式 {mode}', { mode: entry.terminalMode }) }}</p>
            <p v-if="errorText(entry)" class="authoring-run-log__error">{{ tr('错误：{detail}', { detail: errorText(entry) }) }}</p>
          </div>
        </details>
      </li>
    </ol>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { tr, uiLocale } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { getAgentRequestTraces } from '../../services/agents/agentRequestTrace.js'

const props = defineProps({
  projectId: { type: [String, Number], default: '' }
})

const entries = ref([])

function refresh() {
  const wanted = String(props.projectId || '')
  entries.value = wanted
    ? getAgentRequestTraces().filter((trace) => String(trace?.projectId || '') === wanted)
    : []
}

onMounted(refresh)
watch(() => props.projectId, refresh)

function kindOf(trace) {
  return trace?.kind === 'agent' ? 'agent' : 'advisor'
}

const STATUS_LABELS = { pending: '进行中', completed: '完成', failed: '失败', cancelled: '已取消' }
function statusLabel(trace) {
  return STATUS_LABELS[trace?.status] || trace?.status || ''
}

const TASK_LABELS = {
  'authoring.knowledge.query': '资料问答',
  'authoring.rewrite': '改写',
  'authoring.review.selection': '选段检查',
  'authoring.review.chapter': '章节检查',
  'authoring.complete.inline': '续写'
}
function taskLabel(trace) {
  return TASK_LABELS[trace?.taskType] || trace?.taskType || ''
}

const BLOCK_LABELS = {
  system: '系统', selection: '选区', scene: '场景', character: '角色', location: '地点',
  history: '历史', memory: '记忆', references: '参考', style: '文风', rules: '约束',
  raw: '原文', outline: '大纲', worldbook: '世界书', inbox: '速记', legacy: '旧版'
}
function blockLabel(kind) {
  return BLOCK_LABELS[kind] || kind || ''
}

function formatClock(value) {
  if (!value) return ''
  return new Date(Number(value)).toLocaleTimeString(uiLocale.value, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function fullTime(value) {
  if (!value) return ''
  return new Date(Number(value)).toLocaleString(uiLocale.value)
}

function formatDuration(trace) {
  const started = Number(trace?.startedAt) || 0
  const completed = Number(trace?.completedAt) || 0
  if (!started || !completed || completed < started) return ''
  const ms = completed - started
  return ms < 1000 ? tr('{ms} 毫秒', { ms }) : tr('{seconds} 秒', { seconds: (ms / 1000).toFixed(1) })
}

function errorText(trace) {
  return [trace?.error?.code, trace?.error?.message].filter(Boolean).join(' · ')
}
</script>

<style scoped>
.authoring-run-log { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 10px; padding: 14px 12px 18px; }
.authoring-run-log__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 2px; }
.authoring-run-log__bar strong { color: var(--text-primary); font: 500 14px/1.5 var(--font-interface, var(--font-sans)); }
.authoring-run-log__refresh { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-run-log__refresh:hover { background: var(--nav-hover); color: var(--text-primary); }
.authoring-run-log__refresh:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.authoring-run-log__empty { margin: auto; padding: 24px 18px; color: var(--text-muted, var(--archive-ink-soft)); font: 13px/1.7 var(--font-interface, var(--font-sans)); text-align: center; }
.authoring-run-log__list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.authoring-run-log__entry { border: 1px solid var(--border-subtle, var(--hairline-soft, rgba(0, 0, 0, 0.12))); border-radius: 10px; }
.authoring-run-log__entry summary { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 8px 10px; color: var(--text-secondary); font: 12px/1.5 var(--font-interface, var(--font-sans)); cursor: pointer; list-style: none; }
.authoring-run-log__entry summary::-webkit-details-marker { display: none; }
.authoring-run-log__entry summary > svg { flex: none; color: var(--text-muted); }
.authoring-run-log__kind { overflow: hidden; min-width: 0; color: var(--text-primary); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.authoring-run-log__status { flex: none; color: var(--text-muted); }
.authoring-run-log__status.is-completed { color: color-mix(in srgb, var(--accent-primary, var(--accent, #3b82f6)) 70%, var(--text-primary, #000)); }
.authoring-run-log__status.is-failed { color: color-mix(in srgb, var(--archive-rose, #b4656f) 82%, var(--text-primary, #000)); }
.authoring-run-log__duration { flex: none; margin-left: auto; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.authoring-run-log__entry summary time { flex: none; color: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.authoring-run-log__detail { display: grid; gap: 6px; padding: 2px 10px 10px; border-top: 1px solid color-mix(in srgb, var(--text-secondary, #666) 12%, transparent); }
.authoring-run-log__meta { margin: 6px 0 0; color: var(--text-secondary); font: 11px/1.6 var(--font-interface, var(--font-sans)); }
.authoring-run-log__error { margin: 6px 0 0; color: var(--archive-rose, #b4656f); font: 11px/1.6 var(--font-interface, var(--font-sans)); overflow-wrap: anywhere; }
.authoring-run-log__blocks, .authoring-run-log__tools { display: flex; flex-direction: column; gap: 4px; margin: 4px 0 0; padding: 0; list-style: none; }
.authoring-run-log__blocks li, .authoring-run-log__tools li { display: flex; align-items: baseline; gap: 8px; color: var(--text-muted); font: 11px/1.6 var(--font-interface, var(--font-sans)); }
.authoring-run-log__tools code { color: var(--text-secondary); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 11px; }
.authoring-run-log__badge { padding: 0 4px; border: 1px solid color-mix(in srgb, var(--archive-rose, #b4656f) 46%, transparent); border-radius: 2px; color: color-mix(in srgb, var(--archive-rose, #b4656f) 82%, var(--text-primary, #000)); font-size: 10px; }

@media (max-width: 720px) {
  .authoring-run-log__refresh { width: 44px; height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .authoring-run-log__refresh { transition: none; }
}
</style>
