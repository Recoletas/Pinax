import { createSourceArchiveRepository } from '@pinax/core/worldbook/sourceArchiveRepository'
import { createBrowserSourceArchiveStore } from './browserSourceArchiveStore.js'

export const { SOURCE_ARCHIVE_SCHEMA_VERSION, SOURCE_ARCHIVE_DB_NAME, SOURCE_ARCHIVE_DB_VERSION, SOURCE_ARCHIVE_CAPACITY_BYTES, SOURCE_ARCHIVE_WARNING_BYTES, SOURCE_PARSE_SLOW_THRESHOLD_MS, SOURCE_ARCHIVE_STORES, normalizeSourceText, hashSourceText, hashSourceTextSha256, buildWorkId, buildSourceChunks, createFileInstanceId, normalizeSourceArtifact, buildSourceArchiveBundle, dedupeSourceChunks, createCreationWorkspace, assertArchiveCapacity, saveSourceArchiveBundle, archiveSourceDocuments, saveCreationWorkspace, loadCreationWorkspace, loadSourceArtifacts, loadSourceChunks, findSourceArtifactByContentHash, loadAllSourceArchiveRecords, restoreSourceArchiveRecords, replaceAllSourceArchiveRecords, estimateSourceArchiveUsage, deleteSourceArchiveArtifacts, cleanupUnreferencedSourceArtifacts, deleteCreationWorkspace, CHAPTER_CONFIDENCES, CHAPTER_DETECTION_BASIS } = createSourceArchiveRepository({
  archiveStore: createBrowserSourceArchiveStore(),
  idFactory: () => typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
})
