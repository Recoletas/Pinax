import { recoverAssistantEdits } from '../services/storage/assistantEditJournal.js'
import { defineStore } from 'pinia'
import { getItem, setItem, removeItem, STORAGE_KEYS } from '../composables/useStorage'
import {
  getSettingField,
  getSettingSection,
  normalizeStructuredSettings
} from '../services/worldbook/settingPanelSchema'
import {
  WRITE_MERGE_MIGRATION_VERSION,
  STRUCTURED_USER_TOUCHED_KEY,
  findStructuredFieldByRef,
  isStructuredEntryInDefaultShape,
  structuredSettingRef,
  syncStructuredCharacterFields,
  migrateStructuredSettingProjections,
  upsertStructuredFieldEntry,
  normalizeSourceDocumentRecords,
  reconcileSourceDocumentEntries,
  deriveSourceDocumentsFromEntries
} from '../services/worldbook/writeMergeMigration'
import {
  parseCharacterEntryProfile
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
// tier 档位枚举单源于注入端（entryTierOf/kindTierOf 语义见 worldbookContextBuilder 头注释）
import { ENTRY_TIER_VALUES } from '../services/worldbook/worldbookContextBuilder'
import { mutationFailure, mutationSuccess } from '../services/storage/durableMutationResult.js'
import {
  createWorldbookFileSyncController,
  isFileSourceAvailable,
  resolveWorldbookLoadSource,
  resolveWorldbookProjectRoot,
  saveWorldbookToFiles
} from '../services/worldbook/worldbookFileRepository'

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

// ---------- W4 写侧合并：结构化投影迁移 / 资料升 source 条目 ----------
// structuredSettings 投影链（syncStructuredEntries + 墓碑 + userTouched 守卫）已退役为
// writeMergeMigration 纯函数模块：非 character 字段的自动 materialize 停用，改为
// writeMergeMigrationVersion 门控的一次性迁移 + 兼容入口保存时显式 upsert；
// 资料记录（sourceDocuments）升为 type:'source' 条目，资料页读路径从条目重建旧形状。
// 语义逐条保留：墓碑不复活 / userTouched 不覆盖 / content 仍是注入真相 / A3 双写接缝零变化。

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

function normalizeWorldbook(raw = {}, { normalizationNow = Date.now(), sourceEntriesReconcile = 'full' } = {}) {
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
  const writeMergeMigrationVersion = Number(source.writeMergeMigrationVersion) || 0
  let syncedEntries = rawEntries
  if (structuredCharacterMigrationVersion < 1) {
    // character 聚合文本的一次性迁移（updateStructuredSetting 保存角色字段后重推也走这里）。
    syncedEntries = syncStructuredCharacterFields(syncedEntries, structuredSettings, normalizationNow, structuredCharacterTombstones)
  }
  if (writeMergeMigrationVersion < WRITE_MERGE_MIGRATION_VERSION) {
    // W4 一次性迁移：非 character 结构化投影落成正式条目（幂等；userTouched 不覆盖）。
    syncedEntries = migrateStructuredSettingProjections(syncedEntries, structuredSettings, { now: normalizationNow })
  }
  const sourceDocumentRecords = normalizeSourceDocumentRecords(source.sourceDocuments, { now: normalizationNow })
  // W4：资料记录 → type:'source' 条目（幂等 reconcile；注入零变化——keys 空 + selective）。
  // 载入/文件组装走 full（账本与条目双向对齐）；更新动作显式传 entries 而未传
  // sourceDocuments 时调用方拥有条目数组（整组替换语义），不做资料条目的增删。
  if (sourceEntriesReconcile === 'full') {
    syncedEntries = reconcileSourceDocumentEntries(syncedEntries, sourceDocumentRecords, { now: normalizationNow })
  }
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
    // 资料页读路径兼容：从 source 条目重建旧记录形状（旧记录完整保存在条目 metadata）。
    // entries-owned 更新（整组替换条目、未动资料账本）时保留原记录，避免视图丢资料。
    sourceDocuments: sourceEntriesReconcile === 'full'
      ? deriveSourceDocumentsFromEntries(entries)
      : sourceDocumentRecords,
    // 地理历史（可玩历史节点）：无地图时保持 null，不阻塞导入。
    geoHistory: normalizeGeoHistory(source.geoHistory),
    structuredCharacterTombstones,
    structuredCharacterMigrationVersion: 1,
    // W4 写侧合并迁移门：非 character 结构化投影退役 + 资料升 source 条目（一次性、幂等）。
    writeMergeMigrationVersion: WRITE_MERGE_MIGRATION_VERSION,
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

// ---------- 文件双写接缝（W2·A3：文件真源优先 + localStorage 缓存回落 + 首载迁移） ----------
// 只挂持久化路径：条目 CRUD/注入/结构化投影语义零变化；server 不可达/未绑定时
// isFileSourceAvailable() 为 false，一切走原 localStorage 路径（零行为差异）。
// 竞争守卫（worldbook-workflow §4）落在副作用 owner=worldbookFileRepository 的控制器内。

const WORLDBOOK_FILE_SYNC_COALESCE_MS = 1500

/** sync 载荷组装：世界书域字段 + 完整条目（entriesMap 是索引不入文件，normalize 重建）。 */
function buildWorldbookFilePayload(raw) {
  const worldbook = normalizeWorldbook(raw)
  return {
    id: String(worldbook.id || ''),
    name: String(worldbook.name || ''),
    worldDescription: String(worldbook.worldDescription || ''),
    writingStyle: String(worldbook.writingStyle || ''),
    forbidden: String(worldbook.forbidden || ''),
    groups: Array.isArray(worldbook.groups) ? worldbook.groups : [],
    entries: Array.isArray(worldbook.entries) ? worldbook.entries : []
  }
}

/** 双写结果轻量标记：只挂在内存 activeWorldbook 上（不入持久化，避免标记写入再触发推送）。 */
function markWorldbookFileSync(worldbookId, info) {
  try {
    const store = useWorldStore()
    if (store.activeWorldbook?.id === worldbookId) {
      store.activeWorldbook.fileSyncAt = info?.at || Date.now()
      store.activeWorldbook.fileSyncError = null
    }
  } catch { /* 标记失败不影响双写 */ }
}

function markWorldbookFileSyncFailed(worldbookId, error) {
  console.warn('[worldStore] 世界书文件双写失败（不影响本地编辑）', worldbookId, String(error?.code || ''), String(error?.message || ''))
  try {
    const store = useWorldStore()
    if (store.activeWorldbook?.id === worldbookId) {
      store.activeWorldbook.fileSyncError = String(error?.message || error?.code || 'file-sync-failed')
    }
  } catch { /* 轻量标记，绝不抛错 */ }
}

let worldbookFileSyncController = null

function getWorldbookFileSyncController() {
  if (worldbookFileSyncController) return worldbookFileSyncController
  worldbookFileSyncController = createWorldbookFileSyncController({
    readFile: (worldbookId) => decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null),
    resolveRoot: (worldbookId) => resolveWorldbookProjectRoot(worldbookId),
    isAvailable: isFileSourceAvailable,
    assemble: buildWorldbookFilePayload,
    push: (projectRoot, worldbook) => saveWorldbookToFiles(projectRoot, worldbook),
    onSynced: markWorldbookFileSync,
    onSyncFailed: markWorldbookFileSyncFailed,
    coalesceMs: WORLDBOOK_FILE_SYNC_COALESCE_MS
  })
  return worldbookFileSyncController
}

/** 保存接缝入口：localStorage 世界书写入成功后调用；文件源不可用时零开销返回。 */
function queueWorldbookFilePush(worldbookId) {
  try {
    getWorldbookFileSyncController().enqueue(worldbookId)
  } catch { /* 双写绝不打断编辑 */ }
}

/** 文件加载成功后的 localStorage 缓存刷新（best-effort；失败时文件仍是真源）。 */
function cacheWorldbookFromFiles(worldbookId, raw) {
  try {
    setItem(WORLDBOOK_KEY_PREFIX + worldbookId, JSON.parse(JSON.stringify(raw)))
  } catch { /* 配额/序列化失败不阻塞加载 */ }
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
      recoverAssistantEdits()
      const activationTicket = ++worldbookActivationSequence
      this.isLoading = true
      try {
        const persistedRaw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        // 文件真源优先（W2·A3）：server 不可达/超时/未绑定/条目失配 → 完全走原 localStorage
        // 路径（零行为差异）；文件缺失而本地有 → 首载迁移（异步幂等推一次）。
        const fileSource = await resolveWorldbookLoadSource(worldbookId, persistedRaw)
        if (fileSource.source === 'blocked') throw new Error(fileSource.error?.message || '世界书文件无法读取，未覆盖现有数据。')
        if (!persistedRaw && fileSource.source !== 'files') throw new Error('世界书不存在')
        const raw = fileSource.source === 'files' ? fileSource.raw : persistedRaw
        const normalized = normalizeWorldbook(raw)
        const loaded = await migrateLegacyWorldbookSources(worldbookId, normalized)
        if (activationTicket === worldbookActivationSequence) {
          this.activeWorldbook = loaded
          if (fileSource.source === 'files') {
            cacheWorldbookFromFiles(worldbookId, raw)
          } else if (fileSource.migrate && persistedRaw) {
            queueWorldbookFilePush(worldbookId)
          }
        }
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
        queueWorldbookFilePush(worldbook.id)
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
      // W4：显式传 entries 且未动 sourceDocuments 的更新 = 调用方拥有条目数组
      //（整组替换/合并语义），跳过资料条目 reconcile，防止整组替换被资料记录复活。
      const sourceEntriesReconcile = Object.prototype.hasOwnProperty.call(updates, 'entries') &&
        !Object.prototype.hasOwnProperty.call(updates, 'sourceDocuments')
        ? 'entries-owned'
        : 'full'
      const updated = normalizeWorldbook({
        ...worldbook,
        ...updates,
        updatedAt: Date.now()
      }, { sourceEntriesReconcile })

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, updated, '世界书')
      queueWorldbookFilePush(worldbookId)

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
        // tier 档位（注入分档）：仅接受 core/support/background，无效值不落字段，
        // 注入端回落 kind 推导；更新路径（_updateEntryMutation 展开透传）不丢显式档位
        ...(ENTRY_TIER_VALUES.includes(entryData.tier) ? { tier: entryData.tier } : {}),
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
      // W4：新资料创建走条目 upsert——携带 importKey（如素材草稿 draft-asset:<id>）的
      // 写入命中同键既有条目时原位更新，不重复追加；其余写入路径零变化。
      const importKey = String(entryData.metadata?.importKey || '').trim()
      const existingKeyIndex = importKey
        ? worldbook.entries.findIndex((existing) => String(existing?.metadata?.importKey || '').trim() === importKey)
        : -1
      if (existingKeyIndex >= 0) {
        const existing = worldbook.entries[existingKeyIndex]
        persistedEntry.id = existing.id
        persistedEntry.metadata = {
          ...persistedEntry.metadata,
          createdAt: existing.metadata?.createdAt || persistedEntry.metadata.createdAt
        }
        worldbook.entries.splice(existingKeyIndex, 1, persistedEntry)
      } else {
        worldbook.entries.push(persistedEntry)
      }
      worldbook.entriesMap[persistedEntry.id] = persistedEntry
      worldbook.updatedAt = Date.now()

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook, '世界书条目')
      queueWorldbookFilePush(worldbookId)
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
            ...getPlacePayloadFromEntry(normalizedEntry),
            ...(Object.prototype.hasOwnProperty.call(updates, 'mapBinding') ? { mapBinding: updates.mapBinding } : {}),
            name: normalizedEntry.name,
            aliases: (normalizedEntry.keys || []).filter((key) => String(key || '').trim() !== String(normalizedEntry.name || '').trim()),
            description: normalizedEntry.content
          }, normalizedEntry)
        : normalizedEntry
      worldbook.entries[entryIdx] = updated
      worldbook.entriesMap[entryId] = updated
      worldbook.updatedAt = Date.now()

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook, '世界书条目')
      queueWorldbookFilePush(worldbookId)
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
      // W4：删除资料条目联动移除 sourceDocuments 记录——资料升条目后记录账本与
      // 条目一致，否则下次归一的 reconcile 会把已删资料复活。
      if (deleting?.metadata?.importSource === 'source-document' && String(deleting?.metadata?.sourceDocumentId || '').trim()) {
        const removedDocId = String(deleting.metadata.sourceDocumentId)
        worldbook.sourceDocuments = ensureArray(worldbook.sourceDocuments)
          .filter((document) => String(document?.id || '') !== removedDocId)
      }

      worldbook.entries.splice(entryIdx, 1)
      delete worldbook.entriesMap[entryId]
      worldbook.updatedAt = Date.now()

      persistOrThrow(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook, '世界书条目')
      queueWorldbookFilePush(worldbookId)
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

    // W2·G5 重复条目标记（去重保守裁定）：只给条目打 metadata.duplicateOf，
    // 不删除、不合并不改名——真删除留 UI 确认。duplicateOfId 为空 = 清标记
    // （undefined 经 JSON 序列化后不落盘，消费方按真值判定）。走 activeWorldbook，
    // 复用 updateEntryDurable 的 durable 边界（回滚/文件双写/索引计数）；自引用静默无操作。
    async markDuplicate(entryId, duplicateOfId) {
      const worldbookId = String(this.activeWorldbook?.id || '').trim()
      if (!worldbookId) throw new Error('没有激活的世界书')
      const selfId = String(entryId || '').trim()
      const targetId = String(duplicateOfId || '').trim()
      if (!selfId || (targetId && targetId === selfId)) return null
      return unwrapWorldbookMutation(
        await this.updateEntryDurable(worldbookId, selfId, { metadata: { duplicateOf: targetId } }),
        'entry'
      )
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
        queueWorldbookFilePush(worldbook.id)
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

      // Different imported books may carry the same original UID. Reserve all
      // original keys first, then allocate collisions without stealing a later
      // entry's key. A null prototype also preserves keys such as __proto__.
      const entries = Object.create(null)
      const preferredUids = worldbook.entries.map(entry => String(entry.metadata?.originalUid ?? '').trim() || entry.id.replace('entry_', ''))
      const reservedUids = new Set(preferredUids)
      const usedUids = new Set()
      let nextUid = 0
      let entryIndex = 0
      for (const entry of worldbook.entries) {
        let uid = preferredUids[entryIndex++]
        if (usedUids.has(uid)) {
          while (reservedUids.has(String(nextUid)) || usedUids.has(String(nextUid))) nextUid += 1
          uid = String(nextUid++)
        }
        usedUids.add(uid)
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
      if (field.entryType === 'character') {
        const structuredCharacterTombstones = (worldbook.structuredCharacterTombstones || [])
          .filter((item) => !String(item).startsWith(`${ref}:`))
        const entries = worldbook.entries.filter((entry) => entry?.metadata?.structuredSettingRef !== ref)
        return this.updateWorldbook(worldbookId, {
          structuredSettings,
          structuredCharacterTombstones,
          entries,
          structuredCharacterMigrationVersion: 0
        })
      }
      // W4 投影链退役：兼容入口保存即直接 upsert 条目（userTouched 只刷 keys，
      // 语义与退役前 sync 的非 character 分支一致），不再依赖载入时的自动 materialize。
      const entries = upsertStructuredFieldEntry(worldbook.entries, getSettingSection(sectionKey), field, String(value || ''), { now: Date.now() })
      return this.updateWorldbook(worldbookId, {
        structuredSettings,
        entries
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

      // W4 投影链退役后条目不再由载入自动派生：转换动作自己完成一次 upsert。
      const entries = upsertStructuredFieldEntry(worldbook.entries, getSettingSection(sectionKey), field, content, { now: Date.now() })
      const updated = await this.updateWorldbook(worldbookId, { structuredSettings, entries })
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
