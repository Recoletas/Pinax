import { computed, ref } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService'
import {
  createPendingResult,
  markFailed,
  markStale,
  markApplied,
  markDismissed,
  acknowledgeApply,
  canApply,
  canDismiss,
  RESULT_STATUSES
} from '../services/agents/agentResultLifecycle'
import { adaptLegacyResultToAgentResult, adaptAgentResultToLegacy } from '../services/agents/legacyAdapter'
import { validateTaskType } from '../services/agents/agentTaskRegistry'
import {
  PASSIVE_HINT_TYPES,
  canRequestPassiveHint,
  canRunAgentTask,
  recordAgentRuntimeEvent
} from '../services/agents/agentRuntimePolicy'

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

function deriveDisplayFields(agentResult) {
  const legacy = adaptAgentResultToLegacy(agentResult)
  const result = legacy.result || {}
  return {
    summary: result.summary || agentResult.summary || '',
    replacement: result.replacement || '',
    targetRange: result.targetRange || null,
    mode: result.mode || 'review',
    issues: Array.isArray(result.issues) ? result.issues : [],
    action: Array.isArray(result.action) ? result.action : [],
    suggestions: Array.isArray(agentResult.suggestions) ? agentResult.suggestions.filter(Boolean) : [],
    actions: Array.isArray(agentResult.actions) ? agentResult.actions.filter(Boolean) : []
  }
}

export function useAdvisor(options = {}) {
  const sideEffectRunner = options.sideEffectRunner || null
  const resultValidator = options.resultValidator || null

  const advisorOpen = ref(false)
  const advisorLoading = ref(false)
  const advisorMessages = ref([])
  const advisorResults = ref([])
  const pendingReminderVisible = ref(false)
  const consistencyNotice = ref('')
  const pendingReviewCount = computed(() => advisorResults.value.filter(
    (item) => item.status === RESULT_STATUSES.COMPLETED
  ).length)

  function showPassiveReminder(type, message = '') {
    const permission = canRequestPassiveHint(type)
    if (!permission.allowed) return false
    recordAgentRuntimeEvent(type, 'shown')
    if (type === PASSIVE_HINT_TYPES.PENDING_RESULT) pendingReminderVisible.value = true
    if (type === PASSIVE_HINT_TYPES.CONSISTENCY_CONFLICT) consistencyNotice.value = message
    return true
  }

  async function askAdvisor(input, contextProvider) {
    if (advisorLoading.value) return

    const task = normalizeAdvisorInput(input)
    if (!task.question) return
    if (!canRunAgentTask()) {
      advisorMessages.value.push({ role: 'advisor', content: '智能 Agent 已关闭，可在写作页“更多”中重新开启。' })
      return
    }

    advisorLoading.value = true
    advisorMessages.value.push({ role: 'user', content: task.label || task.question })

    const taskTypeValidation = validateTaskType(task.taskType)
    const effectiveTaskType = taskTypeValidation.valid
      ? taskTypeValidation.canonical
      : task.taskType

    const pendingAgentResult = createPendingResult(
      effectiveTaskType || 'writing.chapter.health',
      { baseRevision: task.target?.revision || null, target: task.target || null }
    )

    const previewFields = deriveDisplayFields(pendingAgentResult)
    advisorResults.value.push({
      id: pendingAgentResult.id,
      _agentResult: pendingAgentResult,
      status: RESULT_STATUSES.PENDING,
      taskType: effectiveTaskType,
      target: task.target,
      ...previewFields
    })
    const entry = advisorResults.value[advisorResults.value.length - 1]

    try {
      if (typeof contextProvider !== 'function') {
        throw new Error('未配置上下文函数')
      }

      const context = await contextProvider()
      const envelope = context?.version != null && Array.isArray(context?.blocks)
        ? context
        : null
      const taskResult = await requestAdvisorTask({
        envelope,
        context: envelope ? null : context,
        question: task.question,
        scope: task.scope,
        taskType: task.taskType,
        target: task.target,
        options: task.options,
        mode: task.mode
      })

      const adaptedResult = adaptLegacyResultToAgentResult(
        taskResult.result,
        effectiveTaskType
      )
      let completedAgentResult = {
        ...adaptedResult,
        baseRevision: task.target?.revision || adaptedResult.baseRevision,
        target: pendingAgentResult.target,
        actions: adaptedResult.actions.map((action) => {
          if (action.type !== 'text-patch') return action
          return {
            ...action,
            range: action.range || task.target?.range || null,
            baseText: action.baseText == null && typeof task.target?.text === 'string'
              ? task.target.text
              : action.baseText
          }
        })
      }
      if (typeof resultValidator === 'function') {
        const validation = resultValidator(completedAgentResult, { task, context })
        if (!validation?.valid) {
          const error = new Error(`Agent 结果未通过领域校验：${validation?.reason || 'invalid-result'}`)
          error.code = 'AGENT_RESULT_INVALID'
          throw error
        }
        completedAgentResult = validation.result || completedAgentResult
      }

      entry._agentResult = completedAgentResult
      const fields = deriveDisplayFields(completedAgentResult)
      entry.summary = fields.summary
      entry.replacement = fields.replacement
      entry.targetRange = fields.targetRange
      entry.mode = fields.mode
      entry.issues = fields.issues
      entry.action = fields.action
      entry.suggestions = fields.suggestions
      entry.actions = fields.actions
      entry.status = RESULT_STATUSES.COMPLETED
      entry.target = task.target
      if (!advisorOpen.value) {
        showPassiveReminder(PASSIVE_HINT_TYPES.PENDING_RESULT)
      }

    } catch (e) {
      const failedAgentResult = markFailed(pendingAgentResult, e)
      entry._agentResult = failedAgentResult
      entry.status = RESULT_STATUSES.FAILED
      entry.statusDetail = e.message || String(e)
      advisorMessages.value.push({ role: 'advisor', content: `获取建议失败：${e.message || e}` })
      if (e?.code === 'AGENT_RESULT_INVALID') {
        showPassiveReminder(
          PASSIVE_HINT_TYPES.CONSISTENCY_CONFLICT,
          '返回结果与当前对象的允许范围不一致，已阻止应用。'
        )
      }
    } finally {
      advisorLoading.value = false
    }
  }

  async function applyAdvisorResult(resultId, currentRevision) {
    const entry = advisorResults.value.find((item) => item.id === resultId)
    if (!entry) return { ok: false, reason: 'not-found', status: null }

    const agentResult = entry._agentResult
    if (!agentResult) return { ok: false, reason: 'no-agent-result', status: null }

    if (!canApply(agentResult, currentRevision)) {
      return {
        ok: false,
        reason: 'cannot-apply',
        status: agentResult.status
      }
    }

    if (typeof sideEffectRunner === 'function') {
      entry.status = 'applying'
      try {
        const runnerResult = await sideEffectRunner(agentResult, { currentRevision })
        if (runnerResult && runnerResult.ok === false) {
          entry._agentResult = markFailed(agentResult, runnerResult.message || 'side-effect failed')
          entry.status = RESULT_STATUSES.FAILED
          entry.statusDetail = runnerResult.message || runnerResult.reason
          return {
            ok: false,
            reason: runnerResult.reason || 'side-effect-failed',
            status: RESULT_STATUSES.FAILED,
            message: runnerResult.message
          }
        }
        entry._agentResult = markApplied(agentResult)
        entry.status = RESULT_STATUSES.APPLIED
        return {
          ok: true,
          resultId,
          status: RESULT_STATUSES.APPLIED,
          actions: agentResult.actions
        }
      } catch (err) {
        entry._agentResult = markFailed(agentResult, err)
        entry.status = RESULT_STATUSES.FAILED
        entry.statusDetail = err.message || String(err)
        return {
          ok: false,
          reason: 'side-effect-exception',
          status: RESULT_STATUSES.FAILED,
          message: err.message || String(err)
        }
      }
    }

    return {
      ok: false,
      reason: 'no-side-effect-runner',
      resultId,
      status: agentResult.status,
      actions: agentResult.actions,
      message: '当前页面未配置结果执行器，未应用任何修改。'
    }
  }

  function dismissResult(resultId) {
    const entry = advisorResults.value.find((item) => item.id === resultId)
    if (!entry) return
    const agentResult = entry._agentResult
    if (!agentResult) return
    if (!canDismiss(agentResult)) return
    entry._agentResult = markDismissed(agentResult)
    entry.status = RESULT_STATUSES.DISMISSED
  }

  function markResultStale(resultId, reason, currentRevision) {
    const entry = advisorResults.value.find((item) => item.id === resultId)
    if (!entry) return
    if (!entry._agentResult) return
    if (entry._agentResult.status === RESULT_STATUSES.APPLIED) return
    if (entry._agentResult.status === RESULT_STATUSES.DISMISSED) return
    entry._agentResult = markStale(entry._agentResult, reason, currentRevision)
    entry.status = RESULT_STATUSES.STALE
    entry.statusDetail = reason || 'base-text-changed'
    showPassiveReminder(
      PASSIVE_HINT_TYPES.CONSISTENCY_CONFLICT,
      '当前内容已经变化，旧建议已标记为过期。'
    )
  }

  function acknowledgeResult(resultId) {
    const entry = advisorResults.value.find((item) => item.id === resultId)
    if (!entry) return
    if (entry._agentResult) {
      entry._agentResult = acknowledgeApply(entry._agentResult)
    }
  }

  function updateAdvisorResultStatus(resultId, status, detail = '') {
    const entry = advisorResults.value.find((item) => item.id === resultId)
    if (!entry) return
    const agentResult = entry._agentResult
    if (!agentResult) {
      entry.status = status
      entry.statusDetail = detail
      return
    }
    switch (status) {
      case RESULT_STATUSES.APPLIED:
        entry._agentResult = markApplied(agentResult)
        entry.status = RESULT_STATUSES.APPLIED
        entry.statusDetail = detail
        break
      case RESULT_STATUSES.FAILED:
        entry._agentResult = markFailed(agentResult, detail || 'User marked as failed')
        entry.status = RESULT_STATUSES.FAILED
        entry.statusDetail = detail
        break
      case RESULT_STATUSES.DISMISSED:
        if (canDismiss(agentResult)) {
          entry._agentResult = markDismissed(agentResult)
          entry.status = RESULT_STATUSES.DISMISSED
        }
        break
      case RESULT_STATUSES.STALE:
        if (agentResult.status !== RESULT_STATUSES.APPLIED
          && agentResult.status !== RESULT_STATUSES.DISMISSED) {
          entry._agentResult = markStale(agentResult, detail, null)
          entry.status = RESULT_STATUSES.STALE
          entry.statusDetail = detail || 'base-text-changed'
          showPassiveReminder(
            PASSIVE_HINT_TYPES.CONSISTENCY_CONFLICT,
            '当前对象已经变化，旧建议已标记为过期。'
          )
        }
        break
      default:
        entry.status = status
        entry.statusDetail = detail
    }
  }

  function openAdvisor() {
    advisorOpen.value = true
    pendingReminderVisible.value = false
  }

  function closeAdvisor() {
    advisorOpen.value = false
    if (pendingReviewCount.value > 0) {
      showPassiveReminder(PASSIVE_HINT_TYPES.PENDING_RESULT)
    }
  }

  function clearAdvisorMessages() {
    advisorMessages.value = []
    advisorResults.value = []
    pendingReminderVisible.value = false
    consistencyNotice.value = ''
  }

  return {
    advisorOpen,
    advisorLoading,
    advisorMessages,
    advisorResults,
    pendingReviewCount,
    pendingReminderVisible,
    consistencyNotice,
    askAdvisor,
    applyAdvisorResult,
    dismissResult,
    markResultStale,
    acknowledgeResult,
    openAdvisor,
    closeAdvisor,
    clearAdvisorMessages,
    updateAdvisorResultStatus
  }
}
