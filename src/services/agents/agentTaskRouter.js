import { resolveLegacyTaskAlias, getCanonicalAgentTask } from '../../../shared/agentCapabilityContract.js'

export function resolveAgentRoute(taskId) {
  const task = getCanonicalAgentTask(resolveLegacyTaskAlias(taskId))
  if (!task) return { valid: false, code: 'AGENT_TASK_UNKNOWN' }
  return { valid: true, task }
}
