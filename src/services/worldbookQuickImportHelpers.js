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
import {
  buildPlayableWorldActionHooks,
  savePlayableWorldEntryIntent
} from './playableWorldEntry'

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

  return {
    name,
    type,
    keys,
    keysSecondary,
    content,
    injection: {
      ...injection,
      group
    }
  }
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
  groups
}) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, idx) => normalizeGeneratedEntry(entry, idx))
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

  const mergedEntries = [...normalizedEntries, ...constraintEntries]

  return {
    name: normalizeText(name) || createAutoWorldbookName('快速世界书'),
    description: normalizedDescription,
    worldDescription: normalizedWorldDescription,
    writingStyle: normalizedWritingStyle,
    examples: normalizedExamples,
    forbidden: normalizedForbidden,
    sourceLabel: normalizeText(sourceLabel) || '快速导入',
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
export async function createWorldbookFromPayload(worldStore, payload) {
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
    description: normalizedPayload.description || normalizedPayload.worldDescription || ''
  })

  for (const entry of normalizedPayload.entries) {
    await worldStore.addEntry(created.id, {
      name: entry.name,
      type: entry.type,
      keys: entry.keys,
      keysSecondary: entry.keysSecondary,
      content: entry.content,
      injection: entry.injection
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
      entries: normalizedEntries,
      groups
    }
  }
}

export async function tryAiGenerateFromBrief({ genre, brief, targetCount, nameHint }) {
  const safeTargetCount = clampNumber(targetCount, 8, 3, 30)
  const genreLabel = entryTypeOptions.find((item) => item.value === genre)?.label || '通用风格'

  const aiResult = await tryAiGenerateWorldbookJsonFromBrief({
    genreLabel,
    brief,
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
      reason: 'AI 返回了空条目，请补充说明后重试。'
    }
  }

  const groups = uniqueGroups([
    ...(Array.isArray(parsed?.groups) ? parsed.groups : []),
    ...collectGroupsFromEntries(normalizedEntries)
  ])

  return {
    ok: true,
    payload: {
      name: normalizeText(parsed?.name || nameHint || createAutoWorldbookName('AI随机世界书')),
      worldDescription: normalizeText(parsed?.worldDescription || parsed?.description || brief.slice(0, 500) || '暂无世界设定描述'),
      writingStyle: normalizeText(parsed?.writingStyle || ''),
      examples: normalizeText(parsed?.examples || ''),
      forbidden: normalizeText(parsed?.forbidden || ''),
      description: normalizeText(parsed?.description || parsed?.worldDescription || brief || '由 AI 根据说明生成。'),
      sourceLabel: `AI 随机生成（${genreLabel}）`,
      entries: normalizedEntries,
      groups
    }
  }
}

// ----- One-click preset world flow -----

/**
 * 一键进入 preset 世界：导入预设 → setActive → 写入 playable world entry intent → 跳转 /opening。
 * - `preset`：seedWorldbookPresets 任意一项
 * - `action`：可选 playable action override；不传则取 buildPlayableWorldActionHooks(preset)[0]
 * - `router`：必须传入 vue-router 的 router 实例；这里只调用 router.push({ name: 'opening' })
 */
export async function enterPresetWorld(worldStore, router, preset, action = null) {
  if (!preset) return null

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

  const created = await createWorldbookFromPayload(worldStore, payload)

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