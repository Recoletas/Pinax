import { getChapterMarkdown } from '../../writing/writingDocumentSchema.js'
import { entryDetailsSnapshot } from '../../../../shared/assistantEntryDetails.js'

function targetOf(change, { book, worldbook }) {
  const list = change.kind === 'chapter' ? book?.chapters : change.kind === 'outline' ? book?.outlineNodes : worldbook?.entries
  return list?.find(item => String(item.id) === change.targetId)
}
function snapshot(change, target) {
  return {
    text: change.kind === 'chapter' && change.field === 'content' ? getChapterMarkdown(target) : String(target[change.field] || ''),
    title: target.name || target.title || '', type: target.type || '', details: entryDetailsSnapshot(target)
  }
}
export function previewAssistantConflict(change, context) {
  const target = targetOf(change, context)
  if (!target) throw new Error('条目已不存在，可保留现有状态并忽略这条建议。')
  const expected = snapshot(change, target)
  const baseline = String(change.baseline || '')
  const start = change.anchor?.from ?? baseline.indexOf(change.before)
  const desired = change.operation === 'create' ? change.after
    : change.operation === 'append' ? `${baseline}${baseline ? '\n\n' : ''}${change.after}`
      : start >= 0 ? baseline.slice(0, start) + change.after + baseline.slice(start + (change.operation === 'insert' ? 0 : change.before.length)) : null
  if (desired === null) throw new Error('旧建议缺少完整定位信息，请保留现有内容，或在编辑器中手动合并。')
  return { expected, desired }
}

export function reconsiderDiscardedAssistantChanges(proposal, changeIds) {
  if (!Array.isArray(changeIds) || !changeIds.length || changeIds.some(id => !proposal.changes.some(change => change.changeId === id && change.status === 'discarded'))) throw new Error('只能重新处理明确选中的已忽略建议。')
  // This temporary proposal exists only within the explicit save transaction.
  // Viewing an ignored suggestion never restores it to accept-all.
  return { ...proposal, status: proposal.changes.some(change => change.status === 'adopted') ? 'partial' : 'pending', changes: proposal.changes.map(change => changeIds.includes(change.changeId) ? { ...change, status: 'pending' } : change) }
}

// A conflict resolution is an explicit replacement of the field the author
// just reviewed. Preserve the existing entity identity, type and attributes.
export function resolveAssistantConflicts(proposal, resolutions, context, changeIds) {
  if (!Array.isArray(resolutions) || !resolutions.length || !changeIds || changeIds.length !== resolutions.length || new Set(resolutions.map(item => item.changeId)).size !== resolutions.length) throw new Error('请选择要解决的具体修改。')
  const changes = proposal.changes.map(change => {
    const resolution = resolutions.find(item => item.changeId === change.changeId)
    if (!resolution) return change
    if (!changeIds.includes(change.changeId) || change.status && change.status !== 'pending' || typeof resolution.after !== 'string') throw new Error('建议已处理，请重新查看。')
    const target = targetOf(change, context)
    if (!target || JSON.stringify(snapshot(change, target)) !== JSON.stringify(resolution.expected)) throw new Error('查看对比后内容又发生了变化，请重新打开对比。')
    return { ...change, operation: 'replace', before: resolution.expected.text, after: resolution.after, baseline: resolution.expected.text, anchor: undefined, details: undefined, detailsBaseline: undefined }
  })
  if (resolutions.some(item => !changes.some(change => change.changeId === item.changeId))) throw new Error('找不到所选建议。')
  return { ...proposal, changes }
}
