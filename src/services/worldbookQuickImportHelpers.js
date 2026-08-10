/**
 * 世界书·快速导入 共享 helpers
 *
 * 提取自 WorldBookQuickImport.vue 的纯函数 + 流程编排 helper。
 * 这些 helper 同时被快速导入页与高级设置编辑器复用，确保两边行为一致。
 *
 * 包含：
 * - 纯归一函数：normalizeText / normalizeEntryType / normalizeKeywords / uniqueGroups
 * - 条目工厂：createSeedEntry / normalizeGeneratedEntry
 * - Payload 归一：buildPendingPayload
 * - UI 派生：getFeaturedPressureRow / getHookExcerpt
 */

import {
  tryAiExtractWorldbookJson,
  tryAiGenerateWorldbookJsonFromBrief
} from './worldbookImportGeneration'
import { formatWorldbookStatus } from './worldbookFeedback'
import { seedWorldbookPresets as presets } from './seedWorldbookPresets'
import { createEmptyStructuredSettings, normalizeStructuredSettings } from './settingPanelSchema'
import {
  buildPlayableWorldActionHooks,
  savePlayableWorldEntryIntent
} from './playableWorldEntry'
import {
  normalizeResearchClaims,
  normalizeResearchConflicts,
  refreshResearchReview
} from './worldbookResearchClaims'
import { createResearchRevision } from './worldbookResearchRevision'

// ----- Entry-type constants (mirrors WorldBookQuickImport.vue) -----

const ENTRY_TYPE_VALUES = new Set([
  'location',
  'character',
  'item',
  'event',
  'lore',
  'quest',
  'general',
  'rule',
  'style',
  'forbidden',
  'organization'
])

const CONSTRAINT_TYPES = new Set(['rule', 'style', 'forbidden'])

export const entryTypeOptions = [
  { value: 'general', label: '通用' },
  { value: 'rule', label: '规则' },
  { value: 'style', label: '风格' },
  { value: 'forbidden', label: '禁忌' },
  { value: 'location', label: '地点' },
  { value: 'character', label: '角色' },
  { value: 'organization', label: '组织' },
  { value: 'item', label: '物品' },
  { value: 'lore', label: '设定' },
  { value: 'quest', label: '任务' },
  { value: 'event', label: '事件' }
]

// ----- Pure normalize helpers -----

export function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeEntryType(typeValue) {
  const normalized = normalizeText(typeValue).toLowerCase()
  if (ENTRY_TYPE_VALUES.has(normalized)) return normalized
  if (normalized === 'org' || normalized === 'faction') return 'organization'
  if (normalized === 'setting') return 'lore'
  return 'general'
}

export function isConstraintType(typeValue) {
  return CONSTRAINT_TYPES.has(normalizeEntryType(typeValue))
}

export function inferConstraintTypeFromSignals({ name = '', content = '', keys = [] } = {}) {
  const keyList = Array.isArray(keys) ? keys : []
  const corpus = [name, content, ...keyList]
    .map((part) => normalizeText(part).toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (!corpus) return ''
  if (/(禁止|禁忌|不得|不能|不可|严禁|forbidden|ban|avoid)/.test(corpus)) return 'forbidden'
  if (/(风格|文风|语气|叙事|视角|style|tone)/.test(corpus)) return 'style'
  if (/(规则|约束|必须|一致性|设定边界|rule|constraint)/.test(corpus)) return 'rule'
  return ''
}

export function inferEntryType(typeValue, name = '', content = '', keys = []) {
  const normalizedType = normalizeEntryType(typeValue)
  if (normalizedType !== 'general' && normalizedType !== 'lore') {
    return normalizedType
  }
  return inferConstraintTypeFromSignals({ name, content, keys }) || normalizedType
}

export function normalizeGroupName(groupValue) {
  return normalizeText(groupValue)
}

export function normalizeKeywords(value, fallback = '') {
  const fromArray = Array.isArray(value) ? value : [value]
  const tokens = []

  for (const item of fromArray) {
    const normalized = String(item || '')
      .split(/[\n,，、|/]/)
      .map((part) => part.trim())
      .filter(Boolean)
    tokens.push(...normalized)
  }

  if (!tokens.length && fallback) {
    tokens.push(fallback.slice(0, 16))
  }

  return Array.from(new Set(tokens)).slice(0, 6)
}

export function clampNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function uniqueGroups(groups = []) {
  const seen = new Set()
  const result = []
  for (const group of groups) {
    const normalized = normalizeGroupName(group)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

export function entryTypeLabel(typeValue) {
  const matched = entryTypeOptions.find((item) => item.value === typeValue)
  return matched?.label || typeValue || '通用'
}

// ----- Entry content / injection -----

const CONSTRAINT_CONTENT_DEFAULTS = {
  rule: '涉及世界规则、身份关系和事件因果时必须保持一致，不得自相矛盾。',
  style: '输出需持续保持既定叙事视角、语气强度与文风边界。',
  forbidden: '严禁生成与设定冲突或被明确禁止的内容。'
}

export function ensureEntryContent(type, name, content) {
  const normalized = normalizeText(content)
  if (normalized.length >= 24) return normalized

  if (isConstraintType(type)) {
    const suffix = CONSTRAINT_CONTENT_DEFAULTS[normalizeEntryType(type)] || CONSTRAINT_CONTENT_DEFAULTS.rule
    return normalized ? `${normalized} ${suffix}` : `${name}：${suffix}`
  }

  if (normalized) return normalized
  return `${name}：补充该条目的背景、边界与影响范围。`
}

export function resolveInjectionPolicy(rawEntry, type, name, content, keys = []) {
  const injectionSource = rawEntry?.injection && typeof rawEntry.injection === 'object'
    ? rawEntry.injection
    : {}
  const modeText = normalizeText(rawEntry?.mode || injectionSource.mode || '').toLowerCase()
  const explicitMode = rawEntry?.constant === true || injectionSource.mode === 'constant'
    ? 'constant'
    : (modeText === 'constant'
      ? 'constant'
      : (modeText === 'selective' || rawEntry?.selective === true ? 'selective' : ''))

  const inferredConstraint = isConstraintType(type) || Boolean(inferConstraintTypeFromSignals({ name, content, keys }))
  const mode = inferredConstraint ? 'constant' : (explicitMode === 'constant' ? 'constant' : 'selective')
  const depthFallback = mode === 'constant' ? 2 : 1

  return {
    mode,
    probability: mode === 'constant' ? 100 : clampNumber(rawEntry?.probability ?? injectionSource.probability, 100, 0, 100),
    cooldown: clampNumber(rawEntry?.cooldown ?? injectionSource.cooldown, 0, 0, 9999),
    depth: clampNumber(rawEntry?.depth ?? injectionSource.depth, depthFallback, 1, 99),
    excludeRecursion: Boolean(rawEntry?.excludeRecursion ?? injectionSource.excludeRecursion)
  }
}

export function defaultGroupByType(typeValue) {
  const type = normalizeEntryType(typeValue)
  if (type === 'rule') return '硬约束'
  if (type === 'style') return '文风约束'
  if (type === 'forbidden') return '禁写边界'
  if (type === 'character') return '角色'
  if (type === 'location') return '地理'
  if (type === 'item') return '道具'
  if (type === 'organization') return '组织'
  if (type === 'event') return '事件'
  if (type === 'lore') return '设定'
  if (type === 'quest') return '任务'
  return '通用'
}

// ----- Seed entry / generated entry -----

export function createSeedEntry(type, name, keys, content, group, mode = '') {
  const normalizedKeys = normalizeKeywords(keys, name)
  const normalizedType = inferEntryType(type, name, content, normalizedKeys)
  const normalizedContent = ensureEntryContent(normalizedType, name, content)
  const injection = resolveInjectionPolicy({ mode }, normalizedType, name, normalizedContent, normalizedKeys)

  return {
    id: `seed_${Math.random().toString(36).slice(2, 10)}`,
    name,
    type: normalizedType,
    keys: normalizedKeys,
    keysSecondary: [],
    content: normalizedContent,
    injection: {
      ...injection,
      group: normalizeGroupName(group) || null
    }
  }
}

export function normalizeGeneratedEntry(rawEntry, index = 0) {
  const rawType = normalizeEntryType(rawEntry?.type)
  const fallbackName = `${entryTypeLabel(rawType)}条目${index + 1}`
  const name = normalizeText(rawEntry?.name || rawEntry?.title || fallbackName) || fallbackName
  const keys = normalizeKeywords(rawEntry?.keys || rawEntry?.keywords || rawEntry?.key, name)
  const type = inferEntryType(rawType, name, rawEntry?.content || rawEntry?.description || '', keys)
  const content = ensureEntryContent(type, name, rawEntry?.content || rawEntry?.description || `${name}相关设定。`)
  const keysSecondary = normalizeKeywords(rawEntry?.keysSecondary || rawEntry?.secondary || rawEntry?.keysecondary)
  const group = normalizeGroupName(rawEntry?.group || rawEntry?.category || rawEntry?.injection?.group || defaultGroupByType(type)) || null
  const injection = resolveInjectionPolicy(rawEntry, type, name, content, keys)
  const claimIds = [...new Set((Array.isArray(rawEntry?.claimIds) ? rawEntry.claimIds : rawEntry?.metadata?.claimIds || [])
    .map((item) => normalizeText(item).toUpperCase())
    .filter((item) => /^C\d+$/.test(item)))]
    .slice(0, 8)
  const sourceRefs = [...new Set((Array.isArray(rawEntry?.sourceRefs) ? rawEntry.sourceRefs : rawEntry?.metadata?.sourceRefs || [])
    .map((item) => normalizeText(item).toUpperCase())
    .filter((item) => /^S\d+$/.test(item)))]
    .slice(0, 8)
  const rawBasis = normalizeText(rawEntry?.basis || rawEntry?.metadata?.basis).toLowerCase()
  const basis = ['research', 'mixed', 'creative'].includes(rawBasis)
    ? rawBasis
    : (sourceRefs.length ? 'mixed' : 'creative')
  const sourceDocumentIds = [...new Set((Array.isArray(rawEntry?.sourceDocumentIds)
    ? rawEntry.sourceDocumentIds
    : rawEntry?.metadata?.sourceDocumentIds || [])
    .map((item) => normalizeText(item))
    .filter(Boolean))]
    .slice(0, 8)

  return {
    name,
    type,
    keys,
    keysSecondary,
    content,
    injection: {
      ...injection,
      group
    },
    metadata: {
      basis,
      sourceRefs,
      sourceDocumentIds,
      claimIds,
      reviewState: 'ready'
    }
  }
}

export function createSourceDocument(content, options = {}) {
  const text = normalizeText(content)
  if (!text) return null
  const maxLength = 120000
  const createdAt = Number(options.createdAt) || Date.now()
  return {
    id: normalizeText(options.id) || `source_${createdAt.toString(36)}`,
    title: normalizeText(options.title) || '导入原文',
    kind: normalizeText(options.kind) || 'reference-text',
    content: text.slice(0, maxLength),
    sourceLabel: normalizeText(options.sourceLabel) || '小说片段导入',
    originalLength: text.length,
    truncated: text.length > maxLength,
    createdAt
  }
}

function normalizeSourceDocuments(documents) {
  return (Array.isArray(documents) ? documents : [])
    .map((document, index) => createSourceDocument(document?.content, {
      ...document,
      id: document?.id || `source_${index + 1}`
    }))
    .filter(Boolean)
    .slice(0, 8)
}

// ----- Helpers used by buildPendingPayload -----

function collectGroupsFromEntries(entries) {
  return uniqueGroups(entries.map((entry) => entry?.injection?.group))
}

function hasConstraintType(entries, targetType) {
  return entries.some((entry) => {
    const entryType = normalizeEntryType(entry?.type)
    if (entryType === targetType) return true
    if (entryType !== 'general' && entryType !== 'lore') return false
    const inferred = inferConstraintTypeFromSignals({
      name: entry?.name,
      content: entry?.content,
      keys: [...(entry?.keys || []), ...(entry?.keysSecondary || [])]
    })
    return inferred === targetType
  })
}

function buildConstraintEntries({ name, description, worldDescription, writingStyle, forbidden, entries = [] }) {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  const shortName = normalizeText(name).slice(0, 18) || '当前世界'

  const worldContext = normalizeText(worldDescription || description)
  const writingContext = normalizeText(writingStyle)
  const forbiddenContext = normalizeText(forbidden)

  const constraints = []

  if (!hasConstraintType(normalizedEntries, 'rule')) {
    const ruleContent = worldContext
      ? `核心世界观：${worldContext.slice(0, 200)}${worldContext.length > 200 ? '...' : ''}。涉及人物关系、地理事实与历史事件时必须保持一致。`
      : '涉及人物关系、地理事实与历史事件时必须保持一致，不得无因改写既有设定。'
    constraints.push(createSeedEntry('rule', `${shortName}一致性规则`, ['世界规则', '一致性', shortName], ruleContent, '硬约束', 'constant'))
  }

  if (!hasConstraintType(normalizedEntries, 'style')) {
    const styleContent = writingContext
      ? `写作风格基线：${writingContext}`
      : '默认采用稳定叙事视角与一致语气；场景描写、人物对话和叙事节奏应保持同一文风基线。'
    constraints.push(createSeedEntry('style', `${shortName}文风基线`, ['写作风格', '文风', shortName], styleContent, '文风约束', 'constant'))
  }

  if (!hasConstraintType(normalizedEntries, 'forbidden')) {
    const forbiddenContent = forbiddenContext
      ? `禁止内容清单：${forbiddenContext}`
      : '禁止生成与设定冲突、角色动机断裂或无因果跳变的内容。'
    constraints.push(createSeedEntry('forbidden', `${shortName}禁写边界`, ['禁止内容', '禁忌', shortName], forbiddenContent, '禁写边界', 'constant'))
  }

  return constraints
}

function createAutoWorldbookName(prefix) {
  const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '-')
  return `${prefix} ${stamp}`
}

function normalizeResearchPayload(research) {
  if (!research || typeof research !== 'object') return null
  const seen = new Set()
  const sources = (Array.isArray(research.sources) ? research.sources : [])
    .map((source) => ({
      id: normalizeText(source?.id).toUpperCase(),
      title: normalizeText(source?.title).slice(0, 240),
      url: normalizeText(source?.url).slice(0, 1600),
      snippet: normalizeText(source?.snippet).slice(0, 1200),
      content: normalizeText(source?.content).slice(0, 6000),
      evidenceLevel: source?.evidenceLevel === 'page' ? 'page' : 'snippet',
      sourceKind: normalizeText(source?.sourceKind).slice(0, 50),
      quality: normalizeText(source?.quality).slice(0, 30),
      publishedAt: normalizeText(source?.publishedAt).slice(0, 80),
      provider: normalizeText(source?.provider || research.provider).slice(0, 40),
      excluded: false,
      evidenceBlocks: (Array.isArray(source?.evidenceBlocks) ? source.evidenceBlocks : [])
        .map((block) => ({
          id: normalizeText(block?.id).toUpperCase().slice(0, 20),
          locator: normalizeText(block?.locator).slice(0, 80),
          text: normalizeText(block?.text).slice(0, 800)
        }))
        .filter((block) => /^P\d+$/.test(block.id) && block.text)
        .slice(0, 12)
    }))
    .filter((source) => {
      if (!/^S\d+$/.test(source.id) || !/^https?:\/\//i.test(source.url) || seen.has(source.id)) return false
      seen.add(source.id)
      return true
    })
    .slice(0, 16)
  if (!sources.length) return null
  const excludedSourceIds = [...new Set((Array.isArray(research.excludedSourceIds) ? research.excludedSourceIds : [])
    .map((sourceId) => normalizeText(sourceId).toUpperCase())
    .filter((sourceId) => /^S\d+$/.test(sourceId)))]
  for (const source of sources) source.excluded = excludedSourceIds.includes(source.id)
  const sourceIds = new Set(sources.map((source) => source.id))
  const claims = normalizeResearchClaims(research.claims, sourceIds, new Set(excludedSourceIds))
  const claimIds = new Set(claims.map((claim) => claim.id))
  const conflicts = normalizeResearchConflicts(research.conflicts, claimIds)
  const normalized = {
    provider: normalizeText(research.provider).slice(0, 40),
    plannedBy: ['ai', 'agent'].includes(research.plannedBy) ? research.plannedBy : 'local',
    intent: normalizeText(research.intent).slice(0, 240),
    queries: [...new Set((Array.isArray(research.queries) ? research.queries : [])
      .map((query) => normalizeText(query).slice(0, 240))
      .filter(Boolean))].slice(0, 4),
    sources,
    excludedSourceIds,
    claims,
    conflicts,
    warnings: (Array.isArray(research.warnings) ? research.warnings : [])
      .map((warning) => normalizeText(warning).slice(0, 300))
      .filter(Boolean)
      .slice(0, 4),
    researchedAt: normalizeText(research.researchedAt).slice(0, 40),
    incremental: research.incremental && typeof research.incremental === 'object'
      ? {
        query: normalizeText(research.incremental.query).slice(0, 220),
        addedSourceCount: Math.max(0, Math.min(16, Number(research.incremental.addedSourceCount) || 0)),
        completedAt: normalizeText(research.incremental.completedAt).slice(0, 40),
        budget: research.incremental.budget === 'single-query' ? 'single-query' : ''
      }
      : null,
    input: {
      brief: normalizeText(research.input?.brief).slice(0, 4000),
      genre: normalizeText(research.input?.genre).slice(0, 60),
      genreLabel: normalizeText(research.input?.genreLabel).slice(0, 60),
      nameHint: normalizeText(research.input?.nameHint).slice(0, 120),
      targetCount: Number(research.input?.targetCount) || 0
    }
  }
  const currentRevision = createResearchRevision({
    input: normalized.input,
    queries: normalized.queries,
    sources: normalized.sources,
    claims: normalized.claims,
    excludedSourceIds: normalized.excludedSourceIds
  })
  const previousRevision = research.revision && typeof research.revision === 'object'
    ? research.revision
    : null
  const revision = previousRevision?.fingerprint
    ? {
      ...currentRevision,
      state: previousRevision.state === 'stale' || previousRevision.fingerprint !== currentRevision.fingerprint
        ? 'stale'
        : 'ready',
      previousFingerprint: previousRevision.fingerprint !== currentRevision.fingerprint
        ? previousRevision.fingerprint
        : ''
    }
    : currentRevision
  const withRevision = { ...normalized, revision }
  return { ...withRevision, review: refreshResearchReview(withRevision) }
}

// ----- Payload builder -----

export function buildPendingPayload({
  name,
  description,
  worldDescription,
  writingStyle,
  examples,
  forbidden,
  sourceLabel,
  entries,
  groups,
  research,
  structuredSettings,
  sourceDocuments
}) {
  const normalizedSourceDocuments = normalizeSourceDocuments(sourceDocuments)
  const defaultSourceDocumentIds = normalizedSourceDocuments.map((document) => document.id)
  const normalizedResearch = normalizeResearchPayload(research)
  const excludedSourceIds = new Set(normalizedResearch?.excludedSourceIds || [])
  const validSourceIds = new Set((normalizedResearch?.sources || [])
    .map((source) => source.id)
    .filter((sourceId) => !excludedSourceIds.has(sourceId)))
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, idx) => normalizeGeneratedEntry(entry, idx))
      .map((entry) => {
        const sourceRefs = (entry.metadata?.sourceRefs || []).filter((sourceId) => validSourceIds.has(sourceId))
        const claimIds = (entry.metadata?.claimIds || [])
          .filter((claimId) => normalizedResearch?.claims?.some((claim) => claim.id === claimId))
        return {
          ...entry,
          metadata: {
            ...entry.metadata,
            sourceDocumentIds: entry.metadata?.sourceDocumentIds?.length
              ? entry.metadata.sourceDocumentIds
              : defaultSourceDocumentIds,
            sourceRefs,
            claimIds,
            basis: sourceRefs.length ? entry.metadata.basis : (claimIds.length ? 'mixed' : 'creative'),
            reviewState: 'ready'
          }
        }
      })
    : []
  const normalizedDescription = normalizeText(description || worldDescription)
  const normalizedWorldDescription = normalizeText(worldDescription || normalizedDescription)
  const normalizedWritingStyle = normalizeText(writingStyle)
  const normalizedExamples = normalizeText(examples)
  const normalizedForbidden = normalizeText(forbidden)

  const constraintEntries = buildConstraintEntries({
    name,
    description: normalizedDescription,
    worldDescription: normalizedWorldDescription,
    writingStyle: normalizedWritingStyle,
    forbidden: normalizedForbidden,
    entries: normalizedEntries
  })

  const researchWithEntries = normalizedResearch
    ? {
      ...normalizedResearch,
      review: refreshResearchReview(normalizedResearch, normalizedEntries),
      revision: normalizedResearch.revision?.state === 'stale'
        ? normalizedResearch.revision
        : { ...normalizedResearch.revision, state: 'ready' }
    }
    : null
  const mergedEntries = [...normalizedEntries, ...constraintEntries]

  return {
    name: normalizeText(name) || createAutoWorldbookName('快速世界书'),
    description: normalizedDescription,
    worldDescription: normalizedWorldDescription,
    writingStyle: normalizedWritingStyle,
    examples: normalizedExamples,
    forbidden: normalizedForbidden,
    sourceLabel: normalizeText(sourceLabel) || '快速导入',
    research: researchWithEntries,
    structuredSettings: normalizeStructuredSettings(structuredSettings),
    sourceDocuments: normalizedSourceDocuments,
    entries: mergedEntries,
    groups: uniqueGroups([...(Array.isArray(groups) ? groups : []), ...collectGroupsFromEntries(mergedEntries)])
  }
}

// ----- WorldStore-driven createWorldbookFromPayload -----

/**
 * 把归一化后的 payload 写入 worldStore：
 * 1) createWorldbook  → 2) 循环 addEntry → 3) 更新 groups → 4) setActive。
 * 返回创建后的 worldbook（含 id / name）。
 */
export async function createWorldbookFromPayload(worldStore, payload, options = {}) {
  if (!worldStore || typeof worldStore.createWorldbook !== 'function') {
    throw new Error('createWorldbookFromPayload 需要有效的 worldStore')
  }
  if (!payload || !Array.isArray(payload.entries) || !payload.entries.length) {
    throw new Error('没有可导入的条目')
  }

  const normalizedPayload = buildPendingPayload(payload)

  const created = await worldStore.createWorldbook({
    name: normalizedPayload.name,
    worldDescription: normalizedPayload.worldDescription || normalizedPayload.description || '',
    writingStyle: normalizedPayload.writingStyle || '',
    examples: normalizedPayload.examples || '',
    forbidden: normalizedPayload.forbidden || '',
    description: normalizedPayload.description || normalizedPayload.worldDescription || '',
    research: normalizedPayload.research,
    structuredSettings: normalizedPayload.structuredSettings,
    sourceDocuments: normalizedPayload.sourceDocuments,
    sourcePresetId: options.sourcePresetId || null,
    presetSignature: options.presetSignature || null
  })

  for (const entry of normalizedPayload.entries) {
    await worldStore.addEntry(created.id, {
      name: entry.name,
      type: entry.type,
      keys: entry.keys,
      keysSecondary: entry.keysSecondary,
      content: entry.content,
      injection: entry.injection,
      metadata: {
        importSource: normalizedPayload.sourceLabel,
        basis: entry.metadata?.basis || 'creative',
        sourceRefs: entry.metadata?.sourceRefs || [],
        claimIds: entry.metadata?.claimIds || [],
        sourceDocumentIds: entry.metadata?.sourceDocumentIds || [],
        reviewState: entry.metadata?.reviewState || 'ready'
      }
    })
  }

  const groups = uniqueGroups([
    ...(normalizedPayload.groups || []),
    ...collectGroupsFromEntries(normalizedPayload.entries)
  ])
  if (groups.length) {
    await worldStore.updateWorldbook(created.id, { groups })
  }

  if (typeof worldStore.loadWorldbooksIndex === 'function') {
    await worldStore.loadWorldbooksIndex()
  }
  if (typeof worldStore.setActiveWorldbook === 'function') {
    await worldStore.setActiveWorldbook(created.id)
  }

  return created
}

// ----- AI-driven extract / generate (advanced 入口) -----

export async function tryAiExtractEntries(sourceText, targetCount, nameHint) {
  const safeTargetCount = clampNumber(targetCount, 10, 3, 30)
  const aiResult = await tryAiExtractWorldbookJson({
    sourceText,
    targetCount: safeTargetCount,
    nameHint
  })

  if (!aiResult.ok || !aiResult.parsed) return aiResult

  const parsed = aiResult.parsed
  const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : []
  const normalizedEntries = rawEntries
    .slice(0, safeTargetCount)
    .map((entry, idx) => normalizeGeneratedEntry(entry, idx))

  if (!normalizedEntries.length) {
    return {
      ok: false,
      reason: 'AI 提炼结果为空，已自动回退本地提炼。'
    }
  }

  const groups = uniqueGroups([
    ...(Array.isArray(parsed?.groups) ? parsed.groups : []),
    ...collectGroupsFromEntries(normalizedEntries)
  ])

  return {
    ok: true,
    payload: {
      name: normalizeText(parsed?.name || nameHint || createAutoWorldbookName('小说导入世界书')),
      worldDescription: normalizeText(parsed?.worldDescription || parsed?.description || ''),
      writingStyle: normalizeText(parsed?.writingStyle || ''),
      examples: normalizeText(parsed?.examples || ''),
      forbidden: normalizeText(parsed?.forbidden || ''),
      description: normalizeText(parsed?.description || parsed?.worldDescription || '由小说段落 AI 提炼生成'),
      sourceLabel: '小说段落 AI 提炼',
      sourceDocuments: [createSourceDocument(sourceText, {
        title: normalizeText(nameHint) ? `${normalizeText(nameHint)} · 导入原文` : '小说片段导入原文',
        sourceLabel: '小说段落 AI 提炼'
      })].filter(Boolean),
      entries: normalizedEntries,
      groups
    }
  }
}

export function buildFoundationPayloadFromAiResult({ parsed, brief, genreLabel, nameHint } = {}) {
  const worldDescription = normalizeText(parsed?.worldDescription || parsed?.description || brief)
  const tone = normalizeText(parsed?.tone || '克制、清晰，保持稳定的情绪张力')
  const writingStyle = normalizeText(parsed?.writingStyle || tone)
  const perspective = normalizeText(parsed?.perspective || '采用稳定的有限视角，不随意越过角色认知边界')
  const examples = normalizeText(parsed?.examples || '')
  const forbidden = normalizeText(parsed?.forbidden || '避免无铺垫的冲突升级、角色失真和设定跳变')
  const consistency = normalizeText(parsed?.consistency || '后续扩写必须遵循既有世界前提、叙事视角和人物认知边界')
  const structuredSettings = createEmptyStructuredSettings()

  structuredSettings.creativeRules.writingStyle = writingStyle
  structuredSettings.creativeRules.perspective = perspective
  structuredSettings.creativeRules.tone = tone
  structuredSettings.creativeRules.taboos = forbidden
  structuredSettings.creativeRules.consistency = consistency

  return {
    name: normalizeText(parsed?.name || nameHint || createAutoWorldbookName('创作基调')),
    worldDescription,
    writingStyle: [writingStyle, `叙事视角：${perspective}`, `情绪基调：${tone}`].filter(Boolean).join('\n'),
    examples,
    forbidden,
    description: worldDescription,
    sourceLabel: `AI 基调初始化（${genreLabel}）`,
    structuredSettings,
    entries: [
      {
        name: '世界一致性基线',
        type: 'rule',
        keys: ['世界规则', '一致性', '设定边界'],
        content: `${worldDescription}\n一致性要求：${consistency}`,
        group: '硬约束',
        mode: 'constant'
      },
      {
        name: '叙事基调',
        type: 'style',
        keys: ['写作风格', '叙事视角', '情绪基调'],
        content: `写作风格：${writingStyle}\n叙事视角：${perspective}\n情绪基调：${tone}${examples ? `\n风格示例：${examples}` : ''}`,
        group: '文风约束',
        mode: 'constant'
      },
      {
        name: '基础禁写边界',
        type: 'forbidden',
        keys: ['禁止内容', '禁写边界', '避免'],
        content: forbidden,
        group: '禁写边界',
        mode: 'constant'
      }
    ],
    groups: ['硬约束', '文风约束', '禁写边界']
  }
}

export async function tryAiGenerateFromBrief({ genre, genreLabel: explicitGenreLabel, brief, nameHint }) {
  const genreLabel = normalizeText(explicitGenreLabel)
    || entryTypeOptions.find((item) => item.value === genre)?.label
    || '通用风格'

  const aiResult = await tryAiGenerateWorldbookJsonFromBrief({ genreLabel, brief, nameHint })

  if (!aiResult.ok || !aiResult.parsed) return aiResult

  return {
    ok: true,
    payload: buildFoundationPayloadFromAiResult({
      parsed: aiResult.parsed,
      brief,
      genreLabel,
      nameHint
    })
  }
}

// ----- One-click preset world flow -----

// preset 内容签名：稳定、可复算，用于识别旧版本产生的、没带 sourcePresetId 的「同源」副本。
// 取 preset.name + description 前 80 字符 + 所有条目 name 排序后拼接，足够区分各预设。
// 导出供测试 / 调试复算使用。
export function presetSignature(preset) {
  if (!preset) return ''
  const entryNames = (Array.isArray(preset.entries) ? preset.entries : [])
    .map((e) => normalizeText(e?.name))
    .filter(Boolean)
    .sort()
    .join('|')
  return `${normalizeText(preset.name)}${normalizeText(preset.description).slice(0, 80)}${entryNames}`
}

/**
 * 一键进入 preset 世界：导入预设 → setActive → 写入 playable world entry intent → 跳转 /opening。
 * - `preset`：seedWorldbookPresets 任意一项
 * - `action`：可选 playable action override；不传则取 buildPlayableWorldActionHooks(preset)[0]
 * - `router`：必须传入 vue-router 的 router 实例；这里只调用 router.push({ name: 'opening' })
 */
export async function enterPresetWorld(worldStore, router, preset, action = null) {
  if (!preset) return null

  // 同 preset 重复点击时复用既有副本，避免「每次点都新建一份一模一样」。
  // store 内部会先按 sourcePresetId（新副本）匹配，没命中再按 presetSignature（旧副本兜底）匹配。
  const signature = presetSignature(preset)
  const existing = typeof worldStore?.findWorldbookByPreset === 'function'
    ? worldStore.findWorldbookByPreset(preset.id, signature)
    : null
  if (existing) {
    if (typeof worldStore.setActiveWorldbook === 'function') {
      await worldStore.setActiveWorldbook(existing.id)
    }
    const intentAction = action || buildPlayableWorldActionHooks(preset)[0]
    if (intentAction) {
      savePlayableWorldEntryIntent({
        worldbookId: existing.id,
        worldbookName: existing.name,
        presetId: preset.id,
        presetName: preset.name,
        action: intentAction
      })
    }
    if (router && typeof router.push === 'function') {
      router.push({ name: 'experience' })
    }
    return existing
  }

  const openingHook = normalizeText(preset.openingHook)
  const worldDescription = [
    preset.worldDescription,
    openingHook ? `开场困境：${openingHook}` : ''
  ].filter(Boolean).join('\n\n')

  const payload = buildPendingPayload({
    name: createAutoWorldbookName(preset.name),
    description: preset.description,
    worldDescription,
    writingStyle: preset.writingStyle,
    forbidden: preset.forbidden,
    sourceLabel: `一键预设：${preset.name}`,
    entries: preset.entries,
    groups: preset.groups
  })

  const created = await createWorldbookFromPayload(worldStore, payload, {
    sourcePresetId: preset.id,
    presetSignature: signature
  })

  const resolvedAction = action || buildPlayableWorldActionHooks(preset)[0]
  if (resolvedAction) {
    savePlayableWorldEntryIntent({
      worldbookId: created.id,
      worldbookName: created.name,
      presetId: preset.id,
      presetName: preset.name,
      action: resolvedAction
    })
  }

  if (router && typeof router.push === 'function') {
    // S17 user feedback: /opening 是 5C v3.5 vibe UI splash 页 (旧版开场), 跟世界书页的
    // 撕角档案册语境不连贯. 主页 "开始冒险" 直进 /experience (Experience.vue
    // workstation: 聊条 + quest + status), 跳过中间 splash. savePlayableWorldEntryIntent
    // 保留以便将来 /opening 还想用; 现在 experience.vue 不读这个 intent, 是 dead-write
    // 但代价小 (1 个 localStorage entry). 后续如果要彻底干净可删.
    router.push({ name: 'experience' })
  }

  return created
}

// ----- UI derived chips -----

/**
 * S17 spec 对齐: 现场/阻力/出口 3 chip, value 从 preset 派生
 * (location / organization / item 或第二个 organization).
 * 缺值回退到 '主城' / '王室' / '行会', 保证 UI 永远有 3 chip.
 */
export function getFeaturedPressureRow(preset) {
  if (!preset) return []
  const entries = Array.isArray(preset?.entries) ? preset.entries : []
  const orgs = entries.filter(e => normalizeEntryType(e?.type) === 'organization').map(e => normalizeText(e?.name))
  const locations = entries.filter(e => normalizeEntryType(e?.type) === 'location').map(e => normalizeText(e?.name))
  const items = entries.filter(e => normalizeEntryType(e?.type) === 'item').map(e => normalizeText(e?.name))
  return [
    { key: 'scene', label: '现场', value: locations[0] || '主城' },
    { key: 'resistance', label: '阻力', value: orgs[0] || '王室' },
    { key: 'exit', label: '出口', value: items[0] || orgs[1] || '行会' }
  ]
}

/**
 * S17 spec 对齐: 接收 preset, 自动提取 openingHook, 截断到 maxChars (默认 80).
 */
export function getHookExcerpt(preset, maxChars = 80) {
  const hook = normalizeText(preset?.openingHook)
  if (!hook) return ''
  if (hook.length <= maxChars) return hook
  return `${hook.slice(0, maxChars)}…`
}

// ----- Preset re-export (供 WorldBookQuickImport.vue / 高级设置使用) -----

export { presets as seedWorldbookPresets, formatWorldbookStatus }
