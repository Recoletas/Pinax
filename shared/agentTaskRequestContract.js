import { randomUUID } from './randomId.js'

export const AGENT_TASK_REQUEST_VERSION = 1

export function createTaskRequest({ taskId, project, target, intent, surface, options = {} }) {
  return Object.freeze({
    version: AGENT_TASK_REQUEST_VERSION,
    requestId: randomUUID(),
    taskId: String(taskId || '').trim(),
    project: { id: String(project?.id || ''), revision: String(project?.revision || '') },
    target: {
      type: String(target?.type || ''),
      id: target?.id == null ? null : String(target.id),
      revision: String(target?.revision || '')
    },
    intent: Object.freeze({ ...(intent || {}) }),
    surface: String(surface || ''),
    options: Object.freeze({ ...options })
  })
}

export function validateTaskRequest(request) {
  if (request?.version !== AGENT_TASK_REQUEST_VERSION) return { valid: false, reason: 'invalid-version' }
  if (!request.taskId) return { valid: false, reason: 'task-id-required' }
  if (!request.project?.id || !request.project?.revision) return { valid: false, reason: 'project-revision-required' }
  if (!request.target?.type || !request.target?.revision) return { valid: false, reason: 'target-revision-required' }
  if (!request.intent || typeof request.intent !== 'object') return { valid: false, reason: 'intent-required' }
  if (!request.surface) return { valid: false, reason: 'surface-required' }
  return { valid: true }
}
