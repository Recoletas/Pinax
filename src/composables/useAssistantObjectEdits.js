import { entryDetailsSnapshot } from '../../shared/assistantEntryDetails.js'
import { computed, unref } from 'vue'
import { applyAssistantProposal } from '../services/agents/storyagent/assistantEditTransaction.js'
import { buildWritingCandidateDiff } from '../../shared/writingCandidateContract.js'
const value = input => typeof input === 'function' ? input() : unref(input)
const pending = change => !change.status || change.status === 'pending'

// Read-only projections for the existing object editor. Every actual write still
// goes through the assistant's permission/revision checked adoption transaction.
export function useAssistantObjectEdits({ review, items, selectedId, kind = 'worldbook', worldbook, emit }) {
  const current = computed(() => {
    const input = value(review)
    const proposal = input?.proposal
    if (!proposal || proposal.bookId !== String(input.bookId || '')) return null
    const expected = proposal.receipt?.worldbookId ?? proposal.worldbookId
    if (kind === 'worldbook' && String(expected || '') !== String(value(worldbook)?.id || '')) return null
    return { ...input, proposal }
  })
  const changes = computed(() => (current.value?.proposal.changes || []).filter(change => change.kind === kind))
  const relatedIds = computed(() => new Set(changes.value.filter(change => !['discarded', 'undone'].includes(change.status)).map(change => String(change.targetId))))
  const catalog = computed(() => {
    const source = value(items) || []
    const creates = changes.value.filter(change => pending(change) && change.operation === 'create' && !source.some(item => String(item.id) === change.targetId))
    return [...source, ...creates.map(change => ({ id: change.targetId, ...(kind === 'worldbook' ? { name: change.title, type: change.entryType, content: '' } : { title: change.title, intent: '' }), __assistantPendingCreate: true }))]
  })
  const targetChanges = computed(() => changes.value.filter(change => change.targetId === String(value(selectedId) || '') && pending(change)))
  const receipts = computed(() => (current.value?.proposal.receipt?.changes || []).filter(change => change.kind === kind && change.targetId === String(value(selectedId) || '') && changes.value.some(item => item.changeId === change.changeId && item.status === 'adopted')))
  const frame = computed(() => {
    const input = current.value
    const id = String(value(selectedId) || '')
    if (!input || !id) return null
    const key = `${input.proposal.id}:${kind}:${id}`
    const source = (value(items) || []).find(item => String(item.id) === id) || null
    if (targetChanges.value.length) {
      // Isolate the object for a cheap, pure preview. Cross-object dependencies
      // remain on the original proposal and are checked by the adoption owner.
      const proposal = { ...input.proposal, changes: targetChanges.value.map(change => ({ ...change, dependsOn: [] })) }
      const binding = proposal.receipt?.worldbookId ?? proposal.worldbookId
      const book = { id: proposal.bookId, worldbookId: binding || '', chapters: [], outlineNodes: kind === 'outline' && source ? [source] : [] }
      try {
        const result = applyAssistantProposal(proposal, { book, worldbook: kind === 'worldbook' && binding ? { id: binding, entries: source ? [source] : [], sourceDocuments: [] } : null })
        const after = (kind === 'worldbook' ? result.worldbook?.entries : result.book.outlineNodes)?.find(item => String(item.id) === id)
        return { before: source, after, pending: true, key, busy: input.busy, error: input.error || '' }
      } catch (error) { return { before: source, after: source, pending: true, key, busy: input.busy, error: error.message } }
    }
    if (!source || !receipts.value.length || input.proposal.reviewedTargets?.includes(`${kind}:${id}`)) return null
    // Later manual edits are not assistant changes; never label them as such.
    const latest = new Map(receipts.value.filter(change => !change.created).map(change => [change.field, change]))
    if ([...latest.values()].some(change => change.details && entryDetailsSnapshot(source) !== change.appliedDetails)) return null
    if ([...latest.values()].some(change => String(source[change.field] || '') !== change.applied)) return null
    let before = { ...source, metadata: { ...(source.metadata || {}) } }
    for (const change of [...receipts.value].reverse()) {
      if (change.created) { before = null; break }
      before[change.field] = change.baseline
      if (change.beforeDetails) {
        for (const key of ['aliases', 'profile', 'relations', 'links', 'sourceRefs']) delete before[key]
        Object.assign(before, JSON.parse(change.beforeDetails))
      }
      if (Object.hasOwn(change, 'beforeCharacterProfile')) {
        if (change.hadCharacterProfile) before.metadata.characterProfile = change.beforeCharacterProfile
        else delete before.metadata.characterProfile
      }
    }
    return { before, after: source, pending: false, key, busy: input.busy, error: input.error || '' }
  })
  function field(read) {
    const input = frame.value
    if (!input) return null
    const before = input.before ? String(read(input.before) || '') : ''
    const after = input.after ? String(read(input.after) || '') : ''
    if (before === after) return null
    const diff = buildWritingCandidateDiff(before, after)
    const additions = diff.after.filter(part => part.type === 'add')
    return diff.before.some(part => part.type === 'remove')
      ? diff.before.flatMap(part => part.type === 'remove' ? [part, ...additions] : [part])
      : diff.after
  }
  function act(action) {
    if (!frame.value || frame.value.busy) return
    if (action === 'done') { emit({ action, kind, targetId: String(value(selectedId) || '') }); return }
    emit({ action, ...(action === 'undo' ? {} : { changeIds: targetChanges.value.map(change => change.changeId) }) })
  }
  return { catalog, relatedIds, state: frame, field, act }
}
