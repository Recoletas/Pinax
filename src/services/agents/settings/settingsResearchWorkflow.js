const RESEARCH_TASKS = new Set(['settings.research.plan', 'settings.research.claims'])

function mapError(error) {
  if (error?.name === 'AbortError') {
    return { code: 'AGENT_ABORTED', retryable: false }
  }
  const message = String(error?.message || '')
  const code = String(error?.code || '')
  if (code.includes('TIMEOUT') || code === 'ETIMEDOUT' || /超时|timed out/i.test(message)) {
    return { code: 'AGENT_TIMEOUT', retryable: true }
  }
  if (code.includes('STALE') || /过期|已更新/.test(message)) {
    return { code: 'AGENT_TARGET_STALE', retryable: false }
  }
  return { code: 'AGENT_EXECUTION_FAILED', retryable: true }
}

export function createSettingsResearchWorkflow({ planQueries, collectClaims } = {}) {
  return Object.freeze({
    async run({ task, request, context }) {
      if (!RESEARCH_TASKS.has(task?.id)) {
        return { status: 'failed', error: { code: 'AGENT_TASK_UNKNOWN', retryable: false } }
      }
      try {
        if (task.id === 'settings.research.plan') {
          const queries = await planQueries({
            request,
            envelope: context?.envelope,
            signal: request.options?.signal
          })
          return { status: 'completed', actions: [], suggestions: [].concat(queries ?? []) }
        }
        const claims = await collectClaims({
          request,
          envelope: context?.envelope,
          signal: request.options?.signal
        })
        return {
          status: 'completed',
          actions: [].concat(claims ?? []).map((claim) => ({
            type: 'setting-draft',
            baseRevision: request.target?.revision || '',
            payload: claim,
            sourceRefs: [...(claim?.sourceRefs || [])]
          }))
        }
      } catch (error) {
        const mapped = mapError(error)
        return { status: 'failed', actions: [], error: { ...mapped, message: String(error?.message || error) } }
      }
    }
  })
}
