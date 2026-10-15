// W4 写侧合并（20261008 工单 B4）：structuredSettings 投影退役 + 资料记录升 source 条目。
// 纯函数模块（无 vue/pinia 依赖）：worldStore 在归一化时调用，冒烟脚本在裸 node 里直测。
//
// 退役语义（逐条对应 worldbook-workflow §4 末三段 / 20261007 §6 墓碑红线）：
// 1. 非 character 结构化字段不再经 syncStructuredEntries 在每次载入时自动 materialize；
//   一次性迁移（writeMergeMigrationVersion 门）把现存投影落成正式条目，幂等。
// 2. userTouched 过的条目迁移时不覆盖（只并 keys，保持索引新鲜——A1 守卫语义原样）。
// 3. character 字段仍走 structuredCharacterMigrationVersion 的一次性迁移 + 显式保存重推；
//   用户删除派生角色后的 tombstone 不复活，由 syncStructuredCharacterEntries 守卫。
// 4. 资料记录（sourceDocuments：archiveRef/chunkIds 轻量指针）迁移为 type:'source' 条目；
//   IndexedDB 归档本体不动，只改指针。资料页读路径兼容：旧记录完整保存在条目
//   metadata.sourceDocument，归一化输出从条目重建同一形状（旧记录形状读得出）。
// 5. 注入行为零变化：source 条目 keys 为空 + selective 模式，永不进入关键词/常驻激活；
//   content 真相与文本不做任何改写。

import { SETTING_SECTIONS } from './settingPanelSchema'
import {
  characterProfileFromCard,
  parseCharacterCards,
  serializeCharacterEntryProfile
} from '../characterCard'

export const WRITE_MERGE_MIGRATION_VERSION = 1

// 用户编辑过的 structured entry 不再被迁移/同步覆盖 name/type/injection。
// 仅同步 keys（保持索引新鲜），其余字段保持用户最后一次编辑的结果。
export const STRUCTURED_USER_TOUCHED_KEY = 'userTouched'

export function structuredSettingRef(sectionKey, fieldKey) {
  return `${sectionKey}.${fieldKey}`
}

export function isStructuredEntry(entry) {
  return entry?.metadata?.importSource === 'structured-setting' ||
    Boolean(entry?.metadata?.structuredSettingRef)
}

// 根据 ref（sectionKey.fieldKey）或 entry 自带的 sourceSection/sourceField/name
// 在 SETTING_SECTIONS 中找到对应的 field 定义。找不到返回 null。
export function findStructuredFieldByRef(ref, entry) {
  for (const section of SETTING_SECTIONS) {
    for (const field of section.fields) {
      const candidateRef = structuredSettingRef(section.key, field.key)
      if (ref && candidateRef === ref) return field
      if (
        (entry?.metadata?.sourceSection === section.key || !entry?.metadata?.sourceSection) &&
        (entry?.metadata?.sourceField === field.key || entry?.name === field.label)
      ) return field
    }
  }
  return null
}

// 判断一个 structured entry 当前字段是否仍为「默认填充形态」。
// 用于迁移守卫：仍为默认形态 → 视作未被用户编辑（userTouched=false），
// 允许迁移继续刷新；已偏离默认 → 保守视作用户编辑过（userTouched=true）。
export function isStructuredEntryInDefaultShape(entry, field) {
  if (!entry || !field) return false
  if (entry.name !== field.label) return false
  const inj = entry.injection || {}
  const isConstant = ['rule', 'style', 'forbidden'].includes(field.entryType)
  // 默认 injection 形态（与 materializeStructuredFieldEntry 新建分支保持一致）
  if (inj.mode !== (isConstant ? 'constant' : 'selective')) return false
  if (inj.probability !== 100) return false
  if (inj.cooldown !== 0) return false
  if (inj.depth !== (isConstant ? 2 : 1)) return false
  if (inj.excludeRecursion !== false) return false
  if (inj.group !== field.defaultGroup) return false
  return true
}

function stableStructuredCharacterKey(name, occurrence = 0) {
  const input = `${String(name || '').trim().toLocaleLowerCase()}#${occurrence}`
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

// 派生角色条目的稳定键（供墓碑守卫与冒烟夹具复用，纯函数）。
export function structuredCharacterKeyFor(name, occurrence = 0) {
  return stableStructuredCharacterKey(name, occurrence)
}

// 墓碑守卫：`${ref}:${cardKey}` 命中即不复活（用户删除派生角色后不得回流）。
function hasCharacterTombstone(tombstones, ref, cardKey) {
  return tombstones.has(`${ref}:${cardKey}`)
}

function syncStructuredCharacterEntries(nextEntries, { section, field, content, ref, stableNow, tombstones }) {
  const sourceEntries = nextEntries.filter((entry) => entry?.metadata?.structuredSettingRef === ref)
  const sourceIds = new Set(sourceEntries.map((entry) => entry.id))
  const detachedLegacyEntries = sourceEntries
    .filter((entry) => !entry?.metadata?.structuredCharacterKey && entry?.metadata?.[STRUCTURED_USER_TOUCHED_KEY])
    .flatMap((entry) => {
      const legacyCards = parseCharacterCards(entry.content)
      if (!legacyCards.length) {
        return [{
          ...entry,
          metadata: {
            ...entry.metadata,
            importSource: 'manual',
            structuredSettingRef: '',
            sourceSection: '',
            sourceField: ''
          }
        }]
      }
      return legacyCards.map((card, index) => {
        const profile = characterProfileFromCard(card)
        return {
          ...entry,
          id: index === 0 ? entry.id : `${entry.id}_${stableStructuredCharacterKey(card.name, index)}`,
          name: card.name,
          keys: [...new Set([card.name, ...(entry.keys || [])])],
          content: serializeCharacterEntryProfile(profile),
          metadata: {
            ...entry.metadata,
            importSource: 'manual',
            structuredSettingRef: '',
            structuredCharacterKey: '',
            sourceSection: '',
            sourceField: '',
            characterProfile: profile
          }
        }
      })
    })
  const detachedNames = new Set(detachedLegacyEntries.map((entry) => String(entry.name || '').trim().toLocaleLowerCase()).filter(Boolean))
  const cards = parseCharacterCards(content)
  const occurrences = new Map()
  const materialized = []

  for (const card of cards) {
    const name = String(card?.name || '').trim()
    if (!name) continue
    const occurrenceName = name.toLocaleLowerCase()
    if (detachedNames.has(occurrenceName)) continue
    const occurrence = occurrences.get(occurrenceName) || 0
    occurrences.set(occurrenceName, occurrence + 1)
    const cardKey = stableStructuredCharacterKey(name, occurrence)
    if (hasCharacterTombstone(tombstones, ref, cardKey)) continue
    const existing = sourceEntries.find((entry) => entry?.metadata?.structuredCharacterKey === cardKey)
    if (existing?.metadata?.[STRUCTURED_USER_TOUCHED_KEY]) {
      materialized.push(existing)
      continue
    }
    const profile = characterProfileFromCard(card)
    const serialized = serializeCharacterEntryProfile(profile)
    materialized.push({
      ...(existing || {}),
      id: existing?.id || `entry_structured_${section.key}_${field.key}_${cardKey}`,
      name,
      type: 'character',
      keys: [...new Set([name, field.label, ...(existing?.keys || [])])],
      keysSecondary: existing?.keysSecondary || [],
      content: serialized || String(card.description || '').trim(),
      speechStyle: card.speechStyle || existing?.speechStyle || '',
      samples: card.samples?.length ? card.samples : (existing?.samples || []),
      injection: {
        ...(existing?.injection || {}),
        mode: 'selective',
        probability: 100,
        cooldown: 0,
        depth: 1,
        excludeRecursion: false,
        group: field.defaultGroup || '角色'
      },
      relations: {
        tags: [...new Set(['结构化设定', field.label, ...(existing?.relations?.tags || [])])],
        locations: existing?.relations?.locations || [],
        characters: existing?.relations?.characters || [],
        events: existing?.relations?.events || []
      },
      metadata: {
        ...(existing?.metadata || {}),
        createdAt: existing?.metadata?.createdAt || stableNow,
        updatedAt: existing?.content === serialized ? (existing?.metadata?.updatedAt || stableNow) : stableNow,
        importSource: 'structured-setting',
        structuredSettingRef: ref,
        structuredCharacterKey: cardKey,
        sourceSection: section.key,
        sourceField: field.key,
        basis: existing?.metadata?.basis || 'creative',
        reviewState: existing?.metadata?.reviewState || 'ready',
        [STRUCTURED_USER_TOUCHED_KEY]: false,
        characterProfile: profile
      }
    })
  }

  return [...nextEntries.filter((entry) => !sourceIds.has(entry.id)), ...detachedLegacyEntries, ...materialized]
}

// character 字段的 legacy 聚合文本迁移（structuredCharacterMigrationVersion < 1 时跑一次，
// 或 updateStructuredSetting 显式保存某角色字段后重推）。墓碑语义在这里守卫。
export function syncStructuredCharacterFields(entries, structuredSettings, normalizationNow = Date.now(), structuredCharacterTombstones = []) {
  const stableNow = Number.isFinite(Number(normalizationNow)) ? Number(normalizationNow) : Date.now()
  let nextEntries = entries.map((entry) => ({
    ...entry,
    metadata: { ...(entry.metadata || {}) }
  }))
  const tombstones = new Set((Array.isArray(structuredCharacterTombstones) ? structuredCharacterTombstones : []).map(String))

  for (const section of SETTING_SECTIONS) {
    for (const field of section.fields) {
      if (field.entryType !== 'character') continue
      const content = String(structuredSettings?.[section.key]?.[field.key] || '').trim()
      const ref = structuredSettingRef(section.key, field.key)
      nextEntries = syncStructuredCharacterEntries(nextEntries, { section, field, content, ref, stableNow, tombstones })
    }
  }

  return nextEntries
}

// 单个非 character 结构化字段 → 条目的 upsert（退役前 sync 的非 character 分支原样语义）：
//   - 字段内容为空：移除派生条目（与退役前 splice 行为一致）。
//   - userTouched：只并 keys，不动 name/type/injection/content。
//   - 其余：按字段内容 materialize/刷新（幂等：内容未变不触碰 updatedAt）。
function materializeStructuredFieldEntry(nextEntries, section, field, content, ref, stableNow) {
  const existingIndex = nextEntries.findIndex((entry) => (
    entry.metadata?.structuredSettingRef === ref ||
    (
      entry.metadata?.importSource === 'structured-setting' &&
      (entry.metadata?.sourceSection === section.key || !entry.metadata?.sourceSection) &&
      (entry.metadata?.sourceField === field.key || entry.name === field.label)
    )
  ))

  if (!content) {
    if (existingIndex >= 0) nextEntries.splice(existingIndex, 1)
    return nextEntries
  }

  const baseEntry = existingIndex >= 0 ? nextEntries[existingIndex] : null
  // A1 守卫：用户编辑过的 entry 只同步 keys（保持索引新鲜），不动 name/type/injection。
  const userTouched = Boolean(baseEntry?.metadata?.[STRUCTURED_USER_TOUCHED_KEY])
  if (userTouched && baseEntry) {
    // 右侧设定工作台接管日常真源后，旧 structuredSettings 只作兼容投影，
    // 不得在迁移/保存时把用户刚保存的 entry.content 反向覆盖。
    nextEntries[existingIndex] = {
      ...baseEntry,
      keys: [...new Set([field.label, ...(baseEntry.keys || [])])],
      metadata: { ...baseEntry.metadata }
    }
    return nextEntries
  }

  const isConstant = ['rule', 'style', 'forbidden'].includes(field.entryType)
  const contentChanged = !baseEntry || baseEntry.content !== content
  const now = stableNow
  const entry = {
    ...(baseEntry || {}),
    id: baseEntry?.id || `entry_structured_${section.key}_${field.key}`,
    name: field.label,
    type: field.entryType,
    keys: [...new Set([field.label, ...(baseEntry?.keys || [])])],
    keysSecondary: baseEntry?.keysSecondary || [],
    content,
    injection: {
      ...(baseEntry?.injection || {}),
      mode: isConstant ? 'constant' : 'selective',
      probability: 100,
      cooldown: 0,
      depth: isConstant ? 2 : 1,
      excludeRecursion: false,
      group: field.defaultGroup
    },
    relations: {
      tags: [...new Set(['结构化设定', ...(baseEntry?.relations?.tags || [])])],
      locations: baseEntry?.relations?.locations || [],
      characters: baseEntry?.relations?.characters || [],
      events: baseEntry?.relations?.events || []
    },
    metadata: {
      ...(baseEntry?.metadata || {}),
      createdAt: baseEntry?.metadata?.createdAt || now,
      updatedAt: contentChanged ? now : (baseEntry?.metadata?.updatedAt || now),
      importSource: 'structured-setting',
      structuredSettingRef: ref,
      sourceSection: section.key,
      sourceField: field.key,
      basis: baseEntry?.metadata?.basis || 'creative',
      reviewState: baseEntry?.metadata?.reviewState || 'ready'
    }
  }

  if (existingIndex >= 0) nextEntries[existingIndex] = entry
  else nextEntries.push(entry)
  return nextEntries
}

// 兼容入口（/settings/structured）单字段保存/转条目：投影链退役后由保存动作
// 直接 upsert 条目（不再依赖载入时的自动 sync）。
export function upsertStructuredFieldEntry(entries, section, field, content, { now = Date.now() } = {}) {
  if (!section || !field) return Array.isArray(entries) ? [...entries] : []
  const stableNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const nextEntries = (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    metadata: { ...(entry.metadata || {}) }
  }))
  return materializeStructuredFieldEntry(
    nextEntries,
    section,
    field,
    String(content || '').trim(),
    structuredSettingRef(section.key, field.key),
    stableNow
  )
}

// W4 一次性迁移（writeMergeMigrationVersion 门）：非 character 结构化投影 → 正式条目。
// 幂等：跑两遍结果不变（内容未变不触碰 updatedAt；userTouched 不覆盖）。
export function migrateStructuredSettingProjections(entries, structuredSettings, { now = Date.now() } = {}) {
  const stableNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  let nextEntries = (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    metadata: { ...(entry.metadata || {}) }
  }))

  for (const section of SETTING_SECTIONS) {
    for (const field of section.fields) {
      if (field.entryType === 'character') continue // character 走 structuredCharacterMigrationVersion 门
      const content = String(structuredSettings?.[section.key]?.[field.key] || '').trim()
      const ref = structuredSettingRef(section.key, field.key)
      nextEntries = materializeStructuredFieldEntry(nextEntries, section, field, content, ref, stableNow)
    }
  }

  return nextEntries
}

// ---------- 资料记录 → type:'source' 条目 ----------

// sourceDocuments 轻量记录的归一（原 worldStore normalizeWorldbook 内联映射原样搬移）。
// content/contentPreview/preview 至少一项非空的记录才保留。
export function normalizeSourceDocumentRecords(raw, { now = Date.now() } = {}) {
  const fallbackNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const source = raw == null ? [] : (Array.isArray(raw) ? raw : (typeof raw === 'object' ? raw : []))
  return (Array.isArray(source) ? source : [])
    .filter((document) => document && typeof document === 'object' && String(document.content || document.contentPreview || document.preview || '').trim())
    .map((document, index) => {
      const content = String(document.content || document.contentPreview || document.preview || '')
      const contentPreview = String(document.contentPreview || document.preview || content)
      return {
        id: String(document.id || `source_${index + 1}`),
        title: String(document.title || `原始资料 ${index + 1}`),
        kind: String(document.kind || 'reference-text'),
        content,
        contentPreview,
        preview: contentPreview,
        sourceLabel: String(document.sourceLabel || ''),
        originalLength: Math.max(content.length, Number(document.originalLength) || 0),
        normalizedLength: Math.max(content.length, Number(document.normalizedLength) || 0),
        truncated: Boolean(document.truncated),
        archiveRef: document.archiveRef ? String(document.archiveRef) : null,
        chunkIds: [...new Set((Array.isArray(document.chunkIds) ? document.chunkIds : []).map(String).filter(Boolean))],
        contentHash: document.contentHash ? String(document.contentHash) : null,
        warnings: (Array.isArray(document.warnings) ? document.warnings : []).map(String),
        createdAt: Number.isFinite(Number(document.createdAt))
          ? Number(document.createdAt)
          : fallbackNow
      }
    })
}

export function isSourceDocumentEntry(entry) {
  return entry?.metadata?.importSource === 'source-document' &&
    Boolean(String(entry?.metadata?.sourceDocumentId || '').trim())
}

// §3.4 目标模型字段：chunk 级溯源 `source:<docId>#<chunkId>`；归档本体指针在 metadata.archiveRef。
function buildEntrySourceRefs(document) {
  const docId = String(document?.id || '')
  if (!docId) return []
  return (Array.isArray(document?.chunkIds) ? document.chunkIds : [])
    .map((chunkId) => `source:${docId}#${String(chunkId)}`)
}

function sourceEntryIdForDocument(documentId) {
  return `entry_source_${String(documentId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function sourceEntryContentPreview(document) {
  return String(document?.contentPreview || document?.preview || document?.content || '')
}

export function buildSourceEntryFromDocument(document, { now = Date.now() } = {}) {
  const stableNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  return {
    id: sourceEntryIdForDocument(document.id),
    name: String(document.title || '未命名资料'),
    type: 'source',
    // keys 留空 + selective：资料不参与关键词/常驻激活（注入行为零变化）。
    keys: [],
    keysSecondary: [],
    content: sourceEntryContentPreview(document),
    injection: {
      mode: 'selective',
      probability: 100,
      cooldown: 0,
      depth: 1,
      excludeRecursion: true,
      group: '资料'
    },
    relations: {
      tags: ['资料'],
      locations: [],
      characters: [],
      events: []
    },
    sourceRefs: buildEntrySourceRefs(document),
    metadata: {
      createdAt: Number.isFinite(Number(document.createdAt)) ? Number(document.createdAt) : stableNow,
      updatedAt: stableNow,
      importSource: 'source-document',
      sourceDocumentId: String(document.id),
      archiveRef: document.archiveRef || null,
      chunkIds: [...(Array.isArray(document.chunkIds) ? document.chunkIds : [])],
      contentHash: document.contentHash || null,
      sourceLabel: String(document.sourceLabel || ''),
      // 完整旧记录保存在条目里：资料页读路径从条目重建同一形状（旧记录形状读得出）。
      sourceDocument: { ...document }
    }
  }
}

// 资料记录 ↔ source 条目的幂等 reconcile（每次归一化运行）：
//   - 记录被移除 → 其派生条目随之移除（联动删除的另一层兜底）。
//   - 记录新增/更新（如惰性归档补 archiveRef）→ 建/刷新派生条目；用户已改过
//     name/content 的条目只刷新指针元数据，不覆盖编辑。
//   - 条目原生 source 条目（无 metadata.sourceDocument，如素材草稿转资料）不受
//     记录账本约束，原样保留。
// 注：传入的 records 必须先经 normalizeSourceDocumentRecords 归一。
export function reconcileSourceDocumentEntries(entries, records, { now = Date.now() } = {}) {
  const stableNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const docsById = new Map((Array.isArray(records) ? records : []).map((document) => [String(document.id), document]))
  const kept = []

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!isSourceDocumentEntry(entry) || !entry.metadata?.sourceDocument) {
      kept.push(entry)
      continue
    }
    const docId = String(entry.metadata.sourceDocumentId)
    const document = docsById.get(docId)
    if (!document) continue // 记录已移除 → 派生条目随之移除
    docsById.delete(docId)
    const stored = entry.metadata.sourceDocument
    if (stored && JSON.stringify(stored) === JSON.stringify(document)) {
      kept.push(entry) // 幂等：记录未变不触碰
      continue
    }
    const defaultShapeName = String(stored?.title || '')
    const defaultShapeContent = sourceEntryContentPreview(stored)
    const untouchedByUser = entry.name === defaultShapeName && entry.content === defaultShapeContent
    kept.push({
      ...entry,
      ...(untouchedByUser
        ? { name: String(document.title || '未命名资料'), content: sourceEntryContentPreview(document) }
        : {}),
      sourceRefs: buildEntrySourceRefs(document),
      metadata: {
        ...entry.metadata,
        updatedAt: stableNow,
        archiveRef: document.archiveRef || null,
        chunkIds: [...(Array.isArray(document.chunkIds) ? document.chunkIds : [])],
        contentHash: document.contentHash || null,
        sourceLabel: String(document.sourceLabel || ''),
        sourceDocument: { ...document }
      }
    })
  }

  // 新增记录按记录顺序补建条目（docsById 已扣除与现存条目对应的 id）。
  for (const document of docsById.values()) {
    kept.push(buildSourceEntryFromDocument(document, { now: stableNow }))
  }
  return kept
}

function reconstructSourceDocumentFromEntry(entry) {
  return {
    id: String(entry.metadata?.sourceDocumentId || entry.id),
    title: String(entry.name || '未命名资料'),
    kind: 'reference-text',
    content: String(entry.content || ''),
    contentPreview: String(entry.content || ''),
    preview: String(entry.content || ''),
    sourceLabel: String(entry.metadata?.sourceLabel || ''),
    originalLength: String(entry.content || '').length,
    normalizedLength: String(entry.content || '').length,
    truncated: false,
    archiveRef: entry.metadata?.archiveRef || null,
    chunkIds: [...(Array.isArray(entry.metadata?.chunkIds) ? entry.metadata.chunkIds : [])],
    contentHash: entry.metadata?.contentHash || null,
    warnings: [],
    createdAt: Number.isFinite(Number(entry.metadata?.createdAt)) ? Number(entry.metadata.createdAt) : 0
  }
}

// 资料页读路径兼容：从 source 条目重建旧 sourceDocuments 记录形状。
// 有存档记录的条目原样吐回完整记录（含 scope/sourceId 等扩展字段丢失前的形状
// ——即写入时归一后的形状）；条目原生 source 条目按最小合同重建。
export function deriveSourceDocumentsFromEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter(isSourceDocumentEntry)
    .map((entry) => ({ ...(entry.metadata?.sourceDocument || reconstructSourceDocumentFromEntry(entry)) }))
}
