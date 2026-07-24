import {
  AGENT_TASK_ERROR_CODES,
  getExecutableAgentTaskTypes,
  LEGACY_AGENT_TASK_ALIASES,
  resolveExecutableAgentTask
} from '../../shared/agentTaskContract.js'

export function validateServerTaskType(taskType) {
  const validation = resolveExecutableAgentTask(taskType)
  if (!validation.valid) return validation
  return {
    valid: true,
    taskType: validation.canonical,
    definition: validation.definition,
    wasLegacyAlias: validation.wasLegacyAlias
  }
}

export function getServerTaskTypes() {
  return getExecutableAgentTaskTypes()
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

export { AGENT_TASK_ERROR_CODES, LEGACY_AGENT_TASK_ALIASES }
