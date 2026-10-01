import { computed, onBeforeUnmount, ref, unref, watch } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService.js'
import {
  createAuthoringKnowledgeAnswer,
  reconcileAuthoringKnowledgeAnswer
} from '../services/agents/authoring/authoringKnowledgeAnswerContract.js'
import {
  AUTHORING_KNOWLEDGE_TASK_ID,
  createAuthoringKnowledgeQuerySession
} from '../services/agents/authoring/authoringKnowledgeQuerySession.js'
import { createBrowserStorageRepository } from '../services/storage/browserStorageRepository.js'
import { INTENT_PRESETS, SKILL_PRESETS, SLASH_COMMANDS, routeAgentIntent } from '../services/agents/storyagent/panelComposer.js'

function valueOf(value) {
  return typeof value === 'function' ? value() : unref(value)
}

function normalizedText(value) {
  return String(value ?? '').trim()
}

function messageId(prefix = 'knowledge') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function errorMessage(error) {
  if (error?.code === 'AGENT_REQUEST_ABORTED') return ''
  return String(error?.message || '助手暂时没有完成查询，请稍后重试。')
}

// 受限 I0 开关（round-3 K34，O0 冻结）：存储键缺省关闭；无设置页，测试经
// addInitScript 开启。逐次 ask 读取，无响应式开销。经仓库正式存储层读取，
// 不在 composable 内直接触碰浏览器存储 API。
const KNOWLEDGE_READ_MODEL_FLAG_KEY = 'pinax_knowledge_read_model_enabled'

function knowledgeReadModelFlagEnabled() {
  try {
    const storage = createBrowserStorageRepository()
    return storage.getText(KNOWLEDGE_READ_MODEL_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

// 作者点过某条证据（组件在既有"回到原文"点击处登记）→ 下一次提问以该
// 来源为受信点名范围走 K 精确查询。来源来自 F2 会话的证据信封（可信链），
// 不是模型自报；接缝仍会在最新授权目录里复核，越权 typed 失败。
const knowledgeSeamTrace = (typeof window !== 'undefined')
  ? (window.__pinaxKnowledgeSeamTrace = window.__pinaxKnowledgeSeamTrace
    || { seamPrepares: 0, lastSeamRefs: [], lastFocusRef: '' })
  : { seamPrepares: 0, lastSeamRefs: [], lastFocusRef: '' }
let focusedEvidenceSourceRef = ''

export function recordKnowledgeSeamFocus(sourceRef) {
  const ref = String(sourceRef ?? '').trim()
  focusedEvidenceSourceRef = ref
  knowledgeSeamTrace.lastFocusRef = ref
}

function lastAnswerEvidenceRefs(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.answer) {
      return (message.answer.evidence || []).map((item) => item.sourceRef)
    }
  }
  return []
}

/**
 * 焦点来源单次消费且归属本实例：只有当焦点 ref 出现在本实例最近一次回答
 * 的证据里（即作者在本助手内点过它）才生效；用后即清，不再无提示地持续
 * 限制后续无关提问。跨实例/过期焦点直接忽略并留痕。
 */
function knowledgeSeamRequestFor(lastAnswerRefs) {
  if (!knowledgeReadModelFlagEnabled() || !focusedEvidenceSourceRef) return null
  if (!lastAnswerRefs.includes(focusedEvidenceSourceRef)) {
    knowledgeSeamTrace.staleFocusIgnored = (knowledgeSeamTrace.staleFocusIgnored ?? 0) + 1
    focusedEvidenceSourceRef = ''
    return null
  }
  const request = { enabled: true, sourceRefs: [focusedEvidenceSourceRef] }
  focusedEvidenceSourceRef = ''
  return request
}

const KNOWLEDGE_SEAM_STOP_MESSAGES = Object.freeze({
  'knowledge-read-model-source-unauthorized': '聚焦的资料当前不可用，本次查询已停止；请重新选择来源后再试。',
  'knowledge-read-model-required-source-does-not-fit': '聚焦的资料无法容纳在本次查询范围内，本次查询已停止。',
  'knowledge-read-model-required-source-not-requested': '聚焦的资料与本次必需来源不一致，本次查询已停止。',
  'knowledge-read-model-no-mappable-source': '聚焦的来源不是可精确查询的设定/历史/记忆资料，本次查询已停止。',
  // 作者主动停止与旧路径取消保持一致：静默结束，不当作错误提示。
  'knowledge-read-model-aborted': ''
})

function knowledgeSeamStopMessage(reason) {
  return KNOWLEDGE_SEAM_STOP_MESSAGES[reason]
    ?? '聚焦的资料当前无法查询，本次查询已停止；请重新选择来源后再试。'
}

export function useAuthoringKnowledgeAssistant({
  projectId,
  target = null,
  resolveLiveSource = null,
  sceneProjection = null,
  revisionSignal = null,
  querySession = createAuthoringKnowledgeQuerySession(),
  executeQuery = requestAdvisorTask,
  agentEngine = null,
  agentSessionStore = null
} = {}) {
  const messages = ref([])
  const draft = ref('')
  const selectedIntent = ref('whole-book')
  const busy = ref(false)
  const error = ref('')
  const lastRequest = ref(null)
  let requestToken = 0
  let abortController = null
  let staleRefreshToken = 0
  let staleRefreshTimer = null

  const activeProjectId = computed(() => normalizedText(valueOf(projectId)))
  const canSubmit = computed(() => Boolean(activeProjectId.value && draft.value.trim() && !busy.value))

  function cancel() {
    // 融合（B 路线）：agent 任务先停后端再掐流（审阅④顺序），advisor 路径保持原语义
    if (activeAgentTaskId && agentEngine) {
      const taskId = activeAgentTaskId
      void Promise.resolve(agentEngine.cancel(taskId)).catch(() => null)
    }
    requestToken += 1
    abortController?.abort()
    abortController = null
    busy.value = false
  }

  function clear() {
    cancel()
    if (staleRefreshTimer) clearTimeout(staleRefreshTimer)
    staleRefreshTimer = null
    messages.value = []
    draft.value = ''
    error.value = ''
    lastRequest.value = null
    // 换项目/清空会话时焦点来源一并失效，防止跨书串写（接缝侧仍有
    // 授权目录复核兜底）。
    focusedEvidenceSourceRef = ''
  }

  function selectIntent(intent) {
    selectedIntent.value = String(intent || 'whole-book')
  }

  async function refreshStaleness() {
    if (!messages.value.some((message) => message.role === 'assistant' && message.answer && message.session)) return false
    const token = ++staleRefreshToken
    const project = activeProjectId.value
    try {
      const next = await Promise.all(messages.value.map(async (message) => {
        if (message.role !== 'assistant' || !message.answer || !message.session) return message
        const revisions = await querySession.collectCurrentRevisions(message.session, {
          sceneProjection: valueOf(sceneProjection),
          liveSource: typeof resolveLiveSource === 'function'
            ? resolveLiveSource({ phase: 'reconcile', session: message.session })
            : valueOf(resolveLiveSource)
        })
        if (token !== staleRefreshToken || project !== activeProjectId.value) return message
        return { ...message, answer: reconcileAuthoringKnowledgeAnswer(message.answer, revisions) }
      }))
      if (token === staleRefreshToken && project === activeProjectId.value) {
        messages.value = next
        return true
      }
    } catch {
      // 只读对账失败时保留原回答；不得把“无法读取 live revision”误报为 fresh。
    }
    return false
  }

  function scheduleStalenessRefresh() {
    if (!messages.value.some((message) => message.role === 'assistant' && message.answer && message.session)) return
    if (staleRefreshTimer) clearTimeout(staleRefreshTimer)
    staleRefreshTimer = setTimeout(() => {
      staleRefreshTimer = null
      void refreshStaleness()
    }, 320)
  }

  async function ask(payload = {}, { appendUser = true } = {}) {
    const question = normalizedText(typeof payload === 'string' ? payload : payload.question ?? draft.value)
    const intent = String(typeof payload === 'object' ? payload.intent || selectedIntent.value : selectedIntent.value)
    const project = activeProjectId.value
    if (!project || !question || busy.value) return false

    // 融合（B 路线）自动路由：特定知识意图/free → 既有 advisor 链；whole-book 按
    // 确定性规则（@ 钉住参考 / 线程已触碰 Agent / 创作词表）分流到 pi-agent 引擎。
    if (agentEngine) {
      const decision = routeAgentIntent({
        intent,
        text: question,
        hasPinnedRefs: pinnedRefs.value.length > 0,
        agentTouched: agentTouched.value
      })
      if (decision.engine === 'agent') {
        return runAgentTurn({ question, refs: pinnedRefs.value.map((item) => ({ ...item })) })
      }
    }

    cancel()
    const token = ++requestToken
    abortController = new AbortController()
    busy.value = true
    error.value = ''
    selectedIntent.value = intent
    lastRequest.value = { question, intent, projectId: project }
    if (appendUser) {
      messages.value.push({ id: messageId('question'), role: 'user', question, intent, createdAt: Date.now() })
      draft.value = ''
    }

    try {
      const lastAnswerRefs = lastAnswerEvidenceRefs(messages.value)
      const knowledgeReadModel = knowledgeSeamRequestFor(lastAnswerRefs)
      if (knowledgeReadModel && abortController) {
        // 取消信号真实传入接缝 prepare：停止/超时不只作用于 provider，
        // reader 返回后同样阻止发布。
        knowledgeReadModel.signal = abortController.signal
      }
      const prepared = await querySession.prepare({
        projectId: project,
        queryIntent: intent,
        question,
        target: valueOf(target),
        liveSource: typeof resolveLiveSource === 'function'
          ? resolveLiveSource({ phase: 'prepare', target: valueOf(target) })
          : valueOf(resolveLiveSource),
        sceneProjection: valueOf(sceneProjection),
        knowledgeReadModel
      })
      if (knowledgeReadModel) focusedEvidenceSourceRef = ''
      if (prepared?.ok === false && String(prepared.reason ?? '').startsWith('knowledge-read-model-')) {
        // 接缝 typed 拒绝是终态：不回退旧检索（否则其他资料会绕过停止
        // 决定进入模型调用），直接把可理解的停止原因交给作者，草稿保留。
        knowledgeSeamTrace.seamRejections = (knowledgeSeamTrace.seamRejections ?? 0) + 1
        knowledgeSeamTrace.lastSeamRefs = []
        throw Object.assign(new Error(knowledgeSeamStopMessage(prepared.reason)), { code: prepared.reason })
        // focus 已在上方消费（单次语义），typed 拒绝后不会残留限制后续提问。
      }
      if (!prepared?.ok) throw Object.assign(new Error('当前作品资料尚未准备好。'), { code: prepared?.reason })
      if (prepared.session?.knowledgeReadModel?.enabled === true) {
        knowledgeSeamTrace.seamPrepares += 1
        knowledgeSeamTrace.lastSeamRefs = prepared.session.evidenceEnvelope.evidence.map((item) => item.sourceRef)
      }
      if (token !== requestToken || project !== activeProjectId.value) return false
      const session = prepared.session
      let modelOutput
      if (intent !== 'free' && session.evidenceEnvelope.evidence.length === 0) {
        // whole-book 空证据 + agent 可用 → 交给 agent 直接创作：查证类的 fail-closed
        // 对创作请求毫无价值（advisor 无据可答），pi-agent 不依赖本体证据。
        if (intent === 'whole-book' && agentEngine) {
          return runAgentTurn({ question, refs: [], pushUserRow: false })
        }
        modelOutput = {
          answer: '当前资料中没有找到足够依据。',
          claims: [],
          missingInformation: session.evidenceEnvelope.missingInformation,
          calculations: []
        }
      } else {
        const result = await executeQuery({
          envelope: session.contextEnvelope,
          question,
          taskType: AUTHORING_KNOWLEDGE_TASK_ID,
          scope: 'writing',
          mode: 'review',
          options: { knowledgeIntent: intent },
          signal: abortController.signal
        })
        modelOutput = result?.result?.knowledgeAnswer
          || result?.rawAdvice
          || result?.advice
          || result?.result?.summary
      }
      if (token !== requestToken || project !== activeProjectId.value) return false
      let answer = createAuthoringKnowledgeAnswer({ evidenceEnvelope: session.evidenceEnvelope, modelOutput })
      if (!answer) throw Object.assign(new Error('助手返回了无法核查的回答。'), { code: 'knowledge-answer-invalid' })
      const revisions = await querySession.collectCurrentRevisions(session, {
        sceneProjection: valueOf(sceneProjection),
        liveSource: typeof resolveLiveSource === 'function'
          ? resolveLiveSource({ phase: 'reconcile', session })
          : valueOf(resolveLiveSource)
      })
      if (token !== requestToken || project !== activeProjectId.value) return false
      answer = reconcileAuthoringKnowledgeAnswer(answer, revisions)
      messages.value.push({
        id: messageId('answer'),
        role: 'assistant',
        answer,
        session,
        createdAt: Date.now()
      })
      draft.value = ''
      lastRequest.value = null
      return true
    } catch (caught) {
      if (token !== requestToken || project !== activeProjectId.value) return false
      const message = errorMessage(caught)
      if (message) {
        error.value = message
        draft.value = question
      }
      return false
    } finally {
      if (token === requestToken) {
        busy.value = false
        abortController = null
      }
    }
  }

  async function retry() {
    if (!lastRequest.value || busy.value) return false
    draft.value = lastRequest.value.question
    return ask(lastRequest.value, { appendUser: false })
  }

  // ---- StoryAgent 引擎区（融合 B 路线，增量）：多命名会话 + pi-agent 流式任务 ----
  const pinnedRefs = ref([])
  const agentSessions = ref([])
  const activeAgentSessionId = ref('')
  const agentTouched = ref(false)
  const agentMode = ref('auto')
  const agentMaxTokens = ref(1600)
  const agentTasks = ref([])
  const loadedSkills = ref([])
  let activeAgentTaskId = ''

  function activeAgentSession() {
    return agentSessions.value.find((s) => s.sessionId === activeAgentSessionId.value) || null
  }

  function persistActiveAgentSession() {
    if (!agentSessionStore || !activeProjectId.value) return false
    let session = activeAgentSession()
    if (!session) {
      session = {
        sessionId: `sas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title: '新会话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      }
      agentSessions.value = [session, ...agentSessions.value]
      activeAgentSessionId.value = session.sessionId
    }
    const firstQuestion = session.messages.find((m) => m.role === 'user')?.question
      ?? messages.value.find((m) => m.role === 'user' && m.kind === 'agent')?.question
    session.messages = messages.value
      .filter((m) => m.kind === 'agent')
      .map((m) => ({ ...m }))
    if (session.title === '新会话' && firstQuestion) session.title = String(firstQuestion).slice(0, 24)
    session.updatedAt = Date.now()
    return agentSessionStore.saveAgentSessions(activeProjectId.value, agentSessions.value.map((s) => ({ ...s })), activeAgentSessionId.value)
  }

  function restoreAgentThread(bookId) {
    if (!agentEngine || !agentSessionStore) return
    const { sessions, activeSessionId } = agentSessionStore.loadAgentSessions(bookId)
    agentSessions.value = sessions
    activeAgentSessionId.value = activeSessionId
    const active = sessions.find((s) => s.sessionId === activeSessionId)
    messages.value = active ? active.messages.map((m) => ({ ...m })) : []
  }

  function newAgentSession() {
    if (busy.value) return false
    const session = {
      sessionId: `sas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: '新会话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    }
    agentSessions.value = [session, ...agentSessions.value]
    activeAgentSessionId.value = session.sessionId
    messages.value = []
    agentTouched.value = false
    pinnedRefs.value = []
    persistActiveAgentSession()
    return true
  }

  function switchAgentSession(sessionId) {
    if (busy.value) return false
    const session = agentSessions.value.find((s) => s.sessionId === String(sessionId || ''))
    if (!session) return false
    activeAgentSessionId.value = session.sessionId
    messages.value = session.messages.map((m) => ({ ...m }))
    return true
  }

  function deleteAgentSession(sessionId) {
    if (busy.value) return false
    agentSessionStore?.deleteAgentSession(activeProjectId.value, sessionId)
    agentSessions.value = agentSessions.value.filter((s) => s.sessionId !== String(sessionId || ''))
    if (activeAgentSessionId.value === String(sessionId || '')) {
      const next = agentSessions.value[0] || null
      activeAgentSessionId.value = next?.sessionId || ''
      messages.value = next ? next.messages.map((m) => ({ ...m })) : []
    }
    return true
  }

  function renameAgentSession(sessionId, title) {
    const session = agentSessions.value.find((s) => s.sessionId === String(sessionId || ''))
    if (!session) return false
    session.title = String(title || '').trim().slice(0, 80) || session.title
    persistActiveAgentSession()
    return true
  }

  function pinRef(entry) {
    const item = entry && entry.title
      ? { id: String(entry.id || entry.title), title: String(entry.title), type: String(entry.type || '条目'), summary: String(entry.summary || '') }
      : null
    if (!item || pinnedRefs.value.some((p) => p.id === item.id)) return false
    pinnedRefs.value.push(item)
    agentTouched.value = true
    return true
  }

  function unpinRef(index) {
    const i = Number(index)
    if (!Number.isInteger(i) || i < 0 || i >= pinnedRefs.value.length) return false
    pinnedRefs.value.splice(i, 1)
    return true
  }

  async function refreshAgentTasks() {
    if (!agentEngine?.tasks) { agentTasks.value = []; return agentTasks.value }
    try {
      const result = await agentEngine.tasks()
      const all = (result?.tasks || []).map((t) => ({ ...t }))
      // 归属过滤（审阅②口径）：只呈现当前作品的任务；无归属的历史任务不显示
      agentTasks.value = all.filter((t) => String(t.bookId || '') === String(activeProjectId.value)).slice(0, 12)
    } catch {
      agentTasks.value = []
    }
    return agentTasks.value
  }

  function resumeAgentTask(taskId) {
    if (busy.value) return false
    const id = String(taskId || '')
    if (!id || !agentSessions.value.some((s) => s.sessionId === activeAgentSessionId.value)) newAgentSession()
    agentTouched.value = true
    activeAgentTaskId = id
    pushSystemRow(`已挂接任务 ${id}——下一条消息将以 resume 续跑该转录`)
    return true
  }

  function pushSystemRow(text) {
    messages.value.push({ id: messageId('sys'), role: 'system', kind: 'agent', text: String(text || ''), createdAt: Date.now() })
  }

  function runAgentCommand(name, args = '') {
    const command = String(name || '')
    const a = String(args || '').trim()
    switch (command) {
      case 'mode':
        if (['init', 'continue', 'auto', 'respond'].includes(a)) { agentMode.value = a; agentTouched.value = true; pushSystemRow(`mode=${a}（Agent 引擎）`); return true }
        pushSystemRow(`未知模式：${a}（可选 init/continue/auto/respond）`)
        return false
      case 'tokens': {
        const t = Number(a)
        if (Number.isFinite(t) && t >= 200 && t <= 8000) { agentMaxTokens.value = t; agentTouched.value = true; pushSystemRow(`maxTokens=${t}（Agent 引擎）`); return true }
        pushSystemRow(`maxTokens 需在 200-8000：${a}`)
        return false
      }
      case 'preset': {
        const key = a.toLowerCase()
        const preset = INTENT_PRESETS.find((p) => p.id === key || p.label === a)
        if (!preset) { pushSystemRow(`未找到预设：${a || '(空)'}`); return false }
        draft.value = preset.intent
        pushSystemRow(`已填入预设「${preset.label}」`)
        return true
      }
      case 'skill': {
        const key = a.toLowerCase()
        const skill = SKILL_PRESETS.find((p) => p.id === key || p.label === a)
        if (!skill) {
          pushSystemRow(`未找到技法：${a || '(空)'}。可用：${SKILL_PRESETS.map((p) => p.id).join(' / ')}`)
          return false
        }
        if (loadedSkills.value.some((s) => s.id === skill.id)) {
          pushSystemRow(`技法「${skill.label}」已装载`)
          return true
        }
        loadedSkills.value = [...loadedSkills.value, { id: skill.id, label: skill.label, instruction: skill.instruction }]
        agentTouched.value = true
        pushSystemRow(`已装载技法「${skill.label}」（随下一条消息上行）`)
        return true
      }
      case 'sessions':
        void refreshAgentTasks()
        return true
      case 'cancel':
        cancel()
        return true
      case 'new':
        newAgentSession()
        return true
      case 'help':
        pushSystemRow(SLASH_COMMANDS.map((c) => `/${c.name} ${c.args} — ${c.desc}`).join('\n'))
        return true
      default:
        pushSystemRow(`未知命令：/${command}（/help 查看全部）`)
        return false
    }
  }

  async function runAgentTurn({ question, refs, pushUserRow = true }) {
    const project = activeProjectId.value
    cancel()
    const token = ++requestToken
    abortController = new AbortController()
    busy.value = true
    error.value = ''
    agentTouched.value = true
    // fallback 调用（whole-book 空证据）时用户行已由 ask() 推入，不重复
    if (pushUserRow) {
      messages.value.push({ id: messageId('question'), role: 'user', kind: 'agent', question, intent: 'agent', createdAt: Date.now() })
    }
    const at = {
      id: messageId('answer'),
      role: 'assistant',
      kind: 'agent',
      text: '',
      thinking: '',
      tools: [],
      status: '生成中…',
      agentResult: null,
      createdAt: Date.now(),
    }
    messages.value.push(at)
    draft.value = ''
    persistActiveAgentSession()
    const localTaskId = `sab_${Date.now().toString(36)}`
    activeAgentTaskId = localTaskId
    const stale = () => token !== requestToken || project !== activeProjectId.value
    try {
      const result = await agentEngine.run({
        text: question,
        pinnedRefs: refs,
        maxTokens: agentMaxTokens.value,
        mode: agentMode.value,
        skills: loadedSkills.value.map((s) => ({ ...s })),
        taskId: localTaskId,
        signal: abortController.signal,
        bookId: project,
        callbacks: {
          onChunk: ({ content }) => {
            if (stale()) return
            at.text += String(content || '')
          },
          onReasoning: ({ content }) => {
            if (stale()) return
            at.thinking += String(content || '')
          },
          onTask: (data) => {
            if (data?.taskId) activeAgentTaskId = String(data.taskId)
          },
        },
        onStatus: (s) => {
          if (stale()) return
          if (s.phase === 'tool') {
            at.tools.push(`${s.tool} · ${s.action || ''}`)
            at.status = `工具回合：${s.tool} · ${s.action || ''}`
          } else if (s.phase === 'step') {
            at.status = `步骤 ${Number(s.stepIndex || 0) + 1}`
          }
        },
      })
      if (stale()) return false
      at.agentResult = {
        ok: Boolean(result.ok),
        model: result.model || 'pi-agent',
        taskId: result.trace?.taskId || activeAgentTaskId,
        status: result.trace?.status || (result.ok ? 'completed' : 'failed'),
        steps: result.trace?.steps || 0,
        calls: result.totalCalls || 0,
        tokens: result.usage?.totalTokens ?? 0,
        reasoningChars: result.trace?.reasoningChars || 0,
        // meta 行在 script 组装（UI 合同：模板不得出现内部术语字样）
        metaLine: `${result.model || 'pi-agent'} · ${result.trace?.status || (result.ok ? 'completed' : 'failed')} · 规划 ${result.trace?.steps || 0} · 工具 ${result.totalCalls || 0} · 词元 ${result.usage?.totalTokens ?? 0}`,
      }
      at.status = result.ok ? '' : (abortController.signal.aborted ? '已取消' : '失败')
      activeAgentTaskId = result.ok ? (result.trace?.taskId || localTaskId) : ''
      if (!result.ok) pushSystemRow(abortController.signal.aborted ? '任务已取消（后端执行已停止）' : '任务失败：适配器未产出正文')
      persistActiveAgentSession()
      return true
    } catch (caught) {
      if (stale()) return false
      at.status = abortController.signal.aborted ? '已取消' : '失败'
      const aborted = caught?.code === 'AGENT_REQUEST_ABORTED' || abortController.signal.aborted
      if (!aborted) {
        pushSystemRow(`任务失败：${String(caught?.message || caught).slice(0, 160)}`)
        error.value = String(caught?.message || 'Agent 任务失败，请稍后重试。')
      }
      persistActiveAgentSession()
      return false
    } finally {
      if (token === requestToken) {
        busy.value = false
        abortController = null
        activeAgentTaskId = ''
      }
    }
  }

  watch(activeProjectId, (next, previous) => {
    if (previous && next !== previous) clear()
    // 融合：书 id 就绪或切换即恢复该书会话（首挂载从空 → bookId 也要恢复）
    if (next !== previous && next) restoreAgentThread(next)
  })
  if (revisionSignal != null) {
    watch(() => valueOf(revisionSignal), scheduleStalenessRefresh, { deep: true })
  }
  onBeforeUnmount(() => {
    if (staleRefreshTimer) clearTimeout(staleRefreshTimer)
    staleRefreshTimer = null
    cancel()
  })

  return Object.freeze({
    messages,
    draft,
    selectedIntent,
    busy,
    error,
    lastRequest,
    canSubmit,
    ask,
    retry,
    cancel,
    clear,
    selectIntent,
    refreshStaleness,
    // ---- StoryAgent 融合区（agentEngine 缺省时均为惰性空实现，不影响既有调用方） ----
    pinnedRefs,
    agentSessions,
    activeAgentSessionId,
    agentTasks,
    agentMaxTokens,
    agentMode,
    loadedSkills,
    agentEnabled: Boolean(agentEngine),
    pinRef,
    unpinRef,
    newAgentSession,
    switchAgentSession,
    deleteAgentSession,
    renameAgentSession,
    resumeAgentTask,
    refreshAgentTasks,
    runAgentCommand
  })
}
