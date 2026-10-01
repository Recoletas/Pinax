<!-- StoryAgent-beta：pi-agent 适配层的侧栏对话坞（校验/测试专用，不写入书稿/世界书）。
     形态对标 storymasterv4 storyharness Chat（dsh）：连续对话流为主区，composer 沉底，
     设置/会话/契约自检收进 ⚙ 抽屉。链路：storyagent/piNarrativeAgentBridge → pinax-adapter。
     所有 SSE 帧都经上游 parseNarrativeAgentSseEvent 校验；不触碰既有 AI 链路与状态机。 -->
<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createPiNarrativeAgentBridge } from '../../services/agents/storyagent/piNarrativeAgentBridge.js'
import { parseNarrativeAgentSseEvent } from '../../../shared/narrativeAgentStreamContract.js'
import { useWorldStore } from '../../stores/worldStore.js'
import { loadWritingBooks, findWritingBook } from '../../services/writing/writingBooksRepository.js'
import { getChapterMarkdown } from '../../services/writing/writingDocumentSchema.js'
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
  // task.* / reasoning.* 生命周期与思维链扩展帧不计入统计——上游 parser 按设计安全忽略。
  parseEvent: (raw) => {
    if (/^event: (task\.|reasoning\.)/m.test(raw)) return null
    const ev = parseNarrativeAgentSseEvent(raw)
    contractStats.total += 1
    if (ev) contractStats.ok += 1
    return ev
  }
})

const open = ref(false)
const health = ref(null)
const settingsOpen = ref(false)
// beta 默认关闭（审阅①）：App 层挂载门控为主，此处为面板自身二次门（挂载开关 localStorage sab_enabled）
const betaEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('sab_enabled') === '1'
const mode = ref(localStorage.getItem('sab_mode') || 'auto')
const maxTokens = ref(Number(localStorage.getItem('sab_maxTokens')) || 1200)

// ---- 对话流：turns = { role: 'user'|'assistant'|'system', text, status?, meta?, tools? } ----
const turns = ref([])
const running = ref(false)
const statusLine = ref('待命')
let activeTaskId = ''
const hasActiveTask = computed(() => Boolean(activeTaskId))
let controller = null

// ---- 作品归属（PR #4 审阅②）：归属锚 = 当前作品绑定的世界书 id（面板可达的最细作品锚；
//      书与世界书经 bookId→worldbookId 一一绑定，字段名待联调确认后统一） ----
const bookId = computed(() => String(worldStore.activeWorldbookId || ''))

// ---- 项目关联（对话不悬空）：从当前路由取书/章，经 canonical 仓储读正文尾部进 kernel ----
const routeBookId = computed(() => String(route.query.bookId || ''))
const routeChapterId = computed(() => String(route.query.chapterId || ''))
const projectContext = ref(null)

function loadProjectContext() {
  try {
    const books = loadWritingBooks()
    const book = findWritingBook(books, routeBookId.value)
    if (!book) { projectContext.value = null; return }
    const chapters = Array.isArray(book.chapters) ? book.chapters : []
    const chapter = chapters.find((c) => String(c?.id || '') === routeChapterId.value) || chapters[0] || null
    let manuscriptTail = ''
    let chars = 0
    if (chapter) {
      const md = String(getChapterMarkdown(chapter) || '')
      chars = md.replace(/\s/g, '').length
      manuscriptTail = md.slice(-2400)
    }
    projectContext.value = {
      bookTitle: String(book.title || ''),
      chapterTitle: String(chapter?.title || ''),
      manuscriptTail,
      chars,
    }
  } catch {
    projectContext.value = null
  }
}
watch([routeBookId, routeChapterId], loadProjectContext)

// ---- composer（@ 提及 / / 命令，语义对标 v4 Chat.tsx） ----
const composerText = ref('')
const taRef = ref(null)
const mention = ref(null)
const slash = ref(null)
const pinnedRefs = ref([])
const chatRef = ref(null)
let streamAnchor = -1
// 预设/技法弹层（原生 select 在内嵌浏览器弹层错位，改自绘 popover）
const presetMenu = ref(false)
const skillMenu = ref(false)

const worldEntries = computed(() => {
  const entries = worldStore.activeWorldbook?.entries || []
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

// @ 候选 = 世界书条目 + 当前项目章节文件（口径对标 pi-web 的「@ 引项目文件」；
// 引用管理归 @ 域自身——chips 自带移除，/ 域只管动作与配置）
const chapterEntries = computed(() => {
  try {
    const book = findWritingBook(loadWritingBooks(), routeBookId.value)
    if (!book) return []
    return (Array.isArray(book.chapters) ? book.chapters : []).slice(0, 20).map((c) => {
      const md = String(getChapterMarkdown(c) || '')
      return {
        id: `ch_${String(c?.id || '')}`,
        title: String(c?.title || '未命名章节'),
        type: '章节',
        summary: md ? md.slice(-600) : '（空章节）',
        aliases: [],
      }
    }).filter((e) => e.title)
  } catch {
    return []
  }
})
const mentionCandidates = computed(() => [...worldEntries.value, ...chapterEntries.value])

const isAuthoring = computed(() => route.name === 'authoring')
const lastTurn = computed(() => turns.value[turns.value.length - 1] || null)

function scrollBottom() {
  nextTick(() => {
    const el = chatRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch(() => turns.value.map((t) => t.text.length).join(','), scrollBottom)
watch(() => turns.value.length, scrollBottom)

function pushTurn(role, text) {
  const t = { role, text, status: '', meta: null, tools: [], thinking: '' }
  turns.value.push(t)
  scrollBottom()
  return t
}

function refreshPopovers(el) {
  const value = el.value
  const caret = el.selectionStart ?? value.length
  const m = mentionAtCursor(value, caret)
  const list = m ? filterMentions(mentionCandidates.value, m.token) : []
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
  composerText.value = r.text
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
const sessions = ref([])
async function loadSessions() {
  try {
    const r = await fetch(`${endpoint}/v1/pinax/tasks/list`)
    const j = await r.json()
    sessions.value = (j?.tasks || []).slice(0, 24)
  } catch {
    sessions.value = []
  }
}

// 归属过滤（审阅②）：会话列表只呈现当前作品的任务；旧书任务留在旧书，不串视图
const bookSessions = computed(() => sessions.value.filter((t) => String(t.bookId || '') === bookId.value))

function resumeSession(t) {
  if (running.value) return
  activeTaskId = t.taskId
  pushTurn('system', `已载入会话 ${t.taskId}（${t.status}，归属 ${t.bookId || '未归属'}）——继续发送消息即续跑该转录`)
}

async function checkHealth() {
  health.value = await bridge.healthz()
}

async function checkContract() {
  pushTurn('system', '契约自检中…')
  try {
    const res = await fetch(`${endpoint}/v1/pinax/contract`)
    const raw = await res.text()
    const ev = parseNarrativeAgentSseEvent(raw)
    pushTurn('system', ev ? `契约自检：✓ 帧解析通过（本轮流内帧校验 ${contractStats.ok}/${contractStats.total}）` : '契约自检：✗ 契约帧解析失败')
  } catch (e) {
    pushTurn('system', `契约自检：✗ 不可达 ${String(e.message || e).slice(0, 80)}`)
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
        project: projectContext.value,
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
  switch (name) {
    case 'mode': return setMode(args)
    case 'tokens': return setTokens(args)
    case 'preset': return applyPreset(args)
    case 'skill': return applySkill(args)
    case 'sessions': loadSessions(); settingsOpen.value = true; return '会话列表已刷新（见设置抽屉）'
    case 'cancel': cancelTask(); return '已请求取消'
    case 'new': {
      turns.value = []; activeTaskId = ''; pinnedRefs.value = []
      return '已开新对话（@ 参考一并清空）'
    }
    case 'help': return SLASH_COMMANDS.map((c) => `/${c.name} ${c.args} — ${c.desc}`).join('\n')
    default: return `未知命令：/${name}（/help 查看全部）`
  }
}

function bindStream(bookAtStart = bookId.value) {
  // 切书守卫（审阅② §三）：旧书任务继续跑，但流不得写进新作品的视图
  const stale = () => bookId.value !== bookAtStart
  return {
    onChunk: ({ content }) => {
      if (stale()) return
      if (streamAnchor < 0) streamAnchor = turns.value.length
      const t = turns.value[streamAnchor]
      if (t) t.text += String(content || '')
      scrollBottom()
    },
    onReasoning: ({ content }) => {
      if (stale()) return
      if (streamAnchor < 0) streamAnchor = turns.value.length
      const t = turns.value[streamAnchor]
      if (t) t.thinking += String(content || '')
      scrollBottom()
    },
    onStatus: (s) => {
      if (stale()) return
      if (s.phase === 'tool') {
        const t = turns.value[streamAnchor]
        if (t) t.tools.push(`${s.tool} · ${s.action || ''}`)
        statusLine.value = `工具回合：${s.tool} · ${s.action || ''}`
      } else if (s.phase === 'step') {
        statusLine.value = `步骤 ${Number(s.stepIndex || 0) + 1}`
      }
    },
  }
}

// 切书（审阅② §三）：呈现新书会话；旧书任务继续归属于旧书（服务端照常落账），
// 本地视图整体让位——activeTaskId 一并清掉，防止在新书视图里误续跑旧书转录
watch(bookId, (next, prev) => {
  if (prev === undefined || next === prev) return
  turns.value = []
  activeTaskId = ''
  streamAnchor = -1
  pinnedRefs.value = []
  if (!running.value) statusLine.value = bookId.value ? '已切换作品' : '未绑定作品'
})

async function sendComposer() {
  const text = composerText.value.trim()
  if (!text || running.value) return
  const parsed = parseSlashCommand(text)
  if (parsed) {
    pushTurn('system', runCommand(parsed.name, parsed.args))
    composerText.value = ''
    return
  }
  composerText.value = ''
  mention.value = null
  slash.value = null
  if (hasActiveTask.value) await runFollowUp(text)
  else await runNewTask(text)
}

async function runNewTask(text) {
  running.value = true
  statusLine.value = '启动任务…'
  contractStats.total = 0
  contractStats.ok = 0
  pushTurn('user', text)
  const at = pushTurn('assistant', '')
  at.status = '生成中…'
  streamAnchor = turns.value.length - 1
  controller = new AbortController()
  const taskId = `sab_${Date.now().toString(36)}`
  // 审阅④：taskId 发送前就已知——立即登记，运行中取消才有靶子（此前要等任务结束才赋值）
  activeTaskId = taskId
  try {
    const run = await bridge.run({
      kernel: buildKernel(text),
      index: buildIndex(),
      mode: mode.value,
      intent: text,
      formatInstructions: '若本轮产出叙事正文：纯正文，不要标题；对话类回应不需要正文格式。',
      maxTokens: Number(maxTokens.value) || 1200,
      requestId: `sabreq_${Date.now().toString(36)}`,
      taskId,
      bookId: bookId.value,
      signal: controller.signal,
      callbacks: bindStream(bookId.value),
    })
    at.meta = {
      ok: run.ok,
      model: run.model,
      taskId: run.trace?.taskId || taskId,
      status: run.trace?.status || (run.ok ? 'completed' : 'failed'),
      steps: run.trace?.steps || 0,
      calls: run.totalCalls || 0,
      tokens: run.usage?.totalTokens ?? 0,
    }
    activeTaskId = run.ok ? (run.trace?.taskId || taskId) : ''
    at.status = run.ok ? '' : (controller.signal.aborted ? '已取消' : '失败')
    if (!run.ok) pushTurn('system', controller.signal.aborted ? '任务已取消（后端执行已停止）' : '任务失败：适配器未产出正文（查看设置 → 适配器状态）')
    loadSessions()
  } catch (e) {
    at.status = controller.signal.aborted ? '已取消' : '失败'
    pushTurn('system', controller.signal.aborted
      ? '任务已取消（后端执行已停止，状态可在会话列表核对）'
      : `任务失败：${String(e?.message || e).slice(0, 160)}`)
  } finally {
    running.value = false
    streamAnchor = -1
    controller = null
    statusLine.value = '待命'
    scrollBottom()
  }
}

async function runFollowUp(text) {
  running.value = true
  statusLine.value = '追问续跑…'
  pushTurn('user', text)
  const at = pushTurn('assistant', '')
  at.status = '生成中…'
  streamAnchor = turns.value.length - 1
  controller = new AbortController()
  try {
    const r = await bridge.resume({
      taskId: activeTaskId,
      kernel: buildKernel(text),
      index: buildIndex(),
      intent: text,
      requestId: `sabq_${Date.now().toString(36)}`,
      bookId: bookId.value,
      signal: controller.signal,
      callbacks: bindStream(bookId.value),
    })
    at.status = r.ok ? '' : (controller.signal.aborted ? '已取消' : '失败')
    if (!r.ok) pushTurn('system', controller.signal.aborted ? '追问已取消（后端执行已停止）' : '追问失败：适配器未产出回复')
    loadSessions()
  } catch (e) {
    at.status = controller.signal.aborted ? '已取消' : '失败'
    pushTurn('system', controller.signal.aborted
      ? '追问已取消（后端执行已停止）'
      : `追问失败：${String(e?.message || e).slice(0, 160)}`)
  } finally {
    running.value = false
    streamAnchor = -1
    controller = null
    statusLine.value = '待命'
    scrollBottom()
  }
}

async function cancelTask() {
  // 审阅④：先打后端 /cancel（停止执行），再掐本流——顺序不能反（流断 ≠ 取消）
  if (activeTaskId) await bridge.cancel(activeTaskId).catch(() => null)
  try {
    controller?.abort(new Error('PINAX_ADAPTER_CANCELLED'))
  } catch { /* already settled */ }
  statusLine.value = '已请求取消'
}

async function copyTurn(t) {
  try {
    await navigator.clipboard.writeText(t.text)
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
  loadProjectContext()
  worldStore.loadWorldbooksIndex().catch(() => null)
})
watch(open, (v) => {
  if (v) { checkHealth(); loadSessions(); loadProjectContext(); scrollBottom() }
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
          @ 引资料（世界书/章节），/ 管动作与配置（/help），<br />
          首条回复后继续发送即基于转录追问。
        </p>
        <template v-for="(t, i) in turns" :key="i">
          <div v-if="t.role === 'user'" class="sab-msg is-user">
            <div class="sab-role">你</div>
            <div class="sab-text">{{ t.text }}</div>
          </div>
          <div v-else-if="t.role === 'assistant'" class="sab-msg is-assistant">
            <div class="sab-role">StoryAgent</div>
            <details v-if="t.thinking" class="sab-think" :open="running && i === turns.length - 1">
              <summary>思维链 · {{ t.thinking.length }} 字</summary>
              <div class="sab-think-body">{{ t.thinking }}</div>
            </details>
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
        <div v-if="projectContext?.bookTitle" class="sab-ctx" title="随每条消息注入 kernel，正文截尾 2400 字">
          已关联：《{{ projectContext.bookTitle }}》{{ projectContext.chapterTitle ? `· ${projectContext.chapterTitle}` : '' }} · {{ projectContext.chars }} 字
        </div>
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
          <div class="sab-mini-wrap">
            <button
              class="sab-btn sab-mini"
              type="button"
              :class="{ 'is-on': presetMenu }"
              :disabled="running"
              @click="presetMenu = !presetMenu; skillMenu = false"
            >预设 ▾</button>
            <button
              class="sab-btn sab-mini"
              type="button"
              :class="{ 'is-on': skillMenu }"
              :disabled="running"
              @click="skillMenu = !skillMenu; presetMenu = false"
            >技法 ▾</button>
            <div v-if="presetMenu || skillMenu" class="sab-pop sab-pop-up" role="listbox">
              <template v-if="presetMenu">
                <div
                  v-for="p in INTENT_PRESETS"
                  :key="p.id"
                  role="option"
                  class="sab-pop-item"
                  @mousedown.prevent="pickPresetById(p.id); presetMenu = false"
                >{{ p.label }} <span class="sab-dim">意图预设</span></div>
              </template>
              <template v-if="skillMenu">
                <div
                  v-for="s in SKILL_PRESETS"
                  :key="s.id"
                  role="option"
                  class="sab-pop-item"
                  @mousedown.prevent="pickSkillById(s.id); skillMenu = false"
                >{{ s.label }} <span class="sab-dim">写作技法</span></div>
              </template>
            </div>
          </div>
          <span class="sab-hint">{{ running ? statusLine : hasActiveTask ? '续跑中 · 发送即追问' : '新对话 · 发送即开任务' }}</span>
          <button v-if="running" class="sab-btn" type="button" @click="cancelTask">取消</button>
          <button v-else class="sab-btn sab-primary" type="button" :disabled="!composerText.trim()" @click="sendComposer">发送</button>
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

.sab-think {
  border-left: 2px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  padding-left: 10px;
  font-size: 11px;
  color: var(--text-muted, #888);
}

.sab-think summary {
  cursor: pointer;
  user-select: none;
}

.sab-think-body {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
  opacity: 0.85;
}

.sab-ctx {
  font-size: 11px;
  color: var(--text-muted, #888);
  border-left: 2px solid var(--accent, #2563eb);
  padding-left: 8px;
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

.sab-mini-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sab-pop-up {
  bottom: calc(100% + 6px);
  left: 0;
  right: auto;
  min-width: 200px;
}

.sab-btn.is-on {
  border-color: var(--accent, #2563eb);
  color: var(--accent, #2563eb);
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
