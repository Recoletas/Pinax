// NC07/NC08：结构化记忆提取（模型链）。
// 参考 Utopia utopia-extract（commit dbb9298…，MIT）的「结构化输出 + 原句引用 +
// 否定/传闻语义保留」思路；不引入其 Rust 实现或数据库。
// 硬约束：每条 claim 必须携带能在冻结原文中逐字命中的 quote；引文不命中、
// 字段缺失、关系方向可疑、实体歧义的提案不进入待审（逐项校验，部分失败可见）。
import { requestAdvisorTask } from '../../advisorTaskService.js'
import { buildContextEnvelope, clipContextEnvelope } from '../../agents/agentContextEnvelope.js'
import { extractionCacheKey, readCachedExtraction, writeCachedExtraction } from './extractionResultCache'

export const MEMORY_EXTRACTION_TASK_ID = 'memory.extraction'

export const CLAIM_POLARITIES = Object.freeze(['positive', 'negative', 'hedged', 'report'])

const EXTRACTION_INSTRUCTION = [
  '你是小说事实提取器。只依据「原文」块抽取明确的、当前故事内已发生的人物事实三元组。',
  '对每个事实输出：subject（人物名，与原文用字一致）、predicate（动词或关系短语）、object（宾语或结果，保留大小写与单位）、quote（支撑该事实的原句，逐字复制，不得改写）、polarity（positive=确定发生；negative=明确否定；hedged=假设/条件/可能；report=人物转述或梦境谎言等非作者断言）、storyTime（时间未知时 precision 填 unknown，禁止用今天日期补）、confidence（0~1）。',
  '规则：不编造原文没有的人物或关系；两人同名时跳过并在 unextractable 说明；「甲说乙死了」只能输出 polarity=report 且 quote 含该转述句；没有可提取事实时 proposals 为空数组并给出 unextractable.reason。',
  '只返回严格 JSON：{"proposals":[{"subject":"...","predicate":"...","object":"...","quote":"...","polarity":"positive","storyTime":{"precision":"unknown"},"confidence":0.8}],"unextractable":{"reason":""}}'
].join('\n')

function text(value) {
  return String(value ?? '').trim()
}

function parseJson(raw) {
  const source = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  if (!source) return null
  try {
    return JSON.parse(source)
  } catch {
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(source.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function normalizeForQuoteMatch(value) {
  return String(value ?? '').replace(/\s+/g, '')
}

// NC08：引文必须能在冻结原文中逐字命中（去空白比较，容忍排版换行）。
export function quoteExistsInSource(quote, sourceText) {
  const needle = normalizeForQuoteMatch(quote)
  if (!needle) return false
  return normalizeForQuoteMatch(sourceText).includes(needle)
}

function normalizeStoryTime(input) {
  if (!input || typeof input !== 'object') return { precision: 'unknown' }
  const precision = ['unknown', 'relative', 'label'].includes(input.precision) ? input.precision : 'unknown'
  if (precision === 'unknown') return { precision }
  return { precision, label: text(input.label).slice(0, 60) }
}

// 已知实体目录（可选）：resolved=唯一稳定 id；ambiguous=多人同名 → 无产出；
// unresolved=目录外实体 → 保留待审但带标记（由作者裁决）。
export function resolveEntityStatus(subject, knownIdentities = []) {
  const name = text(subject)
  if (!name || !Array.isArray(knownIdentities) || !knownIdentities.length) {
    return { status: 'unflagged', id: '' }
  }
  const matches = knownIdentities
    .map((identity) => ({
      id: text(identity?.id || identity?.entryId || ''),
      aliases: [identity?.name, identity?.title, ...(Array.isArray(identity?.aliases) ? identity.aliases : [])]
        .map((alias) => text(alias)).filter(Boolean)
    }))
    .filter((identity) => identity.aliases.includes(name))
  const stableIds = [...new Set(matches.map((match) => match.id).filter(Boolean))]
  if (matches.length > 1 && stableIds.length > 1) return { status: 'ambiguous', id: '' }
  if (stableIds.length === 1) return { status: 'resolved', id: stableIds[0] }
  return { status: 'unresolved', id: '' }
}

/**
 * 逐项校验模型输出。返回 { proposals, rejected }：
 * - proposals 可进入待审（含 polarity/entityStatus/storyTime 元数据）
 * - rejected 每项带 reason（引文不命中/字段缺失/实体歧义/重复），部分失败可见
 */
export function validateMemoryExtractionResponse(parsed, { sourceText = '', knownIdentities = [] } = {}) {
  const rejected = []
  if (!parsed || !Array.isArray(parsed.proposals)) {
    return { proposals: [], rejected: [{ reason: 'response-schema-invalid' }] }
  }
  const seen = new Set()
  const proposals = []
  for (const raw of parsed.proposals.slice(0, 12)) {
    const subject = text(raw?.subject)
    const predicate = text(raw?.predicate)
    const object = text(raw?.object)
    const quote = text(raw?.quote)
    if (!subject || !predicate || !object) {
      rejected.push({ reason: 'claim-fields-missing', raw: { subject, predicate, object } })
      continue
    }
    if (!quoteExistsInSource(quote, sourceText)) {
      rejected.push({ reason: 'quote-missing-in-source', quote: quote.slice(0, 60) })
      continue
    }
    const polarity = CLAIM_POLARITIES.includes(raw?.polarity) ? raw.polarity : 'positive'
    const confidenceRaw = Number(raw?.confidence)
    const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0.5
    const entity = resolveEntityStatus(subject, knownIdentities)
    if (entity.status === 'ambiguous') {
      rejected.push({ reason: 'ambiguous-entity', subject })
      continue
    }
    const fingerprint = `${subject}\u0000${predicate}\u0000${object}\u0000${polarity}`
    if (seen.has(fingerprint)) {
      rejected.push({ reason: 'duplicate-claim', subject, predicate })
      continue
    }
    seen.add(fingerprint)
    proposals.push({
      subject,
      subjectKey: subject.toLowerCase().replace(/\s+/g, ' '),
      predicate: predicate.toLowerCase().replace(/\s+/g, ' '),
      object,
      quote,
      polarity,
      storyTime: normalizeStoryTime(raw?.storyTime),
      confidence,
      entityStatus: entity.status,
      entityId: entity.id
    })
  }
  return { proposals, rejected }
}

export function buildMemoryExtractionEnvelope({
  sourceText = '',
  sourceRef = '',
  sourceRevision = '',
  knownIdentities = []
} = {}) {
  const frozenSource = text(sourceText)
  if (!frozenSource || !text(sourceRef)) return null
  const blocks = [
    {
      kind: 'rules',
      priority: 1000,
      content: EXTRACTION_INSTRUCTION,
      sourceRefs: [sourceRef]
    },
    {
      kind: 'selection',
      priority: 900,
      content: `【原文（冻结 revision=${sourceRevision || 'unknown'}）】\n${frozenSource}`,
      sourceRefs: [sourceRef]
    }
  ]
  if (Array.isArray(knownIdentities) && knownIdentities.length) {
    blocks.push({
      kind: 'memory',
      priority: 800,
      content: `【已知人物】${knownIdentities.map((identity) => text(identity?.name || identity)).filter(Boolean).join('、')}`,
      sourceRefs: [sourceRef]
    })
  }
  return clipContextEnvelope(buildContextEnvelope({
    surface: 'authoring',
    projectId: null,
    target: { type: 'memory-extraction', id: sourceRef, revision: sourceRevision || null },
    blocks,
    budget: { maxChars: 16000 }
  }), 16000)
}

export function parseMemoryExtractionResponse(raw) {
  const parsed = raw && typeof raw === 'object' ? raw : parseJson(raw)
  if (!parsed) return null
  if (Array.isArray(parsed.proposals) || parsed.unextractable) return parsed
  if (Array.isArray(parsed.claims)) return { proposals: parsed.claims, unextractable: { reason: '' } }
  return null
}

/**
 * 通过现有 advisor dispatcher 调一次结构化提取（toolChoice=none）。
 * 返回原始解析结果（未校验）；校验由 validateMemoryExtractionResponse 负责。
 */
export async function runMemoryExtraction(request = {}, { signal = null, cache = true } = {}) {
  const envelope = request.envelope || buildMemoryExtractionEnvelope(request)
  if (!envelope) {
    const error = new Error('缺少冻结原文或来源引用，不能提取')
    error.code = 'MEMORY_EXTRACTION_REQUEST_INVALID'
    error.retryable = false
    throw error
  }
  // M07：缓存键绑定冻结请求（来源引用+修订+原文）。命中即不付出模型调用；
  // 校验仍在调用方每次执行，knownIdentities 变化不受缓存影响。
  const cacheKey = cache
    ? extractionCacheKey({
      sourceRef: request.sourceRef || '',
      sourceRevision: request.sourceRevision || '',
      sourceText: typeof request.sourceText === 'string' ? request.sourceText : JSON.stringify(envelope.blocks || '')
    })
    : null
  if (cacheKey) {
    const cached = readCachedExtraction(cacheKey)
    if (cached) {
      return { parsed: cached.parsed, meta: { provider: 'extraction-cache', requestId: cacheKey }, cached: true }
    }
  }
  const result = await requestAdvisorTask({
    envelope,
    question: '从冻结原文中提取有引文支撑的事实三元组，只返回约定 JSON。',
    taskType: MEMORY_EXTRACTION_TASK_ID,
    scope: 'writing',
    mode: 'direct',
    options: {
      toolChoice: 'none',
      maxOutputChars: 6000
    },
    signal
  })
  const raw = result?.result?.text ?? result?.result ?? result?.advice
  const parsed = parseMemoryExtractionResponse(raw)
  if (!parsed) {
    const error = new Error('提取结果不是有效 JSON')
    error.code = 'MEMORY_EXTRACTION_RESULT_INVALID'
    error.retryable = true
    error.parseFailed = true
    throw error
  }
  if (cacheKey) writeCachedExtraction(cacheKey, parsed)
  return { parsed, meta: { provider: result?.meta?.provider || '', requestId: result?.meta?.requestId || '' }, cached: false }
}
