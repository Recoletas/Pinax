export const AUTHORING_REVIEW_SCHEMA_VERSION = 1

const REVIEW_KINDS = new Set(['proofing', 'consistency'])
const ISSUE_TYPES = new Set([
  'typo',
  'punctuation',
  'quote',
  'repetition',
  'grammar',
  'naming',
  'time',
  'number',
  'scene-conflict'
])
const REVIEW_SOURCES = new Set(['local', 'model', 'exception'])
const REVIEW_STATUSES = new Set(['open', 'ignored', 'applied', 'stale', 'detached'])
const SEVERITIES = new Set(['low', 'medium', 'high'])
const CONSISTENCY_ISSUES = new Set(['naming', 'time', 'number', 'scene-conflict'])
const WEAK_REVIEW_PATTERNS = [
  /更生动/u,
  /更精彩/u,
  /加强描写/u,
  /注意氛围/u,
  /丰富细节/u,
  /提升.*感染力/u
]
const LEGACY_REVIEW_TYPES = Object.freeze({
  '重复': Object.freeze({ kind: 'proofing', issueType: 'repetition' }),
  '衔接': Object.freeze({ kind: 'proofing', issueType: 'grammar' }),
  'POV': Object.freeze({ kind: 'consistency', issueType: 'scene-conflict' }),
  '角色连续性': Object.freeze({ kind: 'consistency', issueType: 'naming' }),
  '时间': Object.freeze({ kind: 'consistency', issueType: 'time' }),
  '设定冲突': Object.freeze({ kind: 'consistency', issueType: 'scene-conflict' }),
  '节奏': Object.freeze({ kind: 'proofing', issueType: 'grammar' }),
  '语言': Object.freeze({ kind: 'proofing', issueType: 'grammar' })
})

function text(value) {
  return value == null ? '' : String(value)
}

function integer(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : fallback
}

function legacyRevision(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const normalized = text(value).trim()
  if (/^-?\d+(?:\.\d+)?$/u.test(normalized)) return Number(normalized)
  return normalized
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function fnv1a(source) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function nodeIdOf(value) {
  return text(value?.nodeId || value?.blockId || value?.id).trim()
}

function normalizeIssue(raw = {}) {
  const explicitKind = text(raw.kind).trim()
  const explicitIssue = text(raw.issueType || raw.category || raw.type).trim()
  const legacy = LEGACY_REVIEW_TYPES[explicitKind] || LEGACY_REVIEW_TYPES[explicitIssue]
  if (legacy) return legacy

  if (ISSUE_TYPES.has(explicitIssue)) {
    return {
      // issueType owns the classification. A provider cannot turn a prose
      // spelling fix into a fact-consistency finding merely by changing kind.
      kind: CONSISTENCY_ISSUES.has(explicitIssue) ? 'consistency' : 'proofing',
      issueType: explicitIssue
    }
  }
  if (REVIEW_KINDS.has(explicitKind)) {
    return {
      kind: explicitKind,
      issueType: explicitKind === 'consistency' ? 'scene-conflict' : 'grammar'
    }
  }
  return null
}

function normalizeSeverity(value) {
  const severity = text(value).trim().toLowerCase()
  return SEVERITIES.has(severity) ? severity : 'medium'
}

function normalizeConfidence(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return clamp(value, 0, 1)
  const normalized = text(value).trim().toLowerCase()
  if (normalized === 'high' || normalized === 'supported') return 0.9
  if (normalized === 'low' || normalized === 'unsupported') return 0.4
  if (normalized === 'medium' || normalized === 'partial') return 0.7
  return 0.7
}

function normalizeSource(value, fallback = 'model') {
  const source = text(value || fallback).trim().toLowerCase()
  return REVIEW_SOURCES.has(source) ? source : 'model'
}

function normalizeStatus(value, preserveStatus = false) {
  const status = text(value).trim().toLowerCase()
  return preserveStatus && REVIEW_STATUSES.has(status) ? status : 'open'
}

function normalizeRefs(values, allowedRefs) {
  const seen = new Set()
  return (Array.isArray(values) ? values : [])
    .map((value) => text(value).trim())
    .filter((value) => {
      if (!value || seen.has(value) || (allowedRefs && !allowedRefs.has(value))) return false
      seen.add(value)
      return true
    })
}

function exactForRange(blocks, startIndex, endIndex, startOffset, endOffset) {
  if (startIndex === endIndex) {
    return blocks[startIndex].text.slice(startOffset, endOffset)
  }
  return [
    blocks[startIndex].text.slice(startOffset),
    ...blocks.slice(startIndex + 1, endIndex).map((block) => block.text),
    blocks[endIndex].text.slice(0, endOffset)
  ].join('\n')
}

function leadingIndent(value) {
  return text(value).match(/^[\t \u3000]+/u)?.[0] || ''
}

// Chinese prose uses outer double quotes and alternating single/double pairs for
// nesting. Validate the whole live node after a proposed patch, rather than the
// selected fragment, because a valid correction may replace only one quote mark.
export function inspectChineseQuoteNesting(value) {
  const stack = []
  for (const character of text(value)) {
    if (character === '“' || character === '‘') {
      const expected = stack.length % 2 === 0 ? '“' : '‘'
      if (character !== expected) return { valid: false, reason: 'noncanonical-opening-quote' }
      stack.push(character)
      continue
    }
    if (character !== '”' && character !== '’') continue
    const opening = stack.pop()
    const expected = opening === '“' ? '”' : opening === '‘' ? '’' : ''
    if (!opening || character !== expected) return { valid: false, reason: 'unmatched-closing-quote' }
  }
  return stack.length
    ? { valid: false, reason: 'unclosed-quote' }
    : { valid: true, reason: '' }
}

// This guard is deliberately narrower than a prose validator. It only blocks
// mutations that a one-click proofing action must never perform: paragraph
// restructuring, first-line indentation changes, and broken Chinese nesting.
export function validateWritingReviewReplacement({
  nodeText = '',
  startOffset = 0,
  endOffset = startOffset,
  exact = '',
  replacement = null
} = {}) {
  if (replacement == null) return { valid: true, replacement: null }
  const source = text(nodeText)
  const start = clamp(integer(startOffset), 0, source.length)
  const end = clamp(integer(endOffset, start), start, source.length)
  const expected = text(exact)
  const next = text(replacement)
  if (source.slice(start, end) !== expected) return { valid: false, reason: 'exact-mismatch' }
  if (next === expected) return { valid: false, reason: 'replacement-unchanged' }
  if (next.length > 1200) return { valid: false, reason: 'replacement-too-long' }
  if (/[\r\n]/u.test(next)) return { valid: false, reason: 'replacement-restructures-node' }
  if (start === 0 && leadingIndent(expected) !== leadingIndent(next)) {
    return { valid: false, reason: 'first-line-indent-changed' }
  }
  const nextNodeText = `${source.slice(0, start)}${next}${source.slice(end)}`
  const quoteState = inspectChineseQuoteNesting(nextNodeText)
  if (!quoteState.valid) return { valid: false, reason: quoteState.reason }
  return { valid: true, replacement: next }
}

function normalizedBlocksFrom(blocks, defaults = {}) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block, order) => ({
      projectId: text(block?.projectId || defaults.projectId).trim(),
      documentRole: text(block?.documentRole || block?.role || defaults.documentRole || 'manuscript').trim(),
      documentId: text(block?.documentId || defaults.documentId).trim(),
      chapterId: text(block?.chapterId || defaults.chapterId).trim(),
      documentRevision: text(block?.documentRevision ?? defaults.documentRevision).trim(),
      unitId: text(block?.unitId).trim() || null,
      unitRevision: text(block?.unitRevision ?? '').trim(),
      nodeId: nodeIdOf(block),
      nodeRevision: text(block?.nodeRevision ?? block?.blockRevision ?? block?.revision ?? '').trim(),
      text: text(block?.text),
      sourceRefs: normalizeRefs(block?.sourceRefs),
      order: Number.isFinite(Number(block?.order)) ? Number(block.order) : order
    }))
    .filter((block) => block.nodeId)
}

function rawRange(raw = {}) {
  const target = raw.target && typeof raw.target === 'object' ? raw.target : {}
  const start = raw.start || raw.startBlock || {}
  const end = raw.end || raw.endBlock || {}
  const startNodeId = nodeIdOf(start)
    || nodeIdOf(target)
    || nodeIdOf({ nodeId: raw.startNodeId || raw.startBlockId })
  const endNodeId = nodeIdOf(end)
    || text(target.endNodeId).trim()
    || nodeIdOf({ nodeId: raw.endNodeId || raw.endBlockId })
    || startNodeId
  return {
    startNodeId,
    endNodeId,
    startOffset: integer(start.offset ?? target.startOffset ?? raw.startOffset),
    endOffset: integer(end.offset ?? target.endOffset ?? raw.endOffset, Number.NaN),
    exact: raw.exact ?? target.exact
  }
}

function createStableFindingId(finding) {
  const target = finding.target
  return `review-${fnv1a([
    target.projectId,
    target.documentId,
    target.documentRevision,
    target.nodeId,
    target.startOffset,
    target.endNodeId,
    target.endOffset,
    finding.issueType,
    target.exact
  ].join('\u0000'))}`
}

function legacyProjection(finding, start, end, nodeIds) {
  return {
    // Transitional aliases keep the old annotation-based UI alive while the
    // dedicated review panel moves to target/reason. New code must use target.
    body: finding.reason,
    exact: finding.target.exact,
    start: {
      unitId: start.unitId,
      unitRevision: legacyRevision(start.unitRevision),
      nodeId: start.nodeId,
      nodeRevision: legacyRevision(start.nodeRevision),
      offset: finding.target.startOffset
    },
    end: {
      unitId: end.unitId,
      unitRevision: legacyRevision(end.unitRevision),
      nodeId: end.nodeId,
      nodeRevision: legacyRevision(end.nodeRevision),
      offset: finding.target.endOffset
    },
    nodeIds
  }
}

function targetSelfEvidenceRefs(blocks, startIndex, endIndex) {
  const refs = new Set()
  for (const block of blocks.slice(startIndex, endIndex + 1)) {
    if (block.chapterId) refs.add(`chapter:${block.chapterId}`)
    if (block.documentId && block.unitId) refs.add(`unit:${block.documentId}:${block.unitId}`)
    if (block.documentId && block.nodeId) refs.add(`node:${block.documentId}:${block.nodeId}`)
  }
  return refs
}

function isAuthoritativeConsistencyEvidenceRef(value) {
  const sourceRef = text(value).trim()
  return sourceRef.startsWith('worldbook-entry:') || sourceRef.startsWith('scene-projection:')
}

export function normalizeWritingReviewFindings(rawFindings, {
  blocks = [],
  maxFindings = 8,
  projectId = '',
  documentRole = 'manuscript',
  documentId = '',
  chapterId = '',
  documentRevision = '',
  allowedEvidenceRefs = null,
  source = 'model',
  preserveStatus = false
} = {}) {
  const normalizedBlocks = normalizedBlocksFrom(blocks, {
    projectId,
    documentRole,
    documentId,
    chapterId,
    documentRevision
  })
  const nodeIndex = new Map(normalizedBlocks.map((block, index) => [block.nodeId, { ...block, index }]))
  const allowedRefs = new Set([
    ...normalizedBlocks.flatMap((block) => block.sourceRefs),
    ...(Array.isArray(allowedEvidenceRefs) ? allowedEvidenceRefs.map((ref) => text(ref).trim()).filter(Boolean) : [])
  ])
  const findings = []
  const seen = new Set()

  for (const raw of Array.isArray(rawFindings) ? rawFindings : []) {
    if (!raw || typeof raw !== 'object') continue
    const issue = normalizeIssue(raw)
    const reason = text(raw.reason || raw.body || raw.message || raw.issue || raw.rationale).trim()
    if (!issue || !reason || reason.length > 500 || WEAK_REVIEW_PATTERNS.some((pattern) => pattern.test(reason))) continue

    const range = rawRange(raw)
    const start = nodeIndex.get(range.startNodeId)
    const end = nodeIndex.get(range.endNodeId)
    if (!start || !end || start.index > end.index) continue
    const startOffset = clamp(range.startOffset, 0, start.text.length)
    const endOffset = Number.isFinite(range.endOffset)
      ? clamp(range.endOffset, 0, end.text.length)
      : end.text.length
    if (start.index === end.index && endOffset <= startOffset) continue
    if (start.index !== end.index && (startOffset >= start.text.length || endOffset <= 0)) continue

    const exact = exactForRange(normalizedBlocks, start.index, end.index, startOffset, endOffset)
    if (!exact || exact.length > 1200) continue
    if (range.exact != null && text(range.exact) !== exact) continue

    const rawReplacement = Object.prototype.hasOwnProperty.call(raw, 'replacement')
      ? raw.replacement
      : raw.suggestion ?? raw.correctedText ?? raw.corrected
    let replacement = rawReplacement == null ? null : text(rawReplacement)
    // Cross-node findings remain useful for jump/ignore, but a one-click patch
    // may never restructure two nodes. The UI can present them without Apply.
    if (start.nodeId !== end.nodeId) {
      replacement = null
    } else if (replacement != null) {
      const replacementValidation = validateWritingReviewReplacement({
        nodeText: start.text,
        startOffset,
        endOffset,
        exact,
        replacement
      })
      if (!replacementValidation.valid) replacement = null
      else replacement = replacementValidation.replacement
    }

    const target = {
      projectId: start.projectId,
      documentRole: start.documentRole || 'manuscript',
      documentId: start.documentId,
      chapterId: start.chapterId,
      documentRevision: start.documentRevision,
      unitId: start.unitId,
      unitRevision: start.unitRevision,
      nodeId: start.nodeId,
      nodeRevision: start.nodeRevision,
      startOffset,
      endUnitId: end.unitId,
      endUnitRevision: end.unitRevision,
      endNodeId: end.nodeId,
      endNodeRevision: end.nodeRevision,
      endOffset,
      exact
    }
    const evidenceRefs = normalizeRefs(raw.evidenceRefs || raw.sourceRefs, allowedRefs)
    if (issue.kind === 'consistency') {
      const selfRefs = targetSelfEvidenceRefs(normalizedBlocks, start.index, end.index)
      // A claim that the prose conflicts with a name, time, number or scene
      // fact must cite at least one separately authorized fact source. The
      // target chapter/unit/node merely proves what the prose says; it cannot
      // also serve as the external fact against which that prose is checked.
      if (!evidenceRefs.some((sourceRef) => (
        !selfRefs.has(sourceRef) && isAuthoritativeConsistencyEvidenceRef(sourceRef)
      ))) continue
    }
    const finding = {
      schemaVersion: AUTHORING_REVIEW_SCHEMA_VERSION,
      id: '',
      kind: issue.kind,
      issueType: issue.issueType,
      target,
      reason,
      replacement,
      evidenceRefs,
      confidence: normalizeConfidence(raw.confidence),
      severity: normalizeSeverity(raw.severity),
      source: normalizeSource(raw.source, source),
      status: normalizeStatus(raw.status, preserveStatus)
    }
    finding.id = createStableFindingId(finding)
    if (seen.has(finding.id)) continue
    seen.add(finding.id)
    const nodeIds = normalizedBlocks.slice(start.index, end.index + 1).map((block) => block.nodeId)
    findings.push({ ...finding, ...legacyProjection(finding, start, end, nodeIds) })
    if (findings.length >= Math.max(1, integer(maxFindings, 8))) break
  }

  return findings
}

export const normalizeAuthoringReviewFindings = normalizeWritingReviewFindings
export const AUTHORING_REVIEW_KINDS = Object.freeze([...REVIEW_KINDS])
export const AUTHORING_REVIEW_ISSUE_TYPES = Object.freeze([...ISSUE_TYPES])
export const AUTHORING_REVIEW_STATUSES = Object.freeze([...REVIEW_STATUSES])
// Kept for callers that still render the old category catalog.
export const WRITING_REVIEW_TYPES = Object.freeze(Object.keys(LEGACY_REVIEW_TYPES))
