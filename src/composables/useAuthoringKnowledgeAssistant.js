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
