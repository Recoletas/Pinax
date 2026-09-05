const MAINTENANCE_TASKS = new Set(['settings.maintenance.audit'])

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
  return { code: 'AGENT_RESULT_INVALID', retryable: true }
}

// 维护审计是 review-only：只返回建议，永不产出会写入世界书的 action。
export function createSettingsMaintenanceWorkflow({ audit } = {}) {
  return Object.freeze({
    async run({ task, request, context }) {
      if (!MAINTENANCE_TASKS.has(task?.id)) {
        return { status: 'failed', actions: [], error: { code: 'AGENT_TASK_UNKNOWN', retryable: false } }
      }
      if (typeof audit !== 'function') {
        return { status: 'failed', actions: [], error: { code: 'AGENT_WORKFLOW_UNAVAILABLE', retryable: false } }
      }
      try {
        const suggestions = await audit({
          request,
          envelope: context?.envelope,
          signal: request.options?.signal
        })
        return { status: 'completed', actions: [], suggestions: [].concat(suggestions ?? []) }
      } catch (error) {
        const mapped = mapError(error)
        return { status: 'failed', actions: [], error: { ...mapped, message: String(error?.message || error) } }
      }
    }
  })
}
