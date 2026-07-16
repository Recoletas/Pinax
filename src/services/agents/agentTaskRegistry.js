const AGENT_TASK_SCHEMA_VERSION = 1

const RESULT_MODES = Object.freeze({
  SUGGESTIONS: 'suggestions',
  STRUCTURED_DRAFT: 'structured-draft',
  TEXT_PATCH: 'text-patch',
  RUNTIME_CANDIDATE: 'runtime-candidate',
  GENERATION_REQUEST: 'generation-request'
})

const LEGACY_ALIASES = Object.freeze({
  'advisor.fix.selection': 'writing.fix.selection',
  'advisor.fix.paragraph': 'writing.fix.paragraph',
  'advisor.close.thread': 'writing.close.thread',
  'advisor.review.chapter': 'writing.chapter.health',
  'advisor.continue.light': 'writing.continue.light'
})

const TASK_DEFINITIONS = Object.freeze([
  {
    id: 'worldbook.import.structure',
    taskType: 'worldbook.import.structure',
    surfaces: ['worldbook'],
    intent: 'parse-structure',
    contextPolicy: 'worldbook-import',
    resultMode: RESULT_MODES.STRUCTURED_DRAFT,
    capabilities: ['text']
  },
  {
    id: 'worldbook.geography.review',
    taskType: 'worldbook.geography.review',
    surfaces: ['worldbook'],
    intent: 'review-consistency',
    contextPolicy: 'worldbook-geography',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'worldbook.history.draft',
    taskType: 'worldbook.history.draft',
    surfaces: ['worldbook'],
    intent: 'generate-draft',
    contextPolicy: 'worldbook-history',
    resultMode: RESULT_MODES.STRUCTURED_DRAFT,
    capabilities: ['text']
  },
  {
    id: 'experience.next-actions',
    taskType: 'experience.next-actions',
    surfaces: ['experience'],
    intent: 'generate-options',
    contextPolicy: 'experience-turn',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'experience.emergence',
    taskType: 'experience.emergence',
    surfaces: ['experience'],
    intent: 'generate-events',
    contextPolicy: 'experience-state',
    resultMode: RESULT_MODES.RUNTIME_CANDIDATE,
    capabilities: ['text']
  },
  {
    id: 'experience.memory.compress',
    taskType: 'experience.memory.compress',
    surfaces: ['experience'],
    intent: 'compress-memory',
    contextPolicy: 'experience-memory',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'writing.continue',
    taskType: 'writing.continue',
    surfaces: ['writing'],
    intent: 'generate-prose',
    contextPolicy: 'writing-chapter',
    resultMode: RESULT_MODES.TEXT_PATCH,
    capabilities: ['text']
  },
  {
    id: 'writing.rewrite',
    taskType: 'writing.rewrite',
    surfaces: ['writing'],
    intent: 'rewrite-text',
    contextPolicy: 'writing-selection',
    resultMode: RESULT_MODES.TEXT_PATCH,
    capabilities: ['text']
  },
  {
    id: 'writing.review',
    taskType: 'writing.review',
    surfaces: ['writing'],
    intent: 'review-text',
    contextPolicy: 'writing-chapter',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'canvas.organize',
    taskType: 'canvas.organize',
    surfaces: ['canvas'],
    intent: 'suggest-layout',
    contextPolicy: 'canvas-selection',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'canvas.relate',
    taskType: 'canvas.relate',
    surfaces: ['canvas'],
    intent: 'suggest-relations',
    contextPolicy: 'canvas-selection',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'media.illustration.prompt',
    taskType: 'media.illustration.prompt',
    surfaces: ['canvas'],
    intent: 'generate-prompt',
    contextPolicy: 'canvas-character',
    resultMode: RESULT_MODES.GENERATION_REQUEST,
    capabilities: ['text']
  },
  {
    id: 'storyboard.generate',
    taskType: 'storyboard.generate',
    surfaces: ['storyboard'],
    intent: 'generate-storyboard',
    contextPolicy: 'storyboard-chapter',
    resultMode: RESULT_MODES.STRUCTURED_DRAFT,
    capabilities: ['text']
  },
  {
    id: 'storyboard.review',
    taskType: 'storyboard.review',
    surfaces: ['storyboard'],
    intent: 'review-continuity',
    contextPolicy: 'storyboard-version',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'storyboard.video.prompt',
    taskType: 'storyboard.video.prompt',
    surfaces: ['storyboard'],
    intent: 'generate-video-prompt',
    contextPolicy: 'storyboard-shot',
    resultMode: RESULT_MODES.GENERATION_REQUEST,
    capabilities: ['text']
  },
  {
    id: 'comic.adapt',
    taskType: 'comic.adapt',
    surfaces: ['comic'],
    intent: 'adapt-to-page',
    contextPolicy: 'comic-beat',
    resultMode: RESULT_MODES.STRUCTURED_DRAFT,
    capabilities: ['text']
  },
  {
    id: 'comic.visual-bible',
    taskType: 'comic.visual-bible',
    surfaces: ['comic'],
    intent: 'build-guide',
    contextPolicy: 'comic-visual',
    resultMode: RESULT_MODES.STRUCTURED_DRAFT,
    capabilities: ['text']
  },
  {
    id: 'comic.panel.compose',
    taskType: 'comic.panel.compose',
    surfaces: ['comic'],
    intent: 'compose-panel',
    contextPolicy: 'comic-panel',
    resultMode: RESULT_MODES.STRUCTURED_DRAFT,
    capabilities: ['text']
  },
  {
    id: 'advisor.general',
    taskType: 'advisor.general',
    surfaces: ['advisor'],
    intent: 'general-advice',
    contextPolicy: 'advisor-global',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'advisor.explain',
    taskType: 'advisor.explain',
    surfaces: ['advisor'],
    intent: 'explain-content',
    contextPolicy: 'advisor-global',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  }
])

const EXTENDED_WRITING_TASKS = Object.freeze([
  {
    id: 'writing.fix.selection',
    taskType: 'writing.fix.selection',
    surfaces: ['writing'],
    intent: 'fix-selection',
    contextPolicy: 'writing-selection',
    resultMode: RESULT_MODES.TEXT_PATCH,
    capabilities: ['text']
  },
  {
    id: 'writing.fix.paragraph',
    taskType: 'writing.fix.paragraph',
    surfaces: ['writing'],
    intent: 'fix-paragraph',
    contextPolicy: 'writing-paragraph',
    resultMode: RESULT_MODES.TEXT_PATCH,
    capabilities: ['text']
  },
  {
    id: 'writing.continue.light',
    taskType: 'writing.continue.light',
    surfaces: ['writing'],
    intent: 'continue-light',
    contextPolicy: 'writing-cursor',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'writing.close.thread',
    taskType: 'writing.close.thread',
    surfaces: ['writing'],
    intent: 'close-thread',
    contextPolicy: 'writing-chapter',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'writing.chapter.health',
    taskType: 'writing.chapter.health',
    surfaces: ['writing'],
    intent: 'review-health',
    contextPolicy: 'writing-chapter',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  },
  {
    id: 'writing.generate.from-asset',
    taskType: 'writing.generate.from-asset',
    surfaces: ['writing'],
    intent: 'generate-from-asset',
    contextPolicy: 'writing-reference',
    resultMode: RESULT_MODES.TEXT_PATCH,
    capabilities: ['text']
  },
  {
    id: 'writing.extract.to-asset',
    taskType: 'writing.extract.to-asset',
    surfaces: ['writing'],
    intent: 'extract-to-asset',
    contextPolicy: 'writing-selection',
    resultMode: RESULT_MODES.SUGGESTIONS,
    capabilities: ['text']
  }
])

const ALL_REGISTERED_TASKS = Object.freeze([
  ...TASK_DEFINITIONS,
  ...EXTENDED_WRITING_TASKS
])

const resolvers = new Map()
for (const def of ALL_REGISTERED_TASKS) {
  resolvers.set(def.id, def)
  resolvers.set(def.taskType, def)
}

const aliasMap = new Map(Object.entries(LEGACY_ALIASES))

export { RESULT_MODES, LEGACY_ALIASES }

export function getTask(id) {
  if (!id) return null
  const direct = resolvers.get(id)
  if (direct) return direct
  const resolved = aliasMap.get(id)
  if (resolved) return resolvers.get(resolved) || null
  return null
}

export function getTasksBySurface(surface) {
  const normalized = String(surface || '').trim()
  if (!normalized) return []
  return ALL_REGISTERED_TASKS.filter((t) => t.surfaces.includes(normalized))
}

export function validateTaskType(taskType) {
  if (!taskType) return { valid: false, reason: 'missing-task-type' }
  const canonical = resolveTaskType(taskType)
  if (!canonical) return { valid: false, reason: 'unknown-task-type' }
  return { valid: true, canonical }
}

export function resolveTaskType(taskType) {
  if (!taskType) return null
  const direct = resolvers.get(taskType)
  if (direct) return direct.taskType
  const resolved = aliasMap.get(taskType)
  if (resolved) return resolved
  return null
}

export function registerTask(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new Error('registerTask requires a task definition object')
  }
  if (!definition.id) throw new Error('Task definition missing id')
  if (!definition.taskType) throw new Error('Task definition missing taskType')
  if (resolvers.has(definition.id) || resolvers.has(definition.taskType)) {
    throw new Error(`Task type already registered: ${definition.taskType}`)
  }
  resolvers.set(definition.id, definition)
  resolvers.set(definition.taskType, definition)
  return definition
}

export function getAllTaskTypes() {
  return ALL_REGISTERED_TASKS.map((t) => t.taskType)
}

export function getTaskByLegacyAlias(legacyName) {
  const resolved = aliasMap.get(legacyName)
  if (!resolved) return null
  return resolvers.get(resolved) || null
}

export function isLegacyAlias(taskType) {
  return aliasMap.has(taskType)
}

export const TASK_SCHEMA_VERSION = AGENT_TASK_SCHEMA_VERSION
