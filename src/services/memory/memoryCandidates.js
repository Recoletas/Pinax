import { getItem, STORAGE_KEYS } from '../../composables/useStorage'
import { commitMemorySnapshot, publicMemoryCandidate } from './memoryHistoryStore'
import { createMemoryCandidateRepository } from '@pinax/core/memory/memoryCandidates'
export const { MEMORY_KINDS, MEMORY_SCOPES, MEMORY_STATUSES, MEMORY_SYNC_STATUSES, listMemoryCandidates, createMemoryCandidate, queueMemoryCandidate, invalidateMemoryBySource, supersedeMemoryCandidates, updateMemoryCandidate, confirmMemoryCandidate, rejectMemoryCandidate, archiveMemoryCandidate, restoreMemoryCandidate, replaceMemoryCandidateConflicts, mergeMemoryCandidateConflicts, batchArchiveMemoryCandidates, batchUpdateMemoryCandidateScope, listScopedActiveMemoryCandidates, MEMORY_RECALL_PREVIEW_LIMIT, rankScopedActiveMemoryCandidates, buildScopedMemoryContext, buildScopedMemoryRecallContext, getMemoryKindLabel, getMemoryScopeLabel, getMemorySyncStatusLabel, findDuplicateMemoryCandidate, findSimilarMemoryCandidate, findConflictingMemoryCandidates, createMemoryContentHash } = createMemoryCandidateRepository({ getItem, memoryKey: STORAGE_KEYS.MEMORY_CANDIDATES, commitMemorySnapshot, publicMemoryCandidate, emitCandidate: detail => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('memory-candidate-created', { detail })) } })

// Opening the history panel only needs a snapshot write for candidates
// that predate revision tracking. A current shelf may already have an
// outbox to drain, which is handled independently by flushMemoryHistory.
export function ensureCandidateHistoryBaselines() {
  const candidates = listMemoryCandidates()
  const stored = getItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  if (!Array.isArray(stored) || !stored.some(item => !item._historyHead)) return true
  return commitMemorySnapshot(candidates)
}
