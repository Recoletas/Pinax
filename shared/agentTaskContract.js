import {
  CANONICAL_AGENT_TASKS,
  WORKFLOW_KINDS,
  LEGACY_CAPABILITY_ALIASES,
  getCanonicalAgentTask,
  listCanonicalAgentTaskIds,
  resolveLegacyTaskAlias
} from './agentCapabilityContract.js'

export {
  CANONICAL_AGENT_TASKS,
  WORKFLOW_KINDS,
  LEGACY_CAPABILITY_ALIASES,
  getCanonicalAgentTask,
  listCanonicalAgentTaskIds,
  resolveLegacyTaskAlias
}

export const AGENT_TASK_ERROR_CODES = Object.freeze({
  MISSING: 'AGENT_TASK_MISSING',
  UNKNOWN: 'AGENT_TASK_UNKNOWN',
  UNAVAILABLE: 'AGENT_TASK_UNAVAILABLE'
})

export const LEGACY_AGENT_TASK_ALIASES = LEGACY_CAPABILITY_ALIASES

export function getExecutableAgentTaskTypes() {
  return listCanonicalAgentTaskIds()
}

export function resolveExecutableAgentTask(taskType) {
  const requested = String(taskType || '').trim()
  if (!requested) {
    return {
      valid: false,
      code: AGENT_TASK_ERROR_CODES.MISSING,
      reason: 'missing-task-type',
      requested,
      canonical: null
    }
  }
  const canonical = resolveLegacyTaskAlias(requested)
  const definition = getCanonicalAgentTask(canonical)
  if (!definition) {
    return {
      valid: false,
      code: AGENT_TASK_ERROR_CODES.UNKNOWN,
      reason: 'unknown-task-type',
      requested,
      canonical: null
    }
  }
  return {
    valid: true,
    requested,
    canonical,
    definition,
    wasLegacyAlias: canonical !== requested
  }
}
