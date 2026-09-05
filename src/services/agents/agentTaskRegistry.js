const AGENT_TASK_SCHEMA_VERSION = 1

import {
  CANONICAL_AGENT_TASKS,
  LEGACY_CAPABILITY_ALIASES,
  getCanonicalAgentTask,
  listCanonicalAgentTaskIds,
  resolveLegacyTaskAlias
} from '../../../shared/agentCapabilityContract'

const RESULT_MODES = Object.freeze({
  SUGGESTIONS: 'suggestions',
  STRUCTURED_DRAFT: 'structured-draft',
  TEXT_PATCH: 'text-patch',
  RUNTIME_CANDIDATE: 'runtime-candidate',
  GENERATION_REQUEST: 'generation-request'
})

export { RESULT_MODES }

export const LEGACY_ALIASES = LEGACY_CAPABILITY_ALIASES

const dynamicTasks = new Map()

function findDynamic(id) {
  return dynamicTasks.get(id) || null
}

export function getTask(id) {
  if (!id) return null
  const requested = String(id).trim()
  const local = findDynamic(requested)
  if (local) return local
  return getCanonicalAgentTask(resolveLegacyTaskAlias(requested))
}

export function getTasksBySurface(surface) {
  const normalized = String(surface || '').trim()
  if (!normalized) return []
  return CANONICAL_AGENT_TASKS.filter((task) => task.owner === normalized)
}

export function resolveTaskType(taskType) {
  if (!taskType) return null
  const canonical = resolveLegacyTaskAlias(String(taskType).trim())
  if (getCanonicalAgentTask(canonical)) return canonical
  const local = findDynamic(canonical)
  return local ? local.taskType : null
}

export function validateTaskType(taskType) {
  if (!taskType) return { valid: false, reason: 'missing-task-type' }
  const canonical = resolveLegacyTaskAlias(String(taskType).trim())
  if (getCanonicalAgentTask(canonical)) return { valid: true, canonical }
  if (findDynamic(canonical)) return { valid: true, canonical }
  return { valid: false, reason: 'unknown-task-type' }
}

export function registerTask(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new Error('registerTask requires a task definition object')
  }
  if (!definition.id) throw new Error('Task definition missing id')
  if (!definition.taskType) throw new Error('Task definition missing taskType')
  if (
    dynamicTasks.has(definition.id)
    || dynamicTasks.has(definition.taskType)
    || getCanonicalAgentTask(resolveLegacyTaskAlias(definition.id))
    || getCanonicalAgentTask(resolveLegacyTaskAlias(definition.taskType))
  ) {
    throw new Error(`Task type already registered: ${definition.taskType}`)
  }
  const frozen = Object.freeze({ ...definition })
  dynamicTasks.set(definition.id, frozen)
  dynamicTasks.set(definition.taskType, frozen)
  return frozen
}

export function getAllTaskTypes() {
  return [...listCanonicalAgentTaskIds(), ...new Set(
    [...dynamicTasks.values()].map((task) => task.taskType)
  )]
}

export function getExecutableTaskTypes() {
  return listCanonicalAgentTaskIds()
}

export function getTaskByLegacyAlias(legacyName) {
  const canonical = LEGACY_ALIASES[legacyName]
  return canonical ? getCanonicalAgentTask(canonical) : null
}

export function isLegacyAlias(taskType) {
  return Boolean(LEGACY_ALIASES[taskType])
}

export const TASK_SCHEMA_VERSION = AGENT_TASK_SCHEMA_VERSION
