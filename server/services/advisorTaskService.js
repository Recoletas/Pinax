export const ADVISOR_TASK_MODES = {
  'advisor.fix.selection': 'replace',
  'advisor.fix.paragraph': 'replace',
  'advisor.close.thread': 'closure',
  'advisor.review.chapter': 'review',
  'advisor.continue.light': 'continue'
}

export function normalizeAdvisorTaskType(taskType) {
  const value = String(taskType || '').trim()
  return value || 'advisor.review.chapter'
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

  return {
    task: taskType,
    mode: base.mode || ADVISOR_TASK_MODES[taskType] || 'review',
    summary: base.summary || advice || '未获取到有效建议',
    replacement: typeof base.replacement === 'string' ? base.replacement : '',
    issues: Array.isArray(base.issues) ? base.issues : [],
    action: Array.isArray(base.action) ? base.action : [],
    stalePolicy: base.stalePolicy || 'require-same-base-text'
  }
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
    return result.summary || '已生成可应用修改'
  }
  return result.summary || rawAdvice || '未获取到有效建议'
}

export function createAdvisorTaskResponse({ taskType, advice, target = null } = {}) {
  const normalizedTaskType = normalizeAdvisorTaskType(taskType)
  const result = attachTargetMetadata(buildAdvisorResult(normalizedTaskType, advice), target)

  return {
    taskType: normalizedTaskType,
    advice: formatAdvice(advice, result),
    rawAdvice: advice,
    result
  }
}
