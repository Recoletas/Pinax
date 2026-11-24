import { readStoredText } from '../storage/writingStorageCodec.js'
import { captureStorageValue, isWritingChangesKey, removeStoredValue, storageValueMatches } from '../storage/writingChapterStorage.js'
import { buildWorldbookRawFromFiles } from '../worldbook/worldbookFileRepository.js'
// File availability enables explicit recovery. Deleting a browser copy also
// requires proof that the same project's files recover every stored field.

export const LOCALIZATION_CATEGORIES = Object.freeze(['file-source', 'cache-droppable', 'browser-only'])

/** IndexedDB 域的伪键前缀（plan key 空间，与 localStorage 真键区分）。 */
export const IDB_SOURCE_ARCHIVE_PLAN_KEY = '@idb:pinax-source-archive'
export const IDB_MEMORY_HISTORY_PLAN_KEY = '@idb:pinax-memory-history'

/**
 * 键逐键裁定表（盘点来源：worldbook-unification-abc-20261008 W6 任务卡键盘点）。
 * exact 键优先匹配；prefix 键按声明顺序匹配（`*` 结尾）。
 * category ∈ file-source（真源=服务器文件，浏览器副本可恢复）
 *          | cache-droppable（可丢缓存：派生/偏好/已迁移残骸，湮灭清除不恢复）
 *          | browser-only（留浏览器：安全敏感项或尚未文件化的作者数据/设备偏好，湮灭永不沾）。
 */
export const LOCALIZATION_KEY_PLAN = Object.freeze([
  /* ── file-source：真源已文件化 ─────────────────────────────────────────── */
  {
    key: 'writing_books',
    domain: 'books',
    category: 'file-source',
    restore: 'book-folder',
    reason: '书+章节正文/大纲/构思经 /api/localmirror/sync 落盘；GET /api/localmirror/book 读回'
  },
  {
    key: 'worldbook_create_draft_v1',
    domain: 'worldbook',
    category: 'browser-only',
    reason: '世界书创建工作区草稿——作者 WIP 未文件化，湮灭不沾（先于 worldbook_* 前缀命中）'
  },
  {
    key: 'worldbook_research_settings_v1',
    domain: 'worldbook',
    category: 'cache-droppable',
    reason: '资料提炼参数偏好，缺省重置无内容损失（先于 worldbook_* 前缀命中）'
  },
  {
    key: 'worldbook_*',
    domain: 'worldbook',
    category: 'file-source',
    restore: 'worldbook-folder',
    prefix: true,
    reason: 'A3 文件双写：世界书/<cat>/*.md + index.json/graph.json；GET /api/localmirror/worldbook 读回，worldStore 文件优先'
  },
  {
    key: 'active_worldbook_id',
    domain: 'worldbook',
    category: 'browser-only',
    reason: '当前世界书选择属于设备，可能与当前项目的绑定不同'
  },
  {
    key: IDB_SOURCE_ARCHIVE_PLAN_KEY,
    domain: 'source-archive',
    category: 'browser-only',
    indexedDb: true,
    reason: '资料库跨作品共享并包含创作工作区；项目文件可补回已归档的资料原文'
  },

  /* ── IndexedDB 未文件化域 ──────────────────────────────────────────────── */
  {
    key: IDB_MEMORY_HISTORY_PLAN_KEY,
    domain: 'revision-history',
    category: 'browser-only',
    indexedDb: true,
    reason: '记忆事实/修订史 Dexie（pinax-memory-history）尚未文件化——湮灭不沾，保留浏览器'
  },

  /* ── cache-droppable：可丢缓存 ─────────────────────────────────────────── */
  {
    key: 'workspace_tabs_v1',
    domain: 'workspace-ui',
    category: 'cache-droppable',
    reason: '工作区标签是会话级 UI 状态，重开即重建'
  },
  {
    key: 'authoring_first_run_v1',
    domain: 'workspace-ui',
    category: 'cache-droppable',
    reason: '首访指引步进状态，重建'
  },
  {
    key: 'legacy_image_library',
    domain: 'media-legacy',
    category: 'browser-only',
    reason: '旧图库可能仍含未完成迁移的图片'
  },
  {
    key: 'pinax_knowledge_read_model_enabled',
    domain: 'flags',
    category: 'cache-droppable',
    reason: '知识读模型功能开关，缺省重置'
  },
  {
    key: 'text_model_selected',
    domain: 'secret-config',
    category: 'cache-droppable',
    reason: '选中的文本模型引用（不含 key），重选即可'
  },
  {
    key: 'video_model_selected',
    domain: 'secret-config',
    category: 'cache-droppable',
    reason: '选中的视频模型引用（不含 key），重选即可'
  },

  /* ── browser-only：设备本地偏好 / 未文件化作者数据 ─────────────────────── */
  /* 20261008 清理：sab_enabled（助手 beta 挂载开关）随 StoryAgentBetaPanel 死面板删除一并退役。 */

  {
    key: 'sab_*',
    domain: 'assistant',
    category: 'browser-only',
    prefix: true,
    reason: '助手/体验会话 UI 偏好（模式/token 上限等）——设备本地偏好，非数据'
  },
  {
    key: 'dialogue_characters',
    domain: 'experience',
    category: 'browser-only',
    reason: '体验对白角色数据尚未文件化——湮灭不沾，保留浏览器'
  },
  {
    key: 'worldbook:brief:*',
    domain: 'worldbook',
    category: 'browser-only',
    prefix: true,
    reason: '结构化设定分区提示——作者手写内容，未文件化，保留浏览器'
  },
  {
    key: 'worldbook:setting-drafts:*',
    domain: 'worldbook',
    category: 'browser-only',
    prefix: true,
    reason: '结构化设定草稿——作者 WIP，未文件化，保留浏览器'
  },

  /* ── browser-only：安全敏感项（永不写服务器文件、永不进冒烟产物、湮灭永不沾）── */
  {
    key: 'text_model_configs',
    domain: 'secret-config',
    category: 'browser-only',
    sensitive: true,
    reason: '文本模型 provider 配置含 API key——安全敏感，必须留浏览器'
  },
  {
    key: 'image_model_configs',
    domain: 'secret-config',
    category: 'browser-only',
    sensitive: true,
    reason: '生图模型 provider 配置含 API key——安全敏感，必须留浏览器'
  },
  {
    key: 'video_model_configs',
    domain: 'secret-config',
    category: 'browser-only',
    sensitive: true,
    reason: '视频模型 provider 配置含 API key——安全敏感，必须留浏览器'
  },
  {
    key: 'apiSettings',
    domain: 'secret-config',
    category: 'browser-only',
    sensitive: true,
    reason: 'AI 渠道配置含密钥——安全敏感，必须留浏览器'
  },
  {
    key: 'mem0_settings',
    domain: 'secret-config',
    category: 'browser-only',
    sensitive: true,
    reason: '记忆服务配置含密钥——安全敏感，必须留浏览器'
  }
])

/** 键 → 裁定条目（exact 优先，prefix 按声明顺序）；未裁定返回 null（一律保留）。 */
export function matchLocalizationKey(key) {
  const text = String(key ?? '')
  const exact = LOCALIZATION_KEY_PLAN.find((entry) => !entry.prefix && entry.key === text)
  if (exact) return exact
  return LOCALIZATION_KEY_PLAN.find((entry) => entry.prefix && text.startsWith(entry.key.slice(0, -1))) || null
}

/** 裁定表总览（UI 展示 + 冒烟完整性断言共用）。 */
export function summarizeKeyPlan() {
  const categories = LOCALIZATION_CATEGORIES.map((category) => {
    const entries = LOCALIZATION_KEY_PLAN.filter((entry) => entry.category === category)
    return {
      category,
      count: entries.length,
      sensitiveCount: entries.filter((entry) => entry.sensitive === true).length,
      entries: entries.map(({ key, domain, reason, sensitive, indexedDb }) => ({ key, domain, reason, sensitive: sensitive === true, indexedDb: indexedDb === true }))
    }
  })
  return { categories, total: LOCALIZATION_KEY_PLAN.length }
}

/* ---------- 浏览器状态快照 ---------- */

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

function byteLengthOf(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length
  return text.length * 2
}

/** 从原始 JSON 抽最近更新时间（对象 updatedAt/createdAt；数组取各项最大值）；不可得返回 null。 */
export function extractUpdatedAt(rawText) {
  return updatedAtOf(parseJson(rawText))
}

function updatedAtOf(value) {
  const revision = row => String(row?.updatedAt || row?.createdAt || '')
  return Array.isArray(value) ? value.reduce((latest, row) => {
    const timestamp = revision(row)
    return timestamp > latest ? timestamp : latest
  }, '') || null : revision(value) || null
}

const snapshotReviews = new WeakMap()
const planReviews = new WeakMap()

function localizationError(message) {
  return Object.assign(new Error(message), { localizationMessage: message })
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

export function collectBrowserState({ storage = defaultStorage(), idbUsage = null } = {}) {
  const keys = []
  const reviewed = new Map()
  if (storage) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key === null || key === undefined || isWritingChangesKey(key)) continue
      const raw = storage.getItem(key)
      const plan = matchLocalizationKey(key)
      let version = raw
      let logical = raw
      if (key === 'writing_books') {
        version = captureStorageValue(storage, key)
        logical = readStoredText(storage, key)
        if (!storageValueMatches(storage, key, version)) throw localizationError('书架正在变化，请重新扫描。')
      }
      const data = plan?.category === 'file-source' ? parseJson(logical) : null
      if (raw !== null && ['file-source', 'cache-droppable'].includes(plan?.category)) reviewed.set(key, { version, data })
      keys.push({
        key,
        exists: raw !== null,
        bytes: raw === null ? 0 : byteLengthOf(raw) + (version?.changes ? byteLengthOf(version.changes) : 0),
        updatedAt: updatedAtOf(data),
        planKey: plan?.key ?? null,
        domain: plan?.domain ?? 'unknown',
        category: plan?.category ?? 'unknown',
        sensitive: plan?.sensitive === true,
        indexedDb: false
      })
    }
  }
  if (idbUsage && typeof idbUsage === 'object') {
    for (const [planKey, usage] of Object.entries(idbUsage)) {
      const plan = LOCALIZATION_KEY_PLAN.find((entry) => entry.key === planKey)
      if (!plan) continue
      keys.push({
        key: planKey,
        exists: usage?.exists === true,
        bytes: Number(usage?.bytes) || 0,
        updatedAt: null,
        planKey,
        domain: plan.domain,
        category: plan.category,
        sensitive: plan.sensitive === true,
        indexedDb: true
      })
    }
  }
  const totalBytes = keys.reduce((sum, item) => sum + item.bytes, 0)
  const snapshot = {
    at: new Date().toISOString(),
    keys,
    totals: { keys: keys.length, bytes: totalBytes, unknownKeys: keys.filter((item) => item.category === 'unknown').length }
  }
  snapshotReviews.set(snapshot, reviewed)
  return snapshot
}

/* ---------- 恢复计划（A3 口径：文件优先 + revision 仲裁） ---------- */

function isUsableFileBook(book) {
  return !!book && typeof book === 'object' && String(book.id || '').trim() !== '' && Array.isArray(book.chapters)
}

function isUsableFileWorldbook(worldbook) {
  return !!worldbook && typeof worldbook === 'object' && Array.isArray(worldbook.entries) && worldbook.entries.length > 0
}

// File readers add derived paths and defaults. Every browser field must still
// survive a cold restore, including unknown legacy fields and ordered arrays.
function coversStoredValue(disk, stored) {
  if (disk === stored) return true
  if (!disk || !stored || typeof disk !== 'object' || typeof stored !== 'object') return false
  if (Array.isArray(stored) !== Array.isArray(disk)) return false
  if (Array.isArray(stored) && disk.length !== stored.length) return false
  return Object.keys(stored).every(key => Object.hasOwn(disk, key) && coversStoredValue(disk[key], stored[key]))
}

export function fileBookToWritingBook(fileBook, existing) {
  const nowIso = new Date().toISOString()
  const { outline, chapters, explorations, ...metadata } = fileBook
  return {
    ...existing,
    ...metadata,
    id: String(fileBook.id),
    title: String(fileBook.title || existing?.title || fileBook.id),
    updatedAt: fileBook.updatedAt || nowIso,
    outlineNodes: outline?.nodes || [],
    outlineEdges: outline?.edges || [],
    explorationDocuments: explorations || [],
    chapters: chapters || []
  }
}

function matchesReviewedBook(plan, book) {
  const review = planReviews.get(plan)
  if (!review || !review.readableShelf) return false
  const expected = review.book
  return coversStoredValue(expected, book) && coversStoredValue(book, expected)
}

export function readReviewedShelfForRestore(plan, storage = defaultStorage()) {
  const raw = readStoredText(storage, 'writing_books')
  const shelf = raw === null ? [] : parseJson(raw)
  const review = planReviews.get(plan)
  if (!Array.isArray(shelf) || !review) throw localizationError('本机书架未能完整读取，请重新扫描。')
  const matches = shelf.filter(row => row && String(row.id) === review.bookId)
  if (matches.length > 1 || !matchesReviewedBook(plan, matches[0] || null)) throw localizationError('本机作品在预览后已修改，请重新扫描。')
  return shelf
}

export function buildRestorePlan(snapshot, serverState = {}) {
  const state = snapshot && typeof snapshot === 'object' ? snapshot : { keys: [] }
  const browserKeys = Array.isArray(state.keys) ? state.keys : []
  const existing = browserKeys.filter((item) => item.exists)
  const keysOf = (predicate) => existing.filter(predicate).map((item) => item.key)

  const actions = []

  /* 书域（writing_books ↔ 正文/大纲/构思 + .pinax 元数据） */
  const reviewed = snapshotReviews.get(state) || new Map()
  const owner = String(serverState.bookId || '')
  const diskBook = serverState.books
  const fileBook = diskBook?.available && isUsableFileBook(diskBook.book) && (!owner || String(diskBook.book.id) === owner)
    && !diskBook.incompleteOutline && !diskBook.warnings?.length ? diskBook.book : null
  const shelf = reviewed.get('writing_books')?.data
  const bookId = owner || String(fileBook?.id || '')
  const book = Array.isArray(shelf) ? shelf.find(item => String(item?.id) === bookId) || null : null
  const browserBookRevision = book?.updatedAt
  const browserBookKeys = keysOf(item => item.key === 'writing_books')
  if (fileBook) {
    const conflict = !!book
    const browserNewer = conflict && browserBookRevision && String(fileBook.updatedAt || '') && browserBookRevision > String(fileBook.updatedAt)
    if (browserNewer) {
      actions.push({ domain: 'books', type: 'keep-browser', keys: [], pushPending: true, conflict: true, arbitration: 'revision-browser-newer', note: '本机书稿更新于 {browser}，文件更新于 {file}。补推前保留本机书稿。', noteArgs: { browser: browserBookRevision, file: fileBook.updatedAt } })
    } else {
      const recoverable = serverState.canLock !== false && book && shelf.length === 1 && (!book.updatedAt || fileBook.updatedAt)
        && coversStoredValue(fileBookToWritingBook(fileBook, null), book)
      actions.push({ domain: 'books', type: 'restore-from-files', keys: recoverable ? ['writing_books'] : [], pushPending: false, conflict, arbitration: conflict ? 'file-first' : null, note: recoverable ? '本机只有当前作品，书稿与文件已核对，可清理本机副本。' : '可从项目文件恢复当前作品；清理时保留含其他作品或独有数据的书架。' })
    }
  } else if (book || (!owner && browserBookKeys.length)) {
    actions.push({ domain: 'books', type: 'keep-browser', keys: [], pushPending: !diskBook?.available && !diskBook?.readError, conflict: false, arbitration: null, note: '当前目录没有可完整读回的同一作品，书架保留在本机。' })
  } else {
    actions.push({ domain: 'books', type: 'empty', keys: [], pushPending: false, conflict: false, arbitration: null, note: '两侧都没有书数据' })
  }

  /* 世界书域（worldbook_* ↔ 世界书/；恢复本身由 worldStore A3 文件优先自动接管） */
  const diskWorld = serverState.worldbook
  const worldbookId = String(fileBook?.worldbookId || book?.worldbookId || '')
  const worldbookMismatch = diskWorld?.mismatch === true || (diskWorld?.available &&
    (!fileBook || !worldbookId || String(diskWorld.worldbook?.id) !== worldbookId ||
      (book?.worldbookId && String(book.worldbookId) !== worldbookId)))
  const fileWorldbook = diskWorld?.available && !worldbookMismatch && !diskWorld.warnings?.length
    && isUsableFileWorldbook(diskWorld.worldbook) ? diskWorld.worldbook : null
  const worldKey = 'worldbook_' + worldbookId
  const localWorld = reviewed.get(worldKey)?.data
  const browserWorldbookKeys = keysOf(item => item.key === worldKey && item.category === 'file-source')
  if (worldbookMismatch) {
    actions.push({ domain: 'worldbook', type: 'keep-browser', keys: [], pushPending: false, conflict: false, arbitration: null, note: '项目世界书归属另一 worldbook id（A3 失配守卫）——拒绝读入，保留浏览器' })
  } else if (fileWorldbook) {
    const conflict = browserWorldbookKeys.length > 0
    const anotherOwner = Array.isArray(shelf) && shelf.some(row => row && String(row.id) !== bookId && String(row.worldbookId) === worldbookId)
    const recoverable = serverState.canLock !== false && book && !anotherOwner && localWorld && String(localWorld.id) === worldbookId
      && !Object.hasOwn(localWorld, 'updatedAt') && !localWorld.pendingFileSync
      && coversStoredValue(buildWorldbookRawFromFiles(fileWorldbook, { worldbookId }), localWorld)
    actions.push({ domain: 'worldbook', type: 'restore-from-files', keys: recoverable ? browserWorldbookKeys : [], pushPending: false, conflict, arbitration: conflict ? 'file-first' : null, note: '当前项目文件有 {count} 个条目。其他世界书、草稿和仅本机的字段保留。', noteArgs: { count: fileWorldbook.entries.length } })
  } else if (browserWorldbookKeys.length) {
    actions.push({ domain: 'worldbook', type: 'keep-browser', keys: [], pushPending: !diskWorld?.readError && !diskWorld?.warnings?.length && !diskWorld?.available, conflict: false, arbitration: null, note: '文件侧没有世界书条目——保留浏览器并提示补推（双写会在可用时自动推）' })
  } else {
    actions.push({ domain: 'worldbook', type: 'empty', keys: [], pushPending: false, conflict: false, arbitration: null, note: '两侧都没有世界书数据' })
  }

  /* 资料归档域（IndexedDB pinax-source-archive ↔ 资料/归档/*.json） */
  const fileSources = Array.isArray(serverState?.sourceArchive?.sources) ? serverState.sourceArchive.sources : []
  const fileArchiveAvailable = !!fileBook && serverState?.sourceArchive?.available === true && fileSources.length > 0
  const archiveBrowser = existing.find((item) => item.key === IDB_SOURCE_ARCHIVE_PLAN_KEY)
  if (fileArchiveAvailable) {
    actions.push({ domain: 'source-archive', type: 'restore-from-files', keys: [], pushPending: false, conflict: archiveBrowser?.exists === true, arbitration: archiveBrowser?.exists ? 'file-first' : null, note: '项目文件有 {count} 份归档可恢复。本机共享资料和创作工作区保留。', noteArgs: { count: fileSources.length } })
  } else if (archiveBrowser?.exists) {
    actions.push({ domain: 'source-archive', type: 'keep-browser', keys: [], pushPending: false, conflict: false, arbitration: null, note: '当前项目没有可恢复的归档。本机共享资料和创作工作区保留。' })
  } else {
    actions.push({ domain: 'source-archive', type: 'empty', keys: [], pushPending: false, conflict: false, arbitration: null, note: '两侧都没有资料归档' })
  }

  /* 可丢缓存与浏览器保留域（无需 server 状态） */
  const cacheKeys = keysOf((item) => item.category === 'cache-droppable')
  actions.push({ domain: 'cache', type: 'clear-cache', keys: cacheKeys, pushPending: false, conflict: false, arbitration: null, note: '可丢缓存：湮灭清除，不恢复（重建或缺省）' })
  const browserOnlyKeys = keysOf((item) => item.category === 'browser-only')
  actions.push({ domain: 'browser-only', type: 'keep-browser', keys: [], pushPending: false, conflict: false, arbitration: null, browserOnlyKeys, note: `浏览器保留（含安全敏感项 ${browserOnlyKeys.length} 键中属敏感的裁定项）——湮灭永不沾` })
  const unknownKeys = keysOf((item) => item.category === 'unknown')
  if (unknownKeys.length) {
    actions.push({ domain: 'unknown', type: 'keep-browser', keys: [], pushPending: false, conflict: false, arbitration: null, browserOnlyKeys: unknownKeys, note: '裁定表未覆盖的键——保守保留，湮灭不沾' })
  }

  const clearKeys = actions.filter((item) => item.type === 'restore-from-files' || item.type === 'clear-cache').flatMap((item) => item.keys)
  const plan = {
    at: new Date().toISOString(),
    actions,
    summary: {
      restoreDomains: actions.filter((item) => item.type === 'restore-from-files').map((item) => item.domain),
      keepDomains: actions.filter((item) => item.type === 'keep-browser').map((item) => item.domain),
      pushPendingDomains: actions.filter((item) => item.pushPending).map((item) => item.domain),
      clearKeyCount: clearKeys.length,
      fileFirstConflicts: actions.filter((item) => item.arbitration === 'file-first').length
    },
    clearKeys
  }
  const versions = new Map(clearKeys.filter(key => reviewed.has(key)).map(key => [key, reviewed.get(key).version]))
  planReviews.set(plan, { versions, bookId, owner: JSON.stringify([bookId, serverState.projectRoot || '']), book,
    readableShelf: !browserBookKeys.length || Array.isArray(shelf) })
  return plan
}

/* ---------- 湮灭执行（只清计划批准的键；安全敏感项永不沾） ---------- */

// Check the original preview, freshly read project files, and the exact
// local version again at the write boundary. A single project never owns
// the entire shared IndexedDB archive.
export function annihilateBrowserCache(plan, { storage = defaultStorage(), currentPlan = null } = {}) {
  const cleared = []
  const kept = []
  const refused = []
  const reviewed = planReviews.get(plan)
  const fresh = planReviews.get(currentPlan)
  for (const key of new Set(plan?.clearKeys || [])) {
    const entry = matchLocalizationKey(key)
    if (!reviewed?.versions.has(key) || !entry || entry.indexedDb || entry.category === 'browser-only') {
      refused.push({ key, reason: 'unreviewed' })
      continue
    }
    try {
      if (storage.getItem(key) === null) {
        kept.push(key)
        continue
      }
      if ((entry.category === 'file-source' && (!fresh?.versions.has(key) || fresh.owner !== reviewed.owner))
        || !storageValueMatches(storage, key, reviewed.versions.get(key))) {
        refused.push({ key, reason: 'changed-or-unrecoverable' })
        continue
      }
      removeStoredValue(storage, key)
      if (storage.getItem(key) !== null) throw new Error('remove-failed')
      cleared.push(key)
    } catch (error) {
      refused.push({ key, reason: String(error?.message || error) })
    }
  }
  return { cleared, kept, refused }
}

/** Only sessions with an unambiguous project/unique worldbook owner may enter its folder. */
export function buildSessionsPushPayload(sessions, book, books, { max = 100 } = {}) {
  if (!Array.isArray(sessions) || !book?.id) return []
  const ownsWorldbook = book.worldbookId && books.filter(row => row?.worldbookId === book.worldbookId).length === 1
  const owned = sessions.filter(session => {
    const owner = session?.bookId || session?.projectId
    return owner ? String(owner) === String(book.id) : ownsWorldbook && session?.worldbookId === book.worldbookId
  })
  return owned.slice(-max)
}
