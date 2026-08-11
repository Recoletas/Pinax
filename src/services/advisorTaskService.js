import api, { getResolvedApiSettings } from './api'
import { adaptLegacyContextToEnvelope } from './agents/legacyAdapter'
import { clipContextEnvelope, toPromptText } from './agents/agentContextEnvelope'
import { getTask, validateTaskType } from './agents/agentTaskRegistry'
import {
  createAgentRequestId,
  recordAgentRequestTrace,
  summarizeAgentEnvelope
} from './agents/agentRequestTrace'

export const ADVISOR_TASK_TYPES = {
  selection: 'writing.fix.selection',
  paragraph: 'writing.fix.paragraph',
  thread: 'writing.close.thread',
  chapter: 'writing.chapter.health',
  continue: 'writing.continue.light'
}

function normalizeQuestion(question) {
  const text = String(question || '').trim()
  if (!text) {
    throw new Error('缺少 question 参数')
  }
  return text
}

function hasContext(context) {
  if (context == null) return false
  if (typeof context === 'string') return context.trim().length > 0
  return true
}

function normalizeAdvisorError(error) {
  const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || '获取建议失败'
  const normalized = new Error(message)
  normalized.code = error?.response?.data?.code || error?.code || 'AGENT_REQUEST_FAILED'
  normalized.retryable = Boolean(error?.response?.data?.retryable ?? error?.retryable)
  return normalized
}

export function normalizeAdvisorTaskType(taskType, scope = '') {
  const explicit = String(taskType || '').trim()
  const requested = explicit || ADVISOR_TASK_TYPES[String(scope || '').trim()] || ADVISOR_TASK_TYPES.chapter
  const validation = validateTaskType(requested)
  if (!validation.valid) {
    const error = new Error(validation.reason === 'task-unavailable'
      ? '该 Agent 任务尚未接入执行器'
      : '未知的 Agent 任务类型')
    error.code = validation.reason === 'task-unavailable'
      ? 'AGENT_TASK_UNAVAILABLE'
      : 'AGENT_TASK_UNKNOWN'
    error.taskType = validation.canonical || requested
    error.retryable = false
    throw error
  }

  return validation.canonical
}

function normalizeAdvisorResult(data, fallbackTaskType) {
  const advice = typeof data?.advice === 'string' && data.advice.trim()
    ? data.advice.trim()
    : '未获取到有效建议'

  const taskType = normalizeAdvisorTaskType(data?.taskType || data?.result?.task || fallbackTaskType)
  const result = data?.result && typeof data.result === 'object'
    ? data.result
    : {
        task: taskType,
        mode: 'review',
        summary: advice
      }

  return {
    taskType,
    advice,
    meta: data?.meta || null,
    result: {
      ...result,
      task: normalizeAdvisorTaskType(result.task || taskType)
    }
  }
}

export function buildAdvisorRequestPayload({
  envelope,
  question,
  taskType,
  options = {},
  mode,
  requestId,
  clientStartedAt
} = {}) {
  return {
    envelope,
    question,
    taskType,
    target: envelope?.target || null,
    options,
    mode,
    trace: { requestId, clientStartedAt }
  }
}

export function buildAdvisorProviderOptions(settings = {}, options = {}) {
  const provider = String(settings.provider || '').trim().toLowerCase()
  const baseUrl = String(settings.baseUrl || '').trim()
  const anthropic = provider === 'claude'
    || provider === 'anthropic'
    || provider === 'minimax'
    || /\/anthropic(?:\/|$)/i.test(baseUrl)

  return {
    ...options,
    agentProvider: 'text-model',
    providerConfig: {
      baseUrl,
      apiKey: String(settings.apiKey || '').trim(),
      model: String(settings.model || '').trim(),
      format: anthropic ? 'anthropic' : 'openai'
    }
  }
}

export async function requestAdvisorTask({
  envelope = null,
  context,
  question,
  taskType,
  scope,
  target = null,
  options = {},
  mode,
  signal = null
} = {}) {
  const normalizedQuestion = normalizeQuestion(question)

  if (!envelope && !hasContext(context)) {
    throw new Error('缺少 envelope 或 context 参数')
  }

  const normalizedTaskType = normalizeAdvisorTaskType(taskType, scope)
  const built = buildAgentEnvelope({
    envelope,
    context,
    question: normalizedQuestion,
    taskType: normalizedTaskType,
    scope,
    target,
    options,
    mode
  })
  const requestId = createAgentRequestId()
  const traceBase = {
    requestId,
    taskType: built.taskType,
    startedAt: Date.now(),
    status: 'pending',
    context: summarizeAgentEnvelope(built.envelope)
  }
  recordAgentRequestTrace(traceBase)

  try {
    const apiSettings = await getResolvedApiSettings()
    const providerOptions = buildAdvisorProviderOptions(apiSettings, options)
    const response = await api.post('/advisor/task', buildAdvisorRequestPayload({
      envelope: built.envelope,
      question: normalizedQuestion,
      taskType: built.taskType,
      options: providerOptions,
      mode,
      requestId,
      clientStartedAt: traceBase.startedAt
    }), {
      signal: signal || undefined
    })

    recordAgentRequestTrace({
      ...traceBase,
      status: 'completed',
      completedAt: Date.now(),
      server: response.data?.meta || null
    })
    return normalizeAdvisorResult(response.data, built.taskType)
  } catch (error) {
    const aborted = Boolean(signal?.aborted)
      || error?.code === 'ERR_CANCELED'
      || error?.name === 'CanceledError'
    const normalized = aborted
      ? Object.assign(new Error('生成已取消'), {
          code: 'AGENT_REQUEST_ABORTED',
          retryable: false
        })
      : normalizeAdvisorError(error)
    recordAgentRequestTrace({
      ...traceBase,
      status: aborted ? 'cancelled' : 'failed',
      completedAt: Date.now(),
      error: { code: normalized.code, retryable: normalized.retryable }
    })
    throw normalized
  }
}

export async function requestAdvisorAdvice({ context, question, taskType, scope, target, options } = {}) {
  const taskResult = await requestAdvisorTask({
    context,
    question,
    taskType,
    scope,
    target,
    options
  })
  return taskResult.advice
}

export function buildAgentEnvelope({
  envelope: suppliedEnvelope = null,
  context,
  question,
  taskType,
  scope = '',
  target = null,
  options = {},
  mode,
  maxChars
} = {}) {
  const normalizedTaskType = normalizeAdvisorTaskType(taskType, scope)
  const adapted = suppliedEnvelope
    ? { envelope: suppliedEnvelope, resolvedTaskType: normalizedTaskType }
    : adaptLegacyContextToEnvelope({
        context,
        question,
        scope,
        taskType: normalizedTaskType,
        target,
        options,
        mode
      })
  const { envelope, resolvedTaskType } = adapted

  const taskMaxChars = getTask(resolvedTaskType)?.maxContextChars
  const requestedMaxChars = maxChars != null ? Number(maxChars) : taskMaxChars
  const clipped = clipContextEnvelope(
    envelope,
    Number.isFinite(requestedMaxChars)
      ? Math.min(requestedMaxChars, taskMaxChars || requestedMaxChars)
      : undefined
  )

  return {
    envelope: clipped,
    taskType: resolvedTaskType,
    question: normalizeQuestion(question),
    promptText: toPromptText(clipped)
  }
}
