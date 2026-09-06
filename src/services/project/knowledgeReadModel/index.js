/**
 * knowledgeReadModel — public entry (v1, offline candidate).
 *
 * Read-only, in-process knowledge query capability. The trusted application
 * boundary assembles an authorized frozen snapshot and calls queryKnowledge.
 * Nothing here writes, switches worldbooks, calls providers, or registers
 * provider tools. Integration into product flows is I0's job — this module
 * has zero production importers by design (night track K, 2026-09-05).
 */

export {
  KNOWLEDGE_LIMITS,
  KNOWLEDGE_READ_MODEL_SCHEMA_VERSION,
  KNOWLEDGE_STATUSES,
  QUESTION_KINDS,
  ENTITY_KINDS,
  TIME_PRECISIONS,
  SOURCE_KINDS,
  REASON_CODES,
  freezeKnowledgeSnapshot,
  hashValue,
  hashText,
  stableStringify,
  fingerprintParts,
  normalizeKnowledgeRequest,
  validateKnowledgeContext
} from './contract.js'

export {
  queryKnowledge,
  createKnowledgeScope
} from './query.js'

export {
  deriveTimelineFromGeoHistory
} from './sourceAdapters.js'
