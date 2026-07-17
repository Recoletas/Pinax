export {
  RESULT_MODES,
  LEGACY_ALIASES,
  getTask,
  getTasksBySurface,
  validateTaskType,
  resolveTaskType,
  registerTask,
  getAllTaskTypes,
  getTaskByLegacyAlias,
  isLegacyAlias,
  TASK_SCHEMA_VERSION
} from './agentTaskRegistry'

export {
  BLOCK_KINDS,
  DEFAULT_BLOCK_PRIORITIES,
  CONTEXT_ENVELOPE_SCHEMA_VERSION,
  buildContextEnvelope,
  addBlock,
  addSystemBlock,
  addSelectionBlock,
  addSceneBlock,
  addRawBlock,
  clipContextEnvelope,
  toPromptText
} from './agentContextEnvelope'

export {
  RESULT_SCHEMA_VERSION,
  RESULT_STATUSES,
  SUGGESTION_TYPES,
  ACTION_TYPES,
  SIDE_EFFECT_TYPES,
  createPendingResult,
  markCompleted,
  markFailed,
  markStale,
  markApplied,
  markDismissed,
  acknowledgeApply,
  isActive,
  canApply,
  canDismiss,
  needsAcknowledge,
  extractTextPatch,
  extractSuggestions,
  extractGenerationRequest
} from './agentResultLifecycle'

export {
  adaptLegacyContextToEnvelope,
  adaptLegacyResultToAgentResult,
  adaptAgentResultToLegacy
} from './legacyAdapter'
