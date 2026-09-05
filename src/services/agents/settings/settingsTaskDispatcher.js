import { createTaskRequest } from '../../../../shared/agentTaskRequestContract.js'
import { createAgentExecutionEngine } from '../agentExecutionEngine.js'
import {
  createSettingsEngineWorkflows,
  resolveSettingsWorkflowTask
} from './settingsWorkflowRegistry.js'

export function createSettingsCallContext({ blocks = [], target = null } = {}) {
  return {
    envelope: { surface: 'settings', target: target || null, blocks: [...blocks] },
    ledger: {}
  }
}

export function createSettingsTaskDispatcher({ engine, resolveContext, facade }) {
  return Object.freeze({
    async dispatch(taskId, input = {}, options = {}) {
      const request = createTaskRequest({
        taskId,
        project: input.project,
        target: input.target,
        intent: input.intent,
        surface: 'settings',
        options
      })
      const route = resolveSettingsWorkflowTask(request.taskId)
      if (!route.ok) {
        return { status: 'failed', error: { code: route.code, retryable: false } }
      }
      const context = await resolveContext({ taskId: request.taskId, request, facade })
      return engine.run(request, context)
    }
  })
}

export function createSettingsPageDispatcher({ adapters = {}, engine, resolveContext, facade } = {}) {
  return createSettingsTaskDispatcher({
    engine: engine || createAgentExecutionEngine({
      workflows: createSettingsEngineWorkflows(adapters)
    }),
    resolveContext: resolveContext || (async ({ request }) => createSettingsCallContext({
      blocks: request.intent?.blocks || [],
      target: request.target
    })),
    facade
  })
}
