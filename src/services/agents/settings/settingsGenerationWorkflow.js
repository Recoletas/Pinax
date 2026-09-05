const METHOD_BY_TASK = Object.freeze({
  'settings.foundation.generate': 'generateFoundation',
  'settings.candidates.extract': 'generateCandidates',
  'settings.field.complete': 'generateField',
  'settings.section.complete': 'generateSection',
  'settings.draft.revise': 'reviseDraft'
})

export function createSettingsGenerationWorkflow(services = {}) {
  return Object.freeze({
    async run({ task, request, context }) {
      const method = METHOD_BY_TASK[task?.id]
      if (!method) {
        return { status: 'failed', error: { code: 'AGENT_TASK_UNKNOWN', retryable: false } }
      }
      if (typeof services[method] !== 'function') {
        return { status: 'failed', error: { code: 'AGENT_WORKFLOW_UNAVAILABLE', retryable: false } }
      }
      try {
        const value = await services[method]({ request, envelope: context?.envelope })
        return {
          status: 'completed',
          actions: [].concat(value ?? []).map((draft) => ({
            type: 'setting-draft',
            baseRevision: request.target?.revision || '',
            payload: draft
          }))
        }
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
