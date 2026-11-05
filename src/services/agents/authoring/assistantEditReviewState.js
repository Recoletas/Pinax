const finalStatuses = new Set(['adopted', 'discarded', 'undone'])
export const sameAssistantEdit = (left, right) => ['kind', 'targetId', 'field', 'operation', 'before', 'after'].every(key => left?.[key] === right?.[key]) && JSON.stringify(left?.details || null) === JSON.stringify(right?.details || null)
export const pendingAssistantEdit = (proposal, change) => ['pending', 'partial'].includes(proposal?.status) && (!change.status || change.status === 'pending')

// Keep an object's edits and explicit dependencies atomic, while allowing
// unrelated objects to proceed when one object conflicts.
export function assistantEditActionGroups(proposal, ids) {
  const selected = proposal.changes.filter(change => ids.includes(change.changeId))
  const parents = new Map(selected.map(change => [change.changeId, change.changeId]))
  const root = id => { while (parents.get(id) !== id) id = parents.get(id); return id }
  const byTarget = new Map()
  for (const change of selected) {
    const key = `${change.kind}:${change.targetId}`
    const related = [...(change.dependsOn || []), byTarget.get(key)].filter(id => parents.has(id))
    for (const id of related) parents.set(root(id), root(change.changeId))
    byTarget.set(key, change.changeId)
  }
  const groups = new Map()
  for (const change of selected) {
    const key = root(change.changeId)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(change.changeId)
  }
  return [...groups.values()]
}

// The persisted decision wins over stale conversation copies, including late
// streamed candidates. Proposal status also applies to legacy change rows that
// predate individual per-change statuses.
export function resolveAssistantEditReview(candidate, readReceipt) {
  if (!candidate?.id || !Array.isArray(candidate.changes)) return null
  const saved = readReceipt?.(candidate.id)
  const proposal = saved?.bookId === candidate.bookId ? saved : candidate
  return { ...proposal, changes: proposal.changes.map(change => finalStatuses.has(proposal.status) && (!change.status || change.status === 'pending') ? { ...change, status: proposal.status } : change) }
}

export function preserveAssistantEditDecisions(proposal, previous, decisions = []) {
  const handled = [...(previous?.changes || []), ...decisions.flatMap(item => item.changes || [])].filter(change => finalStatuses.has(change.status))
  return { ...proposal, changes: proposal.changes.map(change => {
    const decided = handled.find(old => sameAssistantEdit(old, change))
    return decided ? { ...change, status: decided.status } : change
  }) }
}

export function assistantConversationWorkingSet(messages, readReceipt) {
  const proposals = messages.filter(message => message.proposal).map(message => ({ ...resolveAssistantEditReview(message.proposal, readReceipt), messageId: message.id }))
  // A regenerated proposal has a new id. That must not bring an identical
  // explicitly rejected edit back into the current working set.
  const rejected = proposals.flatMap(proposal => proposal.changes.filter(change => ['discarded', 'undone'].includes(change.status)))
  const saved = proposals.flatMap(proposal => proposal.changes.filter(change => change.status === 'adopted').map(change => ({ bookId: proposal.bookId, change })))
  const seen = []
  const working = proposals.map(proposal => {
    const changes = proposal.changes.map(change => {
      if (!pendingAssistantEdit(proposal, change)) return change
      const duplicate = [...saved, ...seen].some(old => old.bookId === proposal.bookId && sameAssistantEdit(old.change, change))
      if (rejected.some(old => sameAssistantEdit(old, change)) || duplicate) return { ...change, status: 'discarded', reviewSuppressed: true }
      seen.push({ bookId: proposal.bookId, change })
      return change
    })
    const pending = changes.some(change => !change.status || change.status === 'pending')
    const adopted = changes.some(change => change.status === 'adopted')
    return { ...proposal, changes, status: pending ? adopted ? 'partial' : 'pending' : adopted ? 'adopted' : proposal.status === 'undone' ? 'undone' : 'discarded' }
  }).filter(proposal => proposal.reviewStatus !== 'completed')
  // Legacy "keep existing / ignore remaining" receipts predate reviewStatus.
  // A fully decided set containing ignored edits has already ended; do not
  // resurrect it as an actionable review after an update or reload.
  if (working.length && !working.some(proposal => proposal.changes.some(change => pendingAssistantEdit(proposal, change))) && working.some(proposal => proposal.changes.some(change => change.status === 'discarded' && !change.reviewSuppressed))) return []
  return working
}
