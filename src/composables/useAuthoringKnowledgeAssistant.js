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

export function useAuthoringKnowledgeAssistant({
  projectId,
  target = null,
  resolveLiveSource = null,
  sceneProjection = null,
  revisionSignal = null,
  querySession = createAuthoringKnowledgeQuerySession(),
  executeQuery = requestAdvisorTask
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
      const prepared = await querySession.prepare({
        projectId: project,
        queryIntent: intent,
        question,
        target: valueOf(target),
        liveSource: typeof resolveLiveSource === 'function'
          ? resolveLiveSource({ phase: 'prepare', target: valueOf(target) })
          : valueOf(resolveLiveSource),
        sceneProjection: valueOf(sceneProjection)
      })
      if (!prepared?.ok) throw Object.assign(new Error('当前作品资料尚未准备好。'), { code: prepared?.reason })
      if (token !== requestToken || project !== activeProjectId.value) return false
      const session = prepared.session
      let modelOutput
      if (intent !== 'free' && session.evidenceEnvelope.evidence.length === 0) {
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

  watch(activeProjectId, (next, previous) => {
    if (previous && next !== previous) clear()
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
    refreshStaleness
  })
}
