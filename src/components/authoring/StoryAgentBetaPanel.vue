<!-- StoryAgent-beta：pi-agent 适配层的侧栏测试坞（校验/测试专用，不写入书稿/世界书）。
     链路：src/services/agents/storyagent/piNarrativeAgentBridge.js → pinax-adapter（默认 127.0.0.1:8451）。
     交互对标 storymasterv4 storyharness Chat.tsx（@ 提及、/ 命令、预设/技法、会话列表续跑）。
     所有 SSE 帧都经上游 parseNarrativeAgentSseEvent 校验；不触碰既有 AI 链路与状态机。 -->
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createPiNarrativeAgentBridge } from '../../services/agents/storyagent/piNarrativeAgentBridge.js'
import { parseNarrativeAgentSseEvent } from '../../../shared/narrativeAgentStreamContract.js'
import { useWorldStore } from '../../stores/worldStore.js'
import {
  applyMention,
  buildKernelBlocks,
  filterMentions,
  INTENT_PRESETS,
  mentionAtCursor,
  parseSlashCommand,
  SKILL_PRESETS,
  slashMatches,
  SLASH_COMMANDS,
} from '../../services/agents/storyagent/panelComposer.js'

const route = useRoute()
const worldStore = useWorldStore()

const endpoint = String(import.meta.env.VITE_PI_ADAPTER_URL || 'http://127.0.0.1:8451')
const contractStats = reactive({ total: 0, ok: 0 })
const bridge = createPiNarrativeAgentBridge({
  endpoint,
  // 逐帧过上游契约 parser：漂移立刻现形（校验面板的核心职责）。
  // task.* 生命周期扩展帧不计入统计——上游 parser 按设计安全忽略。
  parseEvent: (raw) => {
    if (/^event: task\./m.test(raw)) return null
    const ev = parseNarrativeAgentSseEvent(raw)
    contractStats.total += 1
    if (ev) contractStats.ok += 1
    return ev
  }
})

const open = ref(false)
const health = ref(null)
const contractCheck = ref('')
const intent = ref('推进当前场景，写一个短叙事片段')
const mode = ref(localStorage.getItem('sab_mode') || 'auto')
const maxTokens = ref(Number(localStorage.getItem('sab_maxTokens')) || 1200)
const sceneText = ref('')
const running = ref(false)
const statusLine = ref('待命')
const output = ref('')
const toolLog = ref([])
const result = ref(null)
const errorMsg = ref('')
const followUp = ref('')
const following = ref(false)
const canFollowUp = computed(() => Boolean(result.value?.ok && result.value.taskId))
let controller = null
let lastTaskId = ''

// ---- @ 提及 / / 命令（语义对标 v4 Chat.tsx：↑↓ 选择、Tab/Enter 确认、Esc 关闭） ----
const mention = ref(null)
const slash = ref(null)
const pinnedRefs = ref([])
const commandEcho = ref('')
const taRef = ref(null)

const worldEntries = computed(() => {
  const entries = worldStore.activeWorldbook?.entries || []
  return entries
    .slice(0, 30)
    .map((e) => ({
      id: String(e?.id || ''),
      title: String(e?.title || e?.name || ''),
      type: String(e?.type || ''),
      summary: String(e?.summary || e?.description || e?.text || ''),
      aliases: Array.isArray(e?.aliases) ? e.aliases.map(String) : []
    }))
    .filter((e) => e.title || e.summary)
})

const isAuthoring = computed(() => route.name === 'authoring')

function refreshPopovers(el) {
  const value = el.value
  const caret = el.selectionStart ?? value.length
  const m = mentionAtCursor(value, caret)
  const list = m ? filterMentions(worldEntries.value, m.token) : []
  mention.value = m && list.length ? { ...m, list, idx: 0 } : null
  if (value.startsWith('/') && !value.includes('\n')) {
    const candidates = slashMatches(value.slice(1))
    slash.value = candidates.length ? { token: value.slice(1), list: candidates, idx: 0 } : null
  } else {
    slash.value = null
  }
}

function pickMention(entry) {
  const m = mention.value
  const el = taRef.value
  if (!m || !el) return
  const r = applyMention(el.value, m.start, m.token.length, entry.title)
  el.value = r.text
  sceneText.value = r.text
  if (!pinnedRefs.value.some((p) => p.id === entry.id)) pinnedRefs.value.push(entry)
  mention.value = null
  requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(r.caret, r.caret) } catch { /* 老内核不设光标 */ } })
}

function unpinRef(i) {
  pinnedRefs.value.splice(i, 1)
}

function setMode(v) {
  if (['init', 'continue', 'auto', 'respond'].includes(v)) {
    mode.value = v
    localStorage.setItem('sab_mode', v)
    return `mode=${v}`
  }
  return `未知模式：${v}（可选 init/continue/auto/respond）`
}

function setTokens(n) {
  const t = Number(n)
  if (!Number.isFinite(t) || t < 200 || t > 8000) return `maxTokens 需在 200-8000：${n}`
  maxTokens.value = t
  localStorage.setItem('sab_maxTokens', String(t))
  return `maxTokens=${t}`
}

function applyPreset(nameOrId) {
  const key = String(nameOrId || '').toLowerCase()
  const p = INTENT_PRESETS.find((x) => x.id === key || x.label === nameOrId)
  if (!p) return `未找到预设：${nameOrId || '(空)'}。可用：${INTENT_PRESETS.map((x) => x.id).join(' / ')}`
  intent.value = p.intent
  return `已应用预设「${p.label}」`
}

function applySkill(nameOrId) {
  const key = String(nameOrId || '').toLowerCase()
  const s = SKILL_PRESETS.find((x) => x.id === key || x.label === nameOrId)
  if (!s) return `未找到技法：${nameOrId || '(空)'}。可用：${SKILL_PRESETS.map((x) => x.id).join(' / ')}`
  intent.value = `${s.instruction}\n${intent.value}`
  return `已叠加技法「${s.label}」到指令前`
}

function pickSkillById(id) {
  const s = SKILL_PRESETS.find((x) => x.id === id)
  if (s) intent.value = `${s.instruction}\n${intent.value}`
}

function pickPresetById(id) {
  const p = INTENT_PRESETS.find((x) => x.id === id)
  if (p) intent.value = p.intent
}

async function loadSessions() {
  try {
    const r = await fetch(`${endpoint}/v1/pinax/tasks/list`)
    const j = await r.json()
    sessions.value = (j?.tasks || []).slice(0, 12)
  } catch {
    sessions.value = []
  }
}

function resumeSession(t) {
  if (running.value || following.value) return
  result.value = { ok: true, taskId: t.taskId, model: '历史会话', usage: null, status: t.status, steps: '-', calls: '-', chars: '-' }
  lastTaskId = t.taskId
  commandEcho.value = `已选会话 ${t.taskId}（${t.status}）——可在下方追问续跑`
}

function runCommand(name, args) {
  switch (name) {
    case 'mode': return setMode(args)
    case 'tokens': return setTokens(args)
    case 'preset': return applyPreset(args)
    case 'skill': return applySkill(args)
    case 'refs': return pinnedRefs.value.length
      ? `已钉住 ${pinnedRefs.value.length} 条：${pinnedRefs.value.map((e, i) => `#${i + 1} @${e.title}`).join('，')}`
      : '尚无钉住的 @ 参考（在场景输入里 @ 世界书条目）'
    case 'unref': {
      if (args === 'all') { const n = pinnedRefs.value.length; pinnedRefs.value = []; return `已移除全部 ${n} 条参考` }
      const i = Number(args) - 1
      if (!Number.isInteger(i) || i < 0 || i >= pinnedRefs.value.length) return `序号无效：${args}（/refs 查看，/unref all 清空）`
      const [gone] = pinnedRefs.value.splice(i, 1)
      return `已移除 @${gone.title}`
    }
    case 'sessions': loadSessions(); return '会话列表已刷新'
    case 'cancel': cancelTask(); return '已请求取消'
    case 'new': {
      output.value = ''; toolLog.value = []; result.value = null; errorMsg.value = ''
      lastTaskId = ''
      return '已清空输出，可开新任务'
    }
    case 'help': return SLASH_COMMANDS.map((c) => `/${c.name} ${c.args} — ${c.desc}`).join('\n')
    default: return `未知命令：/${name}（/help 查看全部）`
  }
}

// ---- 会话列表（适配器 tasks/list） ----
const sessions = ref([])
const sessionsOpen = ref(false)

async function checkHealth() {
  health.value = await bridge.healthz()
}

async function checkContract() {
  contractCheck.value = '检查中…'
  try {
    const res = await fetch(`${endpoint}/v1/pinax/contract`)
    const raw = await res.text()
    const ev = parseNarrativeAgentSseEvent(raw)
    contractCheck.value = ev ? '✓ 契约帧解析通过' : '✗ 契约帧解析失败'
  } catch (e) {
    contractCheck.value = `✗ 不可达：${String(e.message || e).slice(0, 80)}`
  }
}

function buildKernel() {
  return {
    revision: `sab_${Date.now().toString(36)}`,
    serialization: { blocks: buildKernelBlocks({ sceneText: sceneText.value, firstEntry: worldEntries.value[0] || null, pinnedRefs: pinnedRefs.value }) },
  }
}

function buildIndex() {
  return {
    revision: `sabw_${worldEntries.value.length}`,
    byDomain: { world: worldEntries.value }
  }
}

async function runTask() {
  if (running.value) return
  running.value = true
  output.value = ''
  toolLog.value = []
  result.value = null
  errorMsg.value = ''
  contractStats.total = 0
  contractStats.ok = 0
  statusLine.value = '启动任务…'
  controller = new AbortController()
  lastTaskId = `sab_${Date.now().toString(36)}`
  try {
    const run = await bridge.run({
      kernel: buildKernel(),
      index: buildIndex(),
      mode: mode.value,
      intent: intent.value.trim() || null,
      formatInstructions: '输出纯叙事正文，不要标题。',
      maxTokens: Number(maxTokens.value) || 1200,
      requestId: `sabreq_${Date.now().toString(36)}`,
      taskId: lastTaskId,
      signal: controller.signal,
      callbacks: {
        onChunk: ({ content }) => {
          output.value += String(content || '')
        }
      },
      onStatus: (s) => {
        if (s.phase === 'tool') {
          toolLog.value.push(`${s.tool} · ${s.action || ''}`)
          statusLine.value = `工具回合：${s.tool} · ${s.action || ''}`
        } else if (s.phase === 'step') {
          statusLine.value = `步骤 ${Number(s.stepIndex || 0) + 1}`
        }
      }
    })
    result.value = {
      ok: run.ok,
      model: run.model,
      usage: run.usage,
      taskId: run.trace?.taskId || lastTaskId,
      status: run.trace?.status || (run.ok ? 'completed' : 'failed'),
      steps: run.trace?.steps || 0,
      calls: run.totalCalls || 0,
      chars: (run.finalContent || '').length
    }
    statusLine.value = run.ok ? '完成' : '失败'
    loadSessions()
  } catch (e) {
    errorMsg.value = String(e?.message || e)
    statusLine.value = '失败'
  } finally {
    running.value = false
    controller = null
  }
}

async function cancelTask() {
  try {
    controller?.abort(new Error('PINAX_ADAPTER_CANCELLED'))
  } catch { /* already settled */ }
  if (lastTaskId) await bridge.cancel(lastTaskId).catch(() => null)
  statusLine.value = '已请求取消'
}

// 追问：不重跑任务，用服务端落盘转录续跑（resume），回复追加在正文之后
async function sendFollowUp() {
  const question = followUp.value.trim()
  if (!question || following.value || !canFollowUp.value) return
  following.value = true
  errorMsg.value = ''
  statusLine.value = '追问续跑…'
  output.value += `\n\n【追问】${question}\n`
  const head = output.value.length
  try {
    const r = await bridge.resume({
      taskId: result.value.taskId,
      kernel: buildKernel(),
      index: buildIndex(),
      intent: question,
      requestId: `sabq_${Date.now().toString(36)}`,
      callbacks: {
        onChunk: ({ content }) => {
          if (output.value.length === head) output.value += '\n'
          output.value += String(content || '')
        }
      },
      onStatus: (s) => {
        if (s.phase === 'tool') statusLine.value = `追问工具：${s.tool} · ${s.action || ''}`
      }
    })
    if (!r.ok) errorMsg.value = '追问失败：适配器未产出回复'
    else statusLine.value = '追问完成'
    followUp.value = ''
    loadSessions()
  } catch (e) {
    errorMsg.value = String(e?.message || e)
    statusLine.value = '追问失败'
  } finally {
    following.value = false
  }
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(output.value)
  } catch { /* 剪贴板不可用即忽略 */ }
}

function onComposerKey(e) {
  const m = mention.value
  if (m) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const d = e.key === 'ArrowDown' ? 1 : -1
      mention.value = { ...m, idx: (m.idx + d + m.list.length) % m.list.length }
      return
    }
    if (e.key === 'Escape') { mention.value = null; return }
    if (e.key === 'Tab' || (e.key === 'Enter' && m.list.length)) { e.preventDefault(); pickMention(m.list[m.idx]); return }
  }
  const s = slash.value
  if (s) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const d = e.key === 'ArrowDown' ? 1 : -1
      slash.value = { ...s, idx: (s.idx + d + s.list.length) % s.list.length }
      return
    }
    if (e.key === 'Escape') { slash.value = null; return }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      const c = s.list[s.idx]
      commandEcho.value = runCommand(c.name, parseSlashCommand(sceneText.value)?.args || '')
      if (c.name !== 'help') sceneText.value = ''
      else sceneText.value = ''
      slash.value = null
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    const parsed = parseSlashCommand(sceneText.value)
    if (parsed) {
      e.preventDefault()
      commandEcho.value = runCommand(parsed.name, parsed.args)
      sceneText.value = ''
      return
    }
    e.preventDefault()
    runTask()
  }
}

onMounted(() => {
  checkHealth()
  loadSessions()
  worldStore.loadWorldbooksIndex().catch(() => null)
})
watch(open, (v) => {
  if (v) { checkHealth(); loadSessions() }
})
</script>

<template>
  <div v-if="isAuthoring">
    <button v-if="!open" class="sab-tab" type="button" title="StoryAgent-beta 测试面板" @click="open = true">
      StoryAgentβ
    </button>
    <section v-else class="sab-panel" role="complementary" aria-label="StoryAgent-beta 测试面板">
      <header class="sab-head">
        <strong>StoryAgent-beta</strong>
        <span class="sab-health" :class="health?.ok ? 'is-ok' : 'is-down'">
          {{ health?.ok ? '适配器在线' : '适配器不可达' }}
        </span>
        <button class="sab-close" type="button" aria-label="关闭 StoryAgent-beta" @click="open = false">×</button>
      </header>

      <div class="sab-body">
        <p class="sab-note">
          校验测试通道：请求直发 pinax-adapter，事件逐帧过上游契约 parser，不写入书稿与世界书。
        </p>

        <div class="sab-row">
          <button class="sab-btn" type="button" :disabled="running" @click="checkContract">契约自检</button>
          <span class="sab-dim">{{ contractCheck || `帧校验 ${contractStats.ok}/${contractStats.total}` }}</span>
        </div>

        <div class="sab-row">
          <label class="sab-field sab-grow">
            <span>意图预设</span>
            <select :disabled="running" @change="pickPresetById($event.target.value); $event.target.value = ''">
              <option value="">— 选择预设 —</option>
              <option v-for="p in INTENT_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </label>
          <label class="sab-field sab-grow">
            <span>写作技法</span>
            <select :disabled="running" @change="pickSkillById($event.target.value); $event.target.value = ''">
              <option value="">— 叠加技法 —</option>
              <option v-for="s in SKILL_PRESETS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
        </div>

        <label class="sab-field">
          <span>指令</span>
          <input v-model="intent" type="text" :disabled="running" />
        </label>
        <div class="sab-row">
          <label class="sab-field sab-grow">
            <span>模式</span>
            <select v-model="mode" :disabled="running">
              <option value="auto">auto</option>
              <option value="continue">continue</option>
              <option value="init">init</option>
              <option value="respond">respond</option>
            </select>
          </label>
          <label class="sab-field sab-narrow">
            <span>maxTokens</span>
            <input v-model="maxTokens" type="number" min="200" max="8000" :disabled="running" />
          </label>
        </div>

        <div class="sab-mention-wrap">
          <div v-if="mention" class="sab-pop" role="listbox">
            <div
              v-for="(p, i) in mention.list"
              :key="p.id"
              role="option"
              :aria-selected="i === mention.idx"
              class="sab-pop-item"
              :class="{ 'is-on': i === mention.idx }"
              @mousedown.prevent="pickMention(p)"
            >@{{ p.title }} <span class="sab-dim">{{ p.type }}</span></div>
          </div>
          <div v-if="slash" class="sab-pop" role="listbox">
            <div
              v-for="(c, i) in slash.list"
              :key="c.name"
              role="option"
              :aria-selected="i === slash.idx"
              class="sab-pop-item"
              :class="{ 'is-on': i === slash.idx }"
              @mousedown.prevent="commandEcho = runCommand(c.name, ''); sceneText = ''; slash = null"
            >/{{ c.name }} {{ c.args }} <span class="sab-dim">{{ c.desc }}</span></div>
          </div>
          <label class="sab-field">
            <span>场景/正文（@ 提及世界书条目、/ 命令；Enter 运行，Shift+Enter 换行）</span>
            <textarea
              ref="taRef"
              v-model="sceneText"
              rows="4"
              :disabled="running"
              placeholder="可粘贴正文或场景要点；@ 引资料，/ 用命令（/help）。"
              @keydown="onComposerKey"
              @input="refreshPopovers($event.target)"
              @click="refreshPopovers($event.target)"
            ></textarea>
          </label>
        </div>

        <div v-if="pinnedRefs.length" class="sab-chips">
          <span v-for="(p, i) in pinnedRefs" :key="p.id" class="sab-chip" :title="p.summary">
            @{{ p.title }}<button class="sab-chip-x" type="button" :aria-label="`移除 ${p.title}`" @click="unpinRef(i)">×</button>
          </span>
        </div>

        <div class="sab-row">
          <button class="sab-btn sab-primary" type="button" :disabled="running" @click="runTask">运行任务</button>
          <button class="sab-btn" type="button" :disabled="!running" @click="cancelTask">取消</button>
          <button class="sab-btn" type="button" :disabled="!output" @click="copyOutput">复制</button>
        </div>

        <p v-if="commandEcho" class="sab-echo">{{ commandEcho }}</p>
        <p class="sab-status">{{ statusLine }}</p>
        <pre v-if="output" class="sab-output">{{ output }}</pre>
        <ul v-if="toolLog.length" class="sab-tools">
          <li v-for="(t, i) in toolLog" :key="i">{{ t }}</li>
        </ul>
        <p v-if="errorMsg" class="sab-error">✗ {{ errorMsg }}</p>
        <p v-if="result" class="sab-result">
          {{ result.ok ? '✓' : '✗' }} {{ result.model }} · {{ result.status }} · steps {{ result.steps }} ·
          tools {{ result.calls }} · {{ result.chars }} 字 · tokens {{ result.usage?.totalTokens ?? 0 }} ·
          task {{ result.taskId }}
        </p>

        <div v-if="canFollowUp" class="sab-row sab-follow">
          <input
            v-model="followUp"
            type="text"
            class="sab-follow-input"
            :disabled="following"
            placeholder="追问（基于服务端转录续跑，不重跑任务）"
            @keydown.enter="sendFollowUp"
          />
          <button class="sab-btn" type="button" :disabled="following || !followUp.trim()" @click="sendFollowUp">
            {{ following ? '续跑中…' : '追问' }}
          </button>
        </div>

        <div class="sab-sessions">
          <button class="sab-btn sab-sessions-toggle" type="button" @click="sessionsOpen = !sessionsOpen">
            {{ sessionsOpen ? '▾' : '▸' }} 最近会话（{{ sessions.length }}）
          </button>
          <ul v-if="sessionsOpen" class="sab-session-list">
            <li v-for="t in sessions" :key="t.taskId" class="sab-session-row">
              <span class="sab-dot" :class="`is-${t.status}`" :title="t.status"></span>
              <span class="sab-session-id">{{ t.taskId }}</span>
              <button class="sab-btn sab-mini" type="button" :disabled="running || following" @click="resumeSession(t)">续跑</button>
            </li>
            <li v-if="!sessions.length" class="sab-dim">（暂无会话）</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sab-tab {
  position: fixed;
  right: 0;
  top: 40%;
  z-index: 700;
  writing-mode: vertical-rl;
  letter-spacing: 0.08em;
  padding: 12px 6px;
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: var(--archive-paper, #faf9f6);
  color: var(--text-secondary, #555);
  font-size: 12px;
  cursor: pointer;
}

.sab-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 700;
  width: min(380px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--archive-paper, #faf9f6);
  color: var(--text-primary, #1c1c1c);
  border-left: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  box-shadow: var(--shadow-workbench-float, 0 8px 24px rgba(0, 0, 0, 0.14));
}

.sab-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
}

.sab-close {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 16px;
  cursor: pointer;
}

.sab-health {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.sab-health.is-ok {
  color: var(--accent, #2563eb);
}

.sab-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.sab-note {
  margin: 0;
  color: var(--text-muted, #888);
  font-size: 12px;
  line-height: 1.5;
}

.sab-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sab-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary, #555);
  font-size: 12px;
}

.sab-grow {
  flex: 1;
  min-width: 0;
}

.sab-narrow {
  width: 96px;
}

.sab-field input,
.sab-field select,
.sab-field textarea {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  padding: 6px 8px;
  font: inherit;
}

.sab-btn {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #555);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.sab-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.sab-primary {
  background: var(--accent, #2563eb);
  border-color: var(--accent, #2563eb);
  color: var(--accent-text, #fff);
}

.sab-mini {
  padding: 2px 8px;
  font-size: 11px;
}

.sab-dim {
  color: var(--text-muted, #888);
  font-size: 12px;
}

.sab-mention-wrap {
  position: relative;
}

.sab-pop {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  z-index: 20;
  margin-bottom: 4px;
  background: var(--archive-paper, #faf9f6);
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  box-shadow: var(--shadow-workbench-float, 0 8px 24px rgba(0, 0, 0, 0.14));
  max-height: 200px;
  overflow-y: auto;
}

.sab-pop-item {
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}

.sab-pop-item.is-on {
  background: var(--surface-workbench-muted, rgba(0, 0, 0, 0.04));
}

.sab-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sab-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 999px;
  padding: 2px 4px 2px 8px;
  font-size: 11px;
  color: var(--text-secondary, #555);
}

.sab-chip-x {
  border: 0;
  background: transparent;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.sab-status {
  margin: 0;
  color: var(--text-muted, #888);
  font-size: 12px;
}

.sab-echo {
  margin: 0;
  white-space: pre-wrap;
  color: var(--text-secondary, #555);
  font-size: 12px;
  line-height: 1.5;
  border-left: 2px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  padding-left: 8px;
}

.sab-output {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  font-family: inherit;
  font-size: 13px;
  color: var(--archive-ink, #222);
  max-height: 40vh;
  overflow-y: auto;
  padding: 8px;
  border: 1px dashed var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
}

.sab-tools {
  margin: 0;
  padding-left: 18px;
  color: var(--text-muted, #888);
  font-size: 12px;
}

.sab-error {
  margin: 0;
  color: var(--sab-danger, #b42318);
  font-size: 12px;
}

.sab-result {
  margin: 0;
  color: var(--text-secondary, #555);
  font-size: 12px;
  line-height: 1.5;
}

.sab-follow {
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
}

.sab-follow-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
}

.sab-sessions {
  border-top: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  padding-top: 8px;
}

.sab-sessions-toggle {
  border: 0;
  background: transparent;
  padding: 2px 0;
}

.sab-session-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sab-session-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary, #555);
}

.sab-session-id {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted, #888);
  flex: none;
}

.sab-dot.is-completed {
  background: var(--accent, #2563eb);
}

.sab-dot.is-failed {
  background: var(--sab-danger, #b42318);
}

.sab-dot.is-cancelled {
  background: var(--text-muted, #888);
}
</style>
