// kit 知识检索代理的薄 fetch 客户端（W1-A RAG 接线）。
// 唯一职责：把 server 三个同源代理端点（/api/knowledge/*）包成带超时与结构化错误的调用；
// 打分与一跳扩展全部由 kit 内核返回、原样上抛给 UI 渲染——前端不重算任何分数。
// projectId 解析：显式传入优先；否则按 bookId 查本地项目注册表（GET /api/localmirror/projects，
// 与 ProjectInfoPanel / 文件双写同一真源，短 TTL 缓存）。世界书检索查不到 = 显式
// NO_PROJECT_CONTEXT 错误态（kit 词表按项目建，没有项目就没有检索目标）；知识卡检索把它当
// 可选增强（方法论语料在 kit 仓全局根），解析不到只查全局并把 project='' 如实上抛。
const API_BASE = '/api/knowledge'
const REGISTRY_BASE = '/api/localmirror'
// 服务端转发自身有 8s 总超时；这里再加客户端护栏（含注册表解析余量）。
const PROXY_TIMEOUT_MS = 12000
const REGISTRY_TIMEOUT_MS = 5000
const REGISTRY_TTL_MS = 5000

let registryCache = { at: 0, projects: null }

/** 清空注册表缓存（测试隔离用）。 */
export function resetKnowledgeClientCaches() {
  registryCache = { at: 0, projects: null }
}

async function postJson(pathname, body) {
  let response
  try {
    response = await fetch(`${API_BASE}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS)
    })
  } catch {
    return { ok: false, error: { code: 'PROXY_UNREACHABLE', message: '知识检索代理不可达或超时（/api/knowledge）' } }
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error) {
    return {
      ok: false,
      status: response.status,
      error: {
        code: String(payload?.error?.code || `HTTP_${response.status}`),
        message: String(payload?.error?.message || '知识检索失败')
      }
    }
  }
  return { ok: true, result: payload }
}

/** bookId → projectId（注册表真源单查；失败/未绑定返回 ''，由调用方落显式错误态）。 */
async function projectIdForBook(bookId) {
  const wanted = String(bookId || '').trim()
  if (!wanted) return ''
  if (!registryCache.projects || Date.now() - registryCache.at > REGISTRY_TTL_MS) {
    try {
      const response = await fetch(`${REGISTRY_BASE}/projects`, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) })
      const body = await response.json()
      registryCache = { at: Date.now(), projects: Array.isArray(body?.projects) ? body.projects : [] }
    } catch {
      return ''
    }
  }
  const entry = registryCache.projects.find((item) => String(item?.bookId || '') === wanted)
  return String(entry?.projectId || '').trim()
}

/**
 * 世界书检索（kit worldbook_search：命中 hits + 一跳扩展 expansion，kit 形状原样返回）。
 * projectId 显式传入优先，否则按 bookId 查注册表；两者都没有 = NO_PROJECT_CONTEXT 显式错误。
 */
export async function searchWorldbookEntries({ projectId = '', bookId = '', q = '', cat = '', k } = {}) {
  const query = String(q || '').trim()
  if (!query) return { ok: false, error: { code: 'EMPTY_QUERY', message: '检索词为空' } }
  let resolved = String(projectId || '').trim()
  if (!resolved) {
    resolved = await projectIdForBook(bookId)
    if (!resolved) {
      return { ok: false, error: { code: 'NO_PROJECT_CONTEXT', message: '当前书稿没有绑定本地项目，无法定位 kit 检索目标（项目面板里给书稿绑定位置后重试）' } }
    }
  }
  const body = { projectId: resolved, q: query }
  if (String(cat || '').trim()) body.cat = String(cat).trim()
  if (Number.isInteger(k) && k > 0) body.k = k
  return postJson('/worldbook-search', body)
}

/**
 * 写作方法论知识卡检索（kit kb_search；R2.2 双根合并）。
 * projectId/bookId 可选：能解析到本地项目就带上 kit 的 project 形参，kit 把全局语料与
 * projects/<id>/kit 本书档并池检索、命中带 source=global|project；解析不到就只查全局
 * （方法论语料本来在 kit 仓，没有本书上下文不是错误）。
 * 返回值的 project 字段（'' = 本轮没带项目侧）供 UI 如实说明来源，代理层不静默这一维。
 */
export async function searchKnowledgeCards({ q = '', dir = '', k, projectId = '', bookId = '' } = {}) {
  const query = String(q || '').trim()
  if (!query) return { ok: false, error: { code: 'EMPTY_QUERY', message: '检索词为空' } }
  const project = String(projectId || '').trim() || await projectIdForBook(bookId)
  const body = { q: query }
  if (String(dir || '').trim()) body.dir = String(dir).trim()
  if (Number.isInteger(k) && k > 0) body.k = k
  if (project) body.projectId = project
  const response = await postJson('/kb-search', body)
  return response.ok ? { ...response, project } : response
}

/**
 * 读知识卡正文（kit kb_read；ref = 卡片 id 或相对路径）。
 * project 与检索时同源：项目命中的 file 是项目根相对路径，不带 project 时全局根读不到它
 * （kit 侧「全局未命中 → 回落项目根」只在传了 project 时才成立）。
 */
export async function readKnowledgeCard({ ref = '', maxChars, projectId = '' } = {}) {
  const cardRef = String(ref || '').trim()
  if (!cardRef) return { ok: false, error: { code: 'EMPTY_REF', message: '卡片引用为空' } }
  const body = { ref: cardRef }
  if (Number.isInteger(maxChars) && maxChars > 0) body.maxChars = maxChars
  const project = String(projectId || '').trim()
  if (project) body.projectId = project
  const response = await postJson('/kb-read', body)
  return response.ok ? { ...response, project } : response
}
