import { validateServerTaskType, isNewEnvelopePayload } from './agentTaskAllowlist.js'
import { validateWritingReplacement } from '../../shared/writingReplacementContract.js'
import { normalizeWritingCandidates } from '../../shared/writingCandidateContract.js'
import { normalizeWritingReviewFindings } from '../../shared/writingReviewContract.js'
import { normalizeRehearsalConsequences } from '../../shared/authoringRehearsalConsequenceContract.js'

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
  'authoring.scene.directions': 'review',
  'authoring.knowledge.query': 'review',
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

// 服务端结果模板历史上按旧任务键维护；canonical 任务通过该映射复用同族模板。
const CANONICAL_TASK_TEMPLATE_KEYS = Object.freeze({
  'authoring.rewrite': 'writing.fix.selection',
  'authoring.review.selection': 'writing.close.thread',
  'authoring.review.chapter': 'writing.chapter.health',
  'authoring.complete.inline': 'writing.continue.light',
  'authoring.next-actions': 'experience.next-actions',
  'authoring.emergence': 'experience.emergence',
  // 统一创作命令链：九个 Authoring 命令全部可路由到既有同族模板。
  'authoring.continue': 'writing.continue.light',
  'authoring.advance': 'writing.continue.light',
  'authoring.simulate.character': 'writing.continue.light',
  'authoring.simulate.scene': 'writing.continue.light',
  'authoring.insert': 'writing.continue.light',
  'authoring.dialogue-options': 'experience.next-actions'
})

function resolveTaskTemplateKey(taskType) {
  return CANONICAL_TASK_TEMPLATE_KEYS[taskType] || taskType
}

export function resolveServerTaskTemplateKey(taskType) {
  return resolveTaskTemplateKey(taskType)
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

function buildAdvisorResult(taskType, advice, options = {}) {
  taskType = resolveTaskTemplateKey(taskType)
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

  if (taskType === 'authoring.rehearsal.step') {
    // 后果批次用共享合同归一化：quote 对请求时捕获的原文强校验，
    // ref/factKey/commitmentKey 只认授权清单。非法批次整批不提交，
    // 保留 issues 以便客户端按“待核对”呈现，不静默丢 delta。
    const verification = options.rehearsalVerification && typeof options.rehearsalVerification === 'object'
      ? options.rehearsalVerification
      : {}
    const parsedResponse = typeof base.response === 'string' ? base.response : ''
    const batch = normalizeRehearsalConsequences(base.consequences, {
      allowedRefs: verification.allowedRefs,
      allowedFactKeys: verification.allowedFactKeys,
      knownCommitments: verification.knownCommitments,
      allowedEvidenceRefs: verification.allowedEvidenceRefs,
      authorizedItems: verification.authorizedItems,
      sceneLocationRef: verification.sceneLocationRef,
      actionText: verification.actionText,
      responseText: parsedResponse
    })
    result.rehearsal = {
      response: base.response,
      change: base.change,
      choices: base.choices,
      evidenceRefs: base.evidenceRefs,
      consequences: batch.consequences,
      consequenceVersion: batch.version,
      consequenceStatus: batch.ok ? 'committed' : 'needs-review',
      consequenceIssues: batch.issues
    }
    result.typedActions = []
    result.action = []
    result.replacement = ''
  }

  if (taskType === 'authoring.knowledge.query') {
    result.knowledgeAnswer = {
      answer: typeof base.answer === 'string' ? base.answer : (base.summary || ''),
      claims: Array.isArray(base.claims) ? base.claims : [],
      missingInformation: Array.isArray(base.missingInformation) ? base.missingInformation : [],
      calculations: Array.isArray(base.calculations) ? base.calculations : []
    }
    result.summary = result.knowledgeAnswer.answer || '当前资料中没有找到足够依据。'
    result.typedActions = []
    result.action = []
  }

  if (taskType === 'writing.fix.selection' || taskType === 'writing.fix.paragraph') {
    result.candidates = normalizeWritingCandidates(base.candidates, {
      text: result.replacement,
      resultId: taskType,
      baseText: result.baseText || options.targetBaseText,
      targetRange: result.targetRange,
      blocks: options.targetBlocks,
      multiBlock: Boolean(options.multiBlock),
      lockedSegments: options.lockedSegments
    })
  }

  if (taskType === 'writing.chapter.health' && options.chapterReview) {
    const reviewTarget = options.reviewTarget && typeof options.reviewTarget === 'object'
      ? options.reviewTarget
      : {}
    result.findings = normalizeWritingReviewFindings(base.findings, {
      blocks: options.reviewBlocks,
      maxFindings: 8,
      projectId: options.projectId || reviewTarget.projectId,
      documentRole: options.documentRole || reviewTarget.documentRole,
      documentId: options.documentId || reviewTarget.documentId,
      chapterId: options.chapterId || reviewTarget.chapterId,
      documentRevision: options.documentRevision || reviewTarget.documentRevision,
      allowedEvidenceRefs: options.allowedEvidenceRefs,
      source: 'model'
    })
    result.issues = result.findings.map((finding) => ({
      type: 'review-finding',
      severity: finding.severity,
      message: finding.reason,
      kind: finding.kind,
      issueType: finding.issueType,
      evidenceRefs: finding.evidenceRefs,
      nodeIds: finding.nodeIds
    }))
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

  if ((taskType === 'writing.fix.selection' || taskType === 'writing.fix.paragraph')
    && result.mode === 'candidates'
    && !result.candidates?.length) {
    const error = new Error('模型返回的候选没有实际修改正文，请调整批注要求后重试')
    error.code = 'AGENT_CANDIDATES_UNCHANGED'
    error.retryable = true
    throw error
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

export function createAdvisorTaskResponse({ taskType, advice, target = null, meta = null, options = {} } = {}) {
  const normalizedTaskType = normalizeAdvisorTaskType(taskType)
  const result = attachTargetMetadata(buildAdvisorResult(normalizedTaskType, advice, {
    ...options,
    targetBaseText: typeof target?.text === 'string' ? target.text : ''
  }), target)

  return {
    taskType: normalizedTaskType,
    advice: formatAdvice(advice, result),
    rawAdvice: advice,
    result,
    meta
  }
}
