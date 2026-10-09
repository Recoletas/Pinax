// kit 知识检索代理的薄 fetch 客户端（W1-A RAG 接线）。
// 唯一职责：把 server 三个同源代理端点（/api/knowledge/*）包成带超时与结构化错误的调用；
// 打分与一跳扩展全部由 kit 内核返回、原样上抛给 UI 渲染——前端不重算任何分数。
// projectId 解析：显式传入优先；否则按 bookId 查本地项目注册表（GET /api/localmirror/projects，
// 与 ProjectInfoPanel / 文件双写同一真源，短 TTL 缓存），查不到 = 显式 NO_PROJECT_CONTEXT 错误态。
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

/** 写作方法论知识卡检索（kit kb_search）。 */
export async function searchKnowledgeCards({ q = '', dir = '', k } = {}) {
  const query = String(q || '').trim()
  if (!query) return { ok: false, error: { code: 'EMPTY_QUERY', message: '检索词为空' } }
  const body = { q: query }
  if (String(dir || '').trim()) body.dir = String(dir).trim()
  if (Number.isInteger(k) && k > 0) body.k = k
  return postJson('/kb-search', body)
}

/** 读知识卡正文（kit kb_read；ref = 卡片 id 或相对路径）。 */
export async function readKnowledgeCard({ ref = '', maxChars } = {}) {
  const cardRef = String(ref || '').trim()
  if (!cardRef) return { ok: false, error: { code: 'EMPTY_REF', message: '卡片引用为空' } }
  const body = { ref: cardRef }
  if (Number.isInteger(maxChars) && maxChars > 0) body.maxChars = maxChars
  return postJson('/kb-read', body)
}
