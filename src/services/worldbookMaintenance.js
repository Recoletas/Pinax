import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'
import { parseJsonFromAiContent } from './worldbookImportGeneration'

export const WORLDBOOK_MAINTENANCE_MODES = Object.freeze({
  CREATE: 'create',
  AUDIT: 'audit',
  REFINE: 'refine'
})

const ENTRY_TYPES = new Set([
  'general', 'rule', 'style', 'forbidden', 'location', 'character',
  'organization', 'item', 'lore', 'quest', 'event'
])
const ACTIONS = new Set(['create', 'update', 'merge', 'retag', 'conflict', 'ignore'])
const MAX_CANDIDATES = 12
const MAX_ENTRY_CONTEXT = 24
const MAX_ENTRY_CONTENT = 2200
const MAX_PROMPT_ENTRY_CONTENT = 720
const MAX_BRIEF = 1600
const AUDIT_TARGETS_PER_BATCH = 2
const MIN_SAME_TYPE_SIMILARITY = 0.28
const MIN_CROSS_TYPE_SIMILARITY = 0.36
const AUDIT_META_PHRASES = new Set([
  '检查', '审查', '整理', '重复', '冲突', '问题', '条目', '世界书', '看看', '是否', '请', '重点', '优化'
])

function text(value, max = Infinity) {
  return String(value || '').trim().slice(0, max)
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => text(value)).filter(Boolean))]
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || !text(entry.id)) return null
  return {
    id: text(entry.id),
    name: text(entry.name || '未命名条目', 120) || '未命名条目',
    type: ENTRY_TYPES.has(text(entry.type).toLowerCase()) ? text(entry.type).toLowerCase() : 'general',
    keys: unique(entry.keys).slice(0, 8),
    keysSecondary: unique(entry.keysSecondary).slice(0, 8),
    content: text(entry.content, MAX_ENTRY_CONTENT),
    group: text(entry.injection?.group || entry.group, 80),
    mode: text(entry.injection?.mode || entry.mode, 20) || 'selective'
  }
}

function cjkNgrams(value) {
  const source = text(value).toLowerCase().replace(/\s+/g, '')
  const terms = new Set(source.match(/[a-z0-9_]{2,}/g) || [])
  const cjk = source.match(/[\u3400-\u9fff]+/g) || []
  for (const chunk of cjk) {
    for (let size = 2; size <= 3; size += 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) {
        terms.add(chunk.slice(index, index + size))
      }
    }
  }
  return terms
}

function entryTerms(entry) {
  return cjkNgrams([
    entry?.name,
    ...(entry?.keys || []),
    ...(entry?.keysSecondary || []),
    entry?.content
  ].join(' '))
}

function briefFocusPhrases(brief) {
  return (text(brief).toLowerCase().match(/[a-z0-9_]{2,}|[\u3400-\u9fff]{2,}/g) || [])
    .filter((phrase) => !AUDIT_META_PHRASES.has(phrase))
}

function entryMatchesBrief(entry, brief) {
  const phrases = briefFocusPhrases(brief)
  if (!phrases.length) return true
  const source = [
    entry?.name,
    ...(entry?.keys || []),
    ...(entry?.keysSecondary || []),
    entry?.content
  ].join(' ').toLowerCase()
  return phrases.some((phrase) => source.includes(phrase))
}

function similarity(left, right) {
  const a = entryTerms(left)
  const b = entryTerms(right)
  if (!a.size || !b.size) return 0
  let overlap = 0
  for (const term of a) if (b.has(term)) overlap += 1
  return overlap / (a.size + b.size - overlap)
}

function entrySnapshot(entry) {
  const normalized = normalizeEntry(entry)
  if (!normalized) return null
  return {
    id: normalized.id,
    name: normalized.name,
    type: normalized.type,
    keys: normalized.keys,
    keysSecondary: normalized.keysSecondary,
    group: normalized.group,
    mode: normalized.mode,
    content: normalized.content.slice(0, MAX_PROMPT_ENTRY_CONTENT)
  }
}

function compactWorldbook(worldbook) {
  const entries = (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .map(entrySnapshot)
    .filter(Boolean)
    .slice(0, MAX_ENTRY_CONTEXT)
  return {
    name: text(worldbook?.name, 120),
    description: text(worldbook?.worldDescription || worldbook?.description, 1400),
    writingStyle: text(worldbook?.writingStyle, 800),
    forbidden: text(worldbook?.forbidden, 800),
    entries
  }
}

export function findWorldbookAuditCandidates(entries = [], options = {}) {
  const normalized = (Array.isArray(entries) ? entries : []).map(normalizeEntry).filter(Boolean)
  const selectedIds = new Set((options.selectedEntryIds || []).map((id) => text(id)).filter(Boolean))
  const brief = text(options.brief, MAX_BRIEF)
  const pairs = []
  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      const left = normalized[leftIndex]
      const right = normalized[rightIndex]
      if (selectedIds.size && !selectedIds.has(left.id) && !selectedIds.has(right.id)) continue
      const explicitlySelected = selectedIds.has(left.id) || selectedIds.has(right.id)
      if (!explicitlySelected && !entryMatchesBrief(left, brief) && !entryMatchesBrief(right, brief)) continue
      const score = similarity(left, right)
      const sameType = left.type === right.type
      const sameName = left.name.toLowerCase() === right.name.toLowerCase()
      if (sameName || score >= (sameType ? MIN_SAME_TYPE_SIMILARITY : MIN_CROSS_TYPE_SIMILARITY)) {
        pairs.push({
          score: Number(score.toFixed(3)),
          entryIds: [left.id, right.id],
          entries: [entrySnapshot(left), entrySnapshot(right)]
        })
      }
    }
  }
  return pairs.sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES)
}

export function findWorldbookAuditTargets(entries = [], options = {}) {
  const normalized = (Array.isArray(entries) ? entries : []).map(normalizeEntry).filter(Boolean)
  const pairs = findWorldbookAuditCandidates(normalized, options)
  const pairedIds = new Set(pairs.flatMap((pair) => pair.entryIds))
  const selectedIds = new Set((options.selectedEntryIds || []).map((id) => text(id)).filter(Boolean))
  const brief = text(options.brief, MAX_BRIEF)
  const rawEntries = Array.isArray(entries) ? entries : []
  const getAuditIssues = (entry) => {
    const raw = rawEntries.find((item) => text(item?.id) === entry.id)
    const contentLength = String(raw?.content || '').trim().length
    return [
      entry.mode !== 'constant' && entry.keys.length === 0 && entry.keysSecondary.length === 0 ? 'missing-trigger' : '',
      contentLength > 1800 ? 'oversized-content' : '',
      /^新条目|未命名条目|补充该条目/.test(entry.name) ? 'placeholder-name' : ''
    ].filter(Boolean)
  }
  const singles = normalized
    .filter((entry) => {
      if (pairedIds.has(entry.id)) return false
      if (selectedIds.size && !selectedIds.has(entry.id)) return false
      if (!selectedIds.has(entry.id) && !entryMatchesBrief(entry, brief)) return false
      return getAuditIssues(entry).length > 0
    })
    .map((entry) => {
      const issues = getAuditIssues(entry)
      return {
        score: 1,
        kind: issues[0],
        issues,
        entryIds: [entry.id],
        entries: [entrySnapshot(entry)]
      }
    })
  return [
    ...pairs.map((pair) => ({ ...pair, kind: 'similar-pair', issues: ['similar-pair'] })),
    ...singles
  ].slice(0, MAX_CANDIDATES)
}

export function chunkWorldbookAuditTargets(targets = [], chunkSize = AUDIT_TARGETS_PER_BATCH) {
  const normalizedTargets = Array.isArray(targets) ? targets.filter(Boolean) : []
  const size = Math.max(1, Number.parseInt(chunkSize, 10) || AUDIT_TARGETS_PER_BATCH)
  const batches = []
  for (let index = 0; index < normalizedTargets.length; index += size) {
    batches.push(normalizedTargets.slice(index, index + size))
  }
  return batches
}

function relevantEntries(worldbook, brief, selectedEntryIds = []) {
  const entries = (Array.isArray(worldbook?.entries) ? worldbook.entries : []).map(normalizeEntry).filter(Boolean)
  const selected = new Set((selectedEntryIds || []).map((id) => text(id)).filter(Boolean))
  const briefTerms = cjkNgrams(brief)
  return entries
    .map((entry) => {
      const terms = entryTerms(entry)
      let score = selected.has(entry.id) ? 100 : 0
      for (const term of briefTerms) if (terms.has(term)) score += 1
      return { entry, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRY_CONTEXT)
    .map(({ entry }) => entrySnapshot(entry))
}

function buildPrompt({ worldbook, mode, brief, selectedEntryIds, auditTargetSubset }) {
  const normalizedBrief = text(brief, MAX_BRIEF)
  const selected = (selectedEntryIds || []).map((id) => text(id)).filter(Boolean)
  const compact = compactWorldbook(worldbook)
  const auditTargets = mode === WORLDBOOK_MAINTENANCE_MODES.AUDIT
    ? (Array.isArray(auditTargetSubset)
        ? auditTargetSubset
        : findWorldbookAuditTargets(worldbook?.entries, { selectedEntryIds: selected, brief: normalizedBrief }))
    : []
  const contextEntries = mode === WORLDBOOK_MAINTENANCE_MODES.AUDIT
    ? auditTargets.flatMap((target) => target.entries)
    : relevantEntries(worldbook, normalizedBrief, selected)
  const dedupedEntries = [...new Map(contextEntries.filter(Boolean).map((entry) => [entry.id, entry])).values()]
  const modeInstruction = mode === WORLDBOOK_MAINTENANCE_MODES.CREATE
    ? '根据用户要求新增一至三条候选设定。已有条目能承载该信息时，优先提出 update 或 merge，而不是重复 create。'
    : mode === WORLDBOOK_MAINTENANCE_MODES.REFINE
      ? '只处理用户选中的条目。可以提出 update、merge 或 conflict，但不得无理由删除已有事实。'
      : '只审查给出的本地预筛目标。判断是真重复、部分重叠、潜在冲突、触发词/正文问题还是应保留；没有充分依据时返回 ignore。'
  return [
    '你是 Pinax 世界书维护编辑。你的输出是给用户逐项审阅的候选操作，不是最终写入命令。',
    '只返回严格 JSON 对象，不要 Markdown、标题、解释、分析或思考过程。',
    `当前模式：${mode}`,
    modeInstruction,
    '每个 candidate 必须包含 action、entryIds、confidence、reason；create/update/merge/retag 必须提供 proposedEntry。',
    'proposedEntry 只允许 name、type、keys、keysSecondary、content、group、mode；不要丢失已有事实，不要擅自改变时间、人物关系或因果。',
    'action 只能是 create、update、merge、retag、conflict、ignore；entryIds 只能使用上下文中的真实 ID；最多返回 12 个候选。',
    '新增内容要具体、可作为世界书条目直接使用；避免把同一事实拆成多个重复条目。',
    normalizedBrief ? `【用户自然语言要求】\n${normalizedBrief}` : '',
    selected.length ? `【用户选中的条目 ID】\n${selected.join(', ')}` : '',
    `【世界书摘要】\n${JSON.stringify({ ...compact, entries: dedupedEntries })}`,
    mode === WORLDBOOK_MAINTENANCE_MODES.AUDIT
      ? `【本地预筛审查目标】\n${JSON.stringify(auditTargets.map(({ kind, issues, score, entryIds }) => ({ kind, issues, score, entryIds })))}\n没有出现在预筛列表的条目不要审查；同一目标的 issues 需要全部检查。`
      : '',
    '返回格式：{"summary":"简短结论","candidates":[{"action":"create","entryIds":[],"confidence":"high|medium|low","reason":"...","proposedEntry":{"name":"...","type":"lore","keys":["..."],"keysSecondary":[],"content":"...","group":"设定","mode":"selective"}}]}'
  ].filter(Boolean).join('\n\n')
}

export function buildWorldbookMaintenanceMessages(options = {}) {
  return [
    {
      role: 'system',
      content: '你是世界书维护编辑。只返回可审阅的 JSON 候选操作，不直接修改世界书。'
    },
    {
      role: 'user',
      content: buildPrompt(options)
    }
  ]
}

function normalizeProposedEntry(raw = {}) {
  if (!raw || typeof raw !== 'object') return null
  const type = text(raw.type).toLowerCase()
  const name = text(raw.name, 120)
  const content = text(raw.content, 2200)
  if (!name || !content || !ENTRY_TYPES.has(type)) return null
  return {
    name,
    type,
    keys: unique(raw.keys).slice(0, 8),
    keysSecondary: unique(raw.keysSecondary).slice(0, 8),
    content,
    group: text(raw.group, 80),
    mode: text(raw.mode, 20) === 'constant' ? 'constant' : 'selective'
  }
}

export function normalizeWorldbookMaintenanceResult(parsed, worldbook, options = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const knownIds = (Array.isArray(worldbook?.entries) ? worldbook.entries : []).map((entry) => text(entry?.id)).filter(Boolean)
  const allowedIds = new Set((Array.isArray(options.allowedEntryIds) ? options.allowedEntryIds : knownIds).map((id) => text(id)).filter(Boolean))
  const candidates = (Array.isArray(parsed.candidates) ? parsed.candidates : [])
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => {
      const action = text(candidate?.action).toLowerCase()
      const entryIds = unique(candidate?.entryIds).filter((id) => allowedIds.has(id)).slice(0, 6)
      const proposedEntry = normalizeProposedEntry(candidate?.proposedEntry)
      if (!ACTIONS.has(action)) return null
      if (!['create'].includes(action) && entryIds.length === 0) return null
      if (['create', 'update', 'merge', 'retag'].includes(action) && !proposedEntry) return null
      return {
        id: text(candidate?.id) || `maintenance_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        action,
        entryIds,
        confidence: ['high', 'medium', 'low'].includes(text(candidate?.confidence).toLowerCase())
          ? text(candidate.confidence).toLowerCase()
          : 'medium',
        reason: text(candidate?.reason, 600),
        proposedEntry,
        status: 'pending'
      }
    })
    .filter(Boolean)
  return {
    summary: text(parsed.summary, 800),
    candidates
  }
}

export async function runWorldbookMaintenance({
  worldbook,
  mode = WORLDBOOK_MAINTENANCE_MODES.AUDIT,
  brief = '',
  selectedEntryIds = [],
  settings = null,
  signal = null
} = {}) {
  if (!worldbook?.id) return { ok: false, reason: '没有可用的世界书。' }
  if (!Object.values(WORLDBOOK_MAINTENANCE_MODES).includes(mode)) return { ok: false, reason: '世界书处理模式无效。' }
  if (mode !== WORLDBOOK_MAINTENANCE_MODES.AUDIT && !text(brief) && !selectedEntryIds.length) {
    return { ok: false, reason: '请先输入自然语言要求或选择条目。' }
  }
  const auditTargets = mode === WORLDBOOK_MAINTENANCE_MODES.AUDIT
    ? findWorldbookAuditTargets(worldbook.entries, { selectedEntryIds, brief })
    : []
  if (mode === WORLDBOOK_MAINTENANCE_MODES.AUDIT && !auditTargets.length) {
    return { ok: true, summary: '本地预筛没有发现需要审查的目标。', candidates: [] }
  }
  const apiSettings = settings || await getResolvedApiSettings()
  const batches = mode === WORLDBOOK_MAINTENANCE_MODES.AUDIT
    ? chunkWorldbookAuditTargets(auditTargets)
    : [null]
  const completed = []
  const failures = []
  for (const [batchIndex, auditTargetSubset] of batches.entries()) {
    const batchResult = await runWorldbookMaintenanceBatch({
      worldbook,
      mode,
      brief,
      selectedEntryIds,
      auditTargetSubset,
      settings: apiSettings,
      batchIndex
    })
    if (batchResult.ok) completed.push(batchResult)
    else failures.push(batchResult.reason || `第 ${batchIndex + 1} 批审查失败。`)
  }
  if (!completed.length) {
    return { ok: false, reason: failures[0] || '世界书处理失败。' }
  }
  const seenCandidates = new Set()
  const candidates = completed
    .flatMap((batch) => batch.result.candidates || [])
    .filter((candidate) => {
      const signature = [
        candidate.action,
        [...candidate.entryIds].sort().join(','),
        candidate.proposedEntry?.name || '',
        candidate.proposedEntry?.content || '',
        candidate.reason || ''
      ].join('|')
      if (seenCandidates.has(signature)) return false
      seenCandidates.add(signature)
      return true
    })
    .slice(0, MAX_CANDIDATES)
  const summaries = completed.map((batch, index) => batch.result.summary || `第 ${index + 1} 批已完成。`)
  if (failures.length) {
    summaries.push(`已完成 ${completed.length}/${batches.length} 批；${failures.length} 批失败，未覆盖的目标请重新审查。`)
  }
  return {
    ok: true,
    summary: summaries.join('；'),
    candidates,
    sourceRevision: String(worldbook.updatedAt || ''),
    mode,
    warnings: failures,
    meta: {
      batchCount: batches.length,
      completedBatchCount: completed.length,
      failedBatchCount: failures.length,
      responses: completed.map((batch) => batch.generation?.response?.meta || null)
    }
  }
}

async function runWorldbookMaintenanceBatch({
  worldbook,
  mode,
  brief,
  selectedEntryIds,
  auditTargetSubset = null,
  settings,
  batchIndex = 0
}) {
  const messages = buildWorldbookMaintenanceMessages({
    worldbook,
    mode,
    brief,
    selectedEntryIds,
    auditTargetSubset
  })
  const isAudit = mode === WORLDBOOK_MAINTENANCE_MODES.AUDIT
  try {
    const generation = await runGenerationTask({
      taskType: `worldbook.maintenance.${mode}`,
      baseMessages: messages,
      settings,
      generationOptions: {
        max_tokens: isAudit ? 2800 : 4200,
        temperature: 0.1,
        max_input_chars: isAudit ? 16000 : 20000,
        timeout_ms: 90000,
        response_format: { type: 'json_object' },
        request_id: `worldbook_maintenance_b${batchIndex + 1}`
      },
      attempts: [
        { name: `worldbook-maintenance-first-${batchIndex + 1}` },
        {
          name: `worldbook-maintenance-repair-${batchIndex + 1}`,
          generationOptions: {
            response_format: null,
            max_tokens: isAudit ? 3200 : 4600,
            max_input_chars: isAudit ? 16000 : 20000,
            reasoning_effort: 'low',
          },
          appendMessages: [{
            role: 'user',
            content: '上一轮没有返回可用候选。请只返回严格 JSON，保留真实 entryIds，候选最多 12 个，不要输出思考过程。'
          }]
        },
        {
          name: `worldbook-maintenance-concise-${batchIndex + 1}`,
          generationOptions: {
            response_format: null,
            max_tokens: isAudit ? 3600 : 5000,
            max_input_chars: isAudit ? 14000 : 18000,
            temperature: 0.2,
            reasoning_effort: 'low',
          },
          appendMessages: [{
            role: 'user',
            content: '请重新完成本次任务。只输出一个 JSON 对象，不要思考过程、Markdown 或说明文字；即使没有修改建议，也必须返回 {"summary":"...","candidates":[]}。'
          }]
        }
      ],
      parseContent: parseJsonFromAiContent,
      isValidParsed: (parsed) => Boolean(normalizeWorldbookMaintenanceResult(parsed, worldbook, { allowedEntryIds: worldbook.entries.map((entry) => entry.id) }))
        && Array.isArray(parsed?.candidates)
    })
    if (!generation?.success) {
      const errorCode = generation?.requestError?.code || ''
      return {
        ok: false,
        reason: errorCode === 'UPSTREAM_EMPTY_CONTENT'
          ? '上游模型连续返回空内容，已自动重试 3 次；请检查当前模型是否只输出思考过程，或切换到普通文本模型后再试。'
          : (generation?.content
            ? 'AI 返回无法解析为世界书处理结果。'
            : (generation?.requestError?.message || '世界书处理失败。'))
      }
    }
    const result = normalizeWorldbookMaintenanceResult(generation.parsed, worldbook, {
      allowedEntryIds: worldbook.entries.map((entry) => entry.id)
    })
    if (!result) return { ok: false, reason: 'AI 返回的世界书处理结果未通过本地校验。' }
    return { ok: true, result, generation }
  } catch (error) {
    if (error?.code === 'UPSTREAM_EMPTY_CONTENT' || String(error?.message || '').includes('[UPSTREAM_EMPTY_CONTENT]')) {
      return {
        ok: false,
        reason: '上游模型连续返回空内容，已自动重试 3 次；请检查当前模型是否只输出思考过程，或切换到普通文本模型后再试。'
      }
    }
    return { ok: false, reason: error?.message || '世界书处理失败。' }
  }
}
