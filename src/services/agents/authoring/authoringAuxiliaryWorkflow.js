const METHOD_BY_TASK = Object.freeze({
  'authoring.next-actions': 'nextActions',
  'authoring.dialogue-options': 'dialogueOptions',
  'authoring.emergence': 'emergence',
  'authoring.context.compact': 'compactContext',
  'authoring.asset.summarize': 'summarizeAsset'
})

const EFFECT_POLICY_BY_TASK = Object.freeze({
  'authoring.next-actions': 'ephemeral',
  'authoring.dialogue-options': 'ephemeral',
  'authoring.emergence': 'review-draft',
  'authoring.context.compact': 'derived-state',
  'authoring.asset.summarize': 'review-draft'
})

function unavailableError(taskId) {
  const error = new Error(`No auxiliary service bound for task: ${taskId}`)
  error.code = 'AGENT_WORKFLOW_UNAVAILABLE'
  return error
}

function normalizeOptionSuggestions(output) {
  const options = Array.isArray(output?.options) ? output.options : []
  return options
    .map((option, index) => ({
      type: 'option',
      content: String(option?.label ?? option?.text ?? option ?? '').trim(),
      index
    }))
    .filter((suggestion) => suggestion.content)
}

export function createAuthoringAuxiliaryWorkflow(services = {}) {
  return Object.freeze({
    async run({ task, request, context }) {
      const method = METHOD_BY_TASK[task.id]
      if (!method || typeof services[method] !== 'function') throw unavailableError(task.id)
      const output = await services[method]({ request, envelope: context.envelope })
      const base = {
        status: 'completed',
        taskId: task.id,
        effectPolicy: EFFECT_POLICY_BY_TASK[task.id],
        actions: []
      }

      if (method === 'nextActions' || method === 'dialogueOptions') {
        return { ...base, suggestions: normalizeOptionSuggestions(output), output }
      }
      if (method === 'emergence') {
        const candidates = output?.candidate ? [output.candidate] : (Array.isArray(output?.candidates) ? output.candidates : [])
        return { ...base, candidates, output }
      }
      if (method === 'compactContext') {
        return {
          ...base,
          derivedUpsert: {
            kind: 'memory-summary',
            summary: String(output?.summary || ''),
            newHistory: Array.isArray(output?.newHistory) ? output.newHistory : [],
            baseRevision: request.target?.revision || ''
          },
          output
        }
      }
      // summarizeAsset → asset drafts
      const assets = Array.isArray(output?.assets) ? output.assets : []
      return {
        ...base,
        assetDrafts: assets.map((asset) => ({
          kind: String(asset?.kind || 'inspiration'),
          title: String(asset?.title || ''),
          content: String(asset?.content || '')
        })),
        output
      }
    }
  })
}

export { METHOD_BY_TASK as AUXILIARY_METHOD_BY_TASK }
