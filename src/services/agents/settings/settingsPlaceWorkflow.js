const METHOD_BY_TASK = Object.freeze({
  'settings.places.extract': 'extractPlaces',
  'settings.place.fleshout': 'fleshOutPlace'
})

export function createSettingsPlaceWorkflow(services = {}) {
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
        const allowedRefs = new Set((context?.envelope?.blocks || []).flatMap((block) => block.sourceRefs || []))
        const value = await services[method]({ request, envelope: context?.envelope })
        return {
          status: 'completed',
          actions: [].concat(value ?? []).map((draft) => ({
            type: 'setting-draft',
            baseRevision: request.target?.revision || '',
            payload: draft,
            sourceRefs: (draft?.sourceRefs || draft?.evidence || []).filter((ref) => allowedRefs.has(ref))
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
