import { createStoryAgentEngine as createEngine } from '@pinax/core/agent/agentEngine'
import { sendAssistantLiveInput } from './assistantLiveInput.js'
export function createStoryAgentEngine(options = {}) {
  const projectId = options.projectId
  return createEngine({ ...options, projectId: () => typeof projectId === 'function' ? projectId() : projectId?.__v_isRef ? projectId.value : projectId, sendAssistantLiveInput })
}
