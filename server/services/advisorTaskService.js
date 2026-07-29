import { validateServerTaskType, isNewEnvelopePayload } from './agentTaskAllowlist.js'
import { validateWritingReplacement } from '../../shared/writingReplacementContract.js'

export const ADVISOR_TASK_MODES = {
  'writing.fix.selection': 'replace',
  'writing.fix.paragraph': 'replace',
  'writing.close.thread': 'closure',
  'writing.chapter.health': 'review',
  'writing.continue.light': 'continue',
  'materials.refine': 'replace',
  'materials.classify': 'review',
  'materials.split': 'review',
  'materials.relate': 'review',
  'canvas.organize': 'review',
  'canvas.relate': 'review',
  'canvas.transition': 'review',
  'experience.next-actions': 'review',
  'experience.emergence': 'review',
  'storyboard.review': 'review',
  'storyboard.video.prompt': 'review'
}

export function validateAdvisorTaskType(taskType) {
  const validation = validateServerTaskType(taskType)
  if (!validation.valid) return null
  return validation.taskType
}

export function normalizeAdvisorTaskType(taskType) {
  return validateAdvisorTaskType(taskType)
}

function stripJsonFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

export function parseAdvisorJson(raw) {
  const text = stripJsonFence(raw)
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function normalizeTargetRange(target) {
  const range = target?.range
  if (!range || typeof range !== 'object') return null

  const start = Number(range.start)
  const end = Number(range.end)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null

  return {
    start: Math.max(0, Math.floor(Math.min(start, end))),
    end: Math.max(0, Math.floor(Math.max(start, end)))
  }
}

function parseSectionedAdvice(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return null

  const sections = { summary: [], issues: [], action: [] }
  let current = ''

  const normalizeHeader = (line) => line
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/[:：]$/, '')
    .trim()
    .toLowerCase()

  for (const line of lines) {
    const normalized = normalizeHeader(line)
    if (normalized === 'summary' || normalized === '摘要') {
      current = 'summary'
      continue
    }
    if (normalized === 'issues' || normalized === '问题') {
      current = 'issues'
      continue
    }
    if (normalized === 'action' || normalized === '动作' || normalized === '建议') {
      current = 'action'
      continue
    }
    if (!current) continue
    sections[current].push(line.replace(/^[-*\d.\s]+/, ''))
  }

  if (!sections.summary.length && !sections.issues.length && !sections.action.length) {
    return null
  }

  return {
    summary: sections.summary.join(' ').slice(0, 80) || raw.slice(0, 80),
    issues: sections.issues.slice(0, 3).map((message) => ({
      type: 'review',
      severity: 'medium',
      message
    })),
    action: sections.action.slice(0, 3)
  }
}

function buildAdvisorResult(taskType, advice) {
  const parsed = parseAdvisorJson(advice)
  const sectioned = parseSectionedAdvice(advice)
  const base = parsed && typeof parsed === 'object'
    ? parsed
    : (sectioned || {})

  const result = {
    task: taskType,
    mode: base.mode || ADVISOR_TASK_MODES[taskType] || 'review',
    summary: base.summary || advice || '未获取到有效建议',
    replacement: typeof base.replacement === 'string' ? base.replacement : '',
    typedActions: Array.isArray(base.actions)
      ? base.actions.filter((action) => action && typeof action === 'object')
      : [],
    issues: Array.isArray(base.issues) ? base.issues : [],
    action: Array.isArray(base.action) ? base.action : [],
    stalePolicy: base.stalePolicy || 'require-same-base-text'
  }

  if (result.mode === 'replace') {
    const validation = validateWritingReplacement(result.replacement)
    if (!validation.valid) {
      const error = new Error('模型没有返回可应用的正文，请重新生成')
      error.code = 'AGENT_REPLACEMENT_INVALID'
      error.retryable = true
      throw error
    }
    result.replacement = validation.text
  }

  return result
}

function attachTargetMetadata(result, target) {
  if (!result || typeof result !== 'object') return result

  const targetRange = result.targetRange || normalizeTargetRange(target)
  const baseText = typeof result.baseText === 'string'
    ? result.baseText
    : (typeof target?.text === 'string' ? target.text : '')

  return {
    ...result,
    targetRange,
    baseText
  }
}

function formatAdvice(rawAdvice, result) {
  if (!result || typeof result !== 'object') return rawAdvice || '未获取到有效建议'
  if (result.replacement) {
    if (result.task === 'writing.continue.light') return result.replacement
    return result.summary || '已生成可应用修改'
  }
  return result.summary || rawAdvice || '未获取到有效建议'
}

export function createAdvisorTaskResponse({ taskType, advice, target = null, meta = null } = {}) {
  const normalizedTaskType = normalizeAdvisorTaskType(taskType)
  const result = attachTargetMetadata(buildAdvisorResult(normalizedTaskType, advice), target)

  return {
    taskType: normalizedTaskType,
    advice: formatAdvice(advice, result),
    rawAdvice: advice,
    result,
    meta
  }
}
