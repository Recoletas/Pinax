import { validateAssistantChanges } from './assistantEditProposal.js'
import { assertAssistantPermission } from './assistantPermission.js'

// Only an unanswered author question carries unfinished candidates forward.
// Completed proposals belong to their frontend adoption receipts.
export function restoreAssistantProposal(req, snapshot, options = {}) {
  if (!options.pendingProposal?.length) return []
  const changes = validateAssistantChanges({ changes: options.pendingProposal })
  const block = req.kernel?.blocks?.find(item => item.kind === 'author-edit-decisions')
  let decisions = []
  try { decisions = JSON.parse(block?.text || '{}').proposals || [] } catch { /* older clients have no receipts */ }
  const rows = decisions.filter(item => item.taskId === req.taskId).flatMap(item => item.changes || [])
  const pending = changes.filter(change => !rows.some(row =>
    row.kind === change.kind && row.targetId === change.targetId && row.field === change.field &&
    row.operation === change.operation && row.before === change.before && row.after === change.after &&
    ['adopted', 'discarded', 'undone'].includes(row.status)))
  assertAssistantPermission(req.assistantPolicy, pending, req.bookId)
  for (const change of pending) {
    const domain = { chapter: 'manuscript', worldbook: 'world_lookup', outline: 'outline' }[change.kind]
    const target = snapshot.domains[domain]?.find(item => item.id === change.targetId)
    const text = String(change.field === 'content' ? target?.text ?? target?.summary ?? '' : target?.[change.field] ?? target?.title ?? '')
    if (change.operation === 'create' ? target : !target || (change.before && !text.includes(change.before))) {
      throw new Error('等待回答期间修改目标已变化，原候选仍保留在对话中，请重新定位后继续。')
    }
  }
  return pending
}

export async function compactAssistantConversation(cfg, task, signal) {
  const [{ compactAssistantSession }, { makeModels }] = await Promise.all([import('./assistantSession.js'), import('../llm.js')])
  const models = makeModels(cfg)
  const model = models.getModel(cfg.provider, cfg.model)
  if (!model) throw new Error('无法读取当前模型配置。')
  const result = await compactAssistantSession({ models, model, tasksDir: cfg.tasksDir,
    req: { taskId: task.taskId, bookId: task.bookId }, signal })
  if (!result.ok) throw new Error(result.error)
  return result
}
