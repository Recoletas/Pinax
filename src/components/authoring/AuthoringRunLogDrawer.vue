<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { vWorkbenchTooltip } from '../workbench/workbenchTooltip.js'

// 更多菜单打开日志浮窗；作品 trace 按需加载，当前会话的工具入参与输出
// 从消息读取，不把内容写入 agentRequestTrace。
const AuthoringRunLog = defineAsyncComponent(() => import('./AuthoringRunLog.vue'))

const props = defineProps({
  projectId: { type: [String, Number], default: '' },
  messages: { type: Array, default: () => [] },
  canCompact: Boolean, compacting: Boolean, compacted: Boolean
})
const emit = defineEmits(['compact'])
function compactContext() { if (menu.value) menu.value.open = false; emit('compact') }

const open = ref(false)
const menu = ref(null), dialog = ref(null), closeButton = ref(null)
const view = ref('current')
async function toggle() {
  if (menu.value) menu.value.open = false
  open.value = true
  await nextTick()
  dialog.value?.showModal()
  closeButton.value?.focus()
}
function close() { dialog.value?.close(); open.value = false; nextTick(() => menu.value?.querySelector('summary')?.focus()) }
function backdrop(event) { if (event.target !== dialog.value) return; const r = dialog.value.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close() }
watch(() => props.projectId, () => { dialog.value?.close(); open.value = false; expanded.value = new Set(); view.value = 'current' })
onBeforeUnmount(() => dialog.value?.close())
const expanded = ref(new Set())

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
        input: JSON.stringify(message.tools?.find(tool => result.callId ? tool.callId === result.callId : tool.name === result.toolName)?.input || result.input || null),
        callId: String(result.callId || ''),
        isError: Boolean(result.isError) || (() => { try { return JSON.parse(result.result?.content?.find(block => block.type === 'text')?.text || '{}').ok === false } catch { return false } })(),
        head,
        chars,
        expanded: expanded.value.has(`${message.id}:${index}`),
        at: Number(message.createdAt) || 0
      })
    }
  }
  return entries.slice(0, 60)
})
function toggleEntry(entry) {
  const next = new Set(expanded.value); if (next.has(entry.key)) next.delete(entry.key); else next.add(entry.key); expanded.value = next
}
function toolLabel(name) { return tr(({ writing_methods: '查阅写作方法', knowledge: '检索知识库', generate_narrative_draft: '推演写作', workspace: '查阅作品目录', manuscript_search: '检索正文', manuscript_get: '读取章节', world_lookup: '查阅设定', notes_search: '检索构思', outline_lookup: '查阅大纲', calc_evaluate: '复算数值', submit_narrative_beat_plan: '规划场景', submit_edit_proposals: '整理修改建议', complete_assistant_task: '交付本轮结果' })[name] || name) }
function shortTime(at) {
  if (!at) return ''
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="authoring-run-log-drawer">
    <details ref="menu" class="authoring-run-log-drawer__menu" @focusout="!$event.currentTarget.contains($event.relatedTarget) && ($event.currentTarget.open = false)" @keydown.esc.stop="$event.currentTarget.open = false; $event.currentTarget.querySelector('summary')?.focus()">
      <summary :aria-label="tr('更多助手操作')" v-workbench-tooltip="tr('更多助手操作')"><WorkbenchIcon name="more" :size="18" /></summary>
      <div class="authoring-run-log-drawer__actions"><button type="button" data-test="assistant-compact-context" :disabled="!canCompact || compacting" :title="tr('保留原消息，只压缩后续发送的上下文；至少需要三轮对话。')" @click="compactContext"><WorkbenchIcon name="archive" :size="15" />{{ tr(compacting ? '正在压缩…' : compacted && !canCompact ? '上下文已压缩' : '压缩上下文') }}</button><button type="button" data-test="authoring-run-log-entry" @click="toggle"><WorkbenchIcon name="history" :size="15" />{{ tr('运行日志') }}</button></div>
    </details>
    <Teleport to="body">
      <dialog v-if="open" ref="dialog" class="authoring-run-log-drawer__dialog" :aria-label="tr('运行日志')" @cancel.prevent="close" @click="backdrop">
        <header><strong>{{ tr('运行日志') }}</strong><button ref="closeButton" type="button" :aria-label="tr('关闭运行日志')" @click="close"><WorkbenchIcon name="close" :size="18" /></button></header>
        <nav class="authoring-run-log-drawer__tabs" aria-label="日志范围"><button type="button" :aria-pressed="view === 'current'" @click="view = 'current'">{{ tr('本次对话') }}</button><button type="button" :aria-pressed="view === 'project'" @click="view = 'project'">{{ tr('作品记录') }}</button></nav>
        <div class="authoring-run-log-drawer__body">
      <section v-if="view === 'current' && toolEntries.length" class="authoring-run-log-drawer__tools" data-test="authoring-tool-ledger">
        <ol class="authoring-run-log-drawer__tool-list">
          <li v-for="entry in toolEntries" :key="entry.key" class="authoring-run-log-drawer__tool" :class="{ 'is-error': entry.isError }">
            <button type="button" class="authoring-run-log-drawer__tool-row" :aria-expanded="entry.expanded.toString()" @click="toggleEntry(entry)">
              <WorkbenchIcon :name="entry.isError ? 'alert' : 'check'" :size="13" /><span class="authoring-run-log-drawer__tool-name">{{ toolLabel(entry.toolName) }}</span>
              <span v-if="entry.isError" class="authoring-run-log-drawer__tool-error">{{ tr('出错') }}</span>
              <time class="authoring-run-log-drawer__tool-time">{{ shortTime(entry.at) }}</time>
              <WorkbenchIcon name="chevron-down" :size="12" class="authoring-run-log-drawer__tool-chevron" :class="{ 'is-open': entry.expanded }" />
            </button>
            <div v-if="entry.expanded" class="authoring-run-log-drawer__details"><span class="authoring-run-log-drawer__detail-label">{{ tr('参数') }} · {{ entry.toolName }}</span><pre class="authoring-run-log-drawer__tool-output">{{ entry.input }}</pre><span class="authoring-run-log-drawer__detail-label">{{ tr('结果') }}</span><pre class="authoring-run-log-drawer__tool-output">{{ entry.head }}{{ entry.chars > entry.head.length ? '\n…（已截断，共 ' + entry.chars + ' 字符）' : '' }}</pre></div>
          </li>
        </ol>
      </section>
      <p v-else-if="view === 'current'" class="authoring-run-log-drawer__empty">{{ tr('这次对话还没有工具记录。') }}</p>
      <AuthoringRunLog v-else :project-id="projectId" />
        </div>
      </dialog>
    </Teleport>
  </div>
</template>

<style scoped>
.authoring-run-log-drawer { flex:none; font:13px/1.5 var(--font-interface); }
.authoring-run-log-drawer__menu { position:relative; }
.authoring-run-log-drawer__menu summary { display:grid; place-items:center; width:36px; height:36px; border-radius:var(--radius-control); cursor:pointer; list-style:none; color:var(--text-secondary); }
.authoring-run-log-drawer__menu summary::-webkit-details-marker { display:none; }
.authoring-run-log-drawer__menu summary:hover { background:var(--nav-hover); }
.authoring-run-log-drawer__actions { position:absolute; z-index:20; top:calc(100% + 4px); right:0; min-width:150px; padding:4px; background:var(--surface-workbench-raised); border:1px solid var(--hairline-soft); border-radius:var(--radius-popover); box-shadow:var(--shadow-workbench-float); }
.authoring-run-log-drawer__actions button:disabled { opacity:.45; cursor:default; }
.authoring-run-log-drawer__actions button { display:flex; width:100%; align-items:center; gap:8px; min-height:36px; padding:8px; text-align:start; }
:is(.authoring-run-log-drawer,.authoring-run-log-drawer__dialog) button { border:0; border-radius:var(--radius-control); background:transparent; color:var(--text-secondary); font:inherit; cursor:pointer; }
:is(.authoring-run-log-drawer,.authoring-run-log-drawer__dialog) button:hover { background:var(--nav-hover); color:var(--text-primary); }
:is(.authoring-run-log-drawer,.authoring-run-log-drawer__dialog) :is(button,summary):focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.authoring-run-log-drawer__dialog { position:fixed; inset:auto; top:50%; left:50%; margin:0; transform:translate(-50%,-50%); box-sizing:border-box; width:min(680px, calc(100vw - 32px)); max-height:80dvh; padding:0; border:1px solid var(--hairline-soft); border-radius:var(--radius-popover); background:var(--surface-workbench-raised); color:var(--text-primary); box-shadow:var(--shadow-workbench-float); font:13px/1.5 var(--font-interface); }
.authoring-run-log-drawer__dialog[open] { display:flex; flex-direction:column; }
.authoring-run-log-drawer__dialog::backdrop { background:var(--surface-workbench-scrim); }
.authoring-run-log-drawer__dialog header { display:flex; flex:none; align-items:center; justify-content:space-between; padding:20px 24px 12px; }
.authoring-run-log-drawer__dialog header strong { font-size:14px; font-weight:600; }
.authoring-run-log-drawer__dialog header button { display:grid; place-items:center; width:32px; height:32px; }
.authoring-run-log-drawer__tabs { display:flex; flex:none; gap:18px; padding:0 24px; border-bottom:1px solid var(--hairline-soft); }
.authoring-run-log-drawer__tabs button { padding:8px 0; border-radius:0; border-bottom:2px solid transparent; }
.authoring-run-log-drawer__tabs button[aria-pressed='true'] { color:var(--text-primary); border-bottom-color:var(--accent); }
.authoring-run-log-drawer__body { min-height:0; overflow:auto; overscroll-behavior:contain; padding:12px 24px 20px; }
.authoring-run-log-drawer__empty { padding:20px 0; margin:0; color:var(--text-muted); }
.authoring-run-log-drawer__tool-list { padding:0; margin:0; list-style:none; }
.authoring-run-log-drawer__tool { border-bottom:1px solid var(--hairline-soft); }
.authoring-run-log-drawer__tool-row { display:flex; width:100%; align-items:center; gap:10px; min-height:44px; padding:8px 4px; }
.authoring-run-log-drawer__tool-name { flex:1; min-width:0; text-align:start; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.authoring-run-log-drawer__tool-time { color:var(--text-muted); font-size:11px; font-variant-numeric:tabular-nums; }
.authoring-run-log-drawer__tool-error { color:var(--danger); font-size:11px; }
.authoring-run-log-drawer__tool-chevron.is-open { transform:rotate(180deg); }
.authoring-run-log-drawer__details { display:grid; gap:6px; padding:4px 0 12px; }
.authoring-run-log-drawer__detail-label { color:var(--text-muted); font-size:11px; }
.authoring-run-log-drawer__tool-output { margin:0; padding:10px; border-radius:var(--radius-control); background:var(--surface-workbench-input); color:var(--text-secondary); font:12px/1.6 var(--font-mono,monospace); white-space:pre-wrap; overflow-wrap:anywhere; max-height:240px; overflow:auto; }
@media (max-width:720px), (pointer:coarse) { .authoring-run-log-drawer__menu summary, :is(.authoring-run-log-drawer,.authoring-run-log-drawer__dialog) button { min-height:44px; } .authoring-run-log-drawer__menu summary { width:44px; } .authoring-run-log-drawer__dialog header, .authoring-run-log-drawer__body { padding-inline:16px; } }
</style>
