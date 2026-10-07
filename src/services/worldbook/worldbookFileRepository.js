// 世界书文件真源 repository（W2·A3）——冻结契约 docs/plan/worldbook-unification-abc-20261008.md §3.3。
//
// 职责：worldStore 持久化接缝与「项目世界书文件夹」之间的唯一文件通道。
// - 文件读侧复用 A2 GET /api/localmirror/worldbook（server 已把 md 条目映射回运行时形状：
//   relations 对象桶还原 + metadata 还位 + relationsRich 富关系保留），本模块不做二次格式映射。
// - 文件写侧复用 A2 POST /api/localmirror/sync（幂等全量：先删后写、meta 最后）。
//
// 绑定真源（不自建第二绑定源）：
// - 「bookId → 项目根路径」唯一真源 = server 项目注册表（GET /api/localmirror/projects，
//   entry.bookId ↔ entry.rootPath），与 ProjectInfoPanel / LocalProjectPanel 同源；
// - 世界书 ↔ 书的关联复用 writing_books.worldbookId（writingBooksRepository）。
//
// 竞争守卫落在副作用 owner（worldbook-workflow skill §4）：createWorldbookFileSyncController
// 在真正推送前复核「仍是这本书 / revision 未变」，过期写直接拒绝；worldStore 只入队。
//
// 本模块保持 node 可加载（零 vue/pinia/IndexedDB 依赖；import 全部带显式 .js——
// writingBooksRepository 链路是无扩展名 import，node 直载不可达），供
// scripts/worldbook-dualwrite-smoke.mjs 注入 fetchImpl / projectRootResolver 直测；
// 浏览器内默认走 global fetch。writing_books 读取用同一 STORAGE_KEYS 统一入口的轻投影，
// 不新建第二数据源（绑定真源仍是 server 注册表）。
import { getItem, STORAGE_KEYS } from '../../composables/useStorage.js'

const API_BASE = '/api/localmirror'
// 超时护栏：双写绝不拖慢编辑——保存推送是 fire-and-forget，加载侧最多等一次探活。
const FETCH_TIMEOUT_MS = 3000
// 探活 / 注册表结果缓存几秒：编辑热路径上的 isFileSourceAvailable() 是同步读缓存。
const AVAILABILITY_TTL_MS = 5000
const REGISTRY_TTL_MS = 5000

/* ---------- 可注入边界（测试用） ---------- */

let fetchImpl = (...args) => globalThis.fetch(...args)

/** 注入 fetch 实现（冒烟/测试）；传 null 恢复默认 global fetch。 */
export function setFetchImpl(impl) {
  fetchImpl = typeof impl === 'function' ? impl : (...args) => globalThis.fetch(...args)
}

let projectRootResolver = null

/**
 * 注入「worldbookId → 项目根路径」解析器（冒烟/测试）；
 * 传 null 恢复默认真源链（writing_books.worldbookId → 注册表 bookId → rootPath）。
 */
export function setProjectRootResolver(impl) {
  projectRootResolver = typeof impl === 'function' ? impl : null
}

/** 清空探活/注册表/根路径缓存（测试隔离用）。 */
export function resetFileRepositoryCaches() {
  availabilityState.probed = false
  availabilityState.available = false
  availabilityState.checkedAt = 0
  availabilityState.inflight = null
  registryState.at = 0
  registryState.projects = null
  registryState.inflight = null
  projectRootCache.clear()
}

/* ---------- 内部工具 ---------- */

function ensureString(value) {
  return String(value ?? '')
}

function ensureStringArray(value) {
  return Array.isArray(value) ? value.map((item) => ensureString(item)) : []
}

/**
 * writing_books 轻投影（与 writingBooksRepository 同一 STORAGE_KEY 同一形状；
 * 仅取双写需要的字段，供 node 冒烟环境直载）。读取失败一律返回 []。
 */
function readWritingBooksLite() {
  try {
    const raw = getItem(STORAGE_KEYS.WRITING_BOOKS)
    if (!Array.isArray(raw)) return []
    return raw
      .filter((book) => book && typeof book === 'object' && ensureString(book?.id).trim())
      .map((book) => ({
        id: ensureString(book.id).trim(),
        title: ensureString(book.title ?? book.name).trim(),
        worldbookId: ensureString(book.worldbookId).trim(),
        chapters: Array.isArray(book.chapters) ? book.chapters : [],
        outlineNodes: Array.isArray(book.outlineNodes) ? book.outlineNodes : [],
        outlineEdges: Array.isArray(book.outlineEdges) ? book.outlineEdges : [],
        explorationDocuments: Array.isArray(book.explorationDocuments) ? book.explorationDocuments : []
      }))
  } catch {
    return []
  }
}

/** fetch + JSON + 超时护栏。任何失败返回 null（调用方一律按「不可达」处理，不抛错）。 */
async function fetchJsonWithTimeout(url, { method = 'GET', body = undefined } = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const impl = fetchImpl
  if (typeof impl !== 'function') return null
  let controller = null
  let timer = null
  try {
    if (typeof AbortController === 'function') {
      controller = new AbortController()
      timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || FETCH_TIMEOUT_MS))
    }
    const response = await impl(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined
    })
    const payload = await response.json().catch(() => null)
    return { ok: response?.ok === true, status: Number(response?.status) || 0, body: payload }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/* ---------- 探活（§3.3 isFileSourceAvailable） ---------- */

const availabilityState = { probed: false, available: false, checkedAt: 0, inflight: null }

/**
 * 异步探活：server 可达 && 注册表中存在至少一条 bookId 绑定（=「项目绑定存在」）。
 * 失败/超时 → false（负结果同样缓存 TTL，server 不在时最多每 TTL 一次探测开销）。
 */
export function refreshFileSourceAvailability() {
  if (availabilityState.inflight) return availabilityState.inflight
  availabilityState.checkedAt = Date.now()
  availabilityState.inflight = (async () => {
    let available = false
    try {
      const projects = await fetchRegistryProjects()
      available = projects.some((project) => project && project.bookId && project.rootPath)
    } catch {
      available = false
    }
    availabilityState.available = available
    availabilityState.probed = true
    availabilityState.checkedAt = Date.now()
    return available
  })().finally(() => {
    availabilityState.inflight = null
  })
  return availabilityState.inflight
}

/** 冻结签名（同步）：项目绑定存在 && server 可达（读几秒内的探活缓存；过期时后台再探）。 */
export function isFileSourceAvailable() {
  if (!availabilityState.probed || Date.now() - availabilityState.checkedAt > AVAILABILITY_TTL_MS) {
    void refreshFileSourceAvailability()
  }
  return availabilityState.available
}

/* ---------- 注册表（「bookId → 项目根」唯一真源） ---------- */

const registryState = { at: 0, projects: null, inflight: null }

async function fetchRegistryProjects() {
  if (registryState.projects && Date.now() - registryState.at < REGISTRY_TTL_MS) return registryState.projects
  if (registryState.inflight) return registryState.inflight
  registryState.inflight = (async () => {
    const response = await fetchJsonWithTimeout(`${API_BASE}/projects`)
    const projects = Array.isArray(response?.body?.projects) ? response.body.projects : []
    if (response?.ok) {
      registryState.projects = projects
      registryState.at = Date.now()
    }
    return projects
  })().finally(() => {
    registryState.inflight = null
  })
  return registryState.inflight
}

function findRegistryEntryByRoot(projects, projectRoot) {
  const wanted = ensureString(projectRoot).trim()
  if (!wanted) return null
  const wantedLower = wanted.toLowerCase()
  return projects.find((project) => {
    const rootPath = ensureString(project?.rootPath).trim()
    if (!rootPath) return false
    return rootPath === wanted || rootPath.toLowerCase() === wantedLower
  }) || null
}

/**
 * worldbookId → 项目根路径（既有真源链，不新建绑定）：
 * writing_books.worldbookId → bookId 列表 → 注册表 entry.bookId → entry.rootPath。
 * 未绑定/不可达 → null（调用方回落 localStorage 域）。
 */
export async function resolveWorldbookProjectRoot(worldbookId) {
  const id = ensureString(worldbookId).trim()
  if (!id) return null
  if (projectRootResolver) return projectRootResolver(id)
  const cached = projectRootCache.get(id)
  if (cached && Date.now() - cached.at < REGISTRY_TTL_MS) return cached.root
  let bookIds = []
  try {
    bookIds = readWritingBooksLite()
      .filter((book) => book.worldbookId === id)
      .map((book) => book.id)
      .filter(Boolean)
  } catch {
    bookIds = []
  }
  if (!bookIds.length) return null
  const projects = await fetchRegistryProjects()
  const entry = projects.find((project) => project?.bookId && project.rootPath && bookIds.includes(ensureString(project.bookId))) || null
  const root = entry ? ensureString(entry.rootPath) : null
  projectRootCache.set(id, { at: Date.now(), root })
  return root
}

const projectRootCache = new Map()

/* ---------- 读：文件 → 世界书（§3.3 loadWorldbookFromFiles） ---------- */

/**
 * GET /api/localmirror/worldbook?path=<项目根>。
 * server 读侧已把 md 条目映射回运行时形状（relations 桶 / metadata 还位 / relationsRich）。
 * 返回 { ok, worldbook?, warnings?, error? }；manifest 归属另一世界书（id 不匹配）→ ok:false，
 * 防止把别的项目世界书覆盖进当前 id。
 */
export async function loadWorldbookFromFiles(projectRoot, worldbookId) {
  const root = ensureString(projectRoot).trim()
  if (!root) return { ok: false, error: { code: 'NO_PROJECT_ROOT', message: 'projectRoot 为空' } }
  const response = await fetchJsonWithTimeout(`${API_BASE}/worldbook?path=${encodeURIComponent(root)}`)
  if (!response) return { ok: false, error: { code: 'SERVER_UNREACHABLE', message: 'localmirror 服务不可达或超时' } }
  if (!response.ok || response.body?.ok !== true) {
    return {
      ok: false,
      error: {
        code: ensureString(response.body?.error) || `HTTP_${response.status || 0}`,
        message: ensureString(response.body?.message) || '世界书文件读回失败'
      }
    }
  }
  const worldbook = response.body.worldbook
  if (!worldbook || typeof worldbook !== 'object') {
    return { ok: false, error: { code: 'BAD_WORLDBOOK', message: '读回数据缺少 worldbook 对象' } }
  }
  const fileId = ensureString(worldbook.id).trim()
  const requestedId = ensureString(worldbookId).trim()
  if (fileId && requestedId && fileId !== requestedId) {
    return {
      ok: false,
      error: { code: 'WORLDBOOK_ID_MISMATCH', message: `项目世界书归属另一世界书（${fileId}），已拒绝读入` }
    }
  }
  return {
    ok: true,
    worldbook,
    warnings: ensureStringArray(response.body.warnings)
  }
}

/**
 * 文件世界书 → localStorage 域 raw（worldStore.normalizeWorldbook 的输入形状，纯函数）。
 * - 以 persistedRaw 为底座保留 localStorage 域字段（structuredSettings/geoHistory/research/
 *   sourceDocuments/…——C2 之前不文件化的运行时字段）；
 * - 文件真源字段（name/worldDescription/writingStyle/forbidden/groups/entries）覆盖；
 * - 不带 entriesMap（normalizeWorldbook 重建）；revision（updatedAt）沿用 persistedRaw，
 *   revision 只随 store 变更推进，文件加载本身不产生新 revision。
 */
export function buildWorldbookRawFromFiles(fileWorldbook, { worldbookId = '', persistedRaw = null } = {}) {
  if (!fileWorldbook || typeof fileWorldbook !== 'object') return null
  const base = persistedRaw && typeof persistedRaw === 'object' && !Array.isArray(persistedRaw) ? persistedRaw : {}
  const entries = (Array.isArray(fileWorldbook.entries) ? fileWorldbook.entries : [])
    .filter((entry) => entry && typeof entry === 'object' && ensureString(entry.id).trim())
  const raw = {
    ...base,
    id: ensureString(worldbookId).trim() || ensureString(base.id).trim() || ensureString(fileWorldbook.id).trim(),
    name: ensureString(fileWorldbook.name) || ensureString(base.name),
    worldDescription: typeof fileWorldbook.worldDescription === 'string'
      ? fileWorldbook.worldDescription
      : ensureString(base.worldDescription),
    writingStyle: typeof fileWorldbook.writingStyle === 'string'
      ? fileWorldbook.writingStyle
      : ensureString(base.writingStyle),
    forbidden: typeof fileWorldbook.forbidden === 'string' ? fileWorldbook.forbidden : ensureString(base.forbidden),
    groups: Array.isArray(fileWorldbook.groups) ? fileWorldbook.groups : (Array.isArray(base.groups) ? base.groups : []),
    entries,
    updatedAt: Number.isFinite(Number(base.updatedAt)) && base.updatedAt !== undefined && base.updatedAt !== null
      ? Number(base.updatedAt)
      : Date.now()
  }
  delete raw.entriesMap
  return raw
}

/**
 * 加载接缝决策（worldStore.loadWorldbook 与冒烟共用的可测纯逻辑）：
 * - 文件可用且有内容 → { source:'files', raw, warnings }（文件优先）；
 * - 文件不存在/为空（且 id 未失配）→ { source:'localStorage', migrate:true }（首载迁移：推一次，幂等）；
 * - id 失配 → { source:'localStorage', reason:'mismatch' }（绝不迁移覆盖别的项目）；
 * - 不可用/未绑定/不可达/任何异常 → { source:'localStorage' }（完全原路径，零行为差异）。
 */
export async function resolveWorldbookLoadSource(worldbookId, persistedRaw, deps = {}) {
  const {
    isAvailable = isFileSourceAvailable,
    refreshAvailability = refreshFileSourceAvailability,
    resolveRoot = resolveWorldbookProjectRoot,
    loadFiles = loadWorldbookFromFiles,
    buildRaw = buildWorldbookRawFromFiles
  } = deps
  const fallback = { source: 'localStorage' }
  try {
    if (!isAvailable()) {
      await refreshAvailability()
      if (!isAvailable()) return { ...fallback, reason: 'unavailable' }
    }
    const root = await resolveRoot(worldbookId)
    if (!root) return { ...fallback, reason: 'unbound' }
    const result = await loadFiles(root, worldbookId)
    if (!result || !result.ok || !result.worldbook) {
      const code = ensureString(result?.error?.code)
      if (code === 'WORLDBOOK_ID_MISMATCH') return { ...fallback, reason: 'mismatch' }
      return { ...fallback, reason: 'missing', migrate: true, error: result?.error }
    }
    const entryCount = Array.isArray(result.worldbook.entries) ? result.worldbook.entries.length : 0
    if (!entryCount) return { ...fallback, reason: 'empty', migrate: true, warnings: result.warnings }
    const raw = buildRaw(result.worldbook, { worldbookId, persistedRaw })
    if (!raw) return { ...fallback, reason: 'bad-file-payload' }
    return { source: 'files', raw, warnings: Array.isArray(result.warnings) ? result.warnings : [] }
  } catch {
    return { ...fallback, reason: 'error' }
  }
}

/* ---------- 写：世界书 → 文件（§3.3 saveWorldbookToFiles） ---------- */

/** sync 载荷的世界书字段（server mirrorBook 消费面：manifest + 契约序列化只认这些）。 */
function buildSyncWorldbookPayload(worldbook) {
  return {
    id: ensureString(worldbook.id).trim(),
    name: ensureString(worldbook.name),
    worldDescription: ensureString(worldbook.worldDescription),
    writingStyle: ensureString(worldbook.writingStyle),
    forbidden: ensureString(worldbook.forbidden),
    groups: Array.isArray(worldbook.groups) ? worldbook.groups : [],
    // 完整运行时条目（relations/injection/keys/metadata/profile…）——契约 v2 序列化在 server 侧
    entries: Array.isArray(worldbook.entries) ? worldbook.entries : []
  }
}

/**
 * POST /api/localmirror/sync（幂等全量重建）。projectRoot 经注册表换回 bookId
 * （server resolveBookDir 以 book.id 绑定定根，前端不传路径——沿用既有防注入边界）。
 * 载荷同时携带绑定书的 正文/大纲/构思（writing book 记录直读），避免部分同步清空这些托管目录；
 * 日志/资料/媒体清单不在 A3 载荷内——由 installLocalMirrorAutoSync 的下一次全量书同步恢复
 * （镜像为读拷贝语义）。返回 { ok, dir?, error? }；绝不抛错。
 */
export async function saveWorldbookToFiles(projectRoot, worldbook) {
  const root = ensureString(projectRoot).trim()
  if (!root) return { ok: false, error: { code: 'NO_PROJECT_ROOT', message: 'projectRoot 为空' } }
  if (!worldbook || typeof worldbook !== 'object' || !Array.isArray(worldbook.entries)) {
    return { ok: false, error: { code: 'BAD_WORLDBOOK', message: 'worldbook.entries 缺失' } }
  }
  let target = null
  try {
    const projects = await fetchRegistryProjects()
    target = findRegistryEntryByRoot(projects, root)
  } catch (error) {
    return { ok: false, error: { code: 'REGISTRY_UNAVAILABLE', message: ensureString(error?.message || error) } }
  }
  if (!target?.bookId) {
    return {
      ok: false,
      error: { code: 'NO_PROJECT_BINDING', message: '项目注册表中没有绑定书（bookId）的项目，世界书不落文件' }
    }
  }
  let bookRecord = null
  try {
    bookRecord = readWritingBooksLite().find((book) => book.id === ensureString(target.bookId)) || null
  } catch {
    bookRecord = null
  }
  const payload = {
    book: {
      id: ensureString(target.bookId),
      title: ensureString(bookRecord?.title || target.name || worldbook.name) || '未命名项目',
      chapters: (Array.isArray(bookRecord?.chapters) ? bookRecord.chapters : []).map((chapter) => ({
        id: ensureString(chapter?.id),
        title: ensureString(chapter?.title) || '未命名章节',
        content: typeof chapter?.content === 'string' ? chapter.content : ''
      })),
      outline: {
        nodes: Array.isArray(bookRecord?.outlineNodes) ? bookRecord.outlineNodes : [],
        edges: Array.isArray(bookRecord?.outlineEdges) ? bookRecord.outlineEdges : []
      },
      explorations: (Array.isArray(bookRecord?.explorationDocuments) ? bookRecord.explorationDocuments : []).map((doc) => ({
        id: ensureString(doc?.id),
        title: ensureString(doc?.title) || '未命名构思',
        content: typeof doc?.content === 'string' ? doc.content : ''
      }))
    },
    worldbook: buildSyncWorldbookPayload(worldbook)
  }
  const response = await fetchJsonWithTimeout(`${API_BASE}/sync`, { method: 'POST', body: payload })
  if (!response) return { ok: false, error: { code: 'SERVER_UNREACHABLE', message: 'localmirror 服务不可达或超时' } }
  if (!response.ok || response.body?.ok !== true) {
    return {
      ok: false,
      error: {
        code: ensureString(response.body?.error) || `HTTP_${response.status || 0}`,
        message: ensureString(response.body?.message) || '世界书文件同步失败'
      }
    }
  }
  return { ok: true, dir: ensureString(response.body.dir) || root }
}

/* ---------- 保存接缝控制器（竞争守卫 owner；worldStore 装配真实依赖，冒烟注入 mock） ---------- */

function revisionOf(raw) {
  return ensureString(raw?.updatedAt ?? '')
}

/**
 * 每本世界书一个串行双写队列：
 * - enqueue 前置 isAvailable() 门（不可用零开销）；
 * - coalesceMs 窗口内多次保存合并为一次推送（编辑连击不放大流量）；
 * - 执行前复核「仍是这本书（readFile 有值）/ revision 未变」——过期写直接拒绝，
 *   新变更自己的入队会接管推送；执行后若期间又变更，成功标记让位给新推送；
 * - 世界书已删除 → 跳过（文件侧不删档，kit「不删档」语义，删除联动不在 A3 范围）；
 * - 一切异常收敛到 onSyncFailed，绝不上抛打断编辑。
 */
export function createWorldbookFileSyncController({
  readFile,
  resolveRoot,
  isAvailable = () => true,
  assemble = (raw) => raw,
  push,
  onSynced = () => {},
  onSyncFailed = () => {},
  coalesceMs = 0,
  setTimeoutFn = (handler, ms) => setTimeout(handler, ms),
  clearTimeoutFn = (handle) => clearTimeout(handle)
} = {}) {
  const states = new Map()

  function safeRead(id) {
    try {
      const raw = readFile(id)
      return raw && typeof raw === 'object' ? raw : null
    } catch {
      return null
    }
  }

  async function run(id) {
    const state = states.get(id)
    if (!state) return
    if (state.running) {
      state.rerunQueued = true
      return
    }
    state.running = true
    try {
      const raw = safeRead(id)
      if (!raw) return
      // 竞争守卫（副作用 owner 复核）：入队后 revision 已变 → 本次是过期写，拒绝。
      if (revisionOf(raw) !== state.expectedRevision) return
      const root = await resolveRoot(id)
      if (!root) return
      const result = await push(root, assemble(raw))
      if (result && result.ok) {
        const current = safeRead(id)
        if (current && revisionOf(current) === state.expectedRevision) {
          onSynced(id, { dir: ensureString(result.dir), at: Date.now() })
        } else {
          // 过期完成：不盖成功标记，期间新变更的入队会立即重新推送。
          console.warn('[worldbookFileRepository] 世界书文件双写完成前已有更新，等待新推送接管', id)
        }
      } else {
        onSyncFailed(id, (result && result.error) || { code: 'SYNC_FAILED', message: '世界书文件同步失败' })
      }
    } catch (error) {
      onSyncFailed(id, { code: 'SYNC_ERROR', message: ensureString(error?.message || error) })
    } finally {
      state.running = false
      if (state.rerunQueued) {
        state.rerunQueued = false
        await run(id)
      }
    }
  }

  return {
    /** 入队一次双写。返回是否确实入队（未入队=不可用/书不存在，调用方无需处理）。 */
    enqueue(worldbookId) {
      const id = ensureString(worldbookId).trim()
      if (!id) return false
      try {
        if (!isAvailable()) return false
      } catch {
        return false
      }
      const raw = safeRead(id)
      if (!raw) return false
      const state = states.get(id) || { handle: null, expectedRevision: '', running: false, rerunQueued: false }
      state.expectedRevision = revisionOf(raw)
      if (state.handle !== null && state.handle !== undefined) clearTimeoutFn(state.handle)
      state.handle = setTimeoutFn(() => {
        state.handle = null
        void run(id)
      }, Math.max(0, Number(coalesceMs) || 0))
      states.set(id, state)
      return true
    },
    /** 测试观察用：当前等待推送的世界书数。 */
    pendingCount() {
      let count = 0
      for (const state of states.values()) {
        if (state.handle !== null && state.handle !== undefined) count += 1
      }
      return count
    }
  }
}

/* ---------- localStorage 快照（readWorldbookSnapshot 域外的一次性读取，供 C 组复用） ---------- */

/** 供测试/诊断：当前持久化的世界书 raw（不做任何写入）。 */
export function readPersistedWorldbookRaw(storageKey) {
  try {
    const raw = getItem(storageKey, null)
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
  } catch {
    return null
  }
}
