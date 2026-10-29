import fs from 'node:fs'
import path from 'node:path'
import {
  PROJECT_SPEC,
  createLocalMirrorService
} from '../services/localMirrorService.js'

// MCP 只服务「本地项目文件夹」路线：浏览器缓存书没有可读目录，一律拒绝。
// 所有读取都走既有 localMirrorService，不在这里重写落盘/解析规则。
const service = createLocalMirrorService()

const MARKER = path.join('.pinax', 'project.json')

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}

export function assertLocalRoute() {
  if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) {
    throw failure('ERR_MCP_LOCAL_ONLY', 'MCP 仅支持本机本地项目路线；公网部署已禁用。')
  }
}

function readManifest(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, MARKER), 'utf-8'))
  } catch {
    return null
  }
}

function realPathOf(target) {
  try {
    return fs.realpathSync(target)
  } catch {
    return null
  }
}

/**
 * 落点校验（写入前必过）：目标父目录的 realpath 必须落在项目 realpath 之内。
 * 只做词法 path.join 时，项目内一个指向项目外的符号链接目录就能把写入带出项目根，
 * 与「绝不写到项目外」的承诺相反；这里用 realpath 把符号链接解掉再判包含性。
 */
export function assertInsideProject(resolved, target) {
  const root = resolved?.realRoot || resolved?.root
  if (!root) throw failure('ERR_PROJECT_REQUIRED', '缺少项目根，无法校验落点。')
  const parent = path.dirname(target)
  const realParent = realPathOf(parent)
  if (!realParent) throw failure('ERR_TARGET_OUTSIDE', `目标目录不存在或不可解析：${parent}`)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  if (realParent !== root && !realParent.toLowerCase().startsWith(prefix.toLowerCase())) {
    throw failure('ERR_TARGET_OUTSIDE', `目标越出项目根（经符号链接）：${target}`)
  }
  try {
    if (fs.lstatSync(target).isSymbolicLink()) {
      throw failure('ERR_TARGET_SYMLINK', `目标是符号链接，拒绝写入：${target}`)
    }
  } catch (error) {
    if (error?.code === 'ERR_TARGET_SYMLINK') throw error
    // 目标还不存在（新建），忽略。
  }
  return target
}

/**
 * 读工具不得触发镜像事务回滚：既有 mirror service 在读世界书/约束时会
 * recoverMirrorTransaction()，残留事务日志下它会 rmSync 掉整个项目目录再回滚备份。
 * MCP 的读工具对外声明 readOnlyHint:true，这里先探测事务日志，命中就类型化拒绝，
 * 把回滚决定权交回应用（作者可以在应用里完成或撤销那次同步）。
 */
export function assertNoPendingMirrorTransaction(root) {
  const journal = `${root}.pinax-sync.json`
  if (fs.existsSync(journal)) {
    throw failure(
      'ERR_MIRROR_TRANSACTION_PENDING',
      `项目存在未完成的镜像事务（${journal}）；请先在 Pinax 应用内完成或撤销那次同步。MCP 读工具不会替你回滚——回滚会删除项目目录。`
    )
  }
}

function registryEntry(root) {
  try {
    const key = path.resolve(root).toLowerCase()
    return service.listProjects().find((item) => path.resolve(item.rootPath).toLowerCase() === key) || null
  } catch {
    return null
  }
}

function projectSummary({ root, manifest, entry }) {
  return {
    projectId: manifest?.projectId || entry?.projectId || null,
    bookId: entry?.bookId ?? null,
    name: manifest?.name || entry?.name || path.basename(root),
    kind: manifest?.kind || entry?.kind || 'generic',
    rootPath: root,
    registered: Boolean(entry),
    updatedAt: manifest?.updatedAt || null
  }
}

/** projectPath 优先；projectId 同时接受注册表 projectId 与已绑定的 bookId。 */
export function resolveProject({ projectPath, projectId } = {}) {
  assertLocalRoute()
  const requestedPath = typeof projectPath === 'string' ? projectPath.trim() : ''
  const requestedId = typeof projectId === 'string' ? projectId.trim() : ''
  if (!requestedPath && !requestedId) {
    throw failure('ERR_PROJECT_REQUIRED', '请提供 projectPath（项目文件夹绝对路径）或 projectId。')
  }

  if (requestedPath) {
    if (!path.isAbsolute(requestedPath)) throw failure('ERR_PATH_NOT_ABSOLUTE', 'projectPath 必须是绝对路径。')
    if (requestedPath.includes('..')) throw failure('ERR_PATH_INVALID', 'projectPath 不允许包含 ..。')
    const root = path.resolve(requestedPath)
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw failure('ERR_DIR_NOT_FOUND', `目录不存在：${root}`)
    const manifest = readManifest(root)
    if (!manifest) {
      throw failure('ERR_NOT_LOCAL_PROJECT', `不是本地 Pinax 项目（缺少 .pinax/project.json）：${root}。MCP 不支持浏览器缓存项目。`)
    }
    if (manifest.spec && manifest.spec !== PROJECT_SPEC) {
      throw failure('ERR_SPEC_MISMATCH', `项目范式 ${manifest.spec} 与当前支持的 ${PROJECT_SPEC} 不匹配。`)
    }
    return { root, realRoot: realPathOf(root) || root, manifest, entry: registryEntry(root) }
  }

  const entry = service.listProjects().find((item) => item.projectId === requestedId || item.bookId === requestedId)
  if (!entry) {
    throw failure('ERR_PROJECT_NOT_FOUND', `注册表中没有 projectId/bookId=${requestedId}。浏览器缓存项目没有本地文件夹，MCP 不可读。`)
  }
  const root = path.resolve(entry.rootPath)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw failure('ERR_DIR_NOT_FOUND', `项目文件夹不存在：${root}`)
  }
  const manifest = readManifest(root)
  if (!manifest) throw failure('ERR_NOT_LOCAL_PROJECT', `项目缺少 .pinax/project.json：${root}`)
  return { root, realRoot: realPathOf(root) || root, manifest, entry }
}

function chapterFiles(root) {
  const dir = path.join(root, '正文')
  if (!fs.existsSync(dir)) return { files: [], total: 0, truncated: false }
  const all = fs.readdirSync(dir)
    .filter((name) => /\.(?:md|txt)$/iu.test(name))
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
  const files = all.slice(0, 500)
  return { files: files.map((name) => path.join(dir, name)), total: all.length, truncated: all.length > files.length }
}

function chapterTitle(name, index) {
  return name.replace(/\.(?:md|txt)$/iu, '').replace(/^\d+-/, '').trim() || `章节 ${index + 1}`
}

export function listChapters(root) {
  const { files } = chapterFiles(root)
  return files.map((file, index) => {
    let bytes = 0
    try { bytes = fs.statSync(file).size } catch { /* 读不到就给 0，不阻断列表 */ }
    return {
      index,
      title: chapterTitle(path.basename(file), index),
      file: `正文/${path.basename(file)}`,
      bytes
    }
  })
}

/** 章节总量与是否被 500 上限截断（如实透出，别让读者以为只有 500 章）。 */
export function chapterStats(root) {
  const { total, truncated } = chapterFiles(root)
  return { total, truncated }
}

function readText(file) {
  const text = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
  if (text.length > 2 * 1024 * 1024) throw failure('ERR_FILE_TOO_LARGE', '章节超过 2MB 读取上限。')
  return text
}

export function readChapter(root, { index, title, offset = 0, maxChars = 20000 } = {}) {
  const { files } = chapterFiles(root)
  if (!files.length) throw failure('ERR_NO_CHAPTERS', '项目「正文/」下没有可读章节。')

  const numericIndex = index === undefined || index === null || index === '' ? null : Number(index)
  let target = -1
  if (numericIndex !== null && Number.isInteger(numericIndex)) {
    target = numericIndex
  } else if (typeof title === 'string' && title.trim()) {
    const wanted = title.trim()
    target = files.findIndex((file, i) => chapterTitle(path.basename(file), i) === wanted)
    if (target < 0) target = files.findIndex((file, i) => chapterTitle(path.basename(file), i).includes(wanted))
  }
  if (target < 0 || target >= files.length) {
    const available = files.slice(0, 20).map((file, i) => chapterTitle(path.basename(file), i))
    throw failure('ERR_CHAPTER_NOT_FOUND', `未找到章节。可用章节（前 20）：${available.join(' / ')}`)
  }

  const limit = Math.max(1000, Math.min(200000, Number(maxChars) || 20000))
  const start = Math.max(0, Math.min(Number(offset) || 0, 10 * 1024 * 1024))
  const content = readText(files[target]).trim()
  const slice = content.slice(start, start + limit)
  return {
    index: target,
    title: chapterTitle(path.basename(files[target]), target),
    file: `正文/${path.basename(files[target])}`,
    chars: content.length,
    offset: start,
    content: slice,
    truncated: start + slice.length < content.length,
    nextOffset: start + slice.length < content.length ? start + slice.length : null
  }
}

export function readWorldbook(root) {
  assertNoPendingMirrorTransaction(root)
  const dir = path.join(root, '世界书')
  if (!fs.existsSync(dir)) return { entries: [], warnings: ['项目没有「世界书」目录'] }
  return service.readWorldbookFolder(dir)
}

export function listWorldbook(root, { type, limit = 300 } = {}) {
  const { worldbook, warnings } = readWorldbook(root)
  const max = Math.max(1, Math.min(1000, Number(limit) || 300))
  const wanted = typeof type === 'string' ? type.trim() : ''
  const all = (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .filter((entry) => !wanted || String(entry.type || 'general') === wanted)
  return {
    total: all.length,
    truncated: all.length > max,
    warnings: warnings || [],
    entries: all.slice(0, max).map((entry) => ({
      id: entry.id || null,
      name: entry.name || '',
      type: entry.type || 'general',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      aliases: Array.isArray(entry.keys) ? entry.keys : [],
      chars: String(entry.content || '').length
    }))
  }
}

export function readWorldbookEntry(root, { id, name } = {}) {
  const { worldbook, warnings } = readWorldbook(root)
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  const wantedId = typeof id === 'string' ? id.trim() : ''
  const wantedName = typeof name === 'string' ? name.trim() : ''
  if (!wantedId && !wantedName) throw failure('ERR_ENTRY_REQUIRED', '请提供 id 或 name。')
  let entry = wantedId ? entries.find((item) => item.id === wantedId) : null
  if (!entry && wantedName) {
    entry = entries.find((item) => item.name === wantedName)
      || entries.find((item) => item.name.includes(wantedName))
  }
  if (!entry) throw failure('ERR_ENTRY_NOT_FOUND', `世界书中没有 ${wantedId || wantedName}。`)
  return { entry, warnings: warnings || [] }
}

export function readOutline(root, { maxNodes = 300 } = {}) {
  const file = path.join(root, '大纲', 'outline.json')
  const warnings = []
  let raw = null
  try { raw = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { raw = null }
  if (!raw) {
    if (fs.existsSync(path.join(root, '大纲', '大纲.md'))) warnings.push('outline.json 缺失；仅有 大纲.md 概览，无法结构化读回。')
    else warnings.push('项目没有「大纲/outline.json」。')
  }
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw?.edges) ? raw.edges : []
  const max = Math.max(1, Math.min(1000, Number(maxNodes) || 300))
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    truncated: nodes.length > max,
    warnings,
    nodes: nodes.slice(0, max).map((node) => ({
      id: node?.id ?? null,
      title: String(node?.title ?? node?.label ?? node?.name ?? ''),
      type: String(node?.type ?? ''),
      summary: String(node?.summary ?? node?.description ?? node?.text ?? '').slice(0, 240)
    })),
    edges: edges.slice(0, max).map((edge) => ({
      from: edge?.from ?? edge?.source ?? null,
      to: edge?.to ?? edge?.target ?? null,
      label: String(edge?.label ?? edge?.type ?? '')
    }))
  }
}

export function buildProjectContext(root, { manifest, entry }) {
  assertNoPendingMirrorTransaction(root)
  const chapters = listChapters(root)
  const outline = readOutline(root)
  const worldbook = listWorldbook(root, { limit: 200 })
  let rules = []
  const warnings = []
  try {
    const result = service.readRuleFiles(root)
    rules = (result.files || []).map((file) => ({ name: file.name, kind: file.kind, chars: String(file.content || '').length }))
    warnings.push(...(result.warnings || []))
  } catch (error) {
    warnings.push(`约束读取失败：${error.message}`)
  }
  return {
    project: projectSummary({ root, manifest, entry }),
    chapters,
    outline,
    worldbook,
    rules,
    warnings
  }
}

export function openProject({ projectPath, projectId } = {}) {
  const resolved = resolveProject({ projectPath, projectId })
  return {
    project: projectSummary(resolved),
    counts: {
      chapters: listChapters(resolved.root).length,
      outlineNodes: readOutline(resolved.root).nodeCount,
      worldbookEntries: listWorldbook(resolved.root).total
    }
  }
}

export function listLocalProjects() {
  assertLocalRoute()
  const projects = service.listProjects()
  return {
    count: projects.length,
    projects: projects.map((entry) => {
      const root = path.resolve(entry.rootPath)
      const manifest = readManifest(root)
      return {
        projectId: entry.projectId || manifest?.projectId || null,
        bookId: entry.bookId ?? null,
        name: manifest?.name || entry.name || path.basename(root),
        kind: manifest?.kind || entry.kind || 'generic',
        rootPath: root,
        exists: fs.existsSync(root),
        hasMarker: Boolean(manifest),
        lastOpenedAt: entry.lastOpenedAt || null,
        lastSyncAt: entry.lastSyncAt || null
      }
    })
  }
}

export { projectSummary }
