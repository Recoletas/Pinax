import { resolveAgentRoute } from './agentTaskRouter.js'

export function createAgentExecutionEngine({ workflows }) {
  return Object.freeze({
    async run(request, context) {
      const route = resolveAgentRoute(request.taskId)
      if (!route.valid) return { status: 'failed', error: { code: route.code, retryable: false } }
      const workflow = workflows?.[route.task.workflowKind]
      if (typeof workflow !== 'function') {
        return { status: 'failed', error: { code: 'AGENT_WORKFLOW_UNAVAILABLE', retryable: false } }
      }
      try {
        return await workflow({ request, context, task: route.task })
      } catch (error) {
        const aborted = error?.name === 'AbortError' || request.options?.signal?.aborted
        return {
          status: 'failed',
          error: {
            code: aborted ? 'AGENT_ABORTED' : 'AGENT_EXECUTION_FAILED',
            message: String(error?.message || error),
            retryable: !aborted
          }
        }
      }
    }
  })
}
