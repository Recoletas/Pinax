import { createSourceArchiveRepository } from '@pinax/core/worldbook/sourceArchiveRepository'
import { createBrowserSourceArchiveStore } from './browserSourceArchiveStore.js'

const archiveStore = createBrowserSourceArchiveStore()
export const readReferencedSourceArtifacts = archiveStore.readReferencedArtifacts
export const countSourceArchiveRecords = archiveStore.countRecords
export const readSourceArchiveRestoreMatches = archiveStore.readRestoreMatches

export const { SOURCE_ARCHIVE_SCHEMA_VERSION, SOURCE_ARCHIVE_DB_NAME, SOURCE_ARCHIVE_DB_VERSION, SOURCE_ARCHIVE_CAPACITY_BYTES, SOURCE_ARCHIVE_WARNING_BYTES, SOURCE_PARSE_SLOW_THRESHOLD_MS, SOURCE_ARCHIVE_STORES, normalizeSourceText, hashSourceText, hashSourceTextSha256, buildWorkId, buildSourceChunks, createFileInstanceId, normalizeSourceArtifact, buildSourceArchiveBundle, dedupeSourceChunks, createCreationWorkspace, assertArchiveCapacity, saveSourceArchiveBundle, archiveSourceDocuments, saveCreationWorkspace, loadCreationWorkspace, loadSourceArtifacts, loadSourceChunks, findSourceArtifactByContentHash, loadAllSourceArchiveRecords, restoreSourceArchiveRecords, replaceAllSourceArchiveRecords, estimateSourceArchiveUsage, deleteSourceArchiveArtifacts, cleanupUnreferencedSourceArtifacts, deleteCreationWorkspace, CHAPTER_CONFIDENCES, CHAPTER_DETECTION_BASIS } = createSourceArchiveRepository({
  archiveStore,
  idFactory: () => typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
})

/** Undo only rows installed by the restore, leaving later edits intact. */
export async function undoSourceArchiveRestore(records, previous) {
  const changes = {}, expected = {}
  for (const [store, items] of Object.entries(records)) {
    changes[store] = { put: [], delete: [] }
    expected[store] = new Map(items.map(item => [item.id, item]))
    for (const item of items) {
      const prior = previous[store].get(item.id)
      if (prior) changes[store].put.push(prior)
      else changes[store].delete.push(item.id)
    }
  }
  const result = await archiveStore.write(changes, { expected, skipConflicts: true })
  if (result.conflicts) throw new Error('部分归档记录在恢复后已修改，保留较新的编辑')
}
