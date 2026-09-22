import { inferWritingLanguage } from '../../../../shared/writingLanguage.js'
import {
  normalizeAuthoringReviewFindings,
  validateWritingReviewReplacement
} from '../../../../shared/writingReviewContract.js'
import {
  assessAuthoringPositionFreshness,
  buildAuthoringPositionIndex,
  compareAuthoringPositions,
  getAuthoringReviewWindows,
  resolveAuthoringPosition
} from '../../writing/authoringPositionIndex.js'
import { matchWorldbookEntries } from '../../worldbook/worldbookContextBuilder.js'
import { resolveWritingSkillMethod } from '../../../../shared/writingSkillMethodContract.js'

export const AUTHORING_REVIEW_SESSION_SCHEMA_VERSION = 1
export const AUTHORING_LOCAL_REVIEW_FINDING_LIMIT = 64

function text(value) {
  return value == null ? '' : String(value)
}

function fnv1a(source) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function unique(values) {
  return [...new Set(values.map((value) => text(value).trim()).filter(Boolean))]
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function reviewWindowBlock(entry) {
  return Object.freeze({
    projectId: entry.projectId,
    documentRole: entry.documentRole,
    documentId: entry.documentId,
    chapterId: entry.chapterId,
    documentRevision: entry.documentRevision,
    unitId: entry.unitId,
    unitRevision: entry.unitRevision,
    nodeId: entry.nodeId,
    nodeRevision: entry.nodeRevision,
    kind: entry.kind,
    text: entry.text,
    fullText: entry.fullText || entry.text,
    reviewStartOffset: Math.max(0, Number(entry.reviewStartOffset) || 0),
    order: entry.documentNodeOrder,
    sourceRefs: entry.sourceRefs
  })
}

export function getAuthoringReviewWorldbookRevision(entry = {}) {
  const id = text(entry?.id).trim()
  if (!id) return ''
  return `authoring-review-worldbook-${fnv1a(JSON.stringify({
    id,
    name: text(entry?.name || entry?.title),
    type: text(entry?.type),
    content: text(entry?.content || entry?.description || entry?.summary),
    keys: Array.isArray(entry?.keys) ? entry.keys.map(text) : [],
    keysSecondary: Array.isArray(entry?.keysSecondary) ? entry.keysSecondary.map(text) : [],
    enabled: entry?.enabled !== false,
    declaredRevision: text(entry?.revision ?? entry?.updatedAt)
  }))}`
}

function normalizeSourceRevisions(values = {}) {
  return Object.fromEntries(Object.entries(values && typeof values === 'object' ? values : {})
    .map(([key, value]) => [text(key).trim(), text(value).trim()])
    .filter(([key]) => key)
    .sort(([left], [right]) => left.localeCompare(right)))
}

function sceneEvidence(sceneProjection, target) {
  if (!sceneProjection || typeof sceneProjection !== 'object') return null
  const sourceRef = text(sceneProjection.sourceRef).trim()
    || `scene-projection:${target.documentId}:${target.unitId || 'chapter'}`
  const participants = [
    ...(sceneProjection.participants || sceneProjection.characters || sceneProjection.presentCharacters || []),
    sceneProjection.viewpointCharacter,
    sceneProjection.activeActor,
    sceneProjection.dialogueTarget
  ]
    .map((item) => text(item?.name || item?.label || item?.id || item).trim())
    .filter(Boolean)
    .filter((name, index, values) => values.indexOf(name) === index)
  const location = text(
    sceneProjection.location?.name
    || sceneProjection.location?.label
    || sceneProjection.locationName
    || sceneProjection.location
  ).trim()
  const time = text(sceneProjection.time?.label || sceneProjection.time?.value || sceneProjection.time).trim()
  const content = [
    time ? `时间：${time}` : '',
    location ? `地点：${location}` : '',
    participants.length ? `人物：${participants.join('、')}` : ''
  ].filter(Boolean).join('\n')
  if (!content) return null
  return {
    kind: 'scene',
    sourceRef,
    revision: text(
      sceneProjection.projectionFingerprint
      || sceneProjection.revision
      || sceneProjection.updatedAt
    ).trim(),
    label: '当前场',
    text: content,
    scopeUnitId: text(target.unitId).trim()
  }
}

function worldbookEvidence(entries = [], {
  maxChars = 12000,
  maxEntryChars = 1200,
  sceneUnitId = ''
} = {}) {
  let remainingChars = Math.max(0, Number(maxChars) || 0)
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const id = text(entry?.id).trim()
    if (!id || remainingChars <= 0) return null
    const content = text(entry?.content || entry?.description || entry?.summary).trim()
    if (!content) return null
    const excerpt = content.slice(0, Math.min(remainingChars, Math.max(1, Number(maxEntryChars) || 1)))
    remainingChars -= excerpt.length
    return {
      kind: 'worldbook',
      sourceRef: `worldbook-entry:${id}`,
      revision: getAuthoringReviewWorldbookRevision(entry),
      label: text(entry?.name || entry?.title || id).trim(),
      text: excerpt,
      scopeUnitId: entry?.reviewSceneScoped ? text(sceneUnitId).trim() : ''
    }
  }).filter((entry) => entry?.text)
}

function sceneWorldbookEntryIds(sceneProjection = {}) {
  return new Set([
    sceneProjection?.location?.id,
    sceneProjection?.viewpointCharacter?.id,
    sceneProjection?.activeActor?.id,
    sceneProjection?.dialogueTarget?.id,
    ...(Array.isArray(sceneProjection?.presentCharacters) ? sceneProjection.presentCharacters : []).map((person) => person?.id),
    ...(Array.isArray(sceneProjection?.plannedCharacters) ? sceneProjection.plannedCharacters : []).map((person) => person?.id)
  ].map((id) => text(id).trim()).filter(Boolean))
}

function selectReviewWorldbookEntries(entries = [], {
  prose = '',
  sceneProjection = null,
  maxEntries = 18
} = {}) {
  const available = (Array.isArray(entries) ? entries : []).filter((entry) => (
    entry?.enabled !== false
    && text(entry?.id).trim()
    && text(entry?.content || entry?.description || entry?.summary).trim()
  ))
  if (!available.length) return []
  const sceneIds = sceneWorldbookEntryIds(sceneProjection || {})
  const matched = matchWorldbookEntries({
    worldbook: { id: 'authoring-review-bound-worldbook', entries: available },
    chatHistory: prose ? [{ role: 'user', content: prose }] : [],
    runtimeState: {
      worldMapState: {
        placeId: text(sceneProjection?.location?.id),
        currentScene: text(sceneProjection?.location?.name)
      }
    },
    boundContext: {
      placeIds: [sceneProjection?.location?.id].map(text).filter(Boolean),
      characterIds: [...sceneIds],
      sourceRefs: Array.isArray(sceneProjection?.sourceRefs) ? sceneProjection.sourceRefs.map(text).filter(Boolean) : []
    },
    scanDepth: 1,
    scanSeed: 0,
    respectProbability: false
  })
  const selectedById = new Map(matched.map((entry) => [text(entry?.id), {
    ...entry,
    reviewSceneScoped: sceneIds.has(text(entry?.id))
  }]))
  for (const entry of available) {
    const id = text(entry?.id)
    if (sceneIds.has(id) && !selectedById.has(id)) {
      selectedById.set(id, {
        ...entry,
        matchReason: 'current-scene',
        reviewSceneScoped: true
      })
    }
  }
  return [...selectedById.values()]
    .sort((left, right) => {
      const priority = (entry) => sceneIds.has(text(entry?.id))
        ? 0
        : entry?.matchReason === 'constant' ? 1 : 2
      return priority(left) - priority(right)
        || text(left?.name).localeCompare(text(right?.name), 'zh-Hans-CN')
    })
    .slice(0, Math.max(1, Number(maxEntries) || 1))
}

function normalizeEvidence(values = []) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).map((entry) => {
    const sourceRef = text(entry?.sourceRef || entry?.ref).trim()
    const content = text(entry?.text || entry?.content).trim()
    if (!sourceRef || !content || seen.has(sourceRef)) return null
    seen.add(sourceRef)
    return {
      kind: text(entry?.kind || 'reference').trim(),
      sourceRef,
      revision: text(entry?.revision ?? entry?.sourceRevision ?? '').trim(),
      label: text(entry?.label || entry?.title || sourceRef).trim(),
      text: content,
      scopeUnitId: text(entry?.scopeUnitId).trim()
    }
  }).filter(Boolean)
}

function sourceFromInput(input = {}) {
  const source = input.source && typeof input.source === 'object' ? input.source : input
  const document = source.document || source.editorDocument
  const projectId = text(source.projectId || input.projectId).trim()
  const documentRole = text(source.documentRole || source.role || input.documentRole || 'manuscript').trim()
  const documentId = text(source.documentId || source.id || input.documentId).trim()
  const chapterId = text(source.chapterId || input.chapterId || (documentRole === 'manuscript' ? documentId : '')).trim()
  const documentRevision = text(source.documentRevision ?? input.documentRevision ?? document?.revision).trim()
  return {
    projectId,
    documentRole,
    documentId,
    chapterId,
    documentRevision,
    documentSchemaRevision: text(source.documentSchemaRevision ?? document?.revision).trim(),
    title: text(source.title || input.title).trim(),
    unitId: text(source.unitId || input.unitId).trim(),
    sceneProjection: source.sceneProjection || input.sceneProjection || null,
    worldbookEntries: source.worldbookEntries || input.worldbookEntries || [],
    document
  }
}

// S04（助手写作 Skills 计划 §6.A/§2.2）：作者目标、显式 scope、风格消解与
// coverage 计划。全部为可选增量输入；不传时 session 行为与原先一致。
export const AUTHORING_STYLE_DIRECTIVE_SOURCES = Object.freeze([
  'invocation',
  'book-rule',
  'method-default'
])

// 风格消解：显式作者约束 > 本书既有规则 > 方法默认，同维度先到先得；
// 不扫描目录、不自动学习偏好。输出冻结的已消解指令数组。
export function resolveAuthoringReviewStyleDirectives({
  invocationConstraints = [],
  bookRules = [],
  methodDefaults = []
} = {}) {
  const byDimension = new Map()
  const resolved = []
  for (const [source, rules] of [
    ['invocation', invocationConstraints],
    ['book-rule', bookRules],
    ['method-default', methodDefaults]
  ]) {
    for (const rule of Array.isArray(rules) ? rules : []) {
      const dimension = text(rule?.dimension).trim().slice(0, 60)
      const directive = text(rule?.directive ?? rule?.text).trim().slice(0, 400)
      if (!dimension || !directive) continue
      const existing = byDimension.get(dimension)
      if (existing) {
        existing.supersededSources.push(source)
        continue
      }
      const entry = { dimension, directive, source, supersededSources: [] }
      byDimension.set(dimension, entry)
      resolved.push(entry)
    }
  }
  return deepFreeze(resolved)
}

function normalizeGoalReviewInput(goal) {
  if (!goal || typeof goal !== 'object') return { goal: null, failure: null }
  const goalText = text(goal.text ?? goal.description).trim()
  if (!goalText) return { goal: null, failure: 'goal-text-missing' }
  const skillId = text(goal.skillId).trim()
  let skill = null
  if (skillId) {
    const resolved = resolveWritingSkillMethod(skillId, goal.skillVersion)
    if (!resolved.ok) return { goal: null, failure: resolved.reason }
    skill = Object.freeze({
      skillId: resolved.method.id,
      skillVersion: resolved.method.version,
      outputSchema: resolved.method.outputSchema
    })
  }
  return {
    goal: Object.freeze({
      text: goalText.slice(0, 400),
      invocationId: text(goal.invocationId).trim().slice(0, 120),
      skill
    }),
    failure: null
  }
}

export function createAuthoringReviewSession(input = {}) {
  const source = sourceFromInput(input)
  if (!source.projectId || !source.documentId || !source.document || !Array.isArray(source.document.content)) return null
  const positionIndex = input.positionIndex || buildAuthoringPositionIndex({
    projectId: source.projectId,
    chapterOrderRevision: input.chapterOrderRevision,
    documents: [{
      ...source,
      document: source.document,
      order: 0
    }]
  })
  if (!positionIndex || positionIndex.projectId !== source.projectId) return null
  const documentEntry = positionIndex.documents?.find((entry) => entry.documentId === source.documentId)
  if (!documentEntry) return null
  const goalReview = normalizeGoalReviewInput(input.goal)
  if (goalReview.failure) return null
  const scopeNodeIds = new Set(unique(input.scopeNodeIds || []))
  const scopeRanges = new Map((Array.isArray(input.scopeRanges) ? input.scopeRanges : []).map((range) => [text(range?.nodeId).trim(), {
    startOffset: Math.max(0, Number(range?.startOffset) || 0),
    endOffset: Math.max(0, Number(range?.endOffset) || 0)
  }]).filter(([nodeId, range]) => nodeId && range.endOffset > range.startOffset))
  // 显式 scope（§4：默认当前选区）只收窄读窗口；完整 index 仍用于
  // 新鲜度对账与定位，不会被缩小。
  const scopedIndex = scopeNodeIds.size
    ? {
        ...positionIndex,
        entries: positionIndex.entries.filter((entry) => (
          entry.documentId === source.documentId
          && scopeNodeIds.has(entry.nodeId)
          && text(entry.text).trim()
        )).map((entry) => {
          const range = scopeRanges.get(entry.nodeId)
          if (!range) return entry
          const fullText = text(entry.text)
          const startOffset = Math.min(fullText.length, range.startOffset)
          const endOffset = Math.max(startOffset, Math.min(fullText.length, range.endOffset))
          return { ...entry, fullText, text: fullText.slice(startOffset, endOffset), reviewStartOffset: startOffset }
        }).filter((entry) => text(entry.text).trim())
      }
    : positionIndex
  const windows = getAuthoringReviewWindows(scopedIndex, {
    documentId: source.documentId,
    maxNodes: input.maxNodesPerWindow ?? 6,
    overlap: input.windowOverlap ?? 1,
    maxChars: input.maxCharsPerWindow ?? 12000
  })
  if (!windows.length) return null

  const reviewProse = windows
    .flatMap((window) => window.blocks)
    .filter((block, index, values) => values.findIndex((candidate) => candidate.nodeId === block.nodeId) === index)
    .map((block) => block.text)
    .join('\n')
  const selectedWorldbookEntries = selectReviewWorldbookEntries(
    input.worldbookEntries || source.worldbookEntries,
    {
      prose: reviewProse,
      sceneProjection: input.sceneProjection || source.sceneProjection
    }
  )

  const evidence = normalizeEvidence([
    ...(Array.isArray(input.evidence) ? input.evidence : []),
    sceneEvidence(input.sceneProjection || source.sceneProjection, source),
    ...worldbookEvidence(selectedWorldbookEntries, { sceneUnitId: source.unitId })
  ].filter(Boolean))
  const allowedEvidenceRefs = unique([
    ...windows.flatMap((window) => window.blocks.flatMap((block) => block.sourceRefs || [])),
    ...evidence.map((entry) => entry.sourceRef),
    ...(Array.isArray(input.allowedEvidenceRefs) ? input.allowedEvidenceRefs : [])
  ])
  const sourceRevisions = normalizeSourceRevisions({
    [`document:${source.documentId}`]: source.documentRevision,
    ...Object.fromEntries(evidence.map((entry) => [entry.sourceRef, entry.revision]).filter(([, revision]) => revision)),
    ...(input.sourceRevisions || {})
  })
  const fingerprintSeed = JSON.stringify({
    projectId: source.projectId,
    documentId: source.documentId,
    documentRevision: source.documentRevision,
    positionFingerprint: positionIndex.fingerprint,
    windowIds: windows.map((window) => window.id),
    sourceRevisions
  })
  const fingerprint = `review-session-${fnv1a(fingerprintSeed)}`
  const styleDirectives = resolveAuthoringReviewStyleDirectives(input.styleInputs || {})
  const coverage = buildAuthoringReviewCoveragePlan(positionIndex, windows, source, scopeNodeIds)

  return deepFreeze({
    schemaVersion: AUTHORING_REVIEW_SESSION_SCHEMA_VERSION,
    sessionId: text(input.sessionId).trim() || fingerprint,
    fingerprint,
    status: 'ready',
    target: {
      projectId: source.projectId,
      documentRole: source.documentRole,
      documentId: source.documentId,
      chapterId: source.chapterId,
      documentRevision: source.documentRevision,
      documentSchemaRevision: source.documentSchemaRevision,
      title: source.title,
      unitId: source.unitId
    },
    positionIndex,
    windows,
    evidence,
    allowedEvidenceRefs,
    sourceRevisions,
    goal: goalReview.goal,
    scope: Object.freeze({
      kind: scopeRanges.size ? 'text-selection' : scopeNodeIds.size ? 'selection' : 'chapter',
      ranges: [...scopeRanges.entries()].map(([nodeId, range]) => ({ nodeId, ...range }))
    }),
    styleDirectives,
    coverage,
    findings: []
  })
}

// coverage 计划：窗口即「完整正文逐批读」的可核查单位（§6.A）。evidence
// 的 Top-K 检索单独呈报，不与已读正文混同（§8.1：不把 Top-K 当全量）。
function buildAuthoringReviewCoveragePlan(positionIndex, windows, source, scopeNodeIds) {
  const documentChars = positionIndex.entries
    .filter((entry) => entry.documentId === source.documentId && text(entry.text).trim())
    .reduce((sum, entry) => sum + text(entry.text).length, 0)
  // 验收返工（阻断 3）：相邻窗口有重叠节点，字符覆盖必须按唯一节点计，
  // 否则 readChars 会超过全文。窗口自身的 usedChars 保留为批次预算口径。
  const nodeChars = new Map()
  for (const window of windows) {
    for (const block of window.blocks) {
      if (!nodeChars.has(block.nodeId)) nodeChars.set(block.nodeId, text(block.text).length)
    }
  }
  return Object.freeze({
    scopeKind: scopeNodeIds.size ? 'selection' : 'chapter',
    totalChars: [...nodeChars.values()].reduce((sum, length) => sum + length, 0),
    documentChars,
    uniqueNodeCount: nodeChars.size,
    nodeChars: Object.freeze(Object.fromEntries(nodeChars)),
    windows: Object.freeze(windows.map((window) => Object.freeze({
      windowId: window.id,
      status: 'planned',
      nodeIds: window.blocks.map((block) => block.nodeId),
      charCount: window.usedChars
    })))
  })
}

const AUTHORING_REVIEW_BATCH_STATUSES = Object.freeze(['completed', 'failed', 'skipped'])

// 批次状态推进：未知窗口或非法状态返回 null（fail closed），由调用方处理。
export function markAuthoringReviewBatchStatus(session, windowId, status) {
  const id = text(windowId).trim()
  if (!session?.coverage || !id || !AUTHORING_REVIEW_BATCH_STATUSES.includes(status)) return null
  if (!session.coverage.windows.some((window) => window.windowId === id)) return null
  return deepFreeze({
    ...session,
    coverage: {
      ...session.coverage,
      windows: session.coverage.windows.map((window) => (
        window.windowId === id ? { ...window, status } : window
      ))
    }
  })
}

// 重跑同一 session（例如失败批次重试前）把全部窗口复位为 planned。
export function resetAuthoringReviewCoverage(session) {
  if (!session?.coverage) return session || null
  return deepFreeze({
    ...session,
    coverage: {
      ...session.coverage,
      windows: session.coverage.windows.map((window) => ({ ...window, status: 'planned' }))
    }
  })
}

// 已读范围报告：正文覆盖按窗口逐一批次呈报；evidence 明示 Top-K 检索来源，
// 作者点名的来源若不在授权清单里如实列为 missing，不冒充已读取。
export function buildAuthoringReviewCoverageReport(session, { requestedSourceRefs = [] } = {}) {
  if (!session?.coverage) return null
  const windows = session.coverage.windows
  const countBy = (status) => windows.filter((window) => window.status === status).length
  const nodeChars = session.coverage.nodeChars || {}
  const readNodeIds = new Set(windows
    .filter((window) => window.status === 'completed')
    .flatMap((window) => window.nodeIds))
  const readChars = [...readNodeIds].reduce((sum, nodeId) => sum + (nodeChars[nodeId] || 0), 0)
  const allowedRefs = new Set(session.allowedEvidenceRefs || [])
  return deepFreeze({
    scopeKind: session.coverage.scopeKind,
    prose: {
      total: windows.length,
      planned: countBy('planned'),
      completed: countBy('completed'),
      failed: countBy('failed'),
      skipped: countBy('skipped'),
      totalChars: session.coverage.totalChars,
      documentChars: session.coverage.documentChars,
      uniqueNodeCount: session.coverage.uniqueNodeCount || Object.keys(nodeChars).length,
      uniqueNodeRead: readNodeIds.size,
      readChars,
      ratio: session.coverage.totalChars
        ? Number((readChars / session.coverage.totalChars).toFixed(4))
        : 1,
      documentRatio: session.coverage.documentChars
        ? Number((readChars / session.coverage.documentChars).toFixed(4))
        : 1,
      windows: windows.map(({ windowId, status, nodeIds, charCount }) => (
        { windowId, status, nodeIds, charCount }
      ))
    },
    evidence: {
      selectionBasis: 'top-k-retrieval',
      sourceRefs: (session.evidence || []).map((entry) => entry.sourceRef),
      missingRequested: unique(requestedSourceRefs).filter((ref) => !allowedRefs.has(ref))
    }
  })
}

// 空结果语义区分（§6.A）：完成零 finding ≠ 材料不足/请求失败。
export function summarizeAuthoringReviewCoverage(session, { findingsCount = 0 } = {}) {
  const report = buildAuthoringReviewCoverageReport(session)
  if (!report) return null
  const { total, completed, failed, skipped } = report.prose
  const processed = completed + failed + skipped
  const status = processed === 0
    ? 'not-started'
    : (completed === total ? 'complete' : (processed === total ? 'partial' : 'in-progress'))
  const outcome = status === 'complete'
    ? (findingsCount > 0 ? 'complete-with-findings' : 'clean-complete')
    : status === 'partial'
      ? (findingsCount > 0 ? 'partial-with-findings' : 'partial-insufficient-coverage')
      : status
  return deepFreeze({ ...report, status, outcome })
}

export function getAuthoringReviewWindow(session, windowId) {
  if (!session || !Array.isArray(session.windows)) return null
  return session.windows.find((window) => window.id === text(windowId).trim()) || null
}

export function createAuthoringReviewBatchContext(session, windowId) {
  const window = getAuthoringReviewWindow(session, windowId)
  if (!window) return null
  const windowUnitIds = new Set(window.blocks.map((block) => text(block.unitId).trim()).filter(Boolean))
  const evidence = session.evidence.filter((entry) => (
    !text(entry.scopeUnitId).trim() || windowUnitIds.has(text(entry.scopeUnitId).trim())
  ))
  const allowedEvidenceRefs = unique([
    ...window.blocks.flatMap((block) => block.sourceRefs || []),
    ...evidence.map((entry) => entry.sourceRef)
  ])
  return deepFreeze({
    sessionId: session.sessionId,
    sessionFingerprint: session.fingerprint,
    target: { ...session.target, nodeIds: window.blocks.map((block) => block.nodeId) },
    reviewBlocks: window.blocks.map((block) => ({ ...block })),
    evidence: evidence.map((entry) => ({ ...entry })),
    allowedEvidenceRefs,
    goal: session.goal || null,
    styleDirectives: session.styleDirectives || [],
    coverageWindow: {
      index: session.windows.findIndex((candidate) => candidate.id === window.id),
      total: session.windows.length,
      charCount: window.usedChars
    }
  })
}

function batchWindow(session, batch, index) {
  const windowId = text(batch?.windowId || batch?.id).trim()
  return getAuthoringReviewWindow(session, windowId) || session.windows[index] || null
}

function localFinding(issueType, reason, block, startOffset, endOffset, replacement = null) {
  const base = Math.max(0, Number(block.reviewStartOffset) || 0)
  return {
    kind: issueType === 'naming' || issueType === 'time' || issueType === 'number' || issueType === 'scene-conflict'
      ? 'consistency'
      : 'proofing',
    issueType,
    reason,
    target: {
      nodeId: block.nodeId,
      startOffset: startOffset + base,
      endOffset: endOffset + base,
      exact: block.text.slice(startOffset, endOffset)
    },
    replacement,
    evidenceRefs: block.sourceRefs,
    confidence: replacement == null ? 0.72 : 0.98,
    severity: 'medium',
    source: 'local'
  }
}

function collectQuoteFindings(block, limit = AUTHORING_LOCAL_REVIEW_FINDING_LIMIT) {
  const findings = []
  const duplicateRanges = []
  const duplicatePattern = /([“”‘’])\1+/gu
  let match
  while (findings.length < limit && (match = duplicatePattern.exec(block.text))) {
    duplicateRanges.push([match.index, match.index + match[0].length])
    findings.push(localFinding(
      'quote',
      '这里连续出现了相同的中文引号。',
      block,
      match.index,
      match.index + match[0].length,
      match[1]
    ))
  }
  // Duplicate marks already explain why the node is unbalanced. Avoid adding a
  // second cascade of unmatched-quote findings for the same obvious typo.
  if (duplicateRanges.length) return findings

  const stack = []
  for (let index = 0; index < block.text.length; index += 1) {
    if (findings.length >= limit) break
    const character = block.text[index]
    if (character === '“' || character === '‘') {
      const expected = stack.length % 2 === 0 ? '“' : '‘'
      // A standalone single-quoted fragment can be intentional. Only flag a
      // noncanonical opener when it is visibly nested inside another quote.
      if (stack.length && character !== expected) {
        findings.push(localFinding(
          'quote',
          '嵌套引号的开引号层级不匹配。',
          block,
          index,
          index + 1,
          expected
        ))
      }
      stack.push({ character, index })
      continue
    }
    if (character !== '”' && character !== '’') continue
    const opening = stack.pop()
    if (!opening) {
      findings.push(localFinding(
        'quote',
        '这里出现了没有对应开引号的闭引号。',
        block,
        index,
        index + 1
      ))
      continue
    }
    const expected = opening.character === '“' ? '”' : '’'
    if (character !== expected) {
      findings.push(localFinding(
        'quote',
        '开引号与闭引号不是同一层级。',
        block,
        index,
        index + 1,
        expected
      ))
    }
  }
  stack.slice(0, Math.max(0, limit - findings.length)).forEach((opening) => {
    findings.push(localFinding(
      'quote',
      '这个开引号没有找到对应的闭引号。',
      block,
      opening.index,
      opening.index + 1
    ))
  })
  return findings
}

function collectRepeatedPunctuationFindings(block, limit = AUTHORING_LOCAL_REVIEW_FINDING_LIMIT) {
  const findings = []
  // Deliberately exclude canonical Chinese ellipsis and em-dash pairs: …… / ——.
  const pattern = /([，。！？；：、])\1+/gu
  let match
  while (findings.length < limit && (match = pattern.exec(block.text))) {
    findings.push(localFinding(
      'punctuation',
      '这里连续重复了同一个标点。',
      block,
      match.index,
      match.index + match[0].length,
      match[1]
    ))
  }
  return findings
}

function collectRepeatedWordFindings(block, limit = AUTHORING_LOCAL_REVIEW_FINDING_LIMIT) {
  const findings = []
  const pattern = /([\p{Script=Han}]{2,6})\1/gu
  let match
  while (findings.length < limit && (match = pattern.exec(block.text))) {
    const phrase = match[1]
    // “哈哈哈哈”一类拟声/强调高度依赖语境；不把同字叠用伪装成确定错误。
    if (new Set([...phrase]).size < 2) continue
    findings.push(localFinding(
      'repetition',
      `“${phrase}”连续出现了两次，请确认是否为误写。`,
      block,
      match.index,
      match.index + match[0].length
    ))
  }
  return findings
}

export function collectLocalAuthoringProofingFindings(session, {
  maxFindings = AUTHORING_LOCAL_REVIEW_FINDING_LIMIT
} = {}) {
  if (!session?.target || !session?.positionIndex?.entries) return []
  const findingLimit = Math.max(1, Math.min(
    AUTHORING_LOCAL_REVIEW_FINDING_LIMIT,
    Number.isFinite(Number(maxFindings)) ? Math.floor(Number(maxFindings)) : AUTHORING_LOCAL_REVIEW_FINDING_LIMIT
  ))
  // 验收返工（阻断 2）：显式选区 scope 时本地校对只看冻结窗口内的节点，
  // 完整 positionIndex 仍保留给新鲜度对账，不用于越界扫描。
  const scopedNodeIds = ['selection', 'text-selection'].includes(session.scope?.kind)
    ? new Set(session.coverage.windows.flatMap((window) => window.nodeIds))
    : null
  const blocks = (scopedNodeIds
    ? session.windows.flatMap((window) => window.blocks).filter((block, index, values) => values.findIndex((item) => item.nodeId === block.nodeId) === index)
    : session.positionIndex.entries.filter((entry) => entry.documentId === session.target.documentId && entry.text.trim()).map(reviewWindowBlock))
  const rawFindings = []
  for (const block of blocks) {
    const remaining = findingLimit - rawFindings.length
    if (remaining <= 0) break
    if (inferWritingLanguage(block.text) !== 'en') rawFindings.push(...collectQuoteFindings(block, remaining))
    if (rawFindings.length >= findingLimit) break
    rawFindings.push(...collectRepeatedPunctuationFindings(block, findingLimit - rawFindings.length))
    if (rawFindings.length >= findingLimit) break
    rawFindings.push(...collectRepeatedWordFindings(block, findingLimit - rawFindings.length))
  }
  return normalizeAuthoringReviewFindings(rawFindings, {
    blocks: blocks.map((block) => ({ ...block, text: block.fullText || block.text })),
    maxFindings: findingLimit,
    projectId: session.target.projectId,
    documentRole: session.target.documentRole,
    documentId: session.target.documentId,
    chapterId: session.target.chapterId,
    documentRevision: session.target.documentRevision,
    allowedEvidenceRefs: session.allowedEvidenceRefs,
    source: 'local'
  })
}

export function mergeAuthoringReviewFindings(session, batches = [], { maxFindingsPerWindow = 8 } = {}) {
  if (!session || !Array.isArray(session.windows)) return null
  const currentStatuses = new Map((session.findings || []).map((finding) => [finding.id, finding.status]))
  const merged = new Map()
  collectLocalAuthoringProofingFindings(session).forEach((finding) => merged.set(finding.id, finding))
  const sourceBatches = Array.isArray(batches) ? batches : []
  sourceBatches.forEach((batch, index) => {
    const window = batchWindow(session, batch, index)
    if (!window) return
    const rawFindings = (Array.isArray(batch) ? batch : batch?.findings)?.map((finding) => {
      const target = finding?.target || {}
      const nodeId = text(finding?.start?.nodeId || target.nodeId || finding?.nodeId).trim()
      const block = window.blocks.find((item) => item.nodeId === nodeId)
      const base = Math.max(0, Number(block?.reviewStartOffset) || 0)
      if (!base) return finding
      const add = (value) => Number.isFinite(Number(value)) ? Number(value) + base : value
      return {
        ...finding,
        ...(finding.start ? { start: { ...finding.start, offset: add(finding.start.offset) } } : {}),
        ...(finding.end ? { end: { ...finding.end, offset: add(finding.end.offset) } } : {}),
        target: { ...target, startOffset: add(target.startOffset ?? finding.startOffset), endOffset: add(target.endOffset ?? finding.endOffset) },
        startOffset: add(finding.startOffset), endOffset: add(finding.endOffset)
      }
    })
    const findings = normalizeAuthoringReviewFindings(rawFindings, {
      blocks: window.blocks.map((block) => ({ ...block, text: block.fullText || block.text })),
      maxFindings: maxFindingsPerWindow,
      projectId: session.target.projectId,
      documentRole: session.target.documentRole,
      documentId: session.target.documentId,
      chapterId: session.target.chapterId,
      documentRevision: session.target.documentRevision,
      allowedEvidenceRefs: session.allowedEvidenceRefs
    })
    findings.forEach((finding) => {
      const existing = merged.get(finding.id)
      if (!existing || (existing.source !== 'local' && finding.confidence > existing.confidence)) {
        merged.set(finding.id, finding)
      }
    })
  })
  const findings = [...merged.values()]
    .map((finding) => ({ ...finding, status: currentStatuses.get(finding.id) || finding.status }))
    .sort((left, right) => (
      compareAuthoringPositions(session.positionIndex, left.target, right.target)
      || right.confidence - left.confidence
      || left.id.localeCompare(right.id)
    ))
  return deepFreeze({ ...session, findings })
}

function livePositionIndex(session, live = {}) {
  if (live?.schemaVersion && Array.isArray(live.entries)) return live
  if (live?.positionIndex) return live.positionIndex
  if (live?.source?.document || live?.document) {
    const source = sourceFromInput(live.source ? live : { source: live })
    if (!source.projectId || !source.documentId || !source.document) return null
    return buildAuthoringPositionIndex({
      projectId: source.projectId,
      documents: [{ ...source, document: source.document }]
    })
  }
  return null
}

export function assessAuthoringReviewFreshness(session, live = {}) {
  if (!session?.target) {
    return deepFreeze({ fresh: false, stale: true, detached: true, reason: 'session-missing', reasons: ['session-missing'] })
  }
  const index = livePositionIndex(session, live)
  if (!index || index.projectId !== session.target.projectId) {
    return deepFreeze({ fresh: false, stale: true, detached: true, reason: 'project-detached', reasons: ['project-detached'] })
  }
  const document = index.documents?.find((entry) => entry.documentId === session.target.documentId)
  if (!document || document.documentRole !== session.target.documentRole) {
    return deepFreeze({ fresh: false, stale: true, detached: true, reason: 'document-detached', reasons: ['document-detached'] })
  }
  const reasons = []
  if (text(document.documentRevision) !== text(session.target.documentRevision)) reasons.push('document-revision-changed')
  const checksSourceRevisions = Object.prototype.hasOwnProperty.call(live || {}, 'sourceRevisions')
  const liveRevisions = normalizeSourceRevisions(live?.sourceRevisions || {})
  for (const [sourceRef, revision] of Object.entries(session.sourceRevisions || {})) {
    if (sourceRef === `document:${session.target.documentId}`) continue
    if (!revision || !checksSourceRevisions) continue
    if (!Object.prototype.hasOwnProperty.call(liveRevisions, sourceRef) || !liveRevisions[sourceRef]) {
      reasons.push(`source-detached:${sourceRef}`)
    } else if (liveRevisions[sourceRef] !== revision) {
      reasons.push(`source-revision-changed:${sourceRef}`)
    }
  }
  const detached = reasons.some((reason) => reason.startsWith('source-detached:'))
  return deepFreeze({
    fresh: reasons.length === 0,
    stale: reasons.length > 0,
    detached,
    reason: reasons[0] || '',
    reasons
  })
}

export function reconcileAuthoringReviewSession(session, live = {}) {
  if (!session) return null
  const assessment = assessAuthoringReviewFreshness(session, live)
  if (assessment.fresh) return session
  const status = assessment.detached ? 'detached' : 'stale'
  return deepFreeze({
    ...session,
    status,
    staleReason: assessment.reason,
    findings: (session.findings || []).map((finding) => (
      finding.status === 'open' ? { ...finding, status } : finding
    ))
  })
}

export function ignoreAuthoringReviewFinding(session, findingId) {
  if (!session || !findingId) return session || null
  const id = text(findingId).trim()
  let changed = false
  const findings = (session.findings || []).map((finding) => {
    if (finding.id !== id || finding.status === 'applied' || finding.status === 'ignored') return finding
    changed = true
    return { ...finding, status: 'ignored' }
  })
  return changed ? deepFreeze({ ...session, findings }) : session
}

export function markAuthoringReviewFindingsApplied(session, findingIds = []) {
  if (!session) return null
  const ids = new Set((Array.isArray(findingIds) ? findingIds : [findingIds]).map((id) => text(id).trim()).filter(Boolean))
  if (!ids.size) return session
  let changed = false
  const findings = (session.findings || []).map((finding) => {
    if (!ids.has(finding.id) || finding.status !== 'open') return finding
    changed = true
    return { ...finding, status: 'applied' }
  })
  return changed ? deepFreeze({ ...session, findings }) : session
}

// A proofing patch is a known, local mutation. Re-scan-free sequential review is
// safe only when every untouched finding can be resolved against the new
// canonical document. Rebase node-local offsets before advancing the session
// revision; findings intersected by the patch fail closed individually.
export function rebaseAuthoringReviewSessionAfterTransaction(session, transaction, live = {}) {
  if (!session?.target || !transaction?.receipt || !Array.isArray(transaction.patches)) return null
  const index = livePositionIndex(session, live)
  if (!index || index.projectId !== session.target.projectId) return reconcileAuthoringReviewSession(session, live)
  const document = index.documents?.find((entry) => entry.documentId === session.target.documentId)
  if (!document || document.documentRole !== session.target.documentRole) {
    return reconcileAuthoringReviewSession(session, live)
  }
  const appliedIds = new Set(transaction.receipt.findingIds || [])
  const oldIndex = session.positionIndex
  const patches = transaction.patches.map((patch) => ({
    ...patch,
    start: Number(patch?.range?.startOffset ?? patch?.start ?? 0),
    end: Number(patch?.range?.endOffset ?? patch?.end ?? 0),
    delta: text(patch?.replacement).length - (Number(patch?.range?.endOffset ?? patch?.end ?? 0) - Number(patch?.range?.startOffset ?? patch?.start ?? 0))
  }))

  const findings = (session.findings || []).map((finding) => {
    if (appliedIds.has(finding.id)) return { ...finding, status: 'applied' }
    if (!['open', 'ignored'].includes(finding.status)) return finding
    const oldStart = resolveAuthoringPosition(oldIndex, finding.target)
    const oldEnd = resolveAuthoringPosition(oldIndex, {
      ...finding.target,
      unitId: finding.target.endUnitId || finding.target.unitId,
      nodeId: finding.target.endNodeId || finding.target.nodeId
    })
    if (!oldStart || !oldEnd) return { ...finding, status: 'detached' }

    const originalStartOffset = Number(finding.target.startOffset || 0)
    const originalEndOffset = Number(finding.target.endOffset || 0)
    let startShift = 0
    let endShift = 0
    let intersected = false
    for (const patch of patches) {
      const patchEntry = resolveAuthoringPosition(oldIndex, {
        documentId: patch.documentId,
        unitId: patch.unitId,
        nodeId: patch.nodeId
      })
      if (!patchEntry || patchEntry.documentId !== oldStart.documentId) continue
      if (patchEntry.documentNodeOrder < oldStart.documentNodeOrder || patchEntry.documentNodeOrder > oldEnd.documentNodeOrder) continue
      if (oldStart.nodeId === oldEnd.nodeId) {
        if (patchEntry.nodeId !== oldStart.nodeId) continue
        if (patch.end <= originalStartOffset) {
          startShift += patch.delta
          endShift += patch.delta
        } else if (patch.start < originalEndOffset) intersected = true
        continue
      }
      if (patchEntry.nodeId === oldStart.nodeId) {
        if (patch.end <= originalStartOffset) startShift += patch.delta
        else intersected = true
      } else if (patchEntry.nodeId === oldEnd.nodeId) {
        if (patch.start < originalEndOffset) intersected = true
      } else {
        intersected = true
      }
    }
    if (intersected) return { ...finding, status: finding.status === 'ignored' ? 'ignored' : 'stale' }

    const startOffset = originalStartOffset + startShift
    const endOffset = originalEndOffset + endShift

    const liveStart = resolveAuthoringPosition(index, finding.target)
    const liveEnd = resolveAuthoringPosition(index, {
      ...finding.target,
      unitId: finding.target.endUnitId || finding.target.unitId,
      nodeId: finding.target.endNodeId || finding.target.nodeId
    })
    if (!liveStart || !liveEnd) return { ...finding, status: 'detached' }
    const target = {
      ...finding.target,
      documentRevision: document.documentRevision,
      unitRevision: liveStart.unitRevision,
      nodeRevision: liveStart.nodeRevision,
      startOffset,
      endUnitId: liveEnd.unitId,
      endUnitRevision: liveEnd.unitRevision,
      endNodeId: liveEnd.nodeId,
      endNodeRevision: liveEnd.nodeRevision,
      endOffset
    }
    const freshness = assessAuthoringPositionFreshness(target, index)
    if (!freshness.fresh) {
      return { ...finding, target, status: freshness.detached ? 'detached' : (finding.status === 'ignored' ? 'ignored' : 'stale') }
    }
    return {
      ...finding,
      target,
      start: {
        ...finding.start,
        unitRevision: liveStart.unitRevision,
        nodeRevision: liveStart.nodeRevision,
        offset: startOffset
      },
      end: {
        ...finding.end,
        unitId: liveEnd.unitId,
        unitRevision: liveEnd.unitRevision,
        nodeId: liveEnd.nodeId,
        nodeRevision: liveEnd.nodeRevision,
        offset: endOffset
      }
    }
  })

  const windows = (session.windows || []).map((window) => ({
    ...window,
    blocks: (window.blocks || []).map((block) => {
      const entry = resolveAuthoringPosition(index, block)
      return entry ? reviewWindowBlock(entry) : block
    })
  }))
  const next = {
    ...session,
    fingerprint: `review-session-${fnv1a(`${session.fingerprint}:${transaction.receipt.id}:${document.documentRevision}`)}`,
    status: 'ready',
    staleReason: '',
    target: {
      ...session.target,
      documentRevision: document.documentRevision,
      documentSchemaRevision: document.documentSchemaRevision
    },
    positionIndex: index,
    windows,
    sourceRevisions: {
      ...session.sourceRevisions,
      [`document:${session.target.documentId}`]: document.documentRevision
    },
    findings
  }
  const externalFreshness = assessAuthoringReviewFreshness(next, { ...live, positionIndex: index })
  return externalFreshness.fresh
    ? deepFreeze(next)
    : reconcileAuthoringReviewSession(deepFreeze(next), { ...live, positionIndex: index })
}

function transactionFailure(reason, details = {}) {
  return { ok: false, reason, ...details }
}

export function prepareAuthoringReviewTransaction(session, findingIds = [], live = {}) {
  if (!session?.target) return transactionFailure('session-missing')
  const ids = unique(Array.isArray(findingIds) ? findingIds : [findingIds])
  if (!ids.length) return transactionFailure('finding-selection-empty')
  const index = livePositionIndex(session, live)
  if (!index) return transactionFailure('live-position-index-missing')
  const sessionFreshness = assessAuthoringReviewFreshness(session, { ...live, positionIndex: index })
  if (!sessionFreshness.fresh) return transactionFailure(sessionFreshness.detached ? 'session-detached' : 'session-stale', { freshness: sessionFreshness })

  const findingsById = new Map((session.findings || []).map((finding) => [finding.id, finding]))
  const selected = ids.map((id) => findingsById.get(id))
  if (selected.some((finding) => !finding)) return transactionFailure('finding-not-found')
  if (selected.some((finding) => finding.status !== 'open')) return transactionFailure('finding-not-open')
  if (selected.some((finding) => finding.replacement == null)) return transactionFailure('finding-has-no-replacement')
  if (selected.some((finding) => finding.target.documentId !== session.target.documentId)) {
    return transactionFailure('finding-document-mismatch')
  }

  const patches = []
  for (const finding of selected) {
    const freshness = assessAuthoringPositionFreshness(finding.target, index)
    if (!freshness.fresh) return transactionFailure(freshness.detached ? 'finding-detached' : 'finding-stale', { findingId: finding.id, freshness })
    if (finding.target.endNodeId !== finding.target.nodeId) return transactionFailure('cross-node-replacement-unsupported', { findingId: finding.id })
    const entry = resolveAuthoringPosition(index, finding.target)
    const replacement = validateWritingReviewReplacement({
      nodeText: entry?.text,
      startOffset: finding.target.startOffset,
      endOffset: finding.target.endOffset,
      exact: finding.target.exact,
      replacement: finding.replacement
    })
    if (!replacement.valid) return transactionFailure(replacement.reason, { findingId: finding.id })
    patches.push({
      findingId: finding.id,
      documentId: finding.target.documentId,
      unitId: finding.target.unitId,
      expectedUnitRevision: finding.target.unitRevision,
      unitRevision: finding.target.unitRevision,
      nodeId: finding.target.nodeId,
      expectedNodeRevision: finding.target.nodeRevision,
      nodeRevision: finding.target.nodeRevision,
      range: {
        startOffset: finding.target.startOffset,
        endOffset: finding.target.endOffset
      },
      start: finding.target.startOffset,
      end: finding.target.endOffset,
      baseText: finding.target.exact,
      expectedText: finding.target.exact,
      replacement: replacement.replacement
    })
  }

  const ordered = [...patches].sort((left, right) => (
    compareAuthoringPositions(index, {
      documentId: left.documentId,
      unitId: left.unitId,
      nodeId: left.nodeId,
      startOffset: left.range.startOffset
    }, {
      documentId: right.documentId,
      unitId: right.unitId,
      nodeId: right.nodeId,
      startOffset: right.range.startOffset
    })
  ))
  for (let position = 1; position < ordered.length; position += 1) {
    const previous = ordered[position - 1]
    const current = ordered[position]
    if (previous.nodeId === current.nodeId && current.range.startOffset < previous.range.endOffset) {
      return transactionFailure('finding-ranges-overlap', {
        findingIds: [previous.findingId, current.findingId]
      })
    }
  }
  const receiptSeed = JSON.stringify({
    sessionId: session.sessionId,
    documentRevision: session.target.documentRevision,
    patches: ordered.map((patch) => [patch.findingId, patch.nodeId, patch.range, patch.baseText, patch.replacement])
  })
  return deepFreeze({
    ok: true,
    patches: ordered,
    receipt: {
      type: 'authoring-review-transaction',
      id: `review-transaction-${fnv1a(receiptSeed)}`,
      sessionId: session.sessionId,
      sessionFingerprint: session.fingerprint,
      projectId: session.target.projectId,
      documentId: session.target.documentId,
      baseDocumentRevision: session.target.documentRevision,
      findingIds: ordered.map((patch) => patch.findingId),
      before: ordered.map((patch) => ({
        nodeId: patch.nodeId,
        startOffset: patch.range.startOffset,
        endOffset: patch.range.endOffset,
        text: patch.baseText
      }))
    }
  })
}
