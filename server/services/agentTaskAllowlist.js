const ALLOWED_TASK_TYPES = Object.freeze([
  'worldbook.import.structure',
  'worldbook.geography.review',
  'worldbook.history.draft',
  'experience.next-actions',
  'experience.emergence',
  'experience.memory.compress',
  'writing.continue',
  'writing.rewrite',
  'writing.review',
  'writing.fix.selection',
  'writing.fix.paragraph',
  'writing.continue.light',
  'writing.close.thread',
  'writing.chapter.health',
  'writing.generate.from-asset',
  'writing.extract.to-asset',
  'canvas.organize',
  'canvas.relate',
  'media.illustration.prompt',
  'storyboard.generate',
  'storyboard.review',
  'storyboard.video.prompt',
  'comic.adapt',
  'comic.visual-bible',
  'comic.panel.compose',
  'advisor.general',
  'advisor.explain',
  'advisor.fix.selection',
  'advisor.fix.paragraph',
  'advisor.close.thread',
  'advisor.review.chapter',
  'advisor.continue.light'
])

const LEGACY_ALIASES = Object.freeze({
  'advisor.fix.selection': 'writing.fix.selection',
  'advisor.fix.paragraph': 'writing.fix.paragraph',
  'advisor.close.thread': 'writing.close.thread',
  'advisor.review.chapter': 'writing.chapter.health',
  'advisor.continue.light': 'writing.continue.light'
})

export function validateServerTaskType(taskType) {
  if (!taskType || typeof taskType !== 'string') {
    return { valid: false, reason: 'missing-task-type' }
  }

  const trimmed = taskType.trim()
  if (ALLOWED_TASK_TYPES.includes(trimmed)) {
    return { valid: true, taskType: trimmed }
  }

  const resolved = LEGACY_ALIASES[trimmed]
  if (resolved && ALLOWED_TASK_TYPES.includes(resolved)) {
    return { valid: true, taskType: resolved, wasLegacyAlias: true }
  }

  return { valid: false, reason: `unknown-task-type: ${trimmed}` }
}

export function isNewEnvelopePayload(body) {
  return Boolean(
    body && typeof body === 'object'
    && body.envelope
    && typeof body.envelope === 'object'
    && body.envelope.version != null
  )
}

export function isLegacyPayload(body) {
  return Boolean(
    body && typeof body === 'object'
    && !body.envelope
    && (body.context || body.question)
  )
}
