import {
  getCanonicalAgentTask,
  resolveLegacyTaskAlias
} from '../../../../shared/agentCapabilityContract'

export const AUTHORING_TEXT_TASK_IDS = Object.freeze([
  'authoring.insert',
  'authoring.rewrite',
  'authoring.expand',
  'authoring.shorten',
  'authoring.complete.inline',
  'authoring.review.selection',
  'authoring.review.chapter'
])

export const AUTHORING_NARRATIVE_TASK_IDS = Object.freeze([
  'authoring.continue',
  'authoring.advance',
  'authoring.simulate.character',
  'authoring.simulate.scene',
  'authoring.trigger'
])

export const AUTHORING_AUXILIARY_TASK_IDS = Object.freeze([
  'authoring.next-actions',
  'authoring.dialogue-options',
  'authoring.emergence',
  'authoring.context.compact',
  'authoring.asset.summarize'
])

export const AUTHORING_OBSERVER_TASK_IDS = Object.freeze([
  'observer.entities.derive',
  'observer.relations.derive',
  'observer.events.derive',
  'observer.timeline.derive',
  'observer.memory.derive'
])

const WORKFLOW_GROUP_BY_TASK = new Map([
  ...AUTHORING_TEXT_TASK_IDS.map((id) => [id, 'text']),
  ...AUTHORING_NARRATIVE_TASK_IDS.map((id) => [id, 'narrative']),
  ...AUTHORING_AUXILIARY_TASK_IDS.map((id) => [id, 'auxiliary']),
  ...AUTHORING_OBSERVER_TASK_IDS.map((id) => [id, 'observer'])
])

const aliasMetric = new Map()

export function resolveAuthoringTaskId(taskId) {
  const requested = String(taskId || '').trim()
  const canonical = resolveLegacyTaskAlias(requested)
  if (requested && canonical !== requested) {
    recordAuthoringAliasUse(requested, canonical)
  }
  return canonical
}

export function recordAuthoringAliasUse(requested, canonical) {
  const key = `${String(requested)}->${String(canonical)}`
  aliasMetric.set(key, (aliasMetric.get(key) || 0) + 1)
}

export function resetAuthoringAliasMetric() {
  aliasMetric.clear()
}

export function getAuthoringAliasMetricSnapshot() {
  return Object.fromEntries(aliasMetric)
}

function unknownTaskError(taskId) {
  const error = new Error(`Unknown agent task: ${taskId}`)
  error.code = 'AGENT_TASK_UNKNOWN'
  return error
}

function unavailableWorkflowError(taskId) {
  const error = new Error(`No workflow bound for task: ${taskId}`)
  error.code = 'AGENT_WORKFLOW_UNAVAILABLE'
  return error
}

export function createAuthoringTaskDispatcher({ workflows = {} } = {}) {
  return Object.freeze({
    resolveTaskId: resolveAuthoringTaskId,
    async run({ taskId, request, context }) {
      const canonicalId = resolveAuthoringTaskId(taskId)
      const task = getCanonicalAgentTask(canonicalId)
      if (!task) throw unknownTaskError(canonicalId)

      const group = WORKFLOW_GROUP_BY_TASK.get(canonicalId)
      if (!group) throw unavailableWorkflowError(canonicalId)
      if (typeof workflows?.[group]?.run !== 'function') throw unavailableWorkflowError(canonicalId)
      return workflows[group].run({
        task,
        request,
        context
      })
    }
  })
}
