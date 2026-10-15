// 浏览器状态本地化纯逻辑（W6·C 全量本地化）——键裁定表 / 浏览器状态快照 / 恢复计划 / 湮灭执行。
//
// 目标（作者原话）：「彻底湮灭所有浏览器缓存内容，把全部信息本地化」——跨浏览器打开零差异：
// 浏览器侧只剩可丢缓存，刷新/换浏览器/清空 localStorage 后全部状态从 server 项目文件恢复。
//
// 边界：
// - 零 vue/pinia 依赖；storage 与 IndexedDB 用量均可注入，node 冒烟直测；
// - 恢复计划的文件侧语义复用 A3 口径（worldbookFileRepository.resolveWorldbookLoadSource）：
//   文件有 → 拉文件；文件无浏览器有 → 保留并提示补推；冲突 → 文件优先，仅当浏览器 revision
//   严格更新（有未同步修订）时让位给浏览器并提示补推；
// - 安全敏感项（模型 key / provider 配置）必须留浏览器：永不写入服务器文件、永不进冒烟产物、
//   湮灭永不沾——annihilateBrowserCache 内置第二道守卫，计划数据损坏时也拒绝清除。
// - 本表未裁定的键（unknown）一律保留：湮灭只清计划批准的键。

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
    category: 'file-source',
    restore: 'derive:writing_books',
    reason: '当前世界书指针——从 writing_books.worldbookId 绑定派生恢复，不单独落文件'
  },
  {
    key: IDB_SOURCE_ARCHIVE_PLAN_KEY,
    domain: 'source-archive',
    category: 'file-source',
    restore: 'archive-folder',
    indexedDb: true,
    reason: '世界书资料全文/chunk 本波文件化：资料/归档/<docId>.json（含 chunk）；GET /api/localmirror/sources 读回'
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
    category: 'cache-droppable',
    reason: '旧图库迁移源——媒体资产链已迁移，残余为迁移输入缓存'
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
  try {
    const parsed = JSON.parse(rawText)
    const pick = (value) => {
      if (!value || typeof value !== 'object') return ''
      return String(value.updatedAt || value.createdAt || '')
    }
    if (Array.isArray(parsed)) {
      return parsed.map(pick).filter(Boolean).sort().at(-1) || null
    }
    return pick(parsed) || null
  } catch {
    return null
  }
}

/**
 * 各域现状快照：localStorage 逐键（存在性+大小+updatedAt+裁定归属）+ 可选 IndexedDB 用量。
 * idbUsage 形如 { '@idb:pinax-source-archive': { exists, bytes } }（浏览器内由组件经
 * estimateSourceArchiveUsage 等注入；node 冒烟直接给假数据）。
 */
export function collectBrowserState({ storage = defaultStorage(), idbUsage = null } = {}) {
  const keys = []
  if (storage) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key === null || key === undefined) continue
      const raw = storage.getItem(key)
      const plan = matchLocalizationKey(key)
      keys.push({
        key,
        exists: raw !== null,
        bytes: raw === null ? 0 : byteLengthOf(String(raw)),
        updatedAt: raw === null ? null : extractUpdatedAt(raw),
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
  return {
    at: new Date().toISOString(),
    keys,
    totals: { keys: keys.length, bytes: totalBytes, unknownKeys: keys.filter((item) => item.category === 'unknown').length }
  }
}

/* ---------- 恢复计划（A3 口径：文件优先 + revision 仲裁） ---------- */

function isUsableFileBook(book) {
  return !!book && typeof book === 'object' && String(book.id || '').trim() !== '' && Array.isArray(book.chapters)
}

function isUsableFileWorldbook(worldbook) {
  return !!worldbook && typeof worldbook === 'object' && Array.isArray(worldbook.entries) && worldbook.entries.length > 0
}

/**
 * serverState（组件经既有 API 组装）：
 * {
 *   books:         { available, book }         — GET /api/localmirror/book（注册表绑定项目根）
 *   worldbook:     { available, worldbook, mismatch? } — GET /api/localmirror/worldbook
 *   sourceArchive: { available, sources }      — GET /api/localmirror/sources
 * }
 *
 * 语义（冻结）：
 * - 文件有 → restore-from-files（拉文件；冲突时文件优先）；
 * - 文件无浏览器有 → keep-browser + pushPending（提示补推到文件）；
 * - 冲突（两边都有）→ 文件优先（arbitration:'file-first'），仅当浏览器 revision 严格更新
 *   （有尚未同步的修订）时让位浏览器：keep-browser + pushPending（arbitration:'revision-browser-newer'）。
 * 湮灭批准集 = restore-from-files / clear-cache 项携带的具体键；keep-browser 项永远不携带键。
 */
export function buildRestorePlan(snapshot, serverState = {}) {
  const state = snapshot && typeof snapshot === 'object' ? snapshot : { keys: [] }
  const browserKeys = Array.isArray(state.keys) ? state.keys : []
  const existing = browserKeys.filter((item) => item.exists)
  const keysOf = (predicate) => existing.filter(predicate).map((item) => item.key)

  const actions = []

  /* 书域（writing_books ↔ 正文/大纲/构思 + .pinax 元数据） */
  const fileBook = isUsableFileBook(serverState?.books?.book) ? serverState.books.book : null
  const browserBookKeys = keysOf((item) => item.domain === 'books')
  // revision 仲裁：快照里已抽好的 writing_books updatedAt（数组取各项最大值），不回读 storage。
  const browserBookRevision = existing.find((item) => item.key === 'writing_books')?.updatedAt || ''
  if (fileBook) {
    const conflict = browserBookKeys.length > 0
    const browserNewer = conflict && browserBookRevision && String(fileBook.updatedAt || '') && browserBookRevision > String(fileBook.updatedAt)
    if (browserNewer) {
      actions.push({ domain: 'books', type: 'keep-browser', keys: [], pushPending: true, conflict: true, arbitration: 'revision-browser-newer', note: `浏览器侧有未同步修订（${browserBookRevision} > 文件 ${fileBook.updatedAt}）——补推后文件追平，湮灭不动本书` })
    } else {
      actions.push({ domain: 'books', type: 'restore-from-files', keys: [...browserBookKeys], pushPending: false, conflict, arbitration: conflict ? 'file-first' : null, note: conflict ? '两侧都有——文件优先（A3 口径），恢复后浏览器副本被文件覆盖' : '从项目文件夹恢复书+章节' })
    }
  } else if (browserBookKeys.length) {
    actions.push({ domain: 'books', type: 'keep-browser', keys: [], pushPending: true, conflict: false, arbitration: null, note: '文件侧没有可读回的书（未绑定/目录缺失）——保留浏览器副本并提示补推' })
  } else {
    actions.push({ domain: 'books', type: 'empty', keys: [], pushPending: false, conflict: false, arbitration: null, note: '两侧都没有书数据' })
  }

  /* 世界书域（worldbook_* ↔ 世界书/；恢复本身由 worldStore A3 文件优先自动接管） */
  const worldbookMismatch = serverState?.worldbook?.mismatch === true
  const fileWorldbook = !worldbookMismatch && isUsableFileWorldbook(serverState?.worldbook?.worldbook) ? serverState.worldbook.worldbook : null
  const browserWorldbookKeys = keysOf((item) => item.domain === 'worldbook')
  if (worldbookMismatch) {
    actions.push({ domain: 'worldbook', type: 'keep-browser', keys: [], pushPending: false, conflict: false, arbitration: null, note: '项目世界书归属另一 worldbook id（A3 失配守卫）——拒绝读入，保留浏览器' })
  } else if (fileWorldbook) {
    const conflict = browserWorldbookKeys.length > 0
    actions.push({ domain: 'worldbook', type: 'restore-from-files', keys: [...browserWorldbookKeys], pushPending: false, conflict, arbitration: conflict ? 'file-first' : null, note: `文件 ${fileWorldbook.entries.length} 条——worldStore 文件优先自动接管；恢复后清掉的浏览器键可由文件还原` })
  } else if (browserWorldbookKeys.length) {
    actions.push({ domain: 'worldbook', type: 'keep-browser', keys: [], pushPending: true, conflict: false, arbitration: null, note: '文件侧没有世界书条目——保留浏览器并提示补推（双写会在可用时自动推）' })
  } else {
    actions.push({ domain: 'worldbook', type: 'empty', keys: [], pushPending: false, conflict: false, arbitration: null, note: '两侧都没有世界书数据' })
  }

  /* 资料归档域（IndexedDB pinax-source-archive ↔ 资料/归档/*.json） */
  const fileSources = Array.isArray(serverState?.sourceArchive?.sources) ? serverState.sourceArchive.sources : []
  const fileArchiveAvailable = serverState?.sourceArchive?.available === true && fileSources.length > 0
  const archiveBrowser = existing.find((item) => item.key === IDB_SOURCE_ARCHIVE_PLAN_KEY)
  if (fileArchiveAvailable) {
    actions.push({ domain: 'source-archive', type: 'restore-from-files', keys: archiveBrowser?.exists ? [IDB_SOURCE_ARCHIVE_PLAN_KEY] : [], pushPending: false, conflict: archiveBrowser?.exists === true, arbitration: archiveBrowser?.exists ? 'file-first' : null, note: `文件侧 ${fileSources.length} 份归档（含 chunk）——读回后经 restoreSourceArchiveRecords 还原 IndexedDB` })
  } else if (archiveBrowser?.exists) {
    actions.push({ domain: 'source-archive', type: 'keep-browser', keys: [], pushPending: true, conflict: false, arbitration: null, note: '文件侧没有归档——保留 IndexedDB 并提示补推（资料/归档）' })
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
  return {
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
}

/* ---------- 湮灭执行（只清计划批准的键；安全敏感项永不沾） ---------- */

/**
 * 按 plan.clearKeys 清浏览器侧。第二道守卫逐键复核裁定：
 * - 类别必须是 file-source / cache-droppable（计划损坏也不清 browser-only/unknown）；
 * - sensitive 永不清；IndexedDB 伪键只经注入的 clearner 执行，无 clearner 记 skipped。
 * 返回 { cleared, kept, refused, idbCleared, idbSkipped }。
 */
export function annihilateBrowserCache(plan, { storage = defaultStorage(), clearners = null } = {}) {
  const cleared = []
  const kept = []
  const refused = []
  const idbCleared = []
  const idbSkipped = []
  const requested = Array.isArray(plan?.clearKeys) ? plan.clearKeys.map(String) : []
  for (const key of requested) {
    const planEntry = matchLocalizationKey(key)
    if (!planEntry) {
      refused.push({ key, reason: 'unknown-key' })
      continue
    }
    if (planEntry.sensitive === true || planEntry.category === 'browser-only') {
      refused.push({ key, reason: 'browser-only-or-sensitive' })
      continue
    }
    if (planEntry.category !== 'file-source' && planEntry.category !== 'cache-droppable') {
      refused.push({ key, reason: 'not-approved-category' })
      continue
    }
    if (planEntry.indexedDb === true) {
      const clearer = clearners && typeof clearners === 'object' ? clearners[key] : null
      if (typeof clearer !== 'function') {
        idbSkipped.push({ key, reason: 'no-clearner' })
        continue
      }
      try {
        awaitResolve(clearer)
        idbCleared.push(key)
      } catch (error) {
        idbSkipped.push({ key, reason: String(error?.message || error || 'clearner-failed') })
      }
      continue
    }
    if (!storage) {
      refused.push({ key, reason: 'no-storage' })
      continue
    }
    try {
      if (storage.getItem(key) === null) {
        kept.push(key)
        continue
      }
      storage.removeItem(key)
      cleared.push(key)
    } catch (error) {
      refused.push({ key, reason: String(error?.message || error || 'remove-failed') })
    }
  }
  return { cleared, kept, refused, idbCleared, idbSkipped }
}

/** 同步上下文里触发异步 clearer（fire-and-forget；结果经 returned promise 校验）。 */
function awaitResolve(clearer) {
  const result = clearer()
  if (result && typeof result.then === 'function') {
    // 湮灭是显式用户动作后的同步批处理；异步 clearer 的失败在其内部收敛（IndexedDB 事务自幂等）。
    result.catch(() => {})
  }
}

/* ---------- 补推载荷组装（纯函数；推送由组件经 /api/localmirror/sync 执行） ---------- */

/**
 * IndexedDB 归档记录 { artifacts, chunks } → sync 载荷的 sourceArchive 片段
 * { docId → { meta, chunks[] } }；chunk 按 sourceId 归到所属 artifact。
 */
export function buildArchivePushPayload(archiveRecords) {
  const artifacts = Array.isArray(archiveRecords?.artifacts) ? archiveRecords.artifacts : []
  const chunks = Array.isArray(archiveRecords?.chunks) ? archiveRecords.chunks : []
  const chunksBySource = new Map()
  for (const chunk of chunks) {
    const sourceId = String(chunk?.sourceId || '')
    if (!sourceId) continue
    if (!chunksBySource.has(sourceId)) chunksBySource.set(sourceId, [])
    chunksBySource.get(sourceId).push(chunk)
  }
  const payload = {}
  for (const artifact of artifacts) {
    const docId = String(artifact?.id || '').trim()
    if (!docId) continue
    const chunkIds = new Set((Array.isArray(artifact?.chunkIds) ? artifact.chunkIds : []).map(String))
    const own = (chunksBySource.get(docId) || []).filter((chunk) => !chunkIds.size || chunkIds.has(String(chunk?.id)))
    payload[docId] = { meta: artifact, chunks: own }
  }
  return payload
}

/** 会话数组 → sync 载荷的 sessions 片段（深拷贝防引用泄漏；上限随 server LIMITS）。 */
export function buildSessionsPushPayload(sessions, { max = 100 } = {}) {
  const list = Array.isArray(sessions) ? sessions.filter((session) => session && typeof session === 'object') : []
  return JSON.parse(JSON.stringify(list.slice(-max)))
}
