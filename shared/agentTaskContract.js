export const AGENT_TASK_ERROR_CODES = Object.freeze({
  MISSING: 'AGENT_TASK_MISSING',
  UNKNOWN: 'AGENT_TASK_UNKNOWN',
  UNAVAILABLE: 'AGENT_TASK_UNAVAILABLE'
})

export const LEGACY_AGENT_TASK_ALIASES = Object.freeze({
  'advisor.fix.selection': 'writing.fix.selection',
  'advisor.fix.paragraph': 'writing.fix.paragraph',
  'advisor.close.thread': 'writing.close.thread',
  'advisor.review.chapter': 'writing.chapter.health',
  'advisor.continue.light': 'writing.continue.light'
})

export const DECLARED_AGENT_TASK_TYPES = Object.freeze([
  'worldbook.import.structure',
  'worldbook.geography.review',
  'worldbook.history.draft',
  'experience.next-actions',
  'experience.emergence',
  'experience.memory.compress',
  'writing.continue',
  'writing.rewrite',
  'writing.review',
  'canvas.organize',
  'canvas.relate',
  'canvas.transition',
  'media.illustration.prompt',
  'storyboard.generate',
  'storyboard.review',
  'storyboard.video.prompt',
  'comic.adapt',
  'comic.visual-bible',
  'comic.panel.compose',
  'advisor.general',
  'advisor.explain',
  'writing.fix.selection',
  'writing.fix.paragraph',
  'writing.continue.light',
  'writing.close.thread',
  'writing.chapter.health',
  'writing.generate.from-asset',
  'writing.extract.to-asset',
  'materials.refine',
  'materials.classify',
  'materials.split',
  'materials.relate'
])

export const EXECUTABLE_AGENT_TASKS = Object.freeze([
  {
    taskType: 'writing.fix.selection',
    owner: 'writing',
    resultMode: 'text-patch',
    actionTypes: ['text-patch'],
    capability: 'text',
    surfaces: ['writing'],
    targetTypes: ['selection'],
    requiresRevision: true,
    maxContextChars: 12000
  },
  {
    taskType: 'writing.fix.paragraph',
    owner: 'writing',
    resultMode: 'text-patch',
    actionTypes: ['text-patch'],
    capability: 'text',
    surfaces: ['writing'],
    targetTypes: ['paragraph'],
    requiresRevision: true,
    maxContextChars: 14000
  },
  {
    taskType: 'writing.continue.light',
    owner: 'writing',
    resultMode: 'suggestions',
    actionTypes: [],
    capability: 'text',
    surfaces: ['writing'],
    requiresRevision: true,
    maxContextChars: 12000
  },
  {
    taskType: 'writing.close.thread',
    owner: 'writing',
    resultMode: 'suggestions',
    actionTypes: [],
    capability: 'text',
    surfaces: ['writing'],
    requiresRevision: true,
    maxContextChars: 16000
  },
  {
    taskType: 'writing.chapter.health',
    owner: 'writing',
    resultMode: 'suggestions',
    actionTypes: [],
    capability: 'text',
    surfaces: ['writing'],
    requiresRevision: true,
    maxContextChars: 20000
  },
  {
    taskType: 'materials.refine',
    owner: 'materials',
    resultMode: 'text-patch',
    actionTypes: ['text-patch'],
    capability: 'text',
    surfaces: ['materials'],
    targetTypes: ['asset'],
    requiresRevision: true,
    maxContextChars: 12000
  },
  {
    taskType: 'materials.classify',
    owner: 'materials',
    resultMode: 'material-actions',
    actionTypes: ['material-classification'],
    capability: 'text',
    surfaces: ['materials'],
    targetTypes: ['asset-selection'],
    requiresRevision: true,
    maxContextChars: 12000
  },
  {
    taskType: 'materials.split',
    owner: 'materials',
    resultMode: 'material-actions',
    actionTypes: ['material-split'],
    capability: 'text',
    surfaces: ['materials'],
    targetTypes: ['asset'],
    requiresRevision: true,
    maxContextChars: 12000
  },
  {
    taskType: 'materials.relate',
    owner: 'materials',
    resultMode: 'material-actions',
    actionTypes: ['material-relations'],
    capability: 'text',
    surfaces: ['materials'],
    targetTypes: ['asset-selection'],
    requiresRevision: true,
    maxContextChars: 14000
  },
  {
    taskType: 'canvas.organize',
    owner: 'canvas',
    resultMode: 'canvas-actions',
    actionTypes: ['canvas-layout'],
    capability: 'text',
    surfaces: ['canvas'],
    targetTypes: ['canvas-selection'],
    requiresRevision: true,
    maxContextChars: 14000
  },
  {
    taskType: 'canvas.relate',
    owner: 'canvas',
    resultMode: 'canvas-actions',
    actionTypes: ['canvas-relations'],
    capability: 'text',
    surfaces: ['canvas'],
    targetTypes: ['canvas-selection'],
    requiresRevision: true,
    maxContextChars: 14000
  },
  {
    taskType: 'canvas.transition',
    owner: 'canvas',
    resultMode: 'canvas-actions',
    actionTypes: ['canvas-transition'],
    capability: 'text',
    surfaces: ['canvas'],
    targetTypes: ['canvas-selection'],
    requiresRevision: true,
    maxContextChars: 14000
  },
  {
    taskType: 'experience.next-actions',
    owner: 'experience',
    resultMode: 'runtime-candidate',
    actionTypes: ['runtime-candidate'],
    capability: 'text',
    surfaces: ['experience'],
    targetTypes: ['experience-turn'],
    requiresRevision: true,
    maxContextChars: 16000
  },
  {
    taskType: 'experience.emergence',
    owner: 'experience',
    resultMode: 'runtime-candidate',
    actionTypes: ['runtime-candidate'],
    capability: 'text',
    surfaces: ['experience'],
    targetTypes: ['experience-state'],
    requiresRevision: true,
    maxContextChars: 16000
  },
  {
    taskType: 'storyboard.review',
    owner: 'storyboard',
    resultMode: 'storyboard-actions',
    actionTypes: ['storyboard-shot-patch'],
    capability: 'text',
    surfaces: ['storyboard'],
    targetTypes: ['storyboard-shot'],
    requiresRevision: true,
    maxContextChars: 12000
  },
  {
    taskType: 'storyboard.video.prompt',
    owner: 'storyboard',
    resultMode: 'generation-request',
    actionTypes: ['generation-request'],
    capability: 'text',
    surfaces: ['storyboard'],
    targetTypes: ['storyboard-shot-generation'],
    requiresRevision: true,
    maxContextChars: 12000
  }
])

const executableByType = new Map(EXECUTABLE_AGENT_TASKS.map((task) => [task.taskType, task]))

export function resolveExecutableAgentTask(taskType) {
  if (typeof taskType !== 'string' || !taskType.trim()) {
    return {
      valid: false,
      code: AGENT_TASK_ERROR_CODES.MISSING,
      reason: 'missing-task-type'
    }
  }

  const requested = taskType.trim()
  const canonical = LEGACY_AGENT_TASK_ALIASES[requested] || requested
  const definition = executableByType.get(canonical)

  if (!definition) {
    const known = DECLARED_AGENT_TASK_TYPES.includes(canonical)
    return {
      valid: false,
      code: known ? AGENT_TASK_ERROR_CODES.UNAVAILABLE : AGENT_TASK_ERROR_CODES.UNKNOWN,
      reason: known ? 'task-unavailable' : 'unknown-task-type',
      requested,
      canonical
    }
  }

  return {
    valid: true,
    requested,
    canonical,
    definition,
    wasLegacyAlias: canonical !== requested
  }
}

export function getExecutableAgentTaskTypes() {
  return EXECUTABLE_AGENT_TASKS.map((task) => task.taskType)
}
