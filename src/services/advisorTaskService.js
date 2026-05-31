import api from './api'

const ADVISOR_REQUEST_TIMEOUT_MS = 90000

export const ADVISOR_TASK_TYPES = {
  selection: 'advisor.fix.selection',
  paragraph: 'advisor.fix.paragraph',
  thread: 'advisor.close.thread',
  chapter: 'advisor.review.chapter',
  continue: 'advisor.continue.light'
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
  if (error?.code === 'ECONNABORTED' || String(error?.message || '').includes('timeout')) {
    return new Error(`获取建议超时（${Math.floor(ADVISOR_REQUEST_TIMEOUT_MS / 1000)}秒），请重试或缩短上下文后再试`)
  }

  const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || '获取建议失败'
  return new Error(message)
}

export function normalizeAdvisorTaskType(taskType, scope = '') {
  const explicit = String(taskType || '').trim()
  if (explicit) return explicit

  const normalizedScope = String(scope || '').trim()
  return ADVISOR_TASK_TYPES[normalizedScope] || ADVISOR_TASK_TYPES.chapter
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
    result: {
      ...result,
      task: normalizeAdvisorTaskType(result.task || taskType)
    }
  }
}

export async function requestAdvisorTask({
  context,
  question,
  taskType,
  scope,
  target = null,
  options = {},
  mode
} = {}) {
  const normalizedQuestion = normalizeQuestion(question)

  if (!hasContext(context)) {
    throw new Error('缺少 context 参数')
  }

  const normalizedTaskType = normalizeAdvisorTaskType(taskType, scope)

  try {
    const response = await api.post(
      '/advisor/task',
      {
        context,
        question: normalizedQuestion,
        taskType: normalizedTaskType,
        target,
        options,
        mode
      },
      {
        timeout: ADVISOR_REQUEST_TIMEOUT_MS
      }
    )

    return normalizeAdvisorResult(response.data, normalizedTaskType)
  } catch (error) {
    throw normalizeAdvisorError(error)
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
