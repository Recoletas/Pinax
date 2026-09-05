import { WORKFLOW_KINDS, getCanonicalAgentTask, resolveLegacyTaskAlias } from '../../../../shared/agentCapabilityContract.js'

export const SETTINGS_TASK_ADAPTERS = Object.freeze({
  'source.parse': 'settingsImport',
  'settings.import.extract': 'settingsImport',
  'settings.foundation.generate': 'settingsGeneration',
  'settings.candidates.extract': 'settingsGeneration',
  'settings.field.complete': 'settingsGeneration',
  'settings.character.complete': 'settingsGeneration',
  'settings.section.complete': 'settingsGeneration',
  'settings.draft.revise': 'settingsGeneration',
  'settings.places.extract': 'settingsPlace',
  'settings.place.fleshout': 'settingsPlace',
  'settings.research.plan': 'settingsResearch',
  'settings.research.claims': 'settingsResearch',
  'settings.maintenance.audit': 'settingsMaintenance'
})

export function resolveSettingsWorkflowTask(taskId) {
  const canonicalId = resolveLegacyTaskAlias(taskId)
  const task = getCanonicalAgentTask(canonicalId)
  if (!task || task.owner !== 'settings') return { ok: false, code: 'AGENT_TASK_UNKNOWN' }
  const adapter = SETTINGS_TASK_ADAPTERS[task.id]
  if (!adapter) return { ok: false, code: 'AGENT_TASK_UNKNOWN' }
  return { ok: true, task, adapter }
}

export function createSettingsEngineWorkflows(adapters = {}) {
  const entries = WORKFLOW_KINDS.map((kind) => [kind, async ({ task, request, context }) => {
    const resolved = resolveSettingsWorkflowTask(task?.id)
    if (!resolved.ok) return { status: 'failed', error: { code: resolved.code, retryable: false } }
    const adapter = adapters[resolved.adapter]
    const run = typeof adapter === 'function' ? adapter : adapter?.run?.bind(adapter)
    if (typeof run !== 'function') {
      return { status: 'failed', error: { code: 'AGENT_WORKFLOW_UNAVAILABLE', retryable: false } }
    }
    return run({ task: resolved.task, request, context })
  }])
  return Object.freeze(Object.fromEntries(entries))
}
