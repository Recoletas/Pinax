<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

// W-B dock 收敛：旧四段 dock 的「执行」tab 退役，运行日志降级为 Agent 面板内
// 的次级入口——默认收起，点开即在助手面板下方展开。AuthoringRunLog 沉到本组件
// 异步加载（trace 概览，按作品过滤）；「本会话工具流水」读当前会话消息自带的
// toolResults（工具入参/输出摘要，ZCode 式逐条可展开——输出全文只在内存/会话
// 存储，不进 agentRequestTrace，对齐「trace 不落内容」的既有口径）。
const AuthoringRunLog = defineAsyncComponent(() => import('./AuthoringRunLog.vue'))

const props = defineProps({
  projectId: { type: [String, Number], default: '' },
  messages: { type: Array, default: () => [] }
})

const open = ref(false)
function toggle() {
  open.value = !open.value
}

function outputHead(result) {
  const raw = result?.result
  let text = ''
  if (typeof raw === 'string') text = raw
  else if (raw && typeof raw === 'object') {
    try { text = JSON.stringify(raw) } catch { text = String(raw) }
  }
  return { head: text.slice(0, 2400), chars: text.length }
}

const toolEntries = computed(() => {
  // messages 可能是 ComputedRef（普通对象嵌套 ref 模板不深层解包），取 .value 归一。
  const source = Array.isArray(props.messages) ? props.messages : (Array.isArray(props.messages?.value) ? props.messages.value : [])
  const entries = []
  for (const message of [...source].reverse()) {
    if (message?.kind !== 'agent' || !Array.isArray(message.toolResults)) continue
    for (const [index, result] of message.toolResults.entries()) {
      if (!result || typeof result.toolName !== 'string') continue
      const { head, chars } = outputHead(result)
      entries.push({
        key: `${message.id}:${index}`,
        toolName: result.toolName,
        input: String(result.input || ''),
        callId: String(result.callId || ''),
        isError: Boolean(result.isError),
        head,
        chars,
        expanded: false,
        at: Number(message.createdAt) || 0
      })
    }
  }
  return entries.slice(0, 60)
})
function toggleEntry(entry) {
  entry.expanded = !entry.expanded
}
function shortTime(at) {
  if (!at) return ''
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <section class="authoring-run-log-drawer" :class="{ 'is-open': open }">
    <button type="button" class="authoring-run-log-drawer__toggle" data-test="authoring-run-log-entry"
      :aria-expanded="open.toString()" :aria-controls="open ? 'authoring-run-log-drawer-body' : undefined"
      @click="toggle">
      <WorkbenchIcon name="history" :size="14" />
      <span>{{ tr('运行日志') }}</span>
      <WorkbenchIcon name="chevron-down" :size="14" class="authoring-run-log-drawer__chevron" />
    </button>
    <div v-if="open" id="authoring-run-log-drawer-body" class="authoring-run-log-drawer__body">
      <section v-if="toolEntries.length" class="authoring-run-log-drawer__tools" data-test="authoring-tool-ledger">
        <h4 class="authoring-run-log-drawer__tools-title">{{ tr('本会话工具流水') }}</h4>
        <ol class="authoring-run-log-drawer__tool-list">
          <li v-for="entry in toolEntries" :key="entry.key" class="authoring-run-log-drawer__tool" :class="{ 'is-error': entry.isError }">
            <button type="button" class="authoring-run-log-drawer__tool-row" :aria-expanded="entry.expanded.toString()" @click="toggleEntry(entry)">
              <code class="authoring-run-log-drawer__tool-name">{{ entry.toolName }}</code>
              <code v-if="entry.input" class="authoring-run-log-drawer__tool-input">{{ entry.input }}</code>
              <span v-if="entry.isError" class="authoring-run-log-drawer__tool-error">{{ tr('出错') }}</span>
              <span v-if="entry.chars" class="authoring-run-log-drawer__tool-chars">{{ tr('{n} 字符', { n: entry.chars }) }}</span>
              <time class="authoring-run-log-drawer__tool-time">{{ shortTime(entry.at) }}</time>
              <WorkbenchIcon name="chevron-down" :size="12" class="authoring-run-log-drawer__tool-chevron" :class="{ 'is-open': entry.expanded }" />
            </button>
            <pre v-if="entry.expanded" class="authoring-run-log-drawer__tool-output">{{ entry.head }}{{ entry.chars > entry.head.length ? '\n…（已截断，共 ' + entry.chars + ' 字符）' : '' }}</pre>
          </li>
        </ol>
      </section>
      <AuthoringRunLog :project-id="projectId" />
    </div>
  </section>
</template>

<style scoped>
.authoring-run-log-drawer { flex: none; border-top: 1px solid var(--hairline-soft, var(--authoring-hairline)); background: var(--surface-workbench-muted); }
.authoring-run-log-drawer__toggle { display: flex; width: 100%; min-height: 36px; align-items: center; gap: 7px; padding: 6px 14px; border: 0; background: transparent; color: var(--text-secondary); font: 12px/1.4 var(--font-interface, var(--font-sans)); cursor: pointer; }
.authoring-run-log-drawer__toggle:hover { background: var(--nav-hover); color: var(--text-primary); }
.authoring-run-log-drawer__toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.authoring-run-log-drawer__chevron { margin-inline-start: auto; transition: transform 120ms ease; }
.authoring-run-log-drawer:not(.is-open) .authoring-run-log-drawer__chevron { transform: rotate(-90deg); }
.authoring-run-log-drawer__body { max-height: min(340px, 50vh); overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--hairline-soft, var(--authoring-hairline)); }
.authoring-run-log-drawer__tools { padding: 8px 14px 4px; }
.authoring-run-log-drawer__tools-title { margin: 0 0 6px; color: var(--text-muted); font: 11px/1.4 var(--font-interface, var(--font-sans)); text-transform: uppercase; letter-spacing: .04em; }
.authoring-run-log-drawer__tool-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; }
.authoring-run-log-drawer__tool { border: 1px solid var(--hairline-soft); border-radius: 8px; background: var(--surface-primary, transparent); }
.authoring-run-log-drawer__tool.is-error { border-color: var(--signal-warm, var(--danger)); }
.authoring-run-log-drawer__tool-row { display: flex; width: 100%; align-items: center; gap: 7px; min-height: 30px; padding: 3px 8px; border: 0; background: transparent; color: var(--text-secondary); font: 12px/1.4 var(--font-interface, var(--font-sans)); cursor: pointer; text-align: start; }
.authoring-run-log-drawer__tool-row:hover { background: var(--nav-hover); color: var(--text-primary); }
.authoring-run-log-drawer__tool-name { flex: none; color: var(--accent-primary, var(--accent)); font-size: 12px; }
.authoring-run-log-drawer__tool-input { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border-radius: 5px; background: var(--surface-workbench-muted); color: var(--text-muted); font-size: 11px; }
.authoring-run-log-drawer__tool-error { flex: none; color: var(--signal-warm, var(--danger)); font-size: 11px; }
.authoring-run-log-drawer__tool-chars { flex: none; color: var(--text-muted); font-size: 11px; }
.authoring-run-log-drawer__tool-time { margin-inline-start: auto; flex: none; color: var(--text-muted); font-size: 11px; }
.authoring-run-log-drawer__tool-chevron { flex: none; transition: transform 120ms ease; }
.authoring-run-log-drawer__tool-chevron.is-open { transform: rotate(180deg); }
.authoring-run-log-drawer__tool-output { margin: 0; padding: 8px 10px; border-top: 1px solid var(--hairline-soft); background: var(--surface-workbench-input); color: var(--text-secondary); font: 11px/1.6 var(--font-mono, ui-monospace, monospace); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 220px; overflow-y: auto; }
@media (max-width: 720px) { .authoring-run-log-drawer__toggle { min-height: 44px; } .authoring-run-log-drawer__tool-row { min-height: 40px; flex-wrap: wrap; } }
@media (prefers-reduced-motion: reduce) { .authoring-run-log-drawer__chevron, .authoring-run-log-drawer__tool-chevron { transition: none; } }
</style>
