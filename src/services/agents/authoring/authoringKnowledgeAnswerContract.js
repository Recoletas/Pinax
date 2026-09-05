export const AUTHORING_EVIDENCE_SCHEMA_VERSION = 1
export const AUTHORING_KNOWLEDGE_ANSWER_SCHEMA_VERSION = 1

export const AUTHORING_KNOWLEDGE_INTENTS = Object.freeze([
  'setting',
  'foreshadowing',
  'calculation',
  'clues',
  'character',
  'whole-book',
  'free'
])

export const AUTHORING_EVIDENCE_AUTHORITIES = Object.freeze([
  'manuscript',
  'worldbook',
  'outline',
  'history',
  'scene',
  'memory',
  'suggestion'
])

export const AUTHORING_EVIDENCE_LOCATOR_KINDS = Object.freeze([
  'manuscript',
  'worldbook-entry',
  'outline-node',
  'exploration',
  'memory-source',
  'history',
  'scene'
])

const CLAIM_CONFIDENCE = new Set(['supported', 'partial', 'unsupported'])
const LOCATOR_KINDS = new Set(AUTHORING_EVIDENCE_LOCATOR_KINDS)
const AUTHORITIES = new Set(AUTHORING_EVIDENCE_AUTHORITIES)
const QUERY_INTENTS = new Set(AUTHORING_KNOWLEDGE_INTENTS)

function text(value, limit = Infinity) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return Number.isFinite(limit) ? normalized.slice(0, limit) : normalized
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function uniqueText(values, limit = 32) {
  return [...new Set(list(values).map((value) => text(value, 240)).filter(Boolean))].slice(0, limit)
}

function clone(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const item of Object.values(value)) deepFreeze(item, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  let result = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function integer(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null
}

function buildSourceAuthorization(projectId, evidence = []) {
  return {
    mode: 'exact-read-only',
    projectId,
    sources: evidence.map((item) => Object.freeze({
      sourceRef: item.sourceRef,
      revision: item.revision,
      authority: item.authority,
      locator: item.locator
    })),
    allowedOperations: ['read-source', 'locate-source'],
    deniedOperations: [
      'write-manuscript',
      'write-worldbook',
      'write-outline',
      'write-scene',
      'write-exploration',
      'write-memory'
    ]
  }
}

function evidenceFingerprintInput(item) {
  return [
    item.sourceRef,
    item.projectId,
    item.authority,
    item.label,
    item.excerpt,
    item.revision,
    item.locator
  ]
}

export function normalizeAuthoringEvidenceLocator(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const kind = text(source.kind)
  if (!LOCATOR_KINDS.has(kind)) return null

  if (kind === 'manuscript') {
    const chapterId = text(source.chapterId)
    const documentId = text(source.documentId || chapterId)
    if (!chapterId || !documentId) return null
    const locator = { kind, documentId, chapterId }
    for (const key of ['unitId', 'nodeId']) {
      const value = text(source[key])
      if (value) locator[key] = value
    }
    const start = integer(source.start)
    const end = integer(source.end)
    if (start != null) locator.start = start
    if (end != null) locator.end = Math.max(start ?? 0, end)
    return Object.freeze(locator)
  }

  if (kind === 'worldbook-entry') {
    const worldbookId = text(source.worldbookId)
    const entryId = text(source.entryId)
    return worldbookId && entryId ? Object.freeze({ kind, worldbookId, entryId }) : null
  }

  if (kind === 'outline-node') {
    const nodeId = text(source.nodeId)
    return nodeId ? Object.freeze({ kind, nodeId }) : null
  }

  if (kind === 'exploration') {
    const documentId = text(source.documentId)
    return documentId ? Object.freeze({ kind, documentId }) : null
  }

  if (kind === 'memory-source') {
    const memoryId = text(source.memoryId)
    if (!memoryId) return null
    const sourceRef = text(source.sourceRef)
    return Object.freeze({ kind, memoryId, ...(sourceRef ? { sourceRef } : {}) })
  }

  if (kind === 'history') {
    const historyId = text(source.historyId)
    return historyId ? Object.freeze({ kind, historyId }) : null
  }

  const chapterId = text(source.chapterId)
  const unitId = text(source.unitId)
  if (!chapterId || !unitId) return null
  const anchorId = text(source.anchorId)
  return Object.freeze({ kind, chapterId, unitId, ...(anchorId ? { anchorId } : {}) })
}

export function sourceRefForAuthoringEvidenceLocator(locator = {}) {
  const normalized = normalizeAuthoringEvidenceLocator(locator)
  if (!normalized) return ''
  if (normalized.kind === 'manuscript') {
    if (normalized.nodeId) return `node:${normalized.documentId}:${normalized.nodeId}`
    if (normalized.unitId) return `unit:${normalized.documentId}:${normalized.unitId}`
    return `chapter:${normalized.chapterId}`
  }
  if (normalized.kind === 'worldbook-entry') return `worldbook-entry:${normalized.entryId}`
  if (normalized.kind === 'outline-node') return `outline-node:${normalized.nodeId}`
  if (normalized.kind === 'exploration') return `exploration:${normalized.documentId}`
  if (normalized.kind === 'memory-source') return `memory:${normalized.memoryId}`
  if (normalized.kind === 'history') return `history-node:${normalized.historyId}`
  return normalized.anchorId
    ? `scene-anchor:${normalized.anchorId}`
    : `scene-projection:${normalized.chapterId}:${normalized.unitId}`
}

export function normalizeAuthoringEvidence(input = {}, { projectId = '' } = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const sourceRef = text(source.sourceRef, 240)
  const revision = text(source.revision, 240)
  const authority = text(source.authority)
  const locator = normalizeAuthoringEvidenceLocator(source.locator)
  if (!sourceRef || !revision || !AUTHORITIES.has(authority) || !locator) return null
  if (sourceRef !== sourceRefForAuthoringEvidenceLocator(locator)) return null
  const evidenceProjectId = text(source.projectId || projectId)
  if (!evidenceProjectId || (projectId && evidenceProjectId !== text(projectId))) return null
  const excerpt = text(source.excerpt, 1200)
  if (!excerpt) return null
  return Object.freeze({
    sourceRef,
    projectId: evidenceProjectId,
    authority,
    label: text(source.label, 120) || sourceRef,
    excerpt,
    revision,
    locator
  })
}

export function createAuthoringEvidenceEnvelope(input = {}) {
  const projectId = text(input.projectId)
  const queryIntent = QUERY_INTENTS.has(input.queryIntent) ? input.queryIntent : ''
  if (!projectId || !queryIntent) return null
  const byRef = new Map()
  for (const item of list(input.evidence)) {
    const evidence = normalizeAuthoringEvidence(item, { projectId })
    if (!evidence) continue
    const existing = byRef.get(evidence.sourceRef)
    if (existing && JSON.stringify(evidenceFingerprintInput(existing)) !== JSON.stringify(evidenceFingerprintInput(evidence))) {
      return null
    }
    if (!existing) byRef.set(evidence.sourceRef, evidence)
  }
  const evidence = [...byRef.values()].sort((left, right) => left.sourceRef.localeCompare(right.sourceRef))
  const evidenceByRef = new Map(evidence.map((item) => [item.sourceRef, item]))
  const claims = list(input.claims)
    .map((claim) => normalizeClaim(claim, evidenceByRef, { freeAdvice: queryIntent === 'free' }).claim)
    .filter(Boolean)
  const createdAt = Number(input.createdAt) || Date.now()
  const core = {
    schemaVersion: AUTHORING_EVIDENCE_SCHEMA_VERSION,
    kind: 'authoring-evidence-envelope',
    projectId,
    queryIntent,
    question: text(input.question, 1200),
    claims,
    evidence,
    missingInformation: uniqueText(input.missingInformation, 16),
    sourceAuthorization: buildSourceAuthorization(projectId, evidence),
    createdAt
  }
  return deepFreeze({
    ...core,
    fingerprint: `evidence-${hash({
      projectId,
      queryIntent,
      question: core.question,
      claims,
      evidence: evidence.map(evidenceFingerprintInput),
      missingInformation: core.missingInformation
    })}`
  })
}

function parseModelValue(value) {
  if (value && typeof value === 'object') return value
  const raw = String(value ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)) } catch { /* fail closed below */ }
    }
  }
  return { answer: raw, claims: [] }
}

function normalizeClaim(input, evidenceByRef, { freeAdvice = false } = {}) {
  const claimText = text(input?.text, 1000)
  if (!claimText) return { claim: null, issue: '' }
  const requestedRefs = uniqueText(input?.evidenceRefs, 16)
  const evidenceRefs = freeAdvice
    ? []
    : requestedRefs.filter((ref) => evidenceByRef.has(ref)).sort((left, right) => left.localeCompare(right))
  const citedEvidence = evidenceRefs.map((ref) => evidenceByRef.get(ref)).filter(Boolean)
  const citedAuthorities = [...new Set(citedEvidence.map((item) => item.authority))]
  const unknownReferenceCount = requestedRefs.length - evidenceRefs.length
  const suggestionOnly = citedEvidence.length > 0
    && citedEvidence.every((item) => item.authority === 'suggestion')
  const mixedAuthorities = citedAuthorities.length > 1
  const requestedAuthority = AUTHORITIES.has(input?.authority) ? input.authority : ''
  const authority = requestedAuthority && (requestedAuthority === 'suggestion' || citedAuthorities.includes(requestedAuthority))
    ? requestedAuthority
    : citedAuthorities[0] || 'suggestion'
  let confidence = CLAIM_CONFIDENCE.has(input?.confidence) ? input.confidence : 'unsupported'
  if (confidence === 'supported' && evidenceRefs.length === 0) confidence = 'unsupported'
  if (confidence === 'partial' && evidenceRefs.length === 0) confidence = 'unsupported'
  // 模型声明未知 ref、只引用速记/素材，或把一个来源域冒充另一个来源域时，
  // 都不得保留 supported。未知 ref 不进入返回对象，避免它之后被误当成授权。
  if (confidence === 'supported' && (unknownReferenceCount > 0 || suggestionOnly)) confidence = 'partial'
  if (confidence === 'supported' && mixedAuthorities) confidence = 'partial'
  if (confidence === 'supported' && requestedAuthority && authority !== requestedAuthority) confidence = 'partial'
  return {
    claim: Object.freeze({ text: claimText, authority, confidence, evidenceRefs }),
    issue: unknownReferenceCount > 0 ? '回答引用了未授权资料，已忽略该引用。' : ''
  }
}

function evaluateNumericExpression(expression) {
  const source = text(expression, 240).replace(/\s+/g, '')
  if (!source || !/^[0-9+\-*/().]+$/.test(source)) return { ok: false }
  let offset = 0
  let operations = 0
  const literals = []

  function bump() {
    operations += 1
    if (operations > 128) throw new Error('expression-too-complex')
  }

  function parseNumber() {
    const start = offset
    let dots = 0
    while (offset < source.length && /[0-9.]/.test(source[offset])) {
      if (source[offset] === '.') dots += 1
      if (dots > 1) throw new Error('invalid-number')
      offset += 1
    }
    const token = source.slice(start, offset)
    if (!token || token === '.' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      throw new Error('invalid-number')
    }
    const value = Number(token)
    if (!Number.isFinite(value)) throw new Error('non-finite-number')
    literals.push(value)
    bump()
    return value
  }

  function parsePrimary(depth = 0) {
    if (depth > 24) throw new Error('expression-too-deep')
    if (source[offset] === '(') {
      offset += 1
      const value = parseExpression(depth + 1)
      if (source[offset] !== ')') throw new Error('missing-parenthesis')
      offset += 1
      return value
    }
    return parseNumber()
  }

  function parseUnary(depth = 0) {
    if (source[offset] === '+' || source[offset] === '-') {
      const operator = source[offset]
      offset += 1
      bump()
      const value = parseUnary(depth + 1)
      return operator === '-' ? -value : value
    }
    return parsePrimary(depth)
  }

  function parseTerm(depth = 0) {
    let value = parseUnary(depth)
    while (source[offset] === '*' || source[offset] === '/') {
      const operator = source[offset]
      offset += 1
      bump()
      const right = parseUnary(depth)
      if (operator === '/' && right === 0) throw new Error('division-by-zero')
      value = operator === '*' ? value * right : value / right
      if (!Number.isFinite(value)) throw new Error('non-finite-result')
    }
    return value
  }

  function parseExpression(depth = 0) {
    let value = parseTerm(depth)
    while (source[offset] === '+' || source[offset] === '-') {
      const operator = source[offset]
      offset += 1
      bump()
      const right = parseTerm(depth)
      value = operator === '+' ? value + right : value - right
      if (!Number.isFinite(value)) throw new Error('non-finite-result')
    }
    return value
  }

  try {
    const value = parseExpression()
    if (offset !== source.length || !Number.isFinite(value)) return { ok: false }
    return {
      ok: true,
      expression: source,
      result: Number(value.toPrecision(15)),
      literals
    }
  } catch {
    return { ok: false }
  }
}

function sameNumericValue(left, right) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= Number.EPSILON * scale * 8
}

function expressionInputsAreComplete(literals, inputs) {
  const unused = inputs.map((item, index) => ({ index, value: Math.abs(item.value) }))
  for (const literal of literals) {
    const matchAt = unused.findIndex((item) => sameNumericValue(item.value, Math.abs(literal)))
    if (matchAt < 0) return false
    unused.splice(matchAt, 1)
  }
  return true
}

function normalizeCalculation(input, evidenceByRef) {
  const label = text(input?.label || input?.name, 120) || '计算'
  const expression = text(input?.expression, 240)
  const evaluation = evaluateNumericExpression(expression)
  if (!expression || !evaluation.ok) {
    return { calculation: null, issue: '计算式不安全或无法复算，已忽略。' }
  }
  const requestedInputs = list(input?.inputs).slice(0, 24)
  let invalidInputCount = 0
  let unknownReferenceCount = 0
  const inputs = requestedInputs.flatMap((item) => {
    const inputLabel = text(item?.label || item?.name, 120)
    const value = Number(item?.value)
    if (!inputLabel || !Number.isFinite(value)) {
      invalidInputCount += 1
      return []
    }
    const requestedRefs = uniqueText(item?.evidenceRefs, 8)
    const evidenceRefs = requestedRefs
      .filter((ref) => evidenceByRef.has(ref))
      .sort((left, right) => left.localeCompare(right))
    unknownReferenceCount += requestedRefs.length - evidenceRefs.length
    const unit = text(item?.unit, 32)
    return [{ label: inputLabel, value, ...(unit ? { unit } : {}), evidenceRefs }]
  })
  const everyInputSourced = inputs.length > 0 && inputs.every((item) => (
    item.evidenceRefs.length > 0
    && item.evidenceRefs.some((ref) => evidenceByRef.get(ref)?.authority !== 'suggestion')
  ))
  const completeInputs = invalidInputCount === 0
    && requestedInputs.length === inputs.length
    && expressionInputsAreComplete(evaluation.literals, inputs)
  const issues = []
  if (!completeInputs) issues.push('input-incomplete')
  if (!everyInputSourced) issues.push('source-incomplete')
  if (unknownReferenceCount > 0) issues.push('unauthorized-source')
  const confidence = issues.length ? 'partial' : 'supported'
  const unit = text(input?.unit, 32)
  return {
    calculation: Object.freeze({
      label,
      inputs: deepFreeze(inputs),
      expression: evaluation.expression,
      result: evaluation.result,
      ...(unit ? { unit } : {}),
      confidence,
      issues: Object.freeze(issues)
    }),
    issue: issues.length ? '计算输入或来源不完整，结果仅供核对。' : ''
  }
}

export function createAuthoringKnowledgeAnswer({
  evidenceEnvelope,
  modelOutput,
  createdAt = Date.now()
} = {}) {
  if (!evidenceEnvelope || evidenceEnvelope.kind !== 'authoring-evidence-envelope') return null
  const parsed = parseModelValue(modelOutput)
  const freeAdvice = evidenceEnvelope.queryIntent === 'free'
  const evidenceByRef = new Map(evidenceEnvelope.evidence.map((item) => [item.sourceRef, item]))
  const normalizedClaims = list(parsed.claims)
    .map((claim) => normalizeClaim(claim, evidenceByRef, { freeAdvice }))
  const claims = normalizedClaims.map((item) => item.claim).filter(Boolean)
  const referenced = new Set(claims.flatMap((claim) => claim.evidenceRefs))
  const normalizedCalculations = freeAdvice
    ? []
    : list(parsed.calculations).map((item) => normalizeCalculation(item, evidenceByRef))
  const calculations = normalizedCalculations.map((item) => item.calculation).filter(Boolean)
  for (const calculation of calculations) {
    for (const input of calculation.inputs) input.evidenceRefs.forEach((ref) => referenced.add(ref))
  }
  const missingInformation = uniqueText([
    ...evidenceEnvelope.missingInformation,
    ...list(parsed.missingInformation),
    ...normalizedClaims.map((item) => item.issue).filter(Boolean),
    ...normalizedCalculations.map((item) => item.issue).filter(Boolean)
  ], 16)
  const groundedClaims = claims.filter((claim) => claim.confidence !== 'unsupported' && claim.evidenceRefs.length)
  let answer = text(parsed.answer || parsed.summary, 5000)
  if (!freeAdvice && groundedClaims.length === 0 && calculations.length === 0) {
    answer = '当前资料中没有找到足够依据。'
    if (!missingInformation.length) missingInformation.push('没有可核查的项目资料支持这项回答。')
  } else if (!answer) {
    answer = freeAdvice ? '暂时没有可提供的建议。' : '已找到相关资料，请查看下方依据。'
  }
  const evidence = freeAdvice
    ? []
    : [...referenced]
      .map((ref) => evidenceByRef.get(ref))
      .filter(Boolean)
      .sort((left, right) => left.sourceRef.localeCompare(right.sourceRef))
  const sessionFingerprint = evidenceEnvelope.fingerprint
  const answerCore = {
    schemaVersion: AUTHORING_KNOWLEDGE_ANSWER_SCHEMA_VERSION,
    kind: 'authoring-knowledge-answer',
    projectId: evidenceEnvelope.projectId,
    queryIntent: evidenceEnvelope.queryIntent,
    question: evidenceEnvelope.question,
    answerKind: freeAdvice ? 'free-advice' : 'project-grounded',
    answer,
    claims,
    evidence,
    missingInformation,
    calculations,
    createdAt: Number(createdAt) || Date.now(),
    sessionFingerprint,
    sourceAuthorization: buildSourceAuthorization(evidenceEnvelope.projectId, evidence),
    stale: false,
    staleSources: []
  }
  return deepFreeze({
    ...answerCore,
    // KnowledgeAnswer 保留 EvidenceEnvelope 的全部可消费字段，并只额外增加
    // answer/calculations/session 状态；createdAt/stale 不参与内容指纹。
    fingerprint: `answer-${hash({
      projectId: answerCore.projectId,
      queryIntent: answerCore.queryIntent,
      question: answerCore.question,
      answerKind: answerCore.answerKind,
      answer: answerCore.answer,
      claims: answerCore.claims,
      evidence: answerCore.evidence.map(evidenceFingerprintInput),
      missingInformation: answerCore.missingInformation,
      calculations: answerCore.calculations,
      sessionFingerprint
    })}`
  })
}

// F3 只携带当前 intervention/impact group 真正依赖的证据。未知 ref、跨 envelope
// ref 或只选中 claim 的一部分都 fail-closed，不能制造一份看似完整的新依据。
export function selectAuthoringEvidenceEnvelope(envelope, refs = []) {
  if (!envelope || !['authoring-evidence-envelope', 'authoring-knowledge-answer'].includes(envelope.kind)) {
    return null
  }
  const requestedRefs = uniqueText(refs, 64)
  if (!requestedRefs.length) return null
  const evidenceByRef = new Map(list(envelope.evidence).map((item) => [item.sourceRef, item]))
  if (requestedRefs.some((ref) => !evidenceByRef.has(ref))) return null
  const selected = new Set(requestedRefs)
  const evidence = requestedRefs
    .map((ref) => evidenceByRef.get(ref))
    .sort((left, right) => left.sourceRef.localeCompare(right.sourceRef))
  const claims = list(envelope.claims).filter((claim) => {
    const claimRefs = uniqueText(claim?.evidenceRefs, 16)
    return claimRefs.length > 0 && claimRefs.every((ref) => selected.has(ref))
  })
  return createAuthoringEvidenceEnvelope({
    projectId: envelope.projectId,
    queryIntent: envelope.queryIntent,
    question: envelope.question,
    claims,
    evidence,
    missingInformation: envelope.missingInformation,
    createdAt: envelope.createdAt
  })
}

export function reconcileAuthoringKnowledgeAnswer(answer, currentRevisions = {}) {
  if (!answer || answer.kind !== 'authoring-knowledge-answer') return null
  const staleSources = answer.evidence.flatMap((evidence) => {
    const actual = text(currentRevisions?.[evidence.sourceRef])
    if (actual === evidence.revision) return []
    return [{
      sourceRef: evidence.sourceRef,
      expected: evidence.revision,
      actual,
      reason: actual ? 'revision-changed' : 'source-missing'
    }]
  })
  return deepFreeze({ ...clone(answer), stale: staleSources.length > 0, staleSources })
}
