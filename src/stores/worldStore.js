import { defineStore } from 'pinia'
import { getItem, setItem, removeItem, STORAGE_KEYS } from '../composables/useStorage'
import {
  SETTING_SECTIONS,
  getSettingField,
  normalizeStructuredSettings
} from '../services/worldbook/settingPanelSchema'
import {
  characterProfileFromCard,
  parseCharacterCards,
  parseCharacterEntryProfile,
  serializeCharacterEntryProfile
} from '../services/characterCard'
import { normalizeNarrativeVoiceProfile } from '../services/narrativeVoiceProfile'
import { resolvePlaceEntity } from '../services/worldHistory/placeEntity'
import {
  createPlaceEntryPatch,
  getPlacePayloadFromEntry,
  isPlaceOverviewEntry,
  placeFingerprint
} from '../../shared/placeEntryContract.js'
import {
  getPlaceDeleteImpact as getCatalogPlaceDeleteImpact,
  getPlaceSourceRevision,
  listPlaceEntries,
  preparePlaceForWrite
} from '../services/worldbook/worldbookPlaceCatalog'
import { archiveSourceDocuments } from '../services/worldbook/worldbookSourceArchive'
import { mutationFailure, mutationSuccess } from '../services/storage/durableMutationResult.js'

const WORLDBOOKS_INDEX_KEY = 'worldbooks_index'
const WORLDBOOK_KEY_PREFIX = 'worldbook_'
const ACTIVE_WORLDBOOK_ID_KEY = 'active_worldbook_id'

// 世界书页面与 Authoring 都可能并发请求不同资料库。只有最后发起的加载
// 可以切换全局 activeWorldbook；较慢的旧请求仍可把自己的精确快照返回给
// 项目调用方，但不能在完成时把当前界面倒回旧库。
let worldbookActivationSequence = 0

function decodeStored(raw, fallback) {
  if (raw == null) return fallback
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }
  return raw
}

function decodeStoredId(raw) {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : raw
  } catch {
    return raw
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function structuredSettingRef(sectionKey, fieldKey) {
  return `${sectionKey}.${fieldKey}`
}

// 用户编辑过的 structured entry 不再被 syncStructuredEntries 覆盖 name/type/injection。
// 仅同步 keys（保持索引新鲜），其余字段保持用户最后一次编辑的结果。
// 见 audit-pass2-plan Phase A1：避免 reload 后静默丢失用户对 PlaceCatalog 的编辑。
const STRUCTURED_USER_TOUCHED_KEY = 'userTouched'

// 判断一个 structured entry 当前字段是否仍为「默认填充形态」。
// 用于 loadWorldbook 迁移：仍为默认形态 → 视作未被用户编辑（userTouched=false），
// 允许后续同步继续刷新；已偏离默认 → 保守视作用户编辑过（userTouched=true）。
function isStructuredEntryInDefaultShape(entry, field) {
  if (!entry || !field) return false
  if (entry.name !== field.label) return false
  const inj = entry.injection || {}
  const isConstant = ['rule', 'style', 'forbidden'].includes(field.entryType)
  // 默认 injection 形态（与下方新建分支保持一致）
  if (inj.mode !== (isConstant ? 'constant' : 'selective')) return false
  if (inj.probability !== 100) return false
  if (inj.cooldown !== 0) return false
  if (inj.depth !== (isConstant ? 2 : 1)) return false
  if (inj.excludeRecursion !== false) return false
  if (inj.group !== field.defaultGroup) return false
  return true
}

// 根据 ref（sectionKey.fieldKey）或 entry 自带的 sourceSection/sourceField/name
// 在 SETTING_SECTIONS 中找到对应的 field 定义。找不到返回 null。
function findStructuredFieldByRef(ref, entry) {
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

function stableStructuredCharacterKey(name, occurrence = 0) {
  const input = `${String(name || '').trim().toLocaleLowerCase()}#${occurrence}`
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
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
    if (tombstones.has(`${ref}:${cardKey}`)) continue
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

function syncStructuredEntries(entries, structuredSettings, normalizationNow = Date.now(), structuredCharacterTombstones = [], options = {}) {
  const stableNow = Number.isFinite(Number(normalizationNow)) ? Number(normalizationNow) : Date.now()
  let nextEntries = entries.map((entry) => ({
    ...entry,
    metadata: { ...(entry.metadata || {}) }
  }))
  const tombstones = new Set(ensureArray(structuredCharacterTombstones).map(String))

  for (const section of SETTING_SECTIONS) {
    for (const field of section.fields) {
      const content = String(structuredSettings?.[section.key]?.[field.key] || '').trim()
      const ref = structuredSettingRef(section.key, field.key)
      if (field.entryType === 'character') {
        if (options.syncLegacyCharacters) {
          nextEntries = syncStructuredCharacterEntries(nextEntries, { section, field, content, ref, stableNow, tombstones })
        }
        continue
      }
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
        continue
      }

      const baseEntry = existingIndex >= 0 ? nextEntries[existingIndex] : null
      // A1 守卫：用户编辑过的 entry 只同步 keys（保持索引新鲜），不动 name/type/injection。
      const userTouched = Boolean(baseEntry?.metadata?.[STRUCTURED_USER_TOUCHED_KEY])
      if (userTouched && baseEntry) {
        // 右侧设定工作台接管日常真源后，旧 structuredSettings 只作兼容投影，
        // 不得在 reload 时把用户刚保存的 entry.content 反向覆盖。
        nextEntries[existingIndex] = {
          ...baseEntry,
          keys: [...new Set([field.label, ...(baseEntry.keys || [])])],
          metadata: { ...baseEntry.metadata }
        }
        continue
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
    }
  }

  return nextEntries
}

/**
 * 归一化 geoHistory 容器。
 * - 缺失 / 空 → null（调用方可据此隐藏历史节点区）。
 * - 数组 → { nodes: [...] }。
 * - 对象 → 保留全部生成器字段，仅把 nodes 强制成数组。
 * 节点内部字段不裁剪：历史/地图窗口的生成器可自由扩展节点结构，
 * 消费方（playableWorldEntry）按需容错读取。
 */
function normalizeGeoHistory(raw) {
  const source = decodeStored(raw, null)
  if (source == null) return null
  if (Array.isArray(source)) {
    const nodes = source.filter((node) => node && typeof node === 'object')
    return { nodes }
  }
  if (typeof source !== 'object') return null
  const nodes = ensureArray(decodeStored(source.nodes, [])).filter((node) => node && typeof node === 'object')
  return { ...source, nodes }
}

function normalizeEntryVoice(entry = {}) {
  const normalized = { ...entry }
  if (String(normalized.type || '').trim().toLowerCase() !== 'character') {
    delete normalized.speechStyle
    delete normalized.samples
    return normalized
  }
  return {
    ...normalized,
    ...normalizeNarrativeVoiceProfile(normalized, normalized.name)
  }
}

function normalizeWorldbook(raw = {}, { normalizationNow = Date.now() } = {}) {
  const source = decodeStored(raw, {})
  const structuredSettings = normalizeStructuredSettings(source.structuredSettings)
  // A1.4 迁移守卫：旧存档的 structured entry 没有 userTouched 字段。
  // 用 heuristic 判断当前字段是否仍为默认填充形态：
  //   仍为默认 → userTouched=false（允许 sync 继续刷新，等价于旧行为）
  //   已偏离默认 → userTouched=true（保守保护，视作用户编辑过）
  const rawEntries = ensureArray(decodeStored(source.entries, [])).map((entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const isStructured = entry.metadata?.importSource === 'structured-setting' ||
      Boolean(entry.metadata?.structuredSettingRef)
    if (!isStructured) return entry
    if (Object.prototype.hasOwnProperty.call(entry.metadata || {}, STRUCTURED_USER_TOUCHED_KEY)) {
      return entry // 已有明确标记，保留
    }
    const ref = entry.metadata?.structuredSettingRef ||
      structuredSettingRef(entry.metadata?.sourceSection, entry.metadata?.sourceField)
    const field = findStructuredFieldByRef(ref, entry)
    const touched = field ? !isStructuredEntryInDefaultShape(entry, field) : true
    return {
      ...entry,
      metadata: { ...entry.metadata, [STRUCTURED_USER_TOUCHED_KEY]: touched }
    }
  })
  const structuredCharacterTombstones = [...new Set(ensureArray(source.structuredCharacterTombstones).map(String).filter(Boolean))]
  const structuredCharacterMigrationVersion = Number(source.structuredCharacterMigrationVersion) || 0
  const syncedEntries = syncStructuredEntries(rawEntries, structuredSettings, normalizationNow, structuredCharacterTombstones, {
    syncLegacyCharacters: structuredCharacterMigrationVersion < 1
  })
  const entries = syncedEntries.map((entry) => {
    const normalizedEntry = normalizeEntryVoice(entry)
    return normalizedEntry?.type === 'location' && !isPlaceOverviewEntry(normalizedEntry)
      ? createPlaceEntryPatch(normalizedEntry, normalizedEntry)
      : normalizedEntry
  })
  const entriesMap = {}

  for (const entry of entries) {
    if (entry?.id) entriesMap[entry.id] = entry
  }

  return {
    ...source,
    // 结构化基础设定
    worldDescription: String(source.worldDescription || source.description || ''),
    writingStyle: String(source.writingStyle || ''),
    examples: String(source.examples || ''),
    forbidden: String(source.forbidden || ''),
    // 兼容旧版 description 字段
    description: String(source.description || ''),
    settings: {
      scanDepth: 2,
      tokenBudget: 4096,
      recursiveScanning: true,
      ...(source.settings && typeof source.settings === 'object' ? source.settings : {})
    },
    entries,
    entriesMap,
    groups: ensureArray(decodeStored(source.groups, [])),
    sourceDocuments: ensureArray(decodeStored(source.sourceDocuments, []))
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
          warnings: ensureArray(document.warnings).map(String),
          createdAt: Number.isFinite(Number(document.createdAt))
            ? Number(document.createdAt)
            : normalizationNow
        }
      }),
    // 地理历史（可玩历史节点）：无地图时保持 null，不阻塞导入。
    geoHistory: normalizeGeoHistory(source.geoHistory),
    structuredCharacterTombstones,
    structuredCharacterMigrationVersion: 1,
    structuredSettings
  }
}

// Authoring run 的只读世界书边界：从指定 storage key 读取一份独立快照，
// 复用正式 worldbook 归一逻辑，但不切换 activeWorldbook，也不执行旧来源归档
// 迁移或任何持久化写入。项目与世界书绑定关系由上层 repository adapter 核对。
export function readWorldbookSnapshot(worldbookId) {
  const id = String(worldbookId ?? '').trim()
  if (!id) return null
  const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + id), null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  // 纯读必须确定性：旧 structured-settings-only 世界书会在归一时派生 entry，
  // 不能每次用新的 Date.now() 生成不同 revision。优先使用存档时间；旧档无时间
  // 时固定为 0，正式可写 load/save 流程仍使用默认当前时间。
  const persistedAt = Number(raw.updatedAt ?? raw.createdAt)
  const normalizationNow = Number.isFinite(persistedAt) ? persistedAt : 0
  const snapshot = normalizeWorldbook(raw, { normalizationNow })
  return String(snapshot?.id ?? '').trim() === id ? snapshot : null
}

function createWorldBookId() {
  return `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createEntryId() {
  return `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function storageWriteError(label = '本地数据') {
  const error = new Error(`${label}写入失败，可能是本地存储空间不足，请清理后重试。`)
  error.name = 'QuotaExceededError'
  error.code = 'quota-exceeded'
  return error
}

function persistOrThrow(key, value, label) {
  if (!setItem(key, value)) throw storageWriteError(label)
}

function cloneMutationValue(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function captureWorldbookMutation(store, worldbookId = '') {
  const id = String(worldbookId || '').trim()
  return {
    id,
    worldbook: id ? cloneMutationValue(getItem(WORLDBOOK_KEY_PREFIX + id)) : null,
    index: cloneMutationValue(store.worldbooksIndex),
    activeWorldbook: cloneMutationValue(store.activeWorldbook),
    activeId: decodeStoredId(getItem(ACTIVE_WORLDBOOK_ID_KEY))
  }
}

function restoreWorldbookMutation(store, snapshot) {
  let restored = true
  if (snapshot.id) {
    if (snapshot.worldbook == null) {
      try { removeItem(WORLDBOOK_KEY_PREFIX + snapshot.id) } catch { restored = false }
    } else if (!setItem(WORLDBOOK_KEY_PREFIX + snapshot.id, snapshot.worldbook)) {
      restored = false
    }
  }
  store.worldbooksIndex = snapshot.index || []
  store.activeWorldbook = snapshot.activeWorldbook || null
  const persistedIndex = decodeStored(getItem(WORLDBOOKS_INDEX_KEY), [])
  if (
    JSON.stringify(persistedIndex) !== JSON.stringify(store.worldbooksIndex)
    && !setItem(WORLDBOOKS_INDEX_KEY, store.worldbooksIndex)
  ) restored = false
  if (snapshot.activeId) {
    if (
      decodeStoredId(getItem(ACTIVE_WORLDBOOK_ID_KEY)) !== snapshot.activeId
      && !setItem(ACTIVE_WORLDBOOK_ID_KEY, snapshot.activeId)
    ) restored = false
  } else {
    try { removeItem(ACTIVE_WORLDBOOK_ID_KEY) } catch { restored = false }
  }
  return restored
}

function worldbookMutationFailure(error, rollbackOk) {
  const code = String(error?.code || '')
  return mutationFailure(code || 'worldbook-mutation-failed', {
    retryable: code === 'quota-exceeded' || error?.name === 'QuotaExceededError',
    message: String(error?.message || '世界书写入失败'),
    errorName: String(error?.name || 'Error'),
    rollbackOk
  })
}

function unwrapWorldbookMutation(result, payloadKey) {
  if (result?.ok) return payloadKey ? result[payloadKey] : result
  const error = new Error(result?.message || '世界书写入失败')
  error.name = result?.errorName || 'Error'
  error.code = result?.reason || 'worldbook-mutation-failed'
  error.retryable = Boolean(result?.retryable)
  throw error
}

async function migrateLegacyWorldbookSources(worldbookId, worldbook) {
  const legacySources = worldbook?.sourceDocuments?.filter((source) => (
    source?.content && !source.archiveRef
  )) || []
  if (!legacySources.length) return worldbook

  try {
    const archived = await archiveSourceDocuments(legacySources)
    const archivedByLegacyId = new Map(legacySources.map((source, index) => [source.id, archived[index]]))
    const sourceDocuments = worldbook.sourceDocuments.map((source) => archivedByLegacyId.get(source.id) || source)
    const migrated = normalizeWorldbook({
      ...worldbook,
      sourceDocuments,
      updatedAt: Date.now()
    })
    if (!setItem(WORLDBOOK_KEY_PREFIX + worldbookId, migrated)) return worldbook
    return migrated
  } catch {
    // 旧资料迁移不能阻塞打开世界书；下次加载仍会重试，原始记录保持不变。
    return worldbook
  }
}

const CONSTRAINT_IMPORT_TYPES = new Set(['rule', 'style', 'forbidden'])

function normalizeKeywordList(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }
  const normalized = String(value || '').trim()
  return normalized ? [normalized] : []
}

function clampImportNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function resolveImportedEntryMode(entry, type) {
  const modeText = String(entry?.mode || '').trim().toLowerCase()
  const explicitMode = entry?.constant === true
    ? 'constant'
    : (modeText === 'constant' ? 'constant' : ((modeText === 'selective' || entry?.selective === true) ? 'selective' : ''))

  if (CONSTRAINT_IMPORT_TYPES.has(type)) return 'constant'
  if (explicitMode === 'constant') return 'constant'
  return 'selective'
}

export const useWorldStore = defineStore('world', {
  state: () => ({
    // 世界书列表索引（轻量）
    worldbooksIndex: [],

    // 当前活跃世界书完整数据（按需加载）
    activeWorldbook: null,

    // 角色卡列表
    characters: [],

    // 活动记录（时间线）
    activities: [],

    // 加载状态
    isLoading: false,
    lastError: null
  }),

  getters: {
    activeWorldbookId: (state) => state.activeWorldbook?.id || null,
    activeWorldbookName: (state) => state.activeWorldbook?.name || '未选择世界书',

    activeEntryCount: (state) => state.activeWorldbook?.entries?.length || 0,

    charactersByWorldbook: (state) => (worldbookId) => {
      if (!worldbookId) return state.characters.filter(c => !c.worldEntryId)
      return state.characters.filter(c => c.worldEntryId?.startsWith(worldbookId))
    },

    // 同一 preset 多次点「一键导入」时，命中既有副本直接激活，避免重复建书。
    // 优先按显式 sourcePresetId 字段匹配（新版副本）。
    // 兜底按内容签名匹配（旧版副本没有 sourcePresetId，但 preset 内容签名一致），
    // 这样清空缓存前已有的「边境王国」副本也能被识别并复用，而不是继续复制。
    findWorldbookByPreset: (state) => (presetId, signature = null) => {
      if (presetId) {
        const tagged = state.worldbooksIndex.find((w) => w?.sourcePresetId === presetId)
        if (tagged) return tagged
      }
      if (signature) {
        const matches = state.worldbooksIndex.filter((w) => w?.presetSignature === signature)
        if (matches.length) return matches[0]
      }
      return null
    }
  },

  actions: {
    getPlaceEntity(placeRef) {
      return resolvePlaceEntity(this.activeWorldbook, placeRef)
    },

    // ---------- 世界书 CRUD ----------

    async loadWorldbooksIndex() {
      try {
        const raw = decodeStored(getItem(WORLDBOOKS_INDEX_KEY), [])
        this.worldbooksIndex = ensureArray(raw)
      } catch (e) {
        this.lastError = e.message
        this.worldbooksIndex = []
      }
    },

    async saveWorldbooksIndex() {
      return setItem(WORLDBOOKS_INDEX_KEY, this.worldbooksIndex)
    },

    async loadWorldbook(worldbookId) {
      const activationTicket = ++worldbookActivationSequence
      this.isLoading = true
      try {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        const normalized = normalizeWorldbook(raw)
        const loaded = await migrateLegacyWorldbookSources(worldbookId, normalized)
        if (activationTicket === worldbookActivationSequence) this.activeWorldbook = loaded
        return loaded
      } catch (e) {
        if (activationTicket === worldbookActivationSequence) this.lastError = e.message
        return null
      } finally {
        if (activationTicket === worldbookActivationSequence) this.isLoading = false
      }
    },

    // 项目绑定加载：只返回请求 ID 对应的世界书，绝不回退到之前的 active 世界书。
    // 加载失败/ID 不匹配时返回 null，由调用方决定“缺失”提示。
    async loadWorldbookForProject(worldbookId) {
      const id = String(worldbookId || '').trim()
      if (!id) return null
      const loaded = await this.loadWorldbook(id)
      return String(loaded?.id || '') === id ? loaded : null
    },

    async _createWorldbookMutation(data = {}) {
      const now = Date.now()
      const worldbook = {
        id: createWorldBookId(),
        name: data.name || '新世界书',
        // 结构化基础设定
        worldDescription: data.worldDescription || data.description || '',
        writingStyle: data.writingStyle || '',
        examples: data.examples || '',
        forbidden: data.forbidden || '',
        // 兼容旧字段
        description: data.description || '',
        author: data.author || '',
        version: '1.0',
        createdAt: now,
        updatedAt: now,
        settings: {
          scanDepth: 2,
          tokenBudget: 4096,
          recursiveScanning: true,
          ...data.settings
        },
        entries: [],
        entriesMap: {}, // id -> entry 便于快速查找
        groups: [],
        sourceDocuments: Array.isArray(data.sourceDocuments) ? data.sourceDocuments : [],
        // 一键预设世界书携带 preset 来源；同 preset 重复点「开始冒险」复用既有副本。
        sourcePresetId: data.sourcePresetId || null,
        // 内容签名兜底：旧版本产生的副本没有 sourcePresetId，签名相同即视为同源。
        presetSignature: data.presetSignature || null,
        // 预设 / AI 生成 / 导入若已带地图历史则挂上；否则 null（不阻塞）。
        geoHistory: normalizeGeoHistory(data.geoHistory),
        structuredSettings: normalizeStructuredSettings(data.structuredSettings),
        research: data.research && typeof data.research === 'object' ? data.research : null
      }

      const previousIndex = this.worldbooksIndex.slice()
      const previousActive = this.activeWorldbook
      const worldbookKey = WORLDBOOK_KEY_PREFIX + worldbook.id
      try {
        persistOrThrow(worldbookKey, worldbook, '世界书')
        this.worldbooksIndex.push({
          id: worldbook.id,
          name: worldbook.name,
          description: worldbook.description,
          author: worldbook.author,
          entryCount: 0,
          createdAt: worldbook.createdAt,
          updatedAt: worldbook.updatedAt,
          sourcePresetId: worldbook.sourcePresetId,
          presetSignature: worldbook.presetSignature
        })
        if (!await this.saveWorldbooksIndex()) throw storageWriteError('世界书索引')
        persistOrThrow(ACTIVE_WORLDBOOK_ID_KEY, worldbook.id, '当前世界书')
        this.activeWorldbook = worldbook
        return worldbook
      } catch (error) {
        removeItem(worldbookKey)
        this.worldbooksIndex = previousIndex
        this.activeWorldbook = previousActive
        // Rollback only touches the newly appended index entry. The prior active
        // worldbook pointer is left intact if writing the new pointer failed.
        setItem(WORLDBOOKS_INDEX_KEY, previousIndex)
        throw error
      }
    },

    async _updateWorldbookMutation(worldbookId, updates) {
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx < 0) throw new Error('世界书不存在')

      const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
      if (!raw) throw new Error('世界书数据不存在')

      const worldbook = normalizeWorldbook(raw)
      const updated = normalizeWorldbook({
        ...worldbook,
        ...updates,
        updatedAt: Date.now()
      })

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, updated, '世界书')

      // 更新索引
      const indexEntry = this.worldbooksIndex[idx]
      if (Object.prototype.hasOwnProperty.call(updates, 'name')) indexEntry.name = updates.name
      if (Object.prototype.hasOwnProperty.call(updates, 'description')) indexEntry.description = updates.description
      if (Object.prototype.hasOwnProperty.call(updates, 'author')) indexEntry.author = updates.author
      indexEntry.entryCount = updated.entries.length
      indexEntry.updatedAt = updated.updatedAt
      if (updated.sourcePresetId) indexEntry.sourcePresetId = updated.sourcePresetId
      if (updated.presetSignature) indexEntry.presetSignature = updated.presetSignature
      if (!await this.saveWorldbooksIndex()) throw storageWriteError('世界书索引')

      if (this.activeWorldbook?.id === worldbookId) {
        this.activeWorldbook = updated
      }

      return updated
    },

    async _deleteWorldbookMutation(worldbookId) {
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx < 0) return

      removeItem(WORLDBOOK_KEY_PREFIX + worldbookId)

      // 从索引删除
      this.worldbooksIndex.splice(idx, 1)
      await this.saveWorldbooksIndex()

      if (this.activeWorldbook?.id === worldbookId) {
        this.activeWorldbook = null
        removeItem(ACTIVE_WORLDBOOK_ID_KEY)
      }

      const persistedActiveId = decodeStoredId(getItem(ACTIVE_WORLDBOOK_ID_KEY))
      if (persistedActiveId === worldbookId) {
        removeItem(ACTIVE_WORLDBOOK_ID_KEY)
      }
    },

    async setActiveWorldbook(worldbookId) {
      if (!worldbookId) {
        this.activeWorldbook = null
        removeItem(ACTIVE_WORLDBOOK_ID_KEY)
        return null
      }
      if (this.activeWorldbook?.id === worldbookId) return this.activeWorldbook

      const loaded = await this.loadWorldbook(worldbookId)
      // 若期间已有更新的加载成为 active，本次旧请求不能覆盖持久化选择。
      if (loaded && String(this.activeWorldbook?.id || '') === String(worldbookId)) {
        setItem(ACTIVE_WORLDBOOK_ID_KEY, worldbookId)
      }
      return loaded
    },

    async ensureActiveWorldbook() {
      if (!this.worldbooksIndex.length) {
        return this.createWorldbook({
          name: '默认世界书',
          description: '自动创建的默认世界书'
        })
      }

      const persistedActiveId = decodeStoredId(getItem(ACTIVE_WORLDBOOK_ID_KEY))
      const targetId = (typeof persistedActiveId === 'string' && this.worldbooksIndex.some(w => w.id === persistedActiveId))
        ? persistedActiveId
        : this.worldbooksIndex[0].id

      return this.setActiveWorldbook(targetId)
    },

    // ---------- 条目 CRUD ----------

    async _addEntryMutation(worldbookId, entryData) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entry = {
        ...entryData,
        id: createEntryId(),
        keys: entryData.keys || [],
        keysSecondary: entryData.keysSecondary || [],
        content: entryData.content || '',
        type: entryData.type || 'general',
        name: entryData.name || entryData.keys?.[0] || '未命名条目',
        injection: {
          mode: entryData.injection?.mode || 'selective',
          probability: entryData.injection?.probability ?? 100,
          cooldown: entryData.injection?.cooldown ?? 0,
          depth: entryData.injection?.depth ?? 1,
          excludeRecursion: entryData.injection?.excludeRecursion ?? false,
          group: entryData.injection?.group || null
        },
        relations: {
          tags: entryData.relations?.tags || [],
          locations: entryData.relations?.locations || [],
          characters: entryData.relations?.characters || [],
          events: entryData.relations?.events || []
        },
        metadata: {
          ...(entryData.metadata || {}),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          importSource: entryData.metadata?.importSource || 'manual',
          basis: ['research', 'mixed', 'creative'].includes(entryData.metadata?.basis)
            ? entryData.metadata.basis
            : 'creative',
          sourceRefs: Array.isArray(entryData.metadata?.sourceRefs)
            ? entryData.metadata.sourceRefs.filter((item) => /^S\d+$/.test(String(item))).slice(0, 8)
            : [],
          sourceDocumentIds: Array.isArray(entryData.metadata?.sourceDocumentIds)
            ? [...new Set(entryData.metadata.sourceDocumentIds.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 8)
            : [],
          structuredSettingRef: String(entryData.metadata?.structuredSettingRef || ''),
          sourceSection: String(entryData.metadata?.sourceSection || ''),
          sourceField: String(entryData.metadata?.sourceField || ''),
          claimIds: Array.isArray(entryData.metadata?.claimIds)
            ? entryData.metadata.claimIds.filter((item) => /^C\d+$/.test(String(item))).slice(0, 8)
            : [],
          reviewState: ['ready', 'stale', 'needs-review'].includes(entryData.metadata?.reviewState)
            ? entryData.metadata.reviewState
            : 'ready'
        }
      }

      const normalizedEntry = normalizeEntryVoice(entry)
      const persistedEntry = normalizedEntry.type === 'location'
        ? createPlaceEntryPatch(normalizedEntry, normalizedEntry)
        : normalizedEntry
      worldbook.entries.push(persistedEntry)
      worldbook.entriesMap[persistedEntry.id] = persistedEntry
      worldbook.updatedAt = Date.now()

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook, '世界书条目')
      this.activeWorldbook = worldbook

      // 更新索引计数
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        if (!await this.saveWorldbooksIndex()) throw storageWriteError('世界书索引')
      }

      return persistedEntry
    },

    async _updateEntryMutation(worldbookId, entryId, updates) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entryIdx = worldbook.entries.findIndex(e => e.id === entryId)
      if (entryIdx < 0) throw new Error('条目不存在')

      const entry = worldbook.entries[entryIdx]
      // A1.3 守卫：structured entry 被用户编辑了「sync 会覆盖的字段」
      // (name/type/injection) 时，标记 userTouched，避免后续 reload 被静默还原。
      const isStructuredEntry = entry.metadata?.importSource === 'structured-setting' ||
        Boolean(entry.metadata?.structuredSettingRef)
      const isStructuredCharacterCard = Boolean(entry.metadata?.structuredCharacterKey)
      const touchedByUser = isStructuredEntry && (
        Object.prototype.hasOwnProperty.call(updates, 'name') ||
        Object.prototype.hasOwnProperty.call(updates, 'type') ||
        Object.prototype.hasOwnProperty.call(updates, 'injection') ||
        (isStructuredCharacterCard && (
          Object.prototype.hasOwnProperty.call(updates, 'content') ||
          Object.prototype.hasOwnProperty.call(updates?.metadata || {}, 'characterProfile')
        ))
      )
      let updatedBase = {
        ...entry,
        ...updates,
        id: entryId, // 不可更改
        metadata: {
          ...entry.metadata,
          ...(updates.metadata && typeof updates.metadata === 'object' ? updates.metadata : {}),
          updatedAt: Date.now(),
          ...(touchedByUser ? { [STRUCTURED_USER_TOUCHED_KEY]: true } : {})
        }
      }
      if (
        String(updatedBase.type || '').trim().toLowerCase() === 'character' &&
        Object.prototype.hasOwnProperty.call(updates, 'content') &&
        !Object.prototype.hasOwnProperty.call(updates?.metadata || {}, 'characterProfile')
      ) {
        updatedBase = {
          ...updatedBase,
          metadata: {
            ...updatedBase.metadata,
            characterProfile: parseCharacterEntryProfile({
              ...updatedBase,
              metadata: { ...updatedBase.metadata, characterProfile: null }
            })
          }
        }
      }

      const normalizedEntry = normalizeEntryVoice(updatedBase)
      const updated = normalizedEntry.type === 'location'
        ? createPlaceEntryPatch({
            ...getPlacePayloadFromEntry(entry),
            name: normalizedEntry.name,
            aliases: (normalizedEntry.keys || []).filter((key) => String(key || '').trim() !== String(normalizedEntry.name || '').trim()),
            description: normalizedEntry.content
          }, normalizedEntry)
        : normalizedEntry
      worldbook.entries[entryIdx] = updated
      worldbook.entriesMap[entryId] = updated
      worldbook.updatedAt = Date.now()

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook, '世界书条目')
      this.activeWorldbook = worldbook

      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        if (!await this.saveWorldbooksIndex()) throw storageWriteError('世界书索引')
      }

      return updated
    },

    async _deleteEntryMutation(worldbookId, entryId) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entryIdx = worldbook.entries.findIndex(e => e.id === entryId)
      if (entryIdx < 0) return

      const deleting = worldbook.entries[entryIdx]
      const structuredRef = String(deleting?.metadata?.structuredSettingRef || '')
      const structuredCharacterKey = String(deleting?.metadata?.structuredCharacterKey || '')
      if (structuredRef && structuredCharacterKey) {
        worldbook.structuredCharacterTombstones = [...new Set([
          ...(worldbook.structuredCharacterTombstones || []),
          `${structuredRef}:${structuredCharacterKey}`
        ])]
      }

      worldbook.entries.splice(entryIdx, 1)
      delete worldbook.entriesMap[entryId]
      worldbook.updatedAt = Date.now()

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook, '世界书条目')
      this.activeWorldbook = worldbook

      // 更新索引计数
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        if (!await this.saveWorldbooksIndex()) throw storageWriteError('世界书索引')
      }
    },

    // ---------- 统一 durable mutation 边界 ----------

    async _runWorldbookMutation(worldbookId, mutate, payloadKey = '') {
      const snapshot = captureWorldbookMutation(this, worldbookId)
      try {
        const payload = await mutate()
        return mutationSuccess(payloadKey ? { [payloadKey]: payload } : {})
      } catch (error) {
        const rollbackOk = restoreWorldbookMutation(this, snapshot)
        this.lastError = String(error?.message || '世界书写入失败')
        return worldbookMutationFailure(error, rollbackOk)
      }
    },

    createWorldbookDurable(data = {}) {
      return this._runWorldbookMutation('', () => this._createWorldbookMutation(data), 'worldbook')
    },

    updateWorldbookDurable(worldbookId, updates) {
      return this._runWorldbookMutation(worldbookId, () => this._updateWorldbookMutation(worldbookId, updates), 'worldbook')
    },

    deleteWorldbookDurable(worldbookId) {
      return this._runWorldbookMutation(worldbookId, async () => {
        await this._deleteWorldbookMutation(worldbookId)
        return true
      }, 'deleted')
    },

    addEntryDurable(worldbookId, entryData) {
      return this._runWorldbookMutation(worldbookId, () => this._addEntryMutation(worldbookId, entryData), 'entry')
    },

    updateEntryDurable(worldbookId, entryId, updates) {
      return this._runWorldbookMutation(worldbookId, () => this._updateEntryMutation(worldbookId, entryId, updates), 'entry')
    },

    deleteEntryDurable(worldbookId, entryId) {
      return this._runWorldbookMutation(worldbookId, async () => {
        await this._deleteEntryMutation(worldbookId, entryId)
        return true
      }, 'deleted')
    },

    importFromSillyTavernDurable(worldbookData) {
      return this._runWorldbookMutation('', () => this._importFromSillyTavernMutation(worldbookData), 'worldbook')
    },

    // Compatibility surface. Existing consumers keep their historical payload
    // and exception behavior, while every write now crosses the durable owner.
    async createWorldbook(data = {}) {
      return unwrapWorldbookMutation(await this.createWorldbookDurable(data), 'worldbook')
    },

    async updateWorldbook(worldbookId, updates) {
      return unwrapWorldbookMutation(await this.updateWorldbookDurable(worldbookId, updates), 'worldbook')
    },

    async deleteWorldbook(worldbookId) {
      return unwrapWorldbookMutation(await this.deleteWorldbookDurable(worldbookId), 'deleted')
    },

    async addEntry(worldbookId, entryData) {
      return unwrapWorldbookMutation(await this.addEntryDurable(worldbookId, entryData), 'entry')
    },

    async updateEntry(worldbookId, entryId, updates) {
      return unwrapWorldbookMutation(await this.updateEntryDurable(worldbookId, entryId, updates), 'entry')
    },

    async deleteEntry(worldbookId, entryId) {
      return unwrapWorldbookMutation(await this.deleteEntryDurable(worldbookId, entryId), 'deleted')
    },

    async importFromSillyTavern(worldbookData) {
      return unwrapWorldbookMutation(await this.importFromSillyTavernDurable(worldbookData), 'worldbook')
    },

    // ---------- 结构化地点目录 ----------

    getPlaceEntries(worldbookId = this.activeWorldbook?.id) {
      const worldbook = this.activeWorldbook?.id === worldbookId
        ? this.activeWorldbook
        : decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
      return listPlaceEntries(worldbook)
    },

    getPlaceDeleteImpact(worldbookId, entryId) {
      const worldbook = this.activeWorldbook?.id === worldbookId
        ? this.activeWorldbook
        : decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
      return getCatalogPlaceDeleteImpact(worldbook, entryId)
    },

    async createPlace(worldbookId, payload, { sourceOverviewRevision = '' } = {}) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }
      if (sourceOverviewRevision && sourceOverviewRevision !== getPlaceSourceRevision(worldbook)) {
        const error = new Error('地理环境概述已更新，请只重新整理这一项。')
        error.code = 'PLACE_DRAFT_STALE'
        throw error
      }
      const prepared = preparePlaceForWrite(payload, worldbook, { allowUnresolved: true })
      return this.addEntry(worldbookId, createPlaceEntryPatch({
        ...prepared.payload,
        reviewState: prepared.payload.reviewState || 'accepted'
      }, { id: createEntryId() }))
    },

    async updatePlace(worldbookId, entryId, payload, {
      expectedFingerprint = '',
      sourceOverviewRevision = ''
    } = {}) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }
      const current = worldbook.entries.find((entry) => entry.id === entryId)
      if (!current) throw new Error('地点条目不存在')
      if (sourceOverviewRevision && sourceOverviewRevision !== getPlaceSourceRevision(worldbook)) {
        const error = new Error('地理环境概述已更新，请只重新整理这一项。')
        error.code = 'PLACE_DRAFT_STALE'
        throw error
      }
      if (expectedFingerprint && placeFingerprint(current) !== expectedFingerprint) {
        const error = new Error('地点条目已更新，请只重新整理这一项。')
        error.code = 'PLACE_DRAFT_STALE'
        throw error
      }
      const currentPlace = getPlacePayloadFromEntry(current)
      const prepared = preparePlaceForWrite({
        ...currentPlace,
        ...payload,
        sourceEvidence: Object.prototype.hasOwnProperty.call(payload || {}, 'sourceEvidence')
          ? payload.sourceEvidence
          : currentPlace.sourceEvidence,
        mapBinding: Object.prototype.hasOwnProperty.call(payload || {}, 'mapBinding')
          ? payload.mapBinding
          : currentPlace.mapBinding
      }, worldbook, { entryId, allowUnresolved: true })
      return this.updateEntry(worldbookId, entryId, createPlaceEntryPatch(prepared.payload, current))
    },

    async deletePlace(worldbookId, entryId, { confirmImpact = false } = {}) {
      const impact = this.getPlaceDeleteImpact(worldbookId, entryId)
      if (impact.total > 0 && !confirmImpact) return { deleted: false, impact }
      await this.deleteEntry(worldbookId, entryId)
      return { deleted: true, impact }
    },

    // 根据关键词匹配条目
    matchEntries(text) {
      if (!this.activeWorldbook || !text) return []
      const lowerText = text.toLowerCase()
      const results = []

      for (const entry of this.activeWorldbook.entries) {
        // 检查keys
        const keysMatch = entry.keys.some(k => lowerText.includes(k.toLowerCase()))
        const keysSecondaryMatch = entry.keysSecondary.some(k => lowerText.includes(k.toLowerCase()))

        if (keysMatch || keysSecondaryMatch) {
          results.push({
            ...entry,
            matchType: keysMatch ? 'primary' : 'secondary'
          })
        }
      }

      return results
    },

    // ---------- 角色卡管理 ----------

    loadCharacters() {
      try {
        const raw = decodeStored(getItem(STORAGE_KEYS.CHARACTERS || 'characters'), [])
        this.characters = ensureArray(raw)
      } catch {
        this.characters = []
      }
    },

    saveCharacters() {
      setItem(STORAGE_KEYS.CHARACTERS || 'characters', this.characters)
    },

    addCharacter(character) {
      if (!character.id) {
        character.id = `char_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      }
      this.characters.push(character)
      this.saveCharacters()
      return character
    },

    updateCharacter(characterId, updates) {
      const idx = this.characters.findIndex(c => c.id === characterId)
      if (idx < 0) return null
      this.characters[idx] = { ...this.characters[idx], ...updates }
      this.saveCharacters()
      return this.characters[idx]
    },

    deleteCharacter(characterId) {
      this.characters = this.characters.filter(c => c.id !== characterId)
      this.saveCharacters()
    },

    // ---------- 活动记录 ----------

    loadActivities() {
      try {
        const raw = decodeStored(getItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities'), [])
        this.activities = ensureArray(raw)
      } catch {
        this.activities = []
      }
    },

    addActivity(activity) {
      if (!activity.id) {
        activity.id = `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      }
      activity.createdAt = Date.now()
      this.activities.push(activity)
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities', this.activities)
      return activity
    },

    clearActivities() {
      this.activities = []
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities', this.activities)
    },

    // ---------- SillyTavern 导入 ----------

    async _importFromSillyTavernMutation(worldbookData) {
      const now = Date.now()
      const pinaxSourceDocuments = worldbookData?.extensions?.pinax_source_documents
      const archivedSourceDocuments = await archiveSourceDocuments(
        Array.isArray(pinaxSourceDocuments) ? pinaxSourceDocuments : []
      )
      const pinaxGeoHistory = worldbookData?.extensions?.pinax_geo_history
      const worldbook = {
        id: createWorldBookId(),
        name: worldbookData.name || worldbookData.world_name || '导入的世界书',
        description: worldbookData.description || worldbookData.world_description || '',
        author: worldbookData.creator || worldbookData.author || '',
        version: worldbookData.version || '1.0',
        createdAt: now,
        updatedAt: now,
        settings: {
          scanDepth: worldbookData.scan_depth || 2,
          tokenBudget: worldbookData.token_budget || 4096,
          recursiveScanning: worldbookData.recursive_scanning ?? true
        },
        entries: [],
        entriesMap: {},
        groups: [],
        sourceDocuments: archivedSourceDocuments,
        geoHistory: normalizeGeoHistory(pinaxGeoHistory)
      }

      // 解析entries
      const rawEntries = worldbookData.entries || worldbookData.entry || {}
      for (const [uid, entry] of Object.entries(rawEntries)) {
        const keys = normalizeKeywordList(entry.key)
        const keysSecondary = normalizeKeywordList(entry.keysecondary)
        const name = String(entry.comment || keys[0] || uid || '未命名条目').trim() || '未命名条目'
        const pinaxPlace = entry?.extensions?.pinax_place
        const pinaxVoice = entry?.extensions?.pinax_voice
        const type = pinaxPlace && typeof pinaxPlace === 'object'
          ? 'location'
          : (pinaxVoice && typeof pinaxVoice === 'object'
              ? 'character'
              : this.guessEntryType(keys, entry.content, name))
        const mode = resolveImportedEntryMode(entry, type)
        const depthFallback = mode === 'constant' ? 2 : 1
        const depthValue = clampImportNumber(entry.depth, depthFallback, 1, 99)
        const defaultGroup = type === 'rule'
          ? '硬约束'
          : (type === 'style' ? '文风约束' : (type === 'forbidden' ? '禁写边界' : ''))

        let mapped = {
          ...entry,
          id: `entry_${Date.now().toString(36)}_${uid.slice(0, 8)}`,
          keys,
          keysSecondary,
          content: entry.content || '',
          type,
          name,
          injection: {
            mode,
            probability: mode === 'constant' ? 100 : clampImportNumber(entry.probability, 100, 0, 100),
            cooldown: clampImportNumber(entry.cooldown, 0, 0, 99999),
            depth: mode === 'constant' ? Math.max(2, depthValue) : depthValue,
            excludeRecursion: Boolean(entry.excludeRecursion),
            group: String(entry.group || '').trim() || defaultGroup || null
          },
          relations: {
            tags: entry.tags || [],
            locations: [],
            characters: [],
            events: []
          },
          metadata: {
            ...(entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}),
            createdAt: now,
            updatedAt: now,
            importSource: 'sillytavern',
            originalUid: uid,
            sourceDocumentIds: Array.isArray(entry?.extensions?.pinax_source_document_ids)
              ? entry.extensions.pinax_source_document_ids.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
              : []
          }
        }

        mapped = normalizeEntryVoice({
          ...mapped,
          ...(pinaxVoice && typeof pinaxVoice === 'object' ? { voice: pinaxVoice } : {})
        })

        if (pinaxPlace && typeof pinaxPlace === 'object') {
          mapped = createPlaceEntryPatch({
            ...pinaxPlace,
            name,
            description: entry.content || pinaxPlace.description
          }, mapped)
        }

        worldbook.entries.push(mapped)
        worldbook.entriesMap[mapped.id] = mapped
      }

      // 解析分组
      if (worldbookData.groups) {
        worldbook.groups = worldbookData.groups
      }

      const previousIndex = this.worldbooksIndex.slice()
      const previousActive = this.activeWorldbook
      const worldbookKey = WORLDBOOK_KEY_PREFIX + worldbook.id
      try {
        persistOrThrow(worldbookKey, worldbook, '导入世界书')
        this.worldbooksIndex.push({
          id: worldbook.id,
          name: worldbook.name,
          description: worldbook.description,
          author: worldbook.author,
          entryCount: worldbook.entries.length,
          createdAt: worldbook.createdAt,
          updatedAt: worldbook.updatedAt
        })
        if (!await this.saveWorldbooksIndex()) throw storageWriteError('世界书索引')
        persistOrThrow(ACTIVE_WORLDBOOK_ID_KEY, worldbook.id, '当前世界书')
        this.activeWorldbook = worldbook
        return worldbook
      } catch (error) {
        removeItem(worldbookKey)
        this.worldbooksIndex = previousIndex
        this.activeWorldbook = previousActive
        setItem(WORLDBOOKS_INDEX_KEY, previousIndex)
        throw error
      }
    },

    // ---------- SillyTavern 导出 ----------

    async exportToSillyTavern(worldbookId) {
      let worldbook = this.activeWorldbook
      if (!worldbook || worldbook.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entries = {}
      for (const entry of worldbook.entries) {
        const uid = entry.metadata?.originalUid || entry.id.replace('entry_', '')
        const place = entry.type === 'location' && !entry.metadata?.structuredSettingRef
          ? getPlacePayloadFromEntry(entry)
          : null
        entries[uid] = {
          key: entry.keys,
          keysecondary: entry.keysSecondary,
          content: entry.content,
          comment: entry.name,
          selective: entry.injection.mode === 'selective',
          constant: entry.injection.mode === 'constant',
          group: entry.injection.group,
          depth: entry.injection.depth,
          probability: entry.injection.probability,
          cooldown: entry.injection.cooldown,
          excludeRecursion: entry.injection.excludeRecursion,
          extensions: {
            ...(entry.metadata?.sourceDocumentIds?.length
              ? { pinax_source_document_ids: entry.metadata.sourceDocumentIds }
              : {}),
            ...(place ? { pinax_place: place } : {}),
            ...(entry.type === 'character' && (entry.speechStyle || entry.samples?.length)
              ? {
                  pinax_voice: normalizeNarrativeVoiceProfile(entry, entry.name)
                }
              : {})
          }
        }
      }

      return {
        name: worldbook.name,
        world_name: worldbook.name,
        description: worldbook.description,
        world_description: worldbook.description,
        creator: worldbook.author,
        version: worldbook.version,
        scan_depth: worldbook.settings.scanDepth,
        token_budget: worldbook.settings.tokenBudget,
        recursive_scanning: worldbook.settings.recursiveScanning,
        extensions: {
          ...(worldbook.sourceDocuments?.length
            ? { pinax_source_documents: worldbook.sourceDocuments }
            : {}),
          ...(worldbook.geoHistory ? { pinax_geo_history: worldbook.geoHistory } : {})
        },
        groups: worldbook.groups,
        entries
      }
    },

    // ---------- 结构化设定 ----------

    async updateStructuredSetting(worldbookId, sectionKey, fieldKey, value) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const field = getSettingField(sectionKey, fieldKey)
      if (!field) throw new Error('设定字段不存在')

      const structuredSettings = normalizeStructuredSettings(worldbook.structuredSettings)
      structuredSettings[sectionKey][fieldKey] = String(value || '')
      const ref = structuredSettingRef(sectionKey, fieldKey)
      const structuredCharacterTombstones = field.entryType === 'character'
        ? (worldbook.structuredCharacterTombstones || []).filter((item) => !String(item).startsWith(`${ref}:`))
        : (worldbook.structuredCharacterTombstones || [])
      const entries = field.entryType === 'character'
        ? worldbook.entries.filter((entry) => entry?.metadata?.structuredSettingRef !== ref)
        : worldbook.entries

      return this.updateWorldbook(worldbookId, {
        structuredSettings,
        structuredCharacterTombstones,
        entries,
        ...(field.entryType === 'character' ? { structuredCharacterMigrationVersion: 0 } : {})
      })
    },

    async convertStructuredSettingToEntry(worldbookId, sectionKey, fieldKey) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const field = getSettingField(sectionKey, fieldKey)
      if (!field) throw new Error('设定字段不存在')

      const structuredSettings = normalizeStructuredSettings(worldbook.structuredSettings)
      const content = structuredSettings[sectionKey][fieldKey].trim()
      if (!content) throw new Error('设定字段为空，不能转为世界书条目')

      const updated = await this.updateWorldbook(worldbookId, { structuredSettings })
      return updated.entries.find((entry) => entry.metadata?.structuredSettingRef === structuredSettingRef(sectionKey, fieldKey)) || null
    },

    // ---------- 辅助方法 ----------

    guessEntryType(keys, content, name = '') {
      const terms = [
        ...(Array.isArray(keys) ? keys : []),
        content,
        name
      ]
        .map(item => String(item || '').toLowerCase())
        .filter(Boolean)

      if (!terms.length) return 'general'

      const corpus = terms.join(' ')
      const containsAny = (keywords) => keywords.some(keyword => corpus.includes(keyword))

      const forbiddenKws = ['禁忌', '禁止', '不得', '不能', '不可', '严禁', 'forbidden', 'ban', 'avoid']
      if (containsAny(forbiddenKws)) return 'forbidden'

      const styleKws = ['风格', '文风', '语气', '叙事', '视角', 'style', 'tone']
      if (containsAny(styleKws)) return 'style'

      const ruleKws = ['规则', '约束', '必须', '原则', '条例', 'rule', 'constraint']
      if (containsAny(ruleKws)) return 'rule'

      const locationKws = ['城市', '城镇', '村庄', '山', '森林', '河流', '海洋', '宫殿', '地点', '位置', 'city', 'town', 'village', 'mountain', 'forest', 'river']
      if (containsAny(locationKws)) return 'location'

      const characterKws = ['人物', '角色', 'npc', '主角', '配角', '人名', 'character']
      if (containsAny(characterKws)) return 'character'

      const organizationKws = ['组织', '门派', '势力', '公司', '协会', '家族', 'organization', 'faction', 'guild']
      if (containsAny(organizationKws)) return 'organization'

      const itemKws = ['物品', '道具', '武器', '装备', 'item', 'weapon', 'artifact', 'tool']
      if (containsAny(itemKws)) return 'item'

      const eventKws = ['事件', '危机', '袭击', '失联', '活动', 'event', 'incident']
      if (containsAny(eventKws)) return 'event'

      const questKws = ['任务', '委托', '目标', 'quest', 'mission']
      if (containsAny(questKws)) return 'quest'

      const loreKws = ['设定', '背景', '历史', '传说', 'lore', 'setting']
      if (containsAny(loreKws)) return 'lore'

      return 'general'
    }
  }
})
