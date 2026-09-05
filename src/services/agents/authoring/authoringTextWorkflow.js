const METHOD_BY_TASK = Object.freeze({
  'authoring.insert': 'insert',
  'authoring.rewrite': 'rewrite',
  'authoring.expand': 'expand',
  'authoring.shorten': 'shorten',
  'authoring.complete.inline': 'completeInline',
  'authoring.review.selection': 'reviewSelection',
  'authoring.review.chapter': 'reviewChapter'
})

export function createAuthoringTextWorkflow(services) {
  return Object.freeze({
    async run({ task, request, context }) {
      const method = METHOD_BY_TASK[task.id]
      if (!method || typeof services?.[method] !== 'function') {
        const error = new Error(`No writing service bound for task: ${task.id}`)
        error.code = 'AGENT_WORKFLOW_UNAVAILABLE'
        throw error
      }
      const output = await services[method]({ request, envelope: context.envelope })
      const isReview = task.effectPolicy === 'review-only'
      const isEphemeral = task.effectPolicy === 'ephemeral'
      return {
        status: 'completed',
        effectPolicy: task.effectPolicy,
        suggestions: isReview || isEphemeral ? [{ type: 'text', content: output.text }] : [],
        actions: isReview || isEphemeral ? [] : [{
          type: task.effectPolicy === 'direct-text' ? 'text-insert' : 'text-patch',
          content: output.text,
          baseRevision: request.target.revision
        }]
      }
    }
  })
}

export { METHOD_BY_TASK }
