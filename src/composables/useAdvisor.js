import { ref } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService'
import { createPendingResult, markCompleted, markFailed, markStale, markApplied, canApply, acknowledgeApply } from '../services/agents/agentResultLifecycle'
import { adaptLegacyResultToAgentResult } from '../services/agents/legacyAdapter'
import { validateTaskType } from '../services/agents/agentTaskRegistry'

function createAdvisorResultId() {
  return `advisor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeAdvisorInput(input) {
  if (typeof input === 'string') {
    const question = input.trim()
    return {
      label: question,
      question,
      scope: '',
      taskType: '',
      target: null,
      options: {}
    }
  }

  if (!input || typeof input !== 'object') {
    return {
      label: '',
      question: '',
      scope: '',
      taskType: '',
      target: null,
      options: {}
    }
  }

  const question = String(input.question || input.label || '').trim()
  const label = String(input.label || question).trim()

  return {
    label,
    question,
    scope: String(input.scope || '').trim(),
    taskType: String(input.taskType || '').trim(),
    target: input.target || null,
    options: input.options || {},
    mode: String(input.mode || '').trim() || undefined
  }
}

export function useAdvisor() {
  const advisorOpen = ref(false)
  const advisorLoading = ref(false)
  const advisorMessages = ref([])
  const advisorResults = ref([])

  async function askAdvisor(input, contextProvider) {
    if (advisorLoading.value) return

    const task = normalizeAdvisorInput(input)
    if (!task.question) return

    advisorLoading.value = true
    advisorMessages.value.push({ role: 'user', content: task.label || task.question })

    try {
      if (typeof contextProvider !== 'function') {
        throw new Error('未配置上下文函数')
      }

      const taskTypeValidation = validateTaskType(task.taskType)
      const effectiveTaskType = taskTypeValidation.valid
        ? taskTypeValidation.canonical
        : task.taskType

      const pendingResult = createPendingResult(effectiveTaskType || 'advisor.review.chapter', {
        baseRevision: task.target?.text || null,
        target: task.target || null
      })

      const context = await contextProvider()
      const taskResult = await requestAdvisorTask({
        context,
        question: task.question,
        scope: task.scope,
        taskType: task.taskType,
        target: task.target,
        options: task.options,
        mode: task.mode
      })

      const agentResult = adaptLegacyResultToAgentResult(
        taskResult.result,
        effectiveTaskType
      )

      advisorResults.value.push({
        id: agentResult?.id || pendingResult.id || createAdvisorResultId(),
        status: 'pending',
        ...(taskResult.result || {}),
        _agentResult: agentResult
      })
      advisorMessages.value.push({ role: 'advisor', content: taskResult.advice })
    } catch (e) {
      advisorMessages.value.push({ role: 'advisor', content: `获取建议失败：${e.message || e}` })
    } finally {
      advisorLoading.value = false
    }
  }

  function applyAdvisorResult(resultId, currentRevision) {
    const result = advisorResults.value.find((item) => item.id === resultId)
    if (!result) return { ok: false, reason: 'not-found' }

    const agentResult = result._agentResult
    if (!agentResult) return { ok: false, reason: 'no-agent-result' }

    if (!canApply(agentResult, currentRevision)) {
      return {
        ok: false,
        reason: 'cannot-apply',
        status: agentResult.status
      }
    }

    console.log('[useAdvisor] applyAdvisorResult not yet wired to side-effect runner')

    return { ok: true, resultId, actions: agentResult.actions }
  }

  function markResultStale(resultId, reason, currentRevision) {
    const result = advisorResults.value.find((item) => item.id === resultId)
    if (!result) return

    if (result._agentResult) {
      result._agentResult = markStale(result._agentResult, reason, currentRevision)
      result.status = 'stale'
    }
  }

  function acknowledgeResult(resultId) {
    const result = advisorResults.value.find((item) => item.id === resultId)
    if (!result) return

    if (result._agentResult) {
      result._agentResult = acknowledgeApply(result._agentResult)
    }
  }

  function openAdvisor() {
    advisorOpen.value = true
  }

  function closeAdvisor() {
    advisorOpen.value = false
  }

  function clearAdvisorMessages() {
    advisorMessages.value = []
    advisorResults.value = []
  }

  function updateAdvisorResultStatus(resultId, status, detail = '') {
    const result = advisorResults.value.find((item) => item.id === resultId)
    if (!result) return
    result.status = status
    result.statusDetail = detail

    if (result._agentResult) {
      if (status === 'applied') {
        result._agentResult = markApplied(result._agentResult)
      } else if (status === 'failed') {
        result._agentResult = markFailed(result._agentResult, detail || 'User marked as failed')
      }
    }
  }

  return {
    advisorOpen,
    advisorLoading,
    advisorMessages,
    advisorResults,
    askAdvisor,
    applyAdvisorResult,
    markResultStale,
    acknowledgeResult,
    openAdvisor,
    closeAdvisor,
    clearAdvisorMessages,
    updateAdvisorResultStatus
  }
}
