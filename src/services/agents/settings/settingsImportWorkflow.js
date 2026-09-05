import { agentEnvelopeToPromptText } from '../../../../shared/agentContextContract.js'

const IMPORT_TASKS = new Set(['source.parse', 'settings.import.extract'])

function identityPreview(parsed) {
  return parsed
}

export function createSettingsImportWorkflow({ parseLocal, extract, buildPreview } = {}) {
  const toPreview = buildPreview || identityPreview
  return Object.freeze({
    async run({ task, request, context }) {
      if (!IMPORT_TASKS.has(task?.id)) {
        return { status: 'failed', error: { code: 'AGENT_TASK_UNKNOWN', retryable: false } }
      }
      try {
        if (task.id === 'source.parse') {
          const report = await parseLocal(request.intent.files, request.options)
          return { status: 'completed', actions: [{ type: 'cache-write', payload: report }] }
        }
        const sourceText = agentEnvelopeToPromptText(context.envelope)
        const parsed = await extract({
          sourceText,
          targetCount: request.intent.targetCount,
          nameHint: request.intent.nameHint,
          signal: request.options?.signal
        })
        return {
          status: 'completed',
          actions: [{ type: 'setting-draft', payload: toPreview(parsed, request.intent.nameHint) }]
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
