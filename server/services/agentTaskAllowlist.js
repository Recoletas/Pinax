import {
  LEGACY_CAPABILITY_ALIASES,
  getCanonicalAgentTask,
  listCanonicalAgentTaskIds,
  resolveLegacyTaskAlias
} from '../../shared/agentCapabilityContract.js'
import { AGENT_TASK_ERROR_CODES } from '../../shared/agentTaskContract.js'

export { AGENT_TASK_ERROR_CODES, LEGACY_AGENT_TASK_ALIASES } from '../../shared/agentTaskContract.js'

export function validateServerTaskType(taskType) {
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
    taskType: canonical,
    definition,
    wasLegacyAlias: canonical !== requested
  }
}

export function getServerTaskTypes() {
  return listCanonicalAgentTaskIds()
}

export function isNewEnvelopePayload(body) {
  return Boolean(
    body && typeof body === 'object'
    && body.envelope
    && typeof body.envelope === 'object'
    && body.envelope.version != null
  )
}

export function isLegacyPayload(body) {
  return Boolean(
    body && typeof body === 'object'
    && !body.envelope
    && (body.context || body.question)
  )
}

export { LEGACY_CAPABILITY_ALIASES }
