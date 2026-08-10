import { defineStore } from 'pinia'
import { getItem, setItem, removeItem, STORAGE_KEYS } from '../composables/useStorage'
import {
  SETTING_SECTIONS,
  getSettingField,
  normalizeStructuredSettings
} from '../services/settingPanelSchema'
import { parseCharacterCards } from '../services/characterCard'
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
} from '../services/worldbookPlaceCatalog'

const WORLDBOOKS_INDEX_KEY = 'worldbooks_index'
const WORLDBOOK_KEY_PREFIX = 'worldbook_'
const ACTIVE_WORLDBOOK_ID_KEY = 'active_worldbook_id'

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

function syncStructuredEntries(entries, structuredSettings) {
  const nextEntries = entries.map((entry) => ({
    ...entry,
    metadata: { ...(entry.metadata || {}) }
  }))

  for (const section of SETTING_SECTIONS) {
    for (const field of section.fields) {
      const content = String(structuredSettings?.[section.key]?.[field.key] || '').trim()
      const ref = structuredSettingRef(section.key, field.key)
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

      const isConstant = ['rule', 'style', 'forbidden'].includes(field.entryType)
      const baseEntry = existingIndex >= 0 ? nextEntries[existingIndex] : null
      const contentChanged = !baseEntry || baseEntry.content !== content
      const now = Date.now()
      const characterKeys = field.entryType === 'character'
        ? parseCharacterCards(content).map((card) => card.name)
        : []
      const entry = {
        ...(baseEntry || {}),
        id: baseEntry?.id || `entry_structured_${section.key}_${field.key}`,
        name: field.label,
        type: field.entryType,
        keys: [...new Set([field.label, ...characterKeys, ...(baseEntry?.keys || [])])],
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
 * - 缺失 / 空 → null（OpeningPage 可据此优雅隐藏历史节点区）。
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

function normalizeWorldbook(raw = {}) {
  const source = decodeStored(raw, {})
  const structuredSettings = normalizeStructuredSettings(source.structuredSettings)
  const syncedEntries = syncStructuredEntries(
    ensureArray(decodeStored(source.entries, [])),
    structuredSettings
  )
  const entries = syncedEntries.map((entry) => (
    entry?.type === 'location' && !isPlaceOverviewEntry(entry)
      ? createPlaceEntryPatch(entry, entry)
      : entry
  ))
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
      .filter((document) => document && typeof document === 'object' && String(document.content || '').trim())
      .map((document, index) => ({
        id: String(document.id || `source_${index + 1}`),
        title: String(document.title || `原始资料 ${index + 1}`),
        kind: String(document.kind || 'reference-text'),
        content: String(document.content || ''),
        sourceLabel: String(document.sourceLabel || ''),
        originalLength: Math.max(String(document.content || '').length, Number(document.originalLength) || 0),
        truncated: Boolean(document.truncated),
        createdAt: Number(document.createdAt) || Date.now()
      })),
    // 地理历史（可玩历史节点）：无地图时保持 null，不阻塞导入。
    geoHistory: normalizeGeoHistory(source.geoHistory),
    structuredSettings
  }
}

function createWorldBookId() {
  return `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createEntryId() {
  return `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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
      setItem(WORLDBOOKS_INDEX_KEY, this.worldbooksIndex)
    },

    async loadWorldbook(worldbookId) {
      this.isLoading = true
      try {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        this.activeWorldbook = normalizeWorldbook(raw)
        return this.activeWorldbook
      } catch (e) {
        this.lastError = e.message
        return null
      } finally {
        this.isLoading = false
      }
    },

    async createWorldbook(data = {}) {
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

      setItem(WORLDBOOK_KEY_PREFIX + worldbook.id, worldbook)

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
      await this.saveWorldbooksIndex()
      this.activeWorldbook = worldbook
      setItem(ACTIVE_WORLDBOOK_ID_KEY, worldbook.id)

      return worldbook
    },

    async updateWorldbook(worldbookId, updates) {
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

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, updated)

      // 更新索引
      const indexEntry = this.worldbooksIndex[idx]
      if (Object.prototype.hasOwnProperty.call(updates, 'name')) indexEntry.name = updates.name
      if (Object.prototype.hasOwnProperty.call(updates, 'description')) indexEntry.description = updates.description
      if (Object.prototype.hasOwnProperty.call(updates, 'author')) indexEntry.author = updates.author
      indexEntry.entryCount = updated.entries.length
      indexEntry.updatedAt = updated.updatedAt
      if (updated.sourcePresetId) indexEntry.sourcePresetId = updated.sourcePresetId
      if (updated.presetSignature) indexEntry.presetSignature = updated.presetSignature
      await this.saveWorldbooksIndex()

      if (this.activeWorldbook?.id === worldbookId) {
        this.activeWorldbook = updated
      }

      return updated
    },

    async deleteWorldbook(worldbookId) {
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
      if (loaded) setItem(ACTIVE_WORLDBOOK_ID_KEY, worldbookId)
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

    async addEntry(worldbookId, entryData) {
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

      const persistedEntry = entry.type === 'location'
        ? createPlaceEntryPatch(entry, entry)
        : entry
      worldbook.entries.push(persistedEntry)
      worldbook.entriesMap[persistedEntry.id] = persistedEntry
      worldbook.updatedAt = Date.now()

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook)
      this.activeWorldbook = worldbook

      // 更新索引计数
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        await this.saveWorldbooksIndex()
      }

      return persistedEntry
    },

    async updateEntry(worldbookId, entryId, updates) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entryIdx = worldbook.entries.findIndex(e => e.id === entryId)
      if (entryIdx < 0) throw new Error('条目不存在')

      const entry = worldbook.entries[entryIdx]
      const updatedBase = {
        ...entry,
        ...updates,
        id: entryId, // 不可更改
        metadata: {
          ...entry.metadata,
          ...(updates.metadata && typeof updates.metadata === 'object' ? updates.metadata : {}),
          updatedAt: Date.now()
        }
      }

      const updated = (updates.type || entry.type) === 'location'
        ? createPlaceEntryPatch(updatedBase, entry)
        : updatedBase
      worldbook.entries[entryIdx] = updated
      worldbook.entriesMap[entryId] = updated
      worldbook.updatedAt = Date.now()

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook)
      this.activeWorldbook = worldbook

      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        await this.saveWorldbooksIndex()
      }

      return updated
    },

    async deleteEntry(worldbookId, entryId) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entryIdx = worldbook.entries.findIndex(e => e.id === entryId)
      if (entryIdx < 0) return

      worldbook.entries.splice(entryIdx, 1)
      delete worldbook.entriesMap[entryId]
      worldbook.updatedAt = Date.now()

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook)
      this.activeWorldbook = worldbook

      // 更新索引计数
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        await this.saveWorldbooksIndex()
      }
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
      } catch (e) {
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
      } catch (e) {
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

    async importFromSillyTavern(worldbookData) {
      const now = Date.now()
      const pinaxSourceDocuments = worldbookData?.extensions?.pinax_source_documents
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
        sourceDocuments: Array.isArray(pinaxSourceDocuments) ? pinaxSourceDocuments : [],
        geoHistory: normalizeGeoHistory(pinaxGeoHistory)
      }

      // 解析entries
      const rawEntries = worldbookData.entries || worldbookData.entry || {}
      for (const [uid, entry] of Object.entries(rawEntries)) {
        const keys = normalizeKeywordList(entry.key)
        const keysSecondary = normalizeKeywordList(entry.keysecondary)
        const name = String(entry.comment || keys[0] || uid || '未命名条目').trim() || '未命名条目'
        const pinaxPlace = entry?.extensions?.pinax_place
        const type = pinaxPlace && typeof pinaxPlace === 'object'
          ? 'location'
          : this.guessEntryType(keys, entry.content, name)
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

      setItem(WORLDBOOK_KEY_PREFIX + worldbook.id, worldbook)

      this.worldbooksIndex.push({
        id: worldbook.id,
        name: worldbook.name,
        description: worldbook.description,
        author: worldbook.author,
        entryCount: worldbook.entries.length,
        createdAt: worldbook.createdAt,
        updatedAt: worldbook.updatedAt
      })
      await this.saveWorldbooksIndex()
      this.activeWorldbook = worldbook
      setItem(ACTIVE_WORLDBOOK_ID_KEY, worldbook.id)

      return worldbook
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
            ...(place ? { pinax_place: place } : {})
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

      return this.updateWorldbook(worldbookId, { structuredSettings })
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
