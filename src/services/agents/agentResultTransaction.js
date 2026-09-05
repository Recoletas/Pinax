import { getCanonicalAgentTask, resolveLegacyTaskAlias } from '../../../shared/agentCapabilityContract.js'
import { normalizeTransactionReceipt } from './agentResultLifecycle.js'

const ALLOWED_ACTIONS = Object.freeze({
  'local-cache': ['cache-write'],
  'review-draft': [
    'setting-draft',
    'text-patch',
    'runtime-candidate',
    'asset-draft',
    'material-classification',
    'material-split',
    'material-relations',
    'canvas-layout',
    'canvas-relations',
    'canvas-transition',
    'storyboard-shot-patch',
    'generation-request'
  ],
  'review-only': [],
  'direct-text': ['text-insert'],
  ephemeral: [],
  'derived-state': ['derived-upsert'],
  'metrics-only': ['metrics-write']
})

export async function applyAgentResultTransaction({ taskId, result, target, currentRevision, adapter }) {
  const task = getCanonicalAgentTask(resolveLegacyTaskAlias(taskId))
  if (!task) return { status: 'failed', error: { code: 'AGENT_TASK_UNKNOWN' } }
  if (!result || result.status !== 'completed') {
    return { status: 'failed', error: { code: 'AGENT_RESULT_NOT_COMPLETED' } }
  }
  if (String(target?.revision) !== String(currentRevision)) {
    return { status: 'stale', staleReason: 'target-revision-changed' }
  }
  const allowed = ALLOWED_ACTIONS[task.effectPolicy] || []
  if (!Array.isArray(result.actions)) {
    return { status: 'failed', error: { code: 'AGENT_RESULT_ACTIONS_INVALID' } }
  }
  const actions = result.actions
  if (actions.some((action) => !allowed.includes(action.type))) {
    return { status: 'failed', error: { code: 'AGENT_EFFECT_FORBIDDEN' } }
  }
  if (typeof adapter?.apply !== 'function') {
    return { status: 'failed', error: { code: 'AGENT_TRANSACTION_ADAPTER_MISSING' } }
  }
  try {
    const receipt = normalizeTransactionReceipt(await adapter.apply(actions, { taskId: task.id, target }))
    return { status: 'applied', receipt }
  } catch (error) {
    return {
      status: 'failed',
      error: {
        code: 'AGENT_TRANSACTION_APPLY_FAILED',
        message: String(error?.message || error),
        retryable: true
      }
    }
  }
}
