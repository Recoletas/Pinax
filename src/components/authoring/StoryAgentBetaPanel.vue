<!-- StoryAgent-beta：pi-agent 适配层的侧栏对话坞（校验/测试专用，不写入书稿/世界书）。
     形态对标 storymasterv4 storyharness Chat（dsh）：连续对话流为主区，composer 沉底，
     设置/会话/契约自检收进 ⚙ 抽屉。链路：storyagent/piNarrativeAgentBridge → pinax-adapter。
     所有 SSE 帧都经上游 parseNarrativeAgentSseEvent 校验；不触碰既有 AI 链路与状态机。 -->
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createPiNarrativeAgentBridge } from '../../services/agents/storyagent/piNarrativeAgentBridge.js'
import { parseNarrativeAgentSseEvent } from '../../../shared/narrativeAgentStreamContract.js'
import { readWorldbookSnapshot, useWorldStore } from '../../stores/worldStore.js'
import { acceptedAuthoringBookId } from '../../services/writing/acceptedAuthoringBook.js'
import { loadWritingBooks, findWritingBook, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { normalizeBookWorldbookBinding } from '../../services/agents/authoring/authoringProjectWorldbook.js'
import { createStoryAgentPanelSessions } from '../../services/agents/storyagent/panelSessionState.js'
import { randomUUID } from '../../../shared/randomId.js'
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
const bridge = createPiNarrativeAgentBridge({ endpoint })
const panelSessions = createStoryAgentPanelSessions()
let disposed = false

const open = ref(false)
const health = ref(null)
const settingsOpen = ref(false)
// beta 默认关闭（审阅①）：App 层挂载门控为主，此处为面板自身二次门（挂载开关 localStorage sab_enabled）
const betaEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('sab_enabled') === '1'
const mode = ref(localStorage.getItem('sab_mode') || 'auto')
const maxTokens = ref(Number(localStorage.getItem('sab_maxTokens')) || 1200)

// Accepted Authoring activation supplies the real book id. Worldbook bindings
// supply reference material only: two books may share one worldbook or none.
const bookId = ref('')
const boundWorldbook = ref(null)
const currentSession = computed(() => panelSessions.get(bookId.value))
const turns = computed(() => currentSession.value.state.turns)
const running = computed(() => currentSession.value.state.running)
const statusLine = computed(() => currentSession.value.state.statusLine)
const activeTaskId = computed(() => currentSession.value.state.activeTaskId)
const hasActiveTask = computed(() => Boolean(activeTaskId.value))
const contractStats = computed(() => currentSession.value.state.contractStats)

function refreshBookContext(nextBookId = acceptedAuthoringBookId.value) {
  if (disposed) return
  const book = findWritingBook(loadWritingBooks(), String(nextBookId || '').trim())
  bookId.value = book?.id || ''
  boundWorldbook.value = readWorldbookSnapshot(normalizeBookWorldbookBinding(book))
}

const unsubscribeActivation = watch(acceptedAuthoringBookId, refreshBookContext, { immediate: true, flush: 'sync' })
const unsubscribeBooks = subscribeWritingBooks(() => refreshBookContext())
const unsubscribeWorldbook = worldStore.$onAction(({ after }) => {
  after(() => refreshBookContext())
})

// ---- composer（@ 提及 / / 命令，语义对标 v4 Chat.tsx） ----
const composerText = computed({
  get: () => currentSession.value.state.draft,
  set: (value) => { currentSession.value.state.draft = value }
})
const taRef = ref(null)
const mention = ref(null)
const slash = ref(null)
const pinnedRefs = computed({
  get: () => currentSession.value.state.pinnedRefs,
  set: (value) => { currentSession.value.state.pinnedRefs = value }
})
const chatRef = ref(null)

const worldEntries = computed(() => {
  const entries = boundWorldbook.value?.entries || []
  return entries
    .slice(0, 30)
    .map((e) => ({
      id: String(e?.id || ''),
      title: String(e?.title || e?.name || ''),
      type: String(e?.type || ''),
      summary: String(e?.summary || e?.content || e?.description || e?.text || ''),
      aliases: Array.isArray(e?.aliases) ? e.aliases.map(String) : []
    }))
    .filter((e) => e.title || e.summary)
})

const isAuthoring = computed(() => route.name === 'authoring')

function scrollBottom() {
  nextTick(() => {
    const el = chatRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch(() => turns.value.map((t) => t.text.length).join(','), scrollBottom)
watch(() => turns.value.length, scrollBottom)

function pushTurn(role, text, entry = currentSession.value) {
  const t = panelSessions.append(entry, role, text)
  if (entry === currentSession.value) scrollBottom()
  return t
}

function refreshPopovers(el) {
  if (running.value) return
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
  if (running.value) return
  const m = mention.value
  const el = taRef.value
  if (!m || !el) return
  const r = applyMention(el.value, m.start, m.token.length, entry.title)
  el.value = r.text
  composerText.value = r.text
  if (!pinnedRefs.value.some((p) => p.id === entry.id)) pinnedRefs.value.push(entry)
  mention.value = null
  requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(r.caret, r.caret) } catch { /* 老内核不设光标 */ } })
}

function unpinRef(i) {
  if (running.value) return
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
  composerText.value = p.intent
  return `已填入预设「${p.label}」，可直接发送或修改`
}

function applySkill(nameOrId) {
  const key = String(nameOrId || '').toLowerCase()
  const s = SKILL_PRESETS.find((x) => x.id === key || x.label === nameOrId)
  if (!s) return `未找到技法：${nameOrId || '(空)'}。可用：${SKILL_PRESETS.map((x) => x.id).join(' / ')}`
  composerText.value = `${s.instruction}\n${composerText.value}`
  return `已叠加技法「${s.label}」`
}

function pickSkillById(id) {
  const s = SKILL_PRESETS.find((x) => x.id === id)
  if (s) composerText.value = `${s.instruction}\n${composerText.value}`
}

function pickPresetById(id) {
  const p = INTENT_PRESETS.find((x) => x.id === id)
  if (p) composerText.value = p.intent
}

// ---- 会话列表（适配器 tasks/list，设置抽屉内） ----
async function loadSessions(entry = currentSession.value) {
  if (!entry.bookId || disposed) return
  const sequence = ++entry.listSequence
  try {
    const r = await fetch(`${endpoint}/v1/pinax/tasks/list?bookId=${encodeURIComponent(entry.bookId)}`)
    if (!r.ok) throw new Error(`会话列表不可达（${r.status}）`)
    const j = await r.json()
    if (disposed || sequence !== entry.listSequence) return
    entry.state.sessions = (Array.isArray(j?.tasks) ? j.tasks : [])
      .filter((task) => String(task.bookId || '') === entry.bookId)
      .slice(0, 24)
  } catch {
    // A failed refresh keeps the last confirmed list for this book.
  }
}

const bookSessions = computed(() => currentSession.value.state.sessions)

function resumeSession(t) {
  if (running.value || !bookId.value || String(t.bookId || '') !== bookId.value) return
  currentSession.value.state.activeTaskId = String(t.taskId || '')
  pushTurn('system', `已载入会话 ${t.taskId}（${t.status}，归属 ${t.bookId || '未归属'}）——继续发送消息即续跑该转录`)
}

async function checkHealth() {
  health.value = await bridge.healthz()
}

async function checkContract() {
  const entry = currentSession.value
  pushTurn('system', '契约自检中…', entry)
  try {
    const res = await fetch(`${endpoint}/v1/pinax/contract`)
    const raw = await res.text()
    const ev = parseNarrativeAgentSseEvent(raw)
    if (disposed) return
    const stats = entry.state.contractStats
    pushTurn('system', ev ? `契约自检：✓ 帧解析通过（本轮流内帧校验 ${stats.ok}/${stats.total}）` : '契约自检：✗ 契约帧解析失败', entry)
  } catch (e) {
    if (!disposed) pushTurn('system', `契约自检：✗ 不可达 ${String(e.message || e).slice(0, 80)}`, entry)
  }
}

function buildKernel(userText) {
  return {
    revision: `sab_${Date.now().toString(36)}`,
    serialization: {
      blocks: buildKernelBlocks({
        sceneText: userText,
        firstEntry: worldEntries.value[0] || null,
        pinnedRefs: pinnedRefs.value,
      }),
    },
  }
}

function buildIndex() {
  return {
    revision: `sabw_${worldEntries.value.length}`,
    byDomain: { world: worldEntries.value }
  }
}

function runCommand(name, args) {
  if (running.value && name !== 'cancel') return '当前任务尚未结束，请先取消或等待完成'
  switch (name) {
    case 'mode': return setMode(args)
    case 'tokens': return setTokens(args)
    case 'preset': return applyPreset(args)
    case 'skill': return applySkill(args)
    case 'refs': return pinnedRefs.value.length
      ? `已钉住 ${pinnedRefs.value.length} 条：${pinnedRefs.value.map((e, i) => `#${i + 1} @${e.title}`).join('，')}`
      : '尚无钉住的 @ 参考（输入 @ 世界书条目）'
    case 'unref': {
      if (args === 'all') { const n = pinnedRefs.value.length; pinnedRefs.value = []; return `已移除全部 ${n} 条参考` }
      const i = Number(args) - 1
      if (!Number.isInteger(i) || i < 0 || i >= pinnedRefs.value.length) return `序号无效：${args}（/refs 查看，/unref all 清空）`
      const [gone] = pinnedRefs.value.splice(i, 1)
      return `已移除 @${gone.title}`
    }
    case 'sessions': loadSessions(); settingsOpen.value = true; return '会话列表已刷新（见设置抽屉）'
    case 'cancel': cancelTask(); return '已请求取消'
    case 'new': {
      if (!panelSessions.clear(currentSession.value)) return '当前任务尚未结束，请先取消或等待完成'
      return '已开新对话（@ 参考一并清空）'
    }
    case 'help': return SLASH_COMMANDS.map((c) => `/${c.name} ${c.args} — ${c.desc}`).join('\n')
    default: return `未知命令：/${name}（/help 查看全部）`
  }
}

function bindStream(owner) {
  return {
    onChunk: ({ content }) => {
      if (!panelSessions.owns(owner)) return
      owner.answer.text += String(content || '')
      if (owner.entry === currentSession.value) scrollBottom()
    },
    onStatus: (status) => {
      if (!panelSessions.owns(owner)) return
      if (status.phase === 'tool') {
        owner.answer.tools.push(`${status.tool} · ${status.action || ''}`)
        owner.entry.state.statusLine = `工具回合：${status.tool} · ${status.action || ''}`
      } else if (status.phase === 'step') {
        owner.entry.state.statusLine = `步骤 ${Number(status.stepIndex || 0) + 1}`
      }
    },
    onTask: (task, eventName) => {
      if (!panelSessions.owns(owner)) return
      if (task.taskId !== owner.taskId || (task.bookId && task.bookId !== owner.bookId)) {
        throw new Error('适配器返回的任务或作品归属不匹配')
      }
      if (eventName === 'task.started') panelSessions.started(owner)
      else owner.runtime.terminalStatus = task.status
    },
  }
}

watch(bookId, () => {
  mention.value = null
  slash.value = null
  if (bookId.value) void loadSessions(currentSession.value)
  scrollBottom()
})

async function sendComposer() {
  const text = composerText.value.trim()
  if (!text || running.value || !bookId.value) return
  const parsed = parseSlashCommand(text)
  if (parsed) {
    pushTurn('system', runCommand(parsed.name, parsed.args))
    composerText.value = ''
    return
  }
  composerText.value = ''
  mention.value = null
  slash.value = null
  await executeTask(text, hasActiveTask.value)
}

function ownerBridge(owner) {
  return createPiNarrativeAgentBridge({
    endpoint,
    parseEvent(raw) {
      const event = parseNarrativeAgentSseEvent(raw)
      if (panelSessions.owns(owner)) {
        owner.entry.state.contractStats.total += 1
        if (event) owner.entry.state.contractStats.ok += 1
      }
      return event
    },
  })
}

function recordTerminal(owner, status, result = null) {
  if (!panelSessions.owns(owner)) return
  owner.runtime.terminalStatus = status
  const state = owner.entry.state
  owner.answer.status = status === 'completed' ? '' : status === 'cancelled' ? '已取消' : '失败'
  state.statusLine = status === 'completed' ? '待命' : status === 'cancelled' ? '已取消' : '任务失败'
  if (status === 'failed') state.activeTaskId = ''
  if (result) {
    owner.answer.meta = {
      ok: result.ok,
      model: result.model,
      taskId: owner.taskId,
      status,
      steps: result.trace?.steps || 0,
      calls: result.totalCalls || 0,
      tokens: result.usage?.totalTokens ?? 0,
    }
  }
}

async function executeTask(text, resumed) {
  const entry = currentSession.value
  if (!entry.bookId || entry.owner) return
  const taskId = resumed ? entry.state.activeTaskId : `sab_${randomUUID()}`
  if (!taskId) return
  // Snapshot before yielding. Switching books cannot replace this execution's
  // request resources, answer turn, task id, controller or parser statistics.
  const kernel = JSON.parse(JSON.stringify(buildKernel(text)))
  const index = JSON.parse(JSON.stringify(buildIndex()))
  const options = { mode: mode.value, maxTokens: Number(maxTokens.value) || 1200 }
  const owner = panelSessions.begin(entry, { taskId, text, resumed })
  if (!owner) return
  scrollBottom()
  try {
    const executionBridge = ownerBridge(owner)
    const request = {
      kernel, index, intent: text,
      requestId: `sabreq_${randomUUID()}`,
      taskId: owner.taskId, bookId: owner.bookId,
      signal: owner.controller.signal, callbacks: bindStream(owner),
    }
    const result = resumed
      ? await executionBridge.resume(request)
      : await executionBridge.run({ ...request, ...options, formatInstructions: '输出纯叙事正文，不要标题。' })
    if (!panelSessions.owns(owner)) return
    if (result.trace?.taskId !== owner.taskId || (result.trace?.bookId && result.trace.bookId !== owner.bookId)) {
      throw new Error('适配器返回的结果归属不匹配')
    }
    const status = result.trace?.status
    if (!['completed', 'failed', 'cancelled'].includes(status)) throw new Error('适配器未确认任务终态')
    recordTerminal(owner, status, result)
    if (status === 'cancelled') pushTurn('system', '任务已取消（后端执行已停止）', entry)
    else if (!result.ok) pushTurn('system', `任务失败：${String(result.error?.message || '适配器未产出正文').slice(0, 160)}`, entry)
  } catch (error) {
    if (!panelSessions.owns(owner)) return
    const terminal = owner.runtime.terminalStatus
    if (['completed', 'failed', 'cancelled'].includes(terminal)) {
      recordTerminal(owner, terminal)
      pushTurn('system', terminal === 'cancelled'
        ? '任务已取消（后端执行已停止）'
        : terminal === 'completed' ? '任务已完成，连接已结束'
          : `任务失败：${String(error?.message || error).slice(0, 160)}`, entry)
    } else {
      owner.answer.status = '连接失败'
      entry.state.statusLine = '连接失败，后端状态尚未确认'
      // Keep a registered session available for explicit recovery. A stream
      // connection error alone never confirms that backend execution stopped.
      if (!owner.runtime.started) entry.state.activeTaskId = ''
      pushTurn('system', `连接失败，后端任务状态尚未确认：${String(error?.message || error).slice(0, 160)}`, entry)
    }
  } finally {
    owner.runtime.streamFinished = true
    if (panelSessions.owns(owner)) {
      // A delayed cancel request targets this task id; keep its slot until the
      // request settles so a follow-up cannot reuse that id under its feet.
      if (!owner.runtime.cancelPending) panelSessions.finish(owner)
      void loadSessions(entry)
      if (entry === currentSession.value) scrollBottom()
    }
  }
}

async function waitForRegistration(owner, timeoutMs = 10000) {
  if (owner.runtime.started) return true
  let timer
  try {
    return await Promise.race([
      owner.runtime.registration,
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function cancelTask() {
  const owner = currentSession.value.owner
  if (!owner || !panelSessions.owns(owner) || owner.runtime.cancelPending) return
  owner.runtime.cancelRequested = true
  owner.runtime.cancelPending = true
  owner.entry.state.statusLine = '正在确认取消…'
  const cancelController = new AbortController()
  let cancelTimer
  try {
    const registered = await waitForRegistration(owner)
    if (!panelSessions.owns(owner)) return
    if (!registered) throw new Error('任务尚未登记，取消尚未确认，请稍后重试')
    cancelTimer = setTimeout(() => cancelController.abort(), 15000)
    const result = await bridge.cancel(owner.taskId, { signal: cancelController.signal })
    if (!panelSessions.owns(owner)) return
    recordTerminal(owner, result.status)
    if (result.cancelled && result.status === 'cancelled') {
      // Only a server-confirmed terminal state permits detaching this stream.
      owner.controller.abort()
    } else {
      pushTurn('system', result.status === 'completed'
        ? '任务已经完成，无需取消'
        : '任务已经失败，后端执行已结束', owner.entry)
    }
  } catch (error) {
    if (!panelSessions.owns(owner)) return
    const terminal = owner.runtime.terminalStatus
    if (['completed', 'failed', 'cancelled'].includes(terminal)) {
      recordTerminal(owner, terminal)
      pushTurn('system', terminal === 'completed' ? '任务已经完成，无需取消'
        : terminal === 'cancelled' ? '任务已取消（后端执行已停止）'
          : '任务已经失败，后端执行已结束', owner.entry)
    } else {
      owner.entry.state.statusLine = '取消未确认，任务连接保留'
      pushTurn('system', `取消未确认：${String(error?.message || error).slice(0, 160)}`, owner.entry)
    }
  } finally {
    clearTimeout(cancelTimer)
    owner.runtime.cancelPending = false
    owner.runtime.cancelRequested = false
    if (owner.runtime.streamFinished && panelSessions.owns(owner)) {
      panelSessions.finish(owner)
      void loadSessions(owner.entry)
    }
  }
}

async function copyTurn(t) {
  try {
    await navigator.clipboard.writeText(t.text)
  } catch { /* 剪贴板不可用即忽略 */ }
}

function onComposerKey(e) {
  if (running.value) return
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
      pushTurn('system', runCommand(c.name, parseSlashCommand(composerText.value)?.args || ''))
      composerText.value = ''
      slash.value = null
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendComposer()
  }
}

onMounted(() => {
  checkHealth()
  loadSessions()
  worldStore.loadWorldbooksIndex().catch(() => null)
})
watch(open, (v) => {
  if (v) { checkHealth(); loadSessions(); scrollBottom() }
})
onUnmounted(() => {
  disposed = true
  unsubscribeActivation()
  unsubscribeBooks()
  unsubscribeWorldbook()
  panelSessions.dispose()
})
</script>

<template>
  <div v-if="isAuthoring && betaEnabled">
    <button v-if="!open" class="sab-tab" type="button" title="StoryAgent-beta 对话坞" @click="open = true">
      StoryAgentβ
    </button>
    <section v-else class="sab-panel" role="complementary" aria-label="StoryAgent-beta 对话坞">
      <header class="sab-head">
        <strong>StoryAgent-beta</strong>
        <span class="sab-health" :class="health?.ok ? 'is-ok' : 'is-down'">
          {{ health?.ok ? '在线' : '不可达' }}
        </span>
        <button class="sab-icon" type="button" aria-label="设置" @click="settingsOpen = !settingsOpen">⚙</button>
        <button class="sab-icon" type="button" aria-label="关闭 StoryAgent-beta" @click="open = false">×</button>
      </header>

      <div v-if="settingsOpen" class="sab-settings">
        <p class="sab-note">
          校验测试通道：请求直发 pinax-adapter，事件逐帧过上游契约 parser，不写入书稿与世界书。
        </p>
        <div class="sab-row">
          <button class="sab-btn" type="button" :disabled="running" @click="checkContract">契约自检</button>
          <span class="sab-dim">帧校验 {{ contractStats.ok }}/{{ contractStats.total }}</span>
        </div>
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
        <div class="sab-sessions">
          <div class="sab-dim">当前作品会话（{{ bookSessions.length }}）</div>
          <ul class="sab-session-list">
            <li v-for="t in bookSessions" :key="t.taskId" class="sab-session-row">
              <span class="sab-dot" :class="`is-${t.status}`" :title="t.status"></span>
              <span class="sab-session-id">{{ t.taskId }}</span>
              <button class="sab-btn sab-mini" type="button" :disabled="running" @click="resumeSession(t)">载入</button>
            </li>
            <li v-if="!bookSessions.length" class="sab-dim">（当前作品暂无会话）</li>
          </ul>
        </div>
      </div>

      <div ref="chatRef" class="sab-chat">
        <p v-if="!turns.length" class="sab-empty">
          直接说话即开任务：发一条指令或场景；<br />
          @ 引世界书资料，/ 用命令（/help），<br />
          首条回复后继续发送即基于转录追问。
        </p>
        <template v-for="(t, i) in turns" :key="t.id">
          <div v-if="t.role === 'user'" class="sab-msg is-user">
            <div class="sab-role">你</div>
            <div class="sab-text">{{ t.text }}</div>
          </div>
          <div v-else-if="t.role === 'assistant'" class="sab-msg is-assistant">
            <div class="sab-role">StoryAgent</div>
            <div v-if="t.text" class="sab-text">{{ t.text }}</div>
            <div v-if="t.status" class="sab-dim">{{ t.status }}{{ running && i === turns.length - 1 && statusLine !== '待命' ? ` · ${statusLine}` : '' }}</div>
            <ul v-if="t.tools.length" class="sab-tools">
              <li v-for="(tl, j) in t.tools" :key="j">{{ tl }}</li>
            </ul>
            <div v-if="t.meta" class="sab-meta">
              {{ t.meta.ok ? '✓' : '✗' }} {{ t.meta.model }} · {{ t.meta.status }} · steps {{ t.meta.steps }} ·
              tools {{ t.meta.calls }} · tokens {{ t.meta.tokens }} · task {{ t.meta.taskId }}
              <button class="sab-mini sab-copy" type="button" @click="copyTurn(t)">复制</button>
            </div>
          </div>
          <div v-else class="sab-msg is-system">{{ t.text }}</div>
        </template>
      </div>

      <div class="sab-composer">
        <div v-if="pinnedRefs.length" class="sab-chips">
          <span v-for="(p, i) in pinnedRefs" :key="p.id" class="sab-chip" :title="p.summary">
            @{{ p.title }}<button class="sab-chip-x" type="button" :aria-label="`移除 ${p.title}`" @click="unpinRef(i)">×</button>
          </span>
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
              @mousedown.prevent="pushTurn('system', runCommand(c.name, '')); composerText = ''; slash = null"
            >/{{ c.name }} {{ c.args }} <span class="sab-dim">{{ c.desc }}</span></div>
          </div>
          <textarea
            ref="taRef"
            v-model="composerText"
            rows="2"
            :disabled="running"
            placeholder="和 StoryAgent 说…（@ 引资料，/ 命令，Enter 发送）"
            @keydown="onComposerKey"
            @input="refreshPopovers($event.target)"
            @click="refreshPopovers($event.target)"
          ></textarea>
        </div>
        <div class="sab-composer-bar">
          <label class="sab-mini-select" title="意图预设">
            <select :disabled="running" @change="pickPresetById($event.target.value); $event.target.value = ''">
              <option value="">预设</option>
              <option v-for="p in INTENT_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </label>
          <label class="sab-mini-select" title="写作技法">
            <select :disabled="running" @change="pickSkillById($event.target.value); $event.target.value = ''">
              <option value="">技法</option>
              <option v-for="s in SKILL_PRESETS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <span class="sab-hint">{{ running ? statusLine : hasActiveTask ? '续跑中 · 发送即追问' : '新对话 · 发送即开任务' }}</span>
          <button v-if="running" class="sab-btn" type="button" @click="cancelTask">取消</button>
          <button v-else class="sab-btn sab-primary" type="button" :disabled="!bookId || !composerText.trim()" @click="sendComposer">发送</button>
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
  padding: 8px 12px;
  border-bottom: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
}

.sab-icon {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
}

.sab-icon + .sab-icon {
  margin-left: 0;
}

.sab-health {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.sab-health.is-ok {
  color: var(--accent, #2563eb);
}

.sab-settings {
  padding: 10px 12px;
  border-bottom: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.sab-note {
  margin: 0;
  color: var(--text-muted, #888);
  font-size: 11px;
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
.sab-field select {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  padding: 4px 6px;
  font: inherit;
}

.sab-btn {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #555);
  padding: 5px 12px;
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
  font-size: 11px;
}

/* ---- 对话流主区 ---- */
.sab-chat {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}

.sab-empty {
  margin: auto;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 12px;
  line-height: 1.8;
}

.sab-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sab-msg.is-user {
  align-items: flex-end;
}

.sab-msg.is-user .sab-text {
  background: var(--surface-workbench-muted, rgba(0, 0, 0, 0.04));
  border-radius: 10px 10px 2px 10px;
  padding: 8px 10px;
  max-width: 92%;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.sab-role {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.sab-msg.is-assistant .sab-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  border-left: 2px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  padding-left: 10px;
}

.sab-msg.is-system {
  color: var(--text-muted, #888);
  font-size: 11px;
  white-space: pre-wrap;
  border-left: 2px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  padding-left: 10px;
}

.sab-tools {
  margin: 0;
  padding-left: 28px;
  color: var(--text-muted, #888);
  font-size: 11px;
  list-style: none;
}

.sab-tools li::before {
  content: '· ';
}

.sab-meta {
  color: var(--text-muted, #888);
  font-size: 11px;
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sab-copy {
  border: 0;
  background: transparent;
  cursor: pointer;
}

/* ---- composer 沉底 ---- */
.sab-composer {
  border-top: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.sab-composer textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  resize: none;
}

.sab-composer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sab-mini-select select {
  border: 0;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
}

.sab-hint {
  flex: 1;
  min-width: 0;
  text-align: right;
  color: var(--text-muted, #888);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sab-sessions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sab-session-list {
  list-style: none;
  margin: 0;
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
