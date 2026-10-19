import { runAuthoringAgentTurn } from '../services/agents/storyagent/authoringAgentTurn.js'
import { normalizeAssistantSampling } from '../services/agents/authoring/assistantRegenerateOptions.js'
import { computed, onScopeDispose, reactive, ref, unref, watch } from 'vue'
import { useComposableWorkspace } from './useComposableWorkspace.js'
import { requestAdvisorTask } from '../services/advisorTaskService.js'
import {
  createAuthoringKnowledgeAnswer,
  reconcileAuthoringKnowledgeAnswer
} from '../services/agents/authoring/authoringKnowledgeAnswerContract.js'
import { createAuthoringKnowledgeQuerySession } from '../services/agents/authoring/lazyAuthoringKnowledgeQuerySession.js'
import { getItem } from './useStorage.js'
import { createBrowserStorageRepository } from '../services/storage/browserStorageRepository.js'
import { createAuthoringAssistantConversationStore } from '../services/agents/authoring/authoringAssistantConversationStore.js'

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
  if (error?.code === 'AGENT_REQUEST_ABORTED' || error?.code === 'knowledge-read-model-aborted') return ''
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
const focusedEvidenceSources = new Map()

export function recordKnowledgeSeamFocus(sourceRef, projectId = '') {
  const ref = String(sourceRef ?? '').trim()
  const project = normalizedText(projectId)
  if (!project) return
  focusedEvidenceSources.set(project, ref)
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
 * 焦点来源按作品隔离且单次消费：只有 ref 出现在本作品最近一次回答的
 * 证据里才生效。切书时清除焦点，避免共享世界书导致引用串入另一作品。
 */
function knowledgeSeamRequestFor(projectId, lastAnswerRefs) {
  const sourceRef = focusedEvidenceSources.get(projectId)
  if (!sourceRef) return null
  focusedEvidenceSources.delete(projectId)
  if (!knowledgeReadModelFlagEnabled()) return null
  if (!lastAnswerRefs.includes(sourceRef)) {
    knowledgeSeamTrace.staleFocusIgnored = (knowledgeSeamTrace.staleFocusIgnored ?? 0) + 1
    return null
  }
  return { enabled: true, sourceRefs: [sourceRef] }
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

function cloneQueryInput(value) {
  function freeze(input) {
    if (input && typeof input === 'object') {
      Object.values(input).forEach(freeze)
      Object.freeze(input)
    }
    return input
  }
  return value == null ? null : freeze(JSON.parse(JSON.stringify(value)))
}

function questionWithConversation(question, messages) {
  const turns = []
  let remaining = 2400
  const history = [...messages]
  const lastMessage = history.at(-1)
  // 重试或停止后再次发送同一问题时，末尾尚无回答的作者问题只出现一次。
  if (lastMessage?.role === 'user' && normalizedText(lastMessage.question) === question) history.pop()
  for (const message of history.reverse()) {
    const answer = message.role === 'assistant' ? message.answer : null
    if (answer?.stale) continue
    const content = message.role === 'user' ? message.question : answer?.answer || (message.kind === 'agent' ? message.text : '')
    if (!content) continue
    const excerpt = String(content).slice(0, Math.min(600, remaining))
    if (!excerpt) break
    turns.unshift(`${message.role === 'user' ? '作者' : '助手'}：${excerpt}`)
    remaining -= excerpt.length
    if (remaining <= 0 || turns.length >= 6) break
  }
  if (!turns.length) return question
  return `此前对话仅用于理解作者意图，旧回答不是作品事实。作品事实必须以本次授权证据为准，不能把以下对话当作引用来源。\n${turns.join('\n')}\n\n本次作者问题：${question}`
}

export function useAuthoringKnowledgeAssistant(options = {}) {
  const workspace = useComposableWorkspace()
  return workspace?.attachAssistant ? workspace.attachAssistant(options) : createAuthoringKnowledgeAssistant(options)
}

export function createAuthoringKnowledgeAssistant({
  projectId,
  agentEngine = null,
  onReviewProposal = null,
  target = null,
  resolveLiveSource = null,
  sceneProjection = null,
  revisionSignal = null,
  editorAttached = () => true,
  attachmentRevision = () => 0,
  querySession = createAuthoringKnowledgeQuerySession(),
  executeQuery = requestAdvisorTask,
  conversationStore = createAuthoringAssistantConversationStore()
} = {}) {
  const reviewedMessageId = ref('')
  const entries = new Map()
  let disposed = false
  const activeProjectId = computed(() => normalizedText(valueOf(projectId)))

  function getEntry(project) {
    if (entries.has(project)) return entries.get(project)
    const loaded = project ? conversationStore.load(project) : { ok: true, conversation: null, draft: '' }
    const saved = loaded.conversation || {}
    const interrupted = saved.status === 'running'
    const conversationReadError = loaded.conversationReadError || (!loaded.ok && !loaded.draftReadError ? loaded.error : '')
    const draftReadError = loaded.draftReadError || ''
    const entry = {
      projectId: project,
      state: reactive({
        messages: saved.messages || [],
        draft: loaded.draft || '',
        selectedIntent: saved.selectedIntent || 'free',
        busy: false,
        error: interrupted ? '上次查询因页面关闭中断；如需继续，请手动重试。' : saved.error || '',
        lastRequest: saved.lastRequest || null,
        status: interrupted ? 'interrupted' : saved.status || 'idle',
        hasUnread: Boolean(saved.hasUnread),
        persistenceError: loaded.ok ? '' : loaded.error,
        agentTaskId: saved.agentTaskId || '', agentRefs: saved.agentRefs || [], agentSkills: saved.agentSkills || [],
        agentPermission: { mode: 'review', scope: 'current', chapterIds: [], worldbook: false, outline: false },
        agentAdoptionBusy: false, runningPermission: null, activeSessionId: saved.activeSessionId || messageId('session'),
        agentSessions: saved.agentSessions || []
      }),
      runtime: {
        token: 0, controller: null, staleToken: 0,
        staleTimer: null, draftTimer: null,
        draftRevision: 0, requestDraftRevision: null,
        conversationError: conversationReadError, draftError: draftReadError,
        canSaveConversation: !conversationReadError, canSaveDraft: !draftReadError
      }
    }
    entries.set(project, entry)
    return entry
  }

  const activeEntry = computed(() => getEntry(activeProjectId.value))
  const messages = computed(() => activeEntry.value.state.messages)
  const draft = computed({
    get: () => activeEntry.value.state.draft,
    set: (value) => {
      const entry = activeEntry.value
      entry.state.draft = String(value || '')
      entry.runtime.draftRevision += 1
      entry.runtime.canSaveDraft = true
      scheduleDraftSave(entry)
    }
  })
  const selectedIntent = computed(() => activeEntry.value.state.selectedIntent)
  const busy = computed(() => activeEntry.value.state.busy)
  const error = computed(() => activeEntry.value.state.error)
  const lastRequest = computed(() => activeEntry.value.state.lastRequest)
  const persistenceError = computed(() => activeEntry.value.state.persistenceError)
  const hasUnread = computed(() => activeEntry.value.state.hasUnread)
  const status = computed(() => activeEntry.value.state.status)
  const canSubmit = computed(() => Boolean(editorAttached() && activeProjectId.value && draft.value.trim() && !busy.value))

  function updateDraft(value) {
    draft.value = value
  }

  function syncPersistenceError(entry) {
    entry.state.persistenceError = entry.runtime.conversationError || entry.runtime.draftError
  }

  function syncSession(entry) {
    const state = entry.state
    const previous = state.agentSessions.find(session => session.sessionId === state.activeSessionId)
    const record = { sessionId: state.activeSessionId, projectId: entry.projectId, title: (previous?.title !== '新对话' ? previous?.title : '') || state.messages.find(message => message.question)?.question?.slice(0, 40) || '新对话',
      archived: Boolean(previous?.archived), updatedAt: Date.now(), messages: state.messages, draft: state.draft, selectedIntent: state.selectedIntent, agentTaskId: state.agentTaskId, agentRefs: state.agentRefs, agentSkills: state.agentSkills }
    state.agentSessions = [record, ...state.agentSessions.filter(session => session.sessionId !== state.activeSessionId)].slice(0, 20)
  }
  function selectSession(sessionId) {
    const entry = activeEntry.value
    if (entry.state.busy || entry.state.agentAdoptionBusy || entry.state.activeSessionId === sessionId) return false
    persistConversation(entry)
    const saved = entry.state.agentSessions.find(session => session.sessionId === sessionId)
    if (!saved) return false
    entry.runtime.token += 1
    entry.runtime.staleToken += 1
    agentEngine?.revokePermission?.()
    entry.state.agentPermission = { mode: 'review', scope: 'current', chapterIds: [], worldbook: false, outline: false }
    reviewedMessageId.value = ''
    entry.state.activeSessionId = sessionId
    entry.state.messages = JSON.parse(JSON.stringify(saved.messages || []))
    entry.state.draft = saved.draft || ''
    entry.state.selectedIntent = saved.selectedIntent || 'free'
    entry.state.agentTaskId = saved.agentTaskId || ''
    entry.state.agentSkills = saved.agentSkills || []
    entry.state.agentRefs = saved.agentRefs || []; entry.state.error = ''; entry.state.lastRequest = null; entry.state.status = 'idle'
    entry.state.hasUnread = false
    persistConversation(entry); persistDraft(entry); scheduleStalenessRefresh()
    return true
  }
  function newConversation() {
    const entry = activeEntry.value
    if (entry.state.busy || entry.state.agentAdoptionBusy) return false
    persistConversation(entry)
    const sessionId = messageId('session')
    entry.state.agentSessions.unshift({ sessionId, projectId: entry.projectId, title: '新对话', messages: [], updatedAt: Date.now() })
    return selectSession(sessionId)
  }
  function branchConversation(id, { before = false } = {}) {
    const entry = activeEntry.value
    const state = entry.state
    if (state.busy || state.agentAdoptionBusy || disposed || !entry.runtime.canSaveConversation) return false
    const index = state.messages.findIndex(message => message.id === id)
    if (index < 0 || persistConversation(entry)?.ok !== true) return false
    const previous = JSON.parse(JSON.stringify(state))
    const history = state.messages.slice(0, index + (before ? 0 : 1)).map(message => {
      const copy = JSON.parse(JSON.stringify(message))
      copy.id = messageId(copy.role === 'user' ? 'question' : 'answer')
      // A branch is conversation history, not another editable copy of old proposals.
      for (const key of ['proposal', 'adoptionReceipt', 'toolResults', 'taskId', 'beatPlan', 'answerVersions', 'answerVersionIndex', 'answerVersionQuestions']) delete copy[key]
      return copy
    })
    const sessionId = messageId('session')
    const source = state.agentSessions.find(session => session.sessionId === state.activeSessionId)
    state.agentSessions.unshift({ sessionId, projectId: entry.projectId, title: `${source?.title || '对话'} · 分支`.slice(0, 80), messages: history, updatedAt: Date.now(), agentTaskId: '', agentRefs: [], agentSkills: state.agentSkills })
    if (!selectSession(sessionId) || persistConversation(entry)?.ok !== true) {
      Object.assign(state, previous)
      persistConversation(entry)
      return false
    }
    return true
  }
  async function editQuestion(id, text) {
    const question = activeEntry.value.state.messages.find(item => item.id === id && item.role === 'user')
    const edited = normalizedText(text)
    if (!question || !edited) return false
    return regenerateQuestion(question, null, edited)
  }
  function answerVersionInfo(id) {
    const history = activeEntry.value.state.messages
    const index = history.findIndex(message => message.id === id && message.role === 'assistant')
    const question = index < 0 ? null : history.slice(0, index).findLast(message => message.role === 'user')
    return { question, index: question?.answerVersionIndex || 0, count: question?.answerVersions?.length || 1 }
  }
  function selectAnswerVersion(id, index) {
    const entry = activeEntry.value, state = entry.state
    const info = answerVersionInfo(id), question = info.question
    if (!question || state.busy || state.agentAdoptionBusy || disposed || !Number.isInteger(index)
      || index < 0 || index >= info.count || index === info.index || persistConversation(entry)?.ok !== true) return false
    const questionIndex = state.messages.indexOf(question)
    const previous = JSON.parse(JSON.stringify(state.messages))
    question.answerVersions[info.index] = JSON.parse(JSON.stringify(state.messages.slice(questionIndex + 1)))
    const selected = question.answerVersions[index]
    if (!Array.isArray(selected)) return false
    question.answerVersionIndex = index
    question.question = question.answerVersionQuestions?.[index] ?? question.question
    state.messages = [...state.messages.slice(0, questionIndex + 1), ...JSON.parse(JSON.stringify(selected))]
    state.error = ''; state.lastRequest = null
    state.status = state.messages.at(-1)?.status || 'idle'
    reviewedMessageId.value = ''
    state.agentTaskId = ''
    agentEngine?.revokePermission?.()
    state.agentPermission = { mode: 'review', scope: 'current', chapterIds: [], worldbook: false, outline: false }
    if (persistConversation(entry)?.ok !== true) { state.messages = previous; return false }
    scheduleStalenessRefresh()
    return true
  }
  async function regenerateAnswer(id, params = null) {
    return regenerateQuestion(answerVersionInfo(id).question, params)
  }
  async function regenerateQuestion(question, params = null, editedText = null) {
    const entry = activeEntry.value, state = entry.state
    const sampling = params ? normalizeAssistantSampling(params) : null
    if (!question || params && (!sampling || !agentEngine) || state.busy || state.agentAdoptionBusy
      || disposed || !editorAttached() || !entry.runtime.canSaveConversation) return false
    if (entry.runtime.cancellation) {
      const stopped = await entry.runtime.cancellation
      entry.runtime.cancellation = null
      if (stopped === false || entry !== activeEntry.value || state.busy || disposed || !state.messages.includes(question)) return false
    }
    if (persistConversation(entry)?.ok !== true) return false
    const previous = JSON.parse(JSON.stringify(state.messages))
    const questionIndex = state.messages.indexOf(question)
    const versions = question.answerVersions || []
    const currentIndex = question.answerVersionIndex || 0
    versions[currentIndex] = JSON.parse(JSON.stringify(state.messages.slice(questionIndex + 1)))
    // Versions belong to this question, never to a new conversation/session.
    const questions = versions.map((_, index) => question.answerVersionQuestions?.[index] ?? question.question)
    question.answerVersions = [...versions.slice(-7), null]
    question.answerVersionQuestions = [...questions.slice(-7), editedText ?? question.question]
    question.question = editedText ?? question.question
    question.answerVersionIndex = question.answerVersions.length - 1
    state.messages = state.messages.slice(0, questionIndex + 1)
    agentEngine?.revokePermission?.()
    state.agentPermission = { mode: 'review', scope: 'current', chapterIds: [], worldbook: false, outline: false }
    state.agentTaskId = ''
    reviewedMessageId.value = ''
    if (persistConversation(entry)?.ok !== true) { state.messages = previous; return false }
    const pending = ask({ question: question.question, intent: sampling?.intent || question.intent || 'free', ...(sampling ? { sampling } : {}) }, { appendUser: false })
    const succeeded = await pending
    if (state.messages.length === questionIndex + 1) { state.messages = previous; persistConversation(entry) }
    return succeeded
  }
  function continueFromMessage(id) {
    const message = activeEntry.value.state.messages.find(item => item.id === id && item.role === 'assistant')
    if (!message || activeEntry.value.state.busy || activeEntry.value.state.agentAdoptionBusy) return false
    return branchConversation(id)
  }
  function renameConversation(sessionId, title) {
    const entry = activeEntry.value
    const saved = entry.state.agentSessions.find(session => session.sessionId === sessionId)
    if (!saved || !normalizedText(title) || entry.state.busy || entry.state.agentAdoptionBusy || !entry.runtime.canSaveConversation) return false
    const previous = saved.title
    saved.title = normalizedText(title).slice(0, 80)
    if (persistConversation(entry)?.ok !== true) { entry.state.agentSessions.find(session => session.sessionId === sessionId).title = previous; return false }
    return true
  }
  function archiveConversation(sessionId, archived = true) {
    const entry = activeEntry.value, state = entry.state
    if (state.busy || state.agentAdoptionBusy || !entry.runtime.canSaveConversation) return false
    if (persistConversation(entry)?.ok !== true) return false
    const saved = state.agentSessions.find(session => session.sessionId === sessionId)
    if (!saved) return false
    const previous = Boolean(saved.archived)
    saved.archived = Boolean(archived)
    if (persistConversation(entry)?.ok !== true) { state.agentSessions.find(session => session.sessionId === sessionId).archived = previous; return false }
    if (archived && state.activeSessionId === sessionId) {
      const next = state.agentSessions.find(session => !session.archived && session.sessionId !== sessionId)
      return next ? selectSession(next.sessionId) : newConversation()
    }
    return true
  }
  function rateMessage(id, reaction) {
    const entry = activeEntry.value
    const message = entry.state.messages.find(item => item.id === id && item.role === 'assistant')
    if (!message || !['up', 'down'].includes(reaction) || entry.state.busy || entry.state.agentAdoptionBusy || !entry.runtime.canSaveConversation) return false
    const previous = message.reaction || ''
    message.reaction = previous === reaction ? '' : reaction
    if (persistConversation(entry)?.ok !== true) { message.reaction = previous; return false }
    return true
  }
  function conversationDetails(id) {
    const entry = activeEntry.value
    if (persistConversation(entry)?.ok !== true) return null
    const session = entry.state.agentSessions.find(item => item.sessionId === id)
    return session ? JSON.parse(JSON.stringify({ ...session, storageKey: `authoring_assistant_conversation:${encodeURIComponent(entry.projectId)}` })) : null
  }
  function deleteConversation(sessionId) {
    const entry = activeEntry.value
    const state = entry.state
    if (state.busy || state.agentAdoptionBusy || !entry.runtime.canSaveConversation) return false
    if (persistConversation(entry)?.ok === false) return false
    if (!state.agentSessions.some(session => session.sessionId === sessionId)) return false
    const previous = JSON.parse(JSON.stringify(state))
    state.agentSessions = state.agentSessions.filter(session => session.sessionId !== sessionId)
    if (state.activeSessionId === sessionId) {
      agentEngine?.revokePermission?.(); state.agentPermission = { mode: 'review', scope: 'current' }
      reviewedMessageId.value = ''
      const next = state.agentSessions[0]
      state.activeSessionId = next?.sessionId || messageId('session')
      state.messages = JSON.parse(JSON.stringify(next?.messages || []))
      state.draft = next?.draft || ''; state.selectedIntent = next?.selectedIntent || 'free'
      state.agentTaskId = next?.agentTaskId || ''; state.agentRefs = next?.agentRefs || []; state.agentSkills = next?.agentSkills || []
      state.error = ''; state.lastRequest = null; state.status = 'idle'; state.hasUnread = false
      entry.runtime.token += 1; entry.runtime.staleToken += 1
    }
    const saved = persistConversation(entry)
    if (!saved?.ok) { Object.assign(state, previous); syncPersistenceError(entry); return false }
    persistDraft(entry)
    scheduleStalenessRefresh()
    return true
  }
  const sessions = computed(() => {
    const state = activeEntry.value.state
    const list = state.agentSessions.some(session => session.sessionId === state.activeSessionId)
      ? state.agentSessions : [{ sessionId: state.activeSessionId, title: '新对话', updatedAt: Date.now() }, ...state.agentSessions]
    return list.map(session => ({ sessionId: session.sessionId, title: session.title, updatedAt: session.updatedAt, archived: Boolean(session.archived), active: session.sessionId === state.activeSessionId }))
  })
  function persistConversation(entry) {
    if (!entry.projectId || !entry.runtime.canSaveConversation) return
    syncSession(entry)
    const result = conversationStore.saveConversation(entry.projectId, entry.state)
    entry.runtime.conversationError = result.ok ? '' : result.error
    syncPersistenceError(entry)
    return result
  }

  function persistDraft(entry) {
    if (entry.runtime.draftTimer) clearTimeout(entry.runtime.draftTimer)
    entry.runtime.draftTimer = null
    if (!entry.projectId || !entry.runtime.canSaveDraft) return
    const result = conversationStore.saveDraft(entry.projectId, entry.state.draft)
    entry.runtime.draftError = result.ok ? '' : result.error
    syncPersistenceError(entry)
  }

  function scheduleDraftSave(entry) {
    if (!entry.projectId) return
    if (entry.runtime.draftTimer) clearTimeout(entry.runtime.draftTimer)
    entry.runtime.draftTimer = setTimeout(() => persistDraft(entry), 450)
  }

  function cancelEntry(entry, { leaving = false, restoreDraft = true } = {}) {
    const wasBusy = entry.state.busy
    entry.runtime.token += 1
    const taskId = entry.state.agentTaskId
    if (wasBusy && taskId && agentEngine) {
      const executionEngine = entry.runtime.requestEngine || agentEngine
      entry.runtime.cancellation = executionEngine.cancel(taskId).catch(() => { entry.state.error = '远端停止尚未确认，请稍后重试。'; persistConversation(entry); return false })
    }
    for (const message of entry.state.messages) if (message.kind === 'agent' && message.status === 'running') message.status = leaving ? 'interrupted' : 'cancelled'
    entry.runtime.controller?.abort()
    entry.runtime.controller = null
    entry.state.busy = false
    entry.state.runningPermission = null
    if (wasBusy) {
      entry.state.status = leaving ? 'interrupted' : 'cancelled'
      if (leaving) entry.state.error = '上次查询因离开写作页停止；如需继续，请手动重试。'
      if (restoreDraft && !entry.state.draft && entry.state.lastRequest
        && entry.runtime.draftRevision === entry.runtime.requestDraftRevision) {
        entry.state.draft = entry.state.lastRequest.question
        persistDraft(entry)
      }
      persistConversation(entry)
    }
  }

  function cancel() {
    cancelEntry(activeEntry.value)
  }

  function clear() {
    const entry = activeEntry.value
    entry.runtime.canSaveConversation = true
    entry.runtime.canSaveDraft = true
    cancelEntry(entry, { restoreDraft: false })
    entry.runtime.staleToken += 1
    if (entry.runtime.staleTimer) clearTimeout(entry.runtime.staleTimer)
    entry.runtime.staleTimer = null
    entry.state.agentTaskId = ''
    entry.state.agentRefs = []
    entry.state.messages = []
    entry.state.draft = ''
    entry.state.error = ''
    entry.state.lastRequest = null
    entry.state.status = 'idle'
    entry.state.hasUnread = false
    focusedEvidenceSources.delete(entry.projectId)
    persistConversation(entry)
    persistDraft(entry)
  }

  function selectIntent(intent) {
    const entry = activeEntry.value
    entry.state.selectedIntent = String(intent || 'free')
    persistConversation(entry)
  }

  function markRead() {
    const entry = activeEntry.value
    if (!entry.state.hasUnread) return
    entry.state.hasUnread = false
    persistConversation(entry)
  }

  function currentReconcileInput(entry, session) {
    if (entry.projectId !== activeProjectId.value || disposed) {
      return { sceneProjection: null, liveSource: null }
    }
    return {
      sceneProjection: cloneQueryInput(valueOf(sceneProjection)),
      liveSource: cloneQueryInput(typeof resolveLiveSource === 'function'
        ? resolveLiveSource({ phase: 'reconcile', session })
        : valueOf(resolveLiveSource))
    }
  }

  async function refreshEntryStaleness(entry) {
    const sourceMessages = entry.state.messages
    const sourceLength = sourceMessages.length
    if (!sourceMessages.some((message) => message.role === 'assistant' && message.answer && message.session)) return false
    const token = ++entry.runtime.staleToken
    try {
      let changed = false
      const next = await Promise.all(sourceMessages.map(async (message) => {
        if (message.role !== 'assistant' || !message.answer || !message.session) return message
        const revisions = await querySession.collectCurrentRevisions(message.session, currentReconcileInput(entry, message.session))
        if (token !== entry.runtime.staleToken || disposed) return message
        const answer = reconcileAuthoringKnowledgeAnswer(message.answer, revisions)
        if (JSON.stringify(answer) === JSON.stringify(message.answer)) return message
        changed = true
        return { ...message, answer }
      }))
      if (token === entry.runtime.staleToken && !disposed
        && entry.state.messages === sourceMessages && entry.state.messages.length === sourceLength) {
        if (changed) {
          entry.state.messages = next
          persistConversation(entry)
        }
        return true
      }
    } catch {
      // 对账无法读取时保留原证据状态，不能误报资料仍然有效。
    }
    return false
  }

  function refreshStaleness() {
    return refreshEntryStaleness(activeEntry.value)
  }

  function scheduleStalenessRefresh() {
    const entry = activeEntry.value
    if (!entry.state.messages.some((message) => message.role === 'assistant' && message.answer && message.session)) return
    if (entry.runtime.staleTimer) clearTimeout(entry.runtime.staleTimer)
    entry.runtime.staleTimer = setTimeout(() => {
      entry.runtime.staleTimer = null
      void refreshEntryStaleness(entry)
    }, 320)
  }

  async function ask(payload = {}, { appendUser = true } = {}) {
    const entry = activeEntry.value
    const state = entry.state
    const runtime = entry.runtime
    const question = normalizedText(typeof payload === 'string' ? payload : payload.question ?? state.draft)
    const intent = String(typeof payload === 'object' ? payload.intent || state.selectedIntent : state.selectedIntent)
    const project = entry.projectId
    const sampling = payload?.sampling ? normalizeAssistantSampling(payload.sampling) : null
    if (payload?.sampling && (!sampling || !agentEngine)) { state.error = '重答参数无效或当前助手不支持参数重答。'; return false }
    if (!editorAttached() || !project || !question || state.busy || state.agentAdoptionBusy || disposed) return false
    if (runtime.cancellation) {
      const stopped = await runtime.cancellation
      runtime.cancellation = null
      if (stopped === false || entry !== activeEntry.value || disposed || state.busy) return false
    }
    if (payload?.projectId && normalizedText(payload.projectId) !== project) return false
    const requestPermission = cloneQueryInput(state.agentPermission)
    const requestSessionId = state.activeSessionId
    const providerQuestion = questionWithConversation(question, state.messages)
    const token = ++runtime.token
    let revealChange = null
    const requestAttachment = attachmentRevision()
    const requestEngine = agentEngine?.capture?.() || agentEngine
    runtime.requestEngine = requestEngine
    runtime.staleToken += 1
    const controller = new AbortController()
    runtime.controller = controller
    runtime.requestDraftRevision = runtime.draftRevision
    runtime.canSaveConversation = true
    runtime.canSaveDraft = true
    state.runningPermission = requestPermission
    state.busy = true
    state.status = 'running'
    state.error = ''
    state.selectedIntent = intent
    state.lastRequest = { question, intent, projectId: project, ...(sampling ? { sampling } : {}) }
    if (appendUser) {
      state.messages.push({ id: messageId('question'), role: 'user', question, intent, createdAt: Date.now() })
    }
    // 只清掉实际发送的草稿；等待期间作者可以继续输入下一问。
    if (state.draft.trim() === question) state.draft = ''
    persistConversation(entry)
    persistDraft(entry)

    try {
      if (agentEngine) {
        // runAuthoringAgentTurn captures the context before its first await.
        const requestId = messageId('agent')
        const pending = runAuthoringAgentTurn({ engine: requestEngine, entry, question, providerQuestion, token, signal: controller.signal,
          sampling, permission: requestPermission, sessionId: requestSessionId, persist: () => persistConversation(entry), isCurrent: t => t === runtime.token && !disposed, id: requestId })
        const succeeded = await pending
        if (!succeeded || token !== runtime.token || disposed) return false
        state.status = state.messages.at(-1)?.status || 'completed'; state.hasUnread = true; state.lastRequest = null
        const message = state.messages.find(item => item.id === requestId && item.proposal)
        if (message?.proposal && entry === activeEntry.value) {
          reviewedMessageId.value = message.id
          if (requestPermission.mode === 'auto' && editorAttached() && attachmentRevision() === requestAttachment) {
            const result = await applyAgentProposal({ automatic: true, permission: requestPermission })
            if (!result) state.error ||= '自动修改未应用，建议已保留供审阅。'
          } else if (requestPermission.mode === 'auto') {
            state.error = '修改建议已保留，请返回正文审阅后采用。'
          } else { revealChange = message.proposal.changes.find(change => change.kind === 'chapter') || message.proposal.changes[0] }
        }
        return true
      }
      // 所有准备输入在第一次 await 前冻结。后台返回只更新启动时的作品。
      const capturedTarget = cloneQueryInput(valueOf(target))
      const capturedSource = cloneQueryInput(typeof resolveLiveSource === 'function'
        ? resolveLiveSource({ phase: 'prepare', target: capturedTarget })
        : valueOf(resolveLiveSource))
      const capturedScene = cloneQueryInput(valueOf(sceneProjection))
      const knowledgeReadModel = knowledgeSeamRequestFor(project, lastAnswerEvidenceRefs(state.messages))
      if (knowledgeReadModel) knowledgeReadModel.signal = controller.signal
      const prepared = await querySession.prepare({
        projectId: project, queryIntent: intent, question,
        target: capturedTarget, liveSource: capturedSource,
        sceneProjection: capturedScene, knowledgeReadModel
      })
      if (prepared?.ok === false && String(prepared.reason ?? '').startsWith('knowledge-read-model-')) {
        knowledgeSeamTrace.seamRejections = (knowledgeSeamTrace.seamRejections ?? 0) + 1
        knowledgeSeamTrace.lastSeamRefs = []
        throw Object.assign(new Error(knowledgeSeamStopMessage(prepared.reason)), { code: prepared.reason })
      }
      if (!prepared?.ok) throw Object.assign(new Error('当前作品资料尚未准备好。'), { code: prepared?.reason })
      if (prepared.session?.knowledgeReadModel?.enabled === true) {
        knowledgeSeamTrace.seamPrepares += 1
        knowledgeSeamTrace.lastSeamRefs = prepared.session.evidenceEnvelope.evidence.map((item) => item.sourceRef)
      }
      if (token !== runtime.token || disposed) return false
      const session = prepared.session
      let modelOutput
      if (intent !== 'free' && session.evidenceEnvelope.evidence.length === 0) {
        modelOutput = {
          answer: '当前资料中没有找到足够依据。', claims: [],
          missingInformation: session.evidenceEnvelope.missingInformation, calculations: []
        }
      } else {
        const result = await executeQuery({
          envelope: session.contextEnvelope, question: providerQuestion,
          taskType: session.taskId, scope: 'writing', mode: 'review',
          options: { knowledgeIntent: intent }, signal: controller.signal
        })
        modelOutput = result?.result?.knowledgeAnswer
          || result?.rawAdvice || result?.advice || result?.result?.summary
      }
      if (token !== runtime.token || disposed) return false
      let answer = createAuthoringKnowledgeAnswer({ evidenceEnvelope: session.evidenceEnvelope, modelOutput })
      if (!answer) throw Object.assign(new Error('助手返回了无法核查的回答。'), { code: 'knowledge-answer-invalid' })
      const revisions = await querySession.collectCurrentRevisions(session, currentReconcileInput(entry, session))
      if (token !== runtime.token || disposed) return false
      answer = reconcileAuthoringKnowledgeAnswer(answer, revisions)
      state.messages.push({ id: messageId('answer'), role: 'assistant', answer, session, createdAt: Date.now() })
      state.status = 'completed'
      state.hasUnread = true
      state.lastRequest = null
      return true
    } catch (caught) {
      if (token !== runtime.token || disposed) return false
      const message = errorMessage(caught)
      state.status = message ? 'failed' : 'cancelled'
      if (message) {
        state.error = message
        state.hasUnread = true
        if (!state.draft && runtime.draftRevision === runtime.requestDraftRevision) {
          state.draft = question
          persistDraft(entry)
        }
      }
      return false
    } finally {
      if (token === runtime.token) {
        state.busy = false
        state.runningPermission = null
        runtime.controller = null
        persistConversation(entry)
        if (revealChange && entry === activeEntry.value && editorAttached() && attachmentRevision() === requestAttachment) onReviewProposal?.(revealChange)
      }
      if (requestEngine && (!editorAttached() || attachmentRevision() !== requestAttachment)) requestEngine.revokePermission?.()
      if (runtime.requestEngine === requestEngine) runtime.requestEngine = null
    }
  }

  async function retry() {
    const request = activeEntry.value.state.lastRequest
    if (!request || busy.value) return false
    return ask(request, { appendUser: false })
  }

  watch(activeProjectId, (next, previous) => {
    if (previous && next !== previous) {
      const entry = entries.get(previous)
      if (entry) { agentEngine?.revokePermission?.(); entry.state.agentPermission = { mode: 'review', scope: 'current' }; cancelEntry(entry, { leaving: true }); persistDraft(entry) }
      reviewedMessageId.value = ''
      focusedEvidenceSources.delete(previous)
    }
    getEntry(next)
    scheduleStalenessRefresh()
  }, { immediate: true })
  if (revisionSignal != null) {
    watch(() => valueOf(revisionSignal), scheduleStalenessRefresh, { deep: true })
  }
  function flushDrafts() {
    for (const entry of entries.values()) persistDraft(entry)
  }
  // 浏览器刷新不会经过 Vue 卸载；在离开文档时冲刷尚未 debounce 落盘的输入。
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flushDrafts)
  onScopeDispose(() => {
    disposed = true
    agentEngine?.revokePermission?.()
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flushDrafts)
    for (const entry of entries.values()) {
      if (entry.runtime.staleTimer) clearTimeout(entry.runtime.staleTimer)
      entry.runtime.staleTimer = null
      entry.runtime.staleToken += 1
      cancelEntry(entry, { leaving: true })
      persistDraft(entry)
      focusedEvidenceSources.delete(entry.projectId)
    }
  })

  const allProposalMessages = computed(() => {
    const state = activeEntry.value.state
    const byId = new Map(state.agentSessions.flatMap(session => session.messages || []).filter(message => message.proposal).map(message => [message.id, message]))
    for (const message of state.messages) if (message.proposal) byId.set(message.id, message)
    return [...byId.values()]
  })
  const pendingProposals = computed(() => allProposalMessages.value.filter(message => ['pending', 'partial'].includes(getItem(`assistant_edit_receipt:${message.proposal.id}`, null)?.status || message.proposal.status)).map(message => ({ ...message.proposal, messageId: message.id })))
  const proposalReview = computed(() => activeEntry.value.state.messages.find(message => message.id === reviewedMessageId.value)?.proposal || null)
  const canUndoProposal = computed(() => agentEngine?.canUndoProposal?.(proposalReview.value) || false)
  function reviewProposal(id) {
    const state = activeEntry.value.state
    if (state.busy || state.agentAdoptionBusy) return false
    let message = state.messages.find(item => item.id === id)
    if (!message) {
      const session = state.agentSessions.find(session => session.messages?.some(item => item.id === id))
      if (!session || !selectSession(session.sessionId)) return false
      message = state.messages.find(item => item.id === id)
    }
    if (!message?.proposal) return false
    const stored = getItem(`assistant_edit_receipt:${message.proposal.id}`, null)
    if (stored?.bookId === message.proposal.bookId) message.proposal = stored
    reviewedMessageId.value = id
    onReviewProposal?.(message.proposal.changes[0])
    return true
  }
  async function undoAgentProposal(id) {
    const message = activeEntry.value.state.messages.find(item => item.id === id)
    if (!message?.proposal?.receipt?.changes?.length) return false
    reviewedMessageId.value = id
    return applyAgentProposal({ undo: true })
  }
  async function applyAgentProposal({ undo = false, discard = false, changeIds = null, automatic = false, permission = null } = {}) {
    const entry = activeEntry.value
    const proposal = proposalReview.value
    if (!editorAttached() || !proposal || (entry.state.busy && !automatic) || entry.state.agentAdoptionBusy) return false
    const adoptionPermission = cloneQueryInput(automatic ? permission || entry.state.runningPermission : entry.state.agentPermission)
    const sessionId = entry.state.activeSessionId
    entry.state.agentAdoptionBusy = true
    try {
      if (!undo && !discard) {
        if (agentEngine.ensureEditorAuthorization) await agentEngine.ensureEditorAuthorization(adoptionPermission, sessionId)
        else if (agentEngine.authorize) {
          const prepared = typeof agentEngine.permissionContext === 'function' ? agentEngine.permissionContext() : agentEngine.prepare({ text: '', bookId: entry.projectId })
          await agentEngine.authorize(adoptionPermission, sessionId, prepared)
        }
      }
      const result = await agentEngine.applyProposal(proposal, { undo, discard, changeIds })
      if (!result.ok) entry.state.error = result.error
      else entry.state.error = ''
      return result.ok
    } catch (error) { entry.state.error = error.message || '修改未保存，建议已保留。'; return false }
    finally { entry.state.agentAdoptionBusy = false; persistConversation(entry) }
  }
  function actOnProposal({ action, changeIds } = {}) {
    if (!['adopt', 'discard', 'undo'].includes(action)) return false
    return applyAgentProposal({ undo: action === 'undo', discard: action === 'discard', changeIds })
  }
  const agentState = computed(() => {
    const state = activeEntry.value.state
    const preferenceKey = permission => JSON.stringify([permission.mode, permission.scope, [...(permission.chapterIds || [])].sort(), Boolean(permission.worldbook), Boolean(permission.outline)])
    return { permission: state.agentPermission, currentChapterId: agentEngine?.destination?.()?.chapterId || '', permissionPending: Boolean(state.busy && state.runningPermission && preferenceKey(state.agentPermission) !== preferenceKey(state.runningPermission)), enabled: Boolean(agentEngine), taskId: state.agentTaskId, refs: state.agentRefs, skills: state.agentSkills, adoptionBusy: state.agentAdoptionBusy }
  })
  async function setAgentPermission(patch) {
    const entry = activeEntry.value
    if (!editorAttached() || entry.state.agentAdoptionBusy) return false
    entry.state.agentPermission = cloneQueryInput({ ...entry.state.agentPermission, ...patch })
    // Settings are preferences for the next send. Revoking/replacing a policy
    // here aborts the current server stream; grant only at send or adoption.
    return true
  }
  function agentContext() { try { return agentEngine?.context() || {} } catch { return {} } }
  function agentChapterOptions() {
    try { return typeof agentEngine?.chapterOptions === 'function' ? agentEngine.chapterOptions() : (agentContext().chapterEntries || []).map(({ id, title }) => ({ id, title })) }
    catch { return [] }
  }
  function setAgentReferences(refs) { activeEntry.value.state.agentRefs = refs.slice(0, 8); persistConversation(activeEntry.value) }
  function setAgentSkills(skills) { activeEntry.value.state.agentSkills = skills.slice(0, 3); persistConversation(activeEntry.value) }
  function newAgentTask() { return newConversation() }
  async function adoptAgentAnswer(id) {
    const entry = activeEntry.value
    const message = entry.state.messages.find(item => item.id === id && item.kind === 'agent')
    if (!editorAttached() || !message || message.adopted || entry.state.busy || entry.state.agentAdoptionBusy) return false
    entry.state.agentAdoptionBusy = true
    entry.state.error = ''
    try {
      const receipt = await agentEngine.adopt(message)
      if (!receipt.ok) { entry.state.error = receipt.error; return false }
      message.adopted = true; message.adoptionReceipt = receipt; entry.state.error = receipt.warning || ''
      return true
    } catch { entry.state.error = '采纳失败，回答仍在对话中。'; return false }
    finally { entry.state.agentAdoptionBusy = false; persistConversation(entry) }
  }
  return Object.freeze({
    undoAgentProposal, canUndoProposal, pendingProposals, proposalReview, reviewProposal, closeProposal: () => { reviewedMessageId.value = '' }, applyAgentProposal, actOnProposal,
    setAgentPermission, sessions, selectSession, newConversation, editQuestion, continueFromMessage, regenerateAnswer, answerVersionInfo, selectAnswerVersion, renameConversation, archiveConversation, rateMessage, conversationDetails, deleteConversation, agentState, agentContext, agentChapterOptions, setAgentReferences, setAgentSkills, newAgentTask, adoptAgentAnswer,
    messages, draft, selectedIntent, busy, error, lastRequest, canSubmit,
    persistenceError, hasUnread, status,
    ask, retry, cancel, clear, selectIntent, refreshStaleness, markRead, updateDraft
  })
}
