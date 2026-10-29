import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalMirrorService } from '../services/localMirrorService.js'
import { collectKnowledgeSources } from '../services/knowledgeProjectIndex.js'
import { assertLocalRoute, resolveProject } from './localProjects.js'
import { resolveAdvisorBaseUrl } from './agentAsk.js'

// 批次 8：知识索引（RAG）状态与只读检索。
// 这一层不自己编译、不自己检索：编译与检索都走既有 knowledgeProjectIndexer 与 /api/knowledge/* 只读动词，
// 本文件只做「算当前 revision、比对缓存里的 coverage、把缺口如实报给 Agent」。
// 项目文件夹永远只读：所有派生产物只落在 <repo>/.runtime/data/knowledge/ 下。

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const runtimeRoot = path.resolve(process.env.PINAX_KNOWLEDGE_RUNTIME || path.join(repoRoot, '.runtime/knowledge'))
const cacheRoot = path.resolve(process.env.PINAX_KNOWLEDGE_CACHE_ROOT || path.join(repoRoot, '.runtime/data/knowledge'))

const DEFAULT_TIMEOUT_MS = 60000
const MAX_TIMEOUT_MS = 180000
const SNAPSHOT_TIMEOUT_MS = 20000
const MAX_RESULTS = 30

const KNOWLEDGE_VERBS = Object.freeze({
  kb_search: '/api/knowledge/kb-search',
  worldbook_search: '/api/knowledge/worldbook-search',
  kb_read: '/api/knowledge/kb-read'
})

const service = createLocalMirrorService()

function failure(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra })
}

function runtimeVerbFile() {
  return path.join(runtimeRoot, 'core', 'dist', 'verbs.js')
}

function assertRuntimeInstalled() {
  if (!fs.existsSync(runtimeVerbFile())) {
    throw failure(
      'KNOWLEDGE_RUNTIME_MISSING',
      '本机知识内核尚未安装（缺 .runtime/knowledge/core/dist/verbs.js），无法建索引或检索；请先运行 npm run build:knowledge-runtime。在此之前任何「已索引/可检索」的说法都不成立。'
    )
  }
}

function registryEntryFor(root, manifest) {
  const key = path.resolve(root).toLowerCase()
  const listed = (() => {
    try { return service.listProjects() } catch { return [] }
  })()
  return listed.find((item) => path.resolve(item.rootPath || '').toLowerCase() === key)
    || listed.find((item) => manifest?.projectId && item.projectId === manifest.projectId)
    || null
}

/** 当前 RAG 输入集快照：文件数、字节、revision；与索引侧 collectKnowledgeSources 同源。 */
export async function snapshotKnowledge(root) {
  const signal = AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS)
  try {
    const collected = await collectKnowledgeSources(root, signal)
    const bytes = collected.files.reduce((sum, file) => sum + Buffer.byteLength(file.text, 'utf-8'), 0)
    const byDir = {}
    for (const file of collected.files) {
      const top = String(file.relative).split('/')[0]
      byDir[top] = (byDir[top] || 0) + 1
    }
    return { ok: true, revision: collected.revision, files: collected.files.length, bytes, byDir }
  } catch (error) {
    if (signal.aborted) return { ok: false, code: 'KNOWLEDGE_TIMEOUT', message: '资料盘点超时（20s），请缩小资料目录后重试。' }
    return { ok: false, code: error?.code || 'KNOWLEDGE_SCAN_FAILED', message: String(error?.message || error) }
  }
}

function readCachedBuilds(projectId) {
  const dir = path.join(cacheRoot, String(projectId || ''))
  if (!projectId || !fs.existsSync(dir)) return []
  const builds = []
  for (const name of fs.readdirSync(dir)) {
    const coverageFile = path.join(dir, name, 'coverage.json')
    try {
      const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf-8'))
      builds.push({ cacheKey: name, ...coverage })
    } catch {
      // 半成品目录（.building-* 或空缓存）忽略，不参与新鲜度判定。
    }
  }
  return builds.sort((a, b) => String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')))
}

/** 新鲜度判定：当前 revision 命中缓存里的 coverage.indexRevision 才算「索引对得上」。 */
async function knowledgeStatus({ root, manifest, entry }) {
  const snapshot = await snapshotKnowledge(root)
  const projectId = entry?.projectId || manifest?.projectId || null
  const builds = projectId ? readCachedBuilds(projectId) : []
  const matched = snapshot.ok ? builds.find((build) => String(build.indexRevision || '') === snapshot.revision) || null : null
  const report = {
    runtimeInstalled: fs.existsSync(runtimeVerbFile()),
    runtimeRoot,
    cacheRoot,
    projectId,
    registered: Boolean(entry),
    inputs: snapshot.ok
      ? { revision: snapshot.revision, files: snapshot.files, bytes: snapshot.bytes, byDir: snapshot.byDir }
      : { revision: null, error: { code: snapshot.code, message: snapshot.message } },
    cachedBuilds: builds.length,
    index: matched
      ? { fresh: true, cacheKey: matched.cacheKey, cards: matched.projectCards ?? null, indexedAt: matched.indexedAt || null, compilerCommit: matched.compilerCommit || null, worldbookRevision: matched.worldbookRevision || null }
      : builds.length
        ? { fresh: false, newestCards: builds[0].projectCards ?? null, newestIndexedAt: builds[0].indexedAt || null, newestRevision: builds[0].indexRevision || null }
        : { fresh: false, newestCards: null, newestIndexedAt: null, newestRevision: null }
  }
  report.verdict = !report.runtimeInstalled
    ? 'runtime-missing'
    : !snapshot.ok
      ? 'inputs-rejected'
      : matched
        ? 'fresh'
        : builds.length ? 'stale' : 'never-indexed'
  return report
}

async function postKnowledge(baseUrl, route, payload, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(new URL(route, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw failure('ERR_KNOWLEDGE_TIMEOUT', `知识服务在 ${timeoutMs}ms 内没有返回（首次建索引较慢，可提高 timeoutMs）。`)
    const cause = error?.cause?.code || error?.code || ''
    throw failure('ERR_KNOWLEDGE_UNAVAILABLE', `连不上本机 Pinax 知识服务（${baseUrl}）。请先启动 npm run server，或用 PINAX_SERVER_URL 指定地址。${cause ? `（${cause}）` : ''}`)
  } finally {
    clearTimeout(timer)
  }
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || `知识服务返回 HTTP ${response.status}`
    throw failure(data?.error?.code || (response.status >= 500 ? 'ERR_KNOWLEDGE_FAILED' : 'ERR_KNOWLEDGE_REJECTED'), detail, {
      status: response.status,
      knowledgeCode: data?.error?.code || null
    })
  }
  if (!data || typeof data !== 'object') throw failure('ERR_KNOWLEDGE_RESPONSE_INVALID', '知识服务返回了无法解析的响应。')
  return data
}

function timeoutOf(value) {
  const ms = Number(value)
  if (!Number.isInteger(ms) || ms <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, ms)
}

/** pinax_project_index 执行体：status 只读盘点；sync 复用既有索引链触发编译并复核新鲜度。 */
export async function indexProject({ projectPath, projectId, action = 'status', probe, timeoutMs, advisorBaseUrl } = {}) {
  const resolved = resolveProject({ projectPath, projectId })
  const wanted = String(action || 'status').trim().toLowerCase()
  if (!['status', 'sync'].includes(wanted)) throw failure('ERR_INDEX_ACTION_INVALID', 'action 只能是 status 或 sync。')
  const entry = registryEntryFor(resolved.root, resolved.manifest)
  const before = await knowledgeStatus({ root: resolved.root, manifest: resolved.manifest, entry })

  if (wanted === 'status') {
    return {
      ...before,
      action: 'status',
      written: false,
      next: before.verdict === 'fresh'
        ? ['索引与当前资料一致，可直接用 pinax_knowledge_search 检索']
        : before.verdict === 'runtime-missing'
          ? ['先安装知识内核：npm run build:knowledge-runtime（需网络与批准）']
          : before.verdict === 'inputs-rejected'
            ? [`索引会整次拒绝（${before.inputs.error?.code || '未知'}）：${before.inputs.error?.message || ''}`, '按 rag-sqlite-boundaries 的拒绝表处置后再 sync']
            : ['跑 action:"sync" 触发一次只读检索以建/刷新索引（需本机 Pinax 服务与知识内核）']
    }
  }

  assertRuntimeInstalled()
  if (!entry?.projectId) {
    throw failure('ERR_PROJECT_NOT_REGISTERED', '索引重建走本机服务与注册表；该项目尚未登记，请先用 pinax_project_init 登记本地项目文件夹。')
  }
  const baseUrl = resolveAdvisorBaseUrl(advisorBaseUrl)
  const budget = timeoutOf(timeoutMs)
  const query = String(probe || '设定').trim().slice(0, 200) || '设定'
  const searched = await postKnowledge(baseUrl, KNOWLEDGE_VERBS.kb_search, { q: query, projectId: entry.projectId, k: 1 }, budget)
  const after = await knowledgeStatus({ root: resolved.root, manifest: resolved.manifest, entry })
  const warnings = []
  if (after.verdict !== 'fresh') warnings.push('检索成功但当前 revision 仍未命中缓存 coverage：可能是服务进程的 .runtime 位置与本机不同（PINAX_KNOWLEDGE_CACHE_ROOT），或编译失败被上游吞掉。')
  if (String(process.env.PINAX_KIT_PROTOCOL_PORT || '').trim()) warnings.push('本机服务把检索转发给了 kit 协议面（PINAX_KIT_PROTOCOL_PORT），coverage 由上游给出，不代表本地缓存已建。')
  return {
    ...after,
    action: 'sync',
    written: true,
    probe: query,
    build: searched?.coverage || null,
    verbResultKeys: Object.keys(searched || {}),
    warnings,
    next: after.verdict === 'fresh'
      ? ['用 pinax_knowledge_search 复核能查到设定', '正文/大纲不进 RAG 输入集；要 Agent 引用正文请用 pinax_chapter_read 或 pinax_agent_ask']
      : ['核对 cachedBuilds 与 revision；必要时删除 <cacheRoot>/<projectId> 下的旧缓存后重跑 sync']
  }
}

/** pinax_knowledge_search 执行体：只转发既有只读动词，不自己实现检索。 */
export async function searchKnowledge({
  projectPath,
  projectId,
  verb = 'kb_search',
  q,
  ref,
  dir,
  k,
  maxChars,
  cat,
  worldbookId,
  worldbookRevision,
  indexRevision,
  timeoutMs,
  advisorBaseUrl
} = {}) {
  // 不带项目参数的全局检索也在本机路线内：公网部署整组禁用（HTTP 轨另有第一道 403）。
  assertLocalRoute()
  const wanted = String(verb || 'kb_search').trim().toLowerCase()
  if (!KNOWLEDGE_VERBS[wanted]) {
    throw failure('ERR_KNOWLEDGE_VERB_INVALID', `verb 只能是 ${Object.keys(KNOWLEDGE_VERBS).join(' / ')}；收到 ${verb}。`)
  }
  assertRuntimeInstalled()
  const budget = timeoutOf(timeoutMs)
  const baseUrl = resolveAdvisorBaseUrl(advisorBaseUrl)
  const payload = {}

  if (wanted === 'kb_read') {
    const reference = String(ref || '').trim()
    if (!reference) throw failure('ERR_KNOWLEDGE_REF_REQUIRED', 'kb_read 需要卡片引用 ref（来自 kb_search 结果）。')
    if (/^(?:[A-Za-z]:|[/\\])/u.test(reference) || reference.split(/[/\\]/).includes('..')) {
      throw failure('ERR_KNOWLEDGE_REF_INVALID', 'ref 必须是知识库内的相对路径或卡片 ID，不接受绝对路径或 ..。')
    }
    payload.ref = reference.slice(0, 1000)
    const chars = Number(maxChars)
    if (Number.isInteger(chars) && chars > 0) payload.maxChars = Math.min(chars, 20000)
    if (indexRevision) payload.indexRevision = String(indexRevision)
  } else {
    const query = String(q || '').trim()
    if (!query) throw failure('ERR_KNOWLEDGE_QUERY_REQUIRED', `${wanted} 需要检索词 q。`)
    payload.q = query.slice(0, 2000)
    const size = Number(k)
    if (Number.isInteger(size) && size > 0) payload.k = Math.min(size, MAX_RESULTS)
    if (wanted === 'kb_search') {
      if (dir) payload.dir = String(dir).trim().slice(0, 100)
    } else {
      if (cat) payload.cat = String(cat).trim().slice(0, 100)
      if (worldbookId) payload.worldbookId = String(worldbookId)
      if (worldbookRevision) payload.worldbookRevision = String(worldbookRevision)
    }
  }

  const scoped = projectPath || projectId ? resolveProject({ projectPath, projectId }) : null
  if (scoped) {
    const entry = registryEntryFor(scoped.root, scoped.manifest)
    if (!entry?.projectId) throw failure('ERR_PROJECT_NOT_REGISTERED', '按项目检索需要项目已登记到本机注册表；请先用 pinax_project_init 登记，或不带项目参数做全局检索。')
    payload.projectId = entry.projectId
    if (scoped.entry?.bookId) payload.bookId = String(scoped.entry.bookId)
  }

  const result = await postKnowledge(baseUrl, KNOWLEDGE_VERBS[wanted], payload, budget)
  const entries = Array.isArray(result?.results) ? result.results : Array.isArray(result?.cards) ? result.cards : Array.isArray(result?.hits) ? result.hits : null
  return {
    verb: wanted,
    scope: scoped ? { projectId: payload.projectId, rootPath: scoped.root } : { projectId: null, rootPath: null, global: true },
    coverage: result?.coverage || null,
    resultCount: entries ? entries.length : null,
    results: entries ? entries.slice(0, MAX_RESULTS) : null,
    raw: entries ? undefined : result,
    warnings: [
      scoped ? '检索只覆盖 RAG 输入集（世界书/资料/规则/约束/文风）；正文与大纲不在其中。' : '未指定项目，走全局知识面（安装态卡片/已发布元数据），不等于本书。',
      ...(wanted === 'kb_read' && result?.truncated ? ['卡片内容已按 maxChars 截断。'] : [])
    ]
  }
}

export const KNOWLEDGE_TOOL_LIMITS = Object.freeze({
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS,
  maxResults: MAX_RESULTS,
  verbs: Object.keys(KNOWLEDGE_VERBS),
  runtimeRoot,
  cacheRoot
})
