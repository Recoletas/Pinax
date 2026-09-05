import { createTaskRequest, validateTaskRequest } from '../../../../shared/agentTaskRequestContract.js'
import { resolveAgentContext as resolveDefaultAgentContext } from '../agentContextResolver.js'
import { applyAgentResultTransaction } from '../agentResultTransaction.js'
import { createAgentExecutionMetric } from '../agentExecutionMetrics.js'
import { createAuthoringTaskDispatcher, resolveAuthoringTaskId } from './authoringTaskDispatcher.js'

const METRICS_LIMIT = 50
const executionMetrics = []

function resetAuthoringExecutionMetrics() {
  executionMetrics.length = 0
}

function getAuthoringExecutionMetrics() {
  return executionMetrics.map((metric) => ({ ...metric }))
}

function recordExecutionMetric(entry) {
  executionMetrics.push(createAgentExecutionMetric(entry))
  if (executionMetrics.length > METRICS_LIMIT) executionMetrics.shift()
}

// 统一创作命令运行时：canonical TaskRequest → 上下文解析（facade+profile ledger）
// → dispatcher/workflow → 结果事务（stale 门禁 + effect policy 白名单）→ 应用。
export function createAuthoringCommandRuntime({
  projectId = '',
  projectRevision = '',
  facade,
  workflows,
  resolveContext = resolveDefaultAgentContext,
  resolveTarget,
  liveRevision = null,
  applyActions = async () => ({}),
  surface = 'authoring'
} = {}) {
  const dispatcher = createAuthoringTaskDispatcher({ workflows })

  async function execute({ taskId, intent = {}, signal } = {}) {
    const startedAt = Date.now()
    const canonicalId = resolveAuthoringTaskId(taskId)
    const target = resolveTarget?.(canonicalId) || null
    const request = createTaskRequest({
      taskId: canonicalId,
      project: { id: projectId, revision: projectRevision },
      target,
      intent,
      surface,
      options: { signal }
    })
    const validation = validateTaskRequest(request)
    if (!validation.valid) {
      const error = new Error(`invalid-task-request: ${validation.reason}`)
      error.code = 'AGENT_TASK_REQUEST_INVALID'
      recordExecutionMetric({ request, task: { workflowKind: '', contextProfile: '' }, result: { status: 'failed', error: { code: error.code } }, timing: { durationMs: Date.now() - startedAt }, ledger: {} })
      throw error
    }

    let context
    try {
      context = await resolveContext({ taskId: canonicalId, request, facade })
    } catch (error) {
      recordExecutionMetric({ request, task: { workflowKind: '', contextProfile: '' }, result: { status: 'failed', error: { code: 'AGENT_CONTEXT_RESOLVE_FAILED' } }, timing: { durationMs: Date.now() - startedAt }, ledger: {} })
      throw error
    }
    if (!context.task) {
      const error = new Error(`unknown agent task: ${canonicalId}`)
      error.code = 'AGENT_TASK_UNKNOWN'
      throw error
    }

    let result
    try {
      result = await dispatcher.run({
        taskId: canonicalId,
        request,
        // C1-1B：session、manifest 与现场投影均属于上下文合同，dispatcher
        // 必须完整透传，不能在 runtime 重新挑选一份字段子集。
        context
      })
    } catch (error) {
      recordExecutionMetric({
        request,
        task: context.task,
        result: { status: 'failed', error: { code: error?.code || 'AGENT_EXECUTION_FAILED' } },
        timing: { durationMs: Date.now() - startedAt },
        ledger: context.ledger || {}
      })
      throw error
    }

    const transaction = await applyAgentResultTransaction({
      taskId: canonicalId,
      result,
      target: request.target,
      currentRevision: String(liveRevision?.() ?? request.target.revision),
      adapter: {
        apply: async (actions) => applyActions({ actions, result, request, taskId: canonicalId })
      }
    })

    recordExecutionMetric({
      request,
      task: context.task,
      result: transaction.status === 'applied' ? { status: 'applied' } : { status: transaction.status, error: { code: transaction.error?.code || 'AGENT_RESULT_STALE' } },
      timing: { durationMs: Date.now() - startedAt },
      ledger: context.ledger || {}
    })

    return {
      status: transaction.status,
      staleReason: transaction.staleReason || null,
      error: transaction.error || null,
      receipt: transaction.receipt || null,
      result,
      request,
      envelope: context.envelope,
      ledger: context.ledger
    }
  }

  return Object.freeze({
    execute,
    dispatcher,
    resolveTaskId: resolveAuthoringTaskId
  })
}

export { resetAuthoringExecutionMetrics, getAuthoringExecutionMetrics }
