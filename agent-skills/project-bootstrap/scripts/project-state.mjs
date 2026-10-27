#!/usr/bin/env node
/* eslint-disable no-console */
// 只读项目状态盘点：把「任何状态下的大梦式目录」压成一张可核对的状态卡。
// 不创建、不移动、不删除任何项目文件；SQLite 仅在无待落盘 WAL 时以 immutable 方式读取。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseWorldbookEntryFile } from '../../../shared/worldbookFileContract.js'
import { KIND_TEMPLATES, PROJECT_SPEC } from '../../../server/services/localMirrorService.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const EXPECTED_DIRS = KIND_TEMPLATES
const RAG_INPUT_DIRS = ['世界书', '资料', '规则', '约束', '文风']
const RAG_FILE_CAP = 2000
const KB_GENERATED = new Set(['00-知识图谱.md'])
/** 世界书里的索引/图谱/台账类辅助文件：不是条目，不参与契约判定，也不算重复。
 *  后四条与知识索引器自身的「不当作世界书条目」白名单一致（server/services/knowledgeProjectIndex.js:83）。 */
const WORLDBOOK_AUXILIARY_BASENAMES = new Set(['00-索引.md', '00-知识图谱.md', 'README.md'])
const WORLDBOOK_AUXILIARY_PATHS = new Set([
  '世界书/纪律.md',
  '世界书/伏笔/台账.md',
  '世界书/底牌/暗线底牌.md',
  '世界书/编年/章账.md'
])
function isAuxiliaryWorldbook(relative) {
  return WORLDBOOK_AUXILIARY_PATHS.has(relative)
    || WORLDBOOK_AUXILIARY_BASENAMES.has(path.posix.basename(relative))
    || /^0\d[-_][^/]*\.md$/iu.test(path.posix.basename(relative))
}

const statOf = (file) => { try { return fs.statSync(file) } catch { return null } }
const isDirectory = (file) => Boolean(statOf(file)?.isDirectory())
const isRegularFile = (file) => Boolean(statOf(file)?.isFile())
const byteSize = (file) => Number(statOf(file)?.size || 0)
const posix = (file) => file.split(path.sep).join('/')
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex')

function readText(file) {
  try { return fs.readFileSync(file, 'utf-8') } catch { return null }
}

function readJson(file) {
  const text = readText(file)
  if (text === null) return null
  try { return JSON.parse(text) } catch { return { __invalid: true } }
}

function sortedEntries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN', { numeric: true }))
  } catch { return [] }
}

/** 递归列文件；symlink 只记账不跟随，深度与数量双重护栏。
 *  indexOrder:true 时按知识索引器自身的排序（localeCompare 无 locale），保证 revision 可比对。 */
function walkFiles(dir, { skipDirs = new Set(), maxDepth = 12, indexOrder = false } = {}) {
  const found = []
  const symlinks = []
  const tooDeep = []
  const compare = indexOrder
    ? (a, b) => String(a.name).localeCompare(String(b.name))
    : (a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN', { numeric: true })
  function visit(current, depth) {
    if (depth > maxDepth) { tooDeep.push(posix(path.relative(dir, current))); return }
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries.sort(compare)) {
      const file = path.join(current, entry.name)
      if (entry.isSymbolicLink()) { symlinks.push(posix(path.relative(dir, file))); continue }
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue
        visit(file, depth + 1)
        continue
      }
      if (entry.isFile()) found.push(file)
    }
  }
  if (isDirectory(dir)) visit(dir, 0)
  return { files: found, symlinks, tooDeep }
}

function charsOf(file) {
  return String(readText(file) || '').length
}

function auditChapters(root) {
  const dir = path.join(root, '正文')
  const files = sortedEntries(dir).filter((entry) => entry.isFile() && /\.(md|txt)$/iu.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
  return {
    count: files.length,
    chars: files.reduce((total, file) => total + charsOf(file), 0),
    sample: files.slice(0, 3).map((file) => posix(path.relative(root, file)))
  }
}

function auditOutline(root) {
  const structured = readJson(path.join(root, '大纲', 'outline.json'))
  const nodes = Array.isArray(structured?.nodes) ? structured.nodes.length : null
  const markdown = sortedEntries(path.join(root, '大纲'))
    .filter((entry) => entry.isFile() && /\.(md|txt)$/iu.test(entry.name))
    .map((entry) => entry.name)
  return { structuredNodes: nodes, markdownFiles: markdown.length, hasStructured: nodes !== null }
}

function auditRules(root) {
  const dirs = ['规则', '约束']
  const files = []
  for (const name of dirs) {
    const dir = path.join(root, name)
    for (const file of walkFiles(dir).files) {
      if (!/\.(md|txt)$/iu.test(file)) continue
      files.push({ dir: name, path: posix(path.relative(root, file)), chars: charsOf(file) })
    }
  }
  const byDir = Object.fromEntries(dirs.map((name) => [name, files.filter((file) => file.dir === name).length]))
  return { count: files.length, byDir, files }
}

function auditWorldbook(root) {
  const dir = path.join(root, '世界书')
  const { files, symlinks } = walkFiles(dir, { skipDirs: new Set(['.kb']) })
  const entries = []
  const invalid = []
  const auxiliary = []
  const byBasename = new Map()
  const byHash = new Map()
  const hashByPath = new Map()
  const pushPair = (map, key, file) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(file)
  }
  for (const file of files) {
    if (!/\.md$/iu.test(file)) continue
    const relative = posix(path.relative(root, file))
    const base = path.basename(relative)
    const text = readText(file) || ''
    const hash = sha256(text)
    hashByPath.set(relative, hash)
    if (isAuxiliaryWorldbook(relative)) { auxiliary.push(relative); continue }
    pushPair(byBasename, base, relative)
    pushPair(byHash, hash, relative)
    const parsed = parseWorldbookEntryFile(text)
    if (parsed.ok) {
      entries.push({
        path: relative,
        id: parsed.entry.id,
        name: parsed.entry.name,
        type: parsed.entry.kind,
        keys: Array.isArray(parsed.entry.keys) ? parsed.entry.keys : [],
        tags: Array.isArray(parsed.entry.tags) ? parsed.entry.tags : [],
        chars: String(parsed.entry.content || '').length,
        hash
      })
    } else {
      invalid.push({ path: relative, code: parsed.error?.code || 'PARSE_FAILED', message: parsed.error?.message || '无法解析' })
    }
  }
  const byType = {}
  for (const entry of entries) byType[entry.type] = (byType[entry.type] || 0) + 1
  const grouped = (key) => {
    const map = new Map()
    for (const entry of entries) {
      const value = entry[key]
      if (!value) continue
      if (!map.has(value)) map.set(value, [])
      map.get(value).push(entry.path)
    }
    return [...map.entries()].filter(([, paths]) => paths.length > 1)
      .map(([value, paths]) => ({ value, paths }))
      .sort((a, b) => b.paths.length - a.paths.length)
  }
  const doubled = (map) => [...map]
    .filter(([, paths]) => paths.length > 1)
    .map(([value, paths]) => ({ value, paths: paths.sort(), identical: new Set(paths.map((file) => hashByPath.get(file))).size === 1 }))
    .sort((a, b) => b.paths.length - a.paths.length || String(a.value).localeCompare(String(b.value), 'zh-CN'))
  const basenameDoubles = doubled(byBasename)
  // 不合规的平铺原文若在子目录已有同名合规副本，处置是「归档原文」而不是重写。
  const validNames = new Set(entries.map((entry) => path.basename(entry.path)))
  const superseded = invalid.filter((item) => validNames.has(path.basename(item.path))).map((item) => item.path)
  return {
    sourceFiles: files.length,
    total: entries.length + invalid.length,
    parsed: entries.length,
    invalid,
    superseded,
    auxiliary,
    byType,
    duplicates: {
      id: grouped('id'),
      name: grouped('name'),
      basename: basenameDoubles,
      content: doubled(byHash),
      // 同名但整文件字节不同＝多半是「平铺原文 + 带契约头的副本」，唯一真源必须人工确认。
      sameNameDifferentBytes: basenameDoubles.filter((group) => !group.identical).length
    },
    symlinks,
    paths: entries.map((entry) => entry.path)
  }
}

function auditSources(root) {
  const dir = path.join(root, '资料')
  const { files } = walkFiles(dir)
  const archives = files.filter((file) => /(^|[./])归档[/\\].*\.json$/iu.test(posix(path.relative(root, file))))
  return { count: files.length, bytes: files.reduce((total, file) => total + byteSize(file), 0), archives: archives.length }
}

/** 复刻 collectKnowledgeSources 的遍历顺序、include 规则与容量判定，用于比对索引 revision。
 *  真实索引器遇到符号链接/超容量是「整次拒绝」（KNOWLEDGE_SYMLINK / KNOWLEDGE_LIMIT），不是跳过，
 *  所以这里如实报 indexWouldReject，而不是假装仍能算出 revision。 */
function auditRagSnapshot(root) {
  const files = []
  const skipped = []
  const blockers = []
  let bytes = 0
  for (const dirName of RAG_INPUT_DIRS) {
    const dir = path.join(root, dirName)
    if (!isDirectory(dir)) continue
    const { files: found, symlinks, tooDeep } = walkFiles(dir, { indexOrder: true })
    for (const symlink of symlinks) blockers.push({ file: symlink, code: 'KNOWLEDGE_SYMLINK' })
    for (const deep of tooDeep) blockers.push({ file: deep, code: 'KNOWLEDGE_LIMIT', detail: '目录层级 > 12' })
    for (const file of found) {
      const relative = posix(path.relative(root, file))
      const included = /\.(md|txt)$/iu.test(relative)
        || /^世界书\/(?:graph|manifest)\.json$/u.test(relative)
        || /^资料\/归档\/[^/]+\.json$/u.test(relative)
      if (!included) continue
      const size = byteSize(file)
      if (size > 16 * 1024 * 1024) blockers.push({ file: relative, code: 'KNOWLEDGE_LIMIT', detail: '单文件 > 16MB' })
      if (files.length >= RAG_FILE_CAP) blockers.push({ file: relative, code: 'KNOWLEDGE_LIMIT', detail: `输入文件数 ≥ ${RAG_FILE_CAP}` })
      if (bytes + size > 64 * 1024 * 1024) blockers.push({ file: relative, code: 'KNOWLEDGE_LIMIT', detail: '累计 > 64MB' })
      if (files.length >= RAG_FILE_CAP) continue
      const text = readText(file)
      if (text === null) { skipped.push({ file: relative, reason: 'unreadable' }); continue }
      bytes += size
      files.push({ relative, text })
    }
  }
  return {
    count: files.length,
    bytes,
    revision: sha256(JSON.stringify(files)),
    skipped,
    blockers,
    indexWouldReject: blockers.length ? blockers[0] : null
  }
}

function readCoverage(directory) {
  const coverage = readJson(path.join(directory, 'coverage.json'))
  if (!coverage || coverage.__invalid) return null
  return { ...coverage, directory: posix(directory), mtime: statOf(directory)?.mtimeMs || 0 }
}

function auditRag(root, projectId) {
  const runtimeRoot = path.resolve(process.env.PINAX_KNOWLEDGE_RUNTIME || path.join(REPO_ROOT, '.runtime/knowledge'))
  const cacheRoot = path.resolve(process.env.PINAX_KNOWLEDGE_CACHE || path.join(REPO_ROOT, '.runtime/data/knowledge'))
  const runtimeReady = isRegularFile(path.join(runtimeRoot, 'core/dist/verbs.js'))
  const runtimeSource = readJson(path.join(runtimeRoot, 'runtime-source.json'))
  const projectCache = projectId ? path.join(cacheRoot, String(projectId)) : null
  const versions = projectCache && isDirectory(projectCache)
    ? sortedEntries(projectCache).filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/iu.test(entry.name))
      .map((entry) => readCoverage(path.join(projectCache, entry.name)))
      .filter(Boolean)
    : []
  const latest = versions.sort((a, b) => String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')) || b.mtime - a.mtime)[0] || null
  const snapshot = auditRagSnapshot(root)
  return {
    runtimeRoot: posix(runtimeRoot),
    runtimeReady,
    runtimeCommit: runtimeSource && !runtimeSource.__invalid ? runtimeSource.commit || null : null,
    cacheRoot: posix(cacheRoot),
    versions: versions.length,
    index: latest ? {
      cards: latest.projectCards ?? null,
      indexRevision: latest.indexRevision || null,
      worldbookRevision: latest.worldbookRevision || null,
      indexedAt: latest.indexedAt || null
    } : null,
    current: { files: snapshot.count, bytes: snapshot.bytes, revision: snapshot.revision, skipped: snapshot.skipped, blockers: snapshot.blockers, indexWouldReject: snapshot.indexWouldReject },
    stale: latest ? latest.indexRevision !== snapshot.revision : null
  }
}

/** 旧 .kb（零依赖 BM25）只作兼容盘点，不与 Pinax 知识运行时混用。 */
function auditLegacyKb(root) {
  const dir = path.join(root, '世界书/.kb')
  const index = readJson(path.join(dir, 'index.json'))
  if (!index || index.__invalid) return { present: isDirectory(dir), indexed: false }
  const indexedFiles = new Set((index.chunks || []).map((chunk) => String(chunk.file || chunk.path || '')).filter(Boolean))
  const current = []
  const onDisk = new Set()
  for (const dirName of ['世界书', '规则', '大纲']) {
    const base = path.join(root, dirName)
    for (const file of walkFiles(base, { skipDirs: new Set(['.kb']) }).files) {
      const relative = posix(path.relative(root, file))
      if (!/\.md$/iu.test(relative)) continue
      onDisk.add(relative)
      const name = path.basename(relative)
      if (KB_GENERATED.has(name)) continue
      if (dirName === '世界书' && isAuxiliaryWorldbook(relative)) continue
      current.push(relative)
    }
  }
  return {
    present: true,
    indexed: true,
    built: index.built || null,
    chunks: Array.isArray(index.chunks) ? index.chunks.length : 0,
    files: indexedFiles.size,
    notIndexed: current.filter((file) => !indexedFiles.has(file)).slice(0, 20),
    missing: [...indexedFiles].filter((file) => !onDisk.has(file)).slice(0, 20)
  }
}

function runSqliteProbe(file) {
  const candidates = ['python', 'python3']
  const code = [
    'import sqlite3,json,sys',
    'p=sys.argv[1]',
    'try:',
    ' con=sqlite3.connect("file:"+p+"?mode=ro&immutable=1",uri=True)',
    ' out={"integrity":con.execute("pragma integrity_check").fetchone()[0]}',
    ' tables=[r[0] for r in con.execute("select name from sqlite_master where type=\'table\' order by name").fetchall()]',
    ' out["tables"]=tables',
    ' for t in tables:',
    '  try: out[t]=con.execute(\'select count(*) from "%s"\' % t).fetchone()[0]',
    '  except Exception: out[t]=None',
    ' print(json.dumps(out))',
    'except Exception as e:',
    ' print(json.dumps({"error":str(e)}))'
  ].join('\n')
  for (const command of candidates) {
    const result = spawnSync(command, ['-c', code, file], { encoding: 'utf-8', windowsHide: true, timeout: 8000 })
    if (result.error || result.status !== 0) continue
    try { return { available: true, ...JSON.parse(String(result.stdout || '{}')) } } catch { return { available: true, error: '探针输出不可解析' } }
  }
  return { available: false, reason: '未找到可用的 python/python3，未读取库内容' }
}

function auditSqlite(root) {
  const candidates = [
    path.join(root, '.pinax/project.sqlite'),
    path.join(root, 'pinax/.pinax/project.sqlite')
  ]
  const found = []
  for (const file of candidates) {
    if (!isRegularFile(file)) continue
    const wal = byteSize(`${file}-wal`)
    const entry = { path: posix(path.relative(root, file)), bytes: byteSize(file), walBytes: wal, shmBytes: byteSize(`${file}-shm`) }
    entry.read = wal > 0 ? { available: false, reason: `-wal 有 ${wal} 字节待落盘；为保持只读未打开，请在桌面端 checkpoint 后再查` } : runSqliteProbe(file)
    found.push(entry)
  }
  return { present: found.length > 0, databases: found, note: '服务端与 MCP 不读写 project.sqlite；它只属于 Electron 桌面工程内核。' }
}

function recommendations(state) {
  const list = []
  const push = (level, text) => list.push({ level, text })
  if (!state.project.markerFound) push('critical', '缺 .pinax/project.json：用 pinax_project_init 初始化（已有文件保留，不覆盖）。')
  else if (state.project.specSupported === false) push('critical', `项目范式 ${state.project.spec} 与当前 ${PROJECT_SPEC} 不符：MCP 会报 ERR_SPEC_MISMATCH，先由作者确认升级路线，不要手改 manifest。`)
  if (state.project.missingDirs.length) push('warning', `缺标准目录：${state.project.missingDirs.join('/')}；写入工具会自动建，或先手工建空目录。`)
  const invalid = state.worldbook.invalid.length
  const superseded = state.worldbook.superseded.length
  if (superseded) push('warning', `${superseded} 个世界书原文不合契约但子目录已有同名合规副本：把原文移进 资料/归档（作者点头后再动），不要重写第二遍。`)
  if (invalid - superseded > 0) push('critical', `${invalid - superseded} 个世界书文件既不合契约又没有替代副本：先备份到 资料/，再用 pinax_worldbook_write 按契约重写。`)
  const basenameDuplicates = state.worldbook.duplicates.basename.length
  if (basenameDuplicates) {
    const suffix = state.worldbook.duplicates.sameNameDifferentBytes
      ? `，其中 ${state.worldbook.duplicates.sameNameDifferentBytes} 组内容不同（多为原文+补契约头的副本），必须逐组人工定唯一真源`
      : '，内容完全相同，可安全归档其一'
    push('warning', `世界书同名 ${basenameDuplicates} 组（平铺与 世界书/<分类>/ 并存）：两份都会进 RAG 输入集，条目与引用会双计${suffix}。`)
  }
  const rulesDirs = Object.entries(state.rules.byDir).filter(([, count]) => count > 0).map(([name]) => name)
  if (rulesDirs.length > 1) push('warning', `规则同时存在于 ${rulesDirs.join(' 与 ')}：新项目标准是 约束/，旧 规则/ 需明确迁移或保留只读。`)
  if (!state.outline.hasStructured) push('note', '没有 大纲/outline.json：MCP 只报 warning，不替作者编节点；需要结构化大纲时由作者或编辑流程补。')
  if (!state.rag.runtimeReady) push('warning', '本机知识运行时未安装：npm run build:knowledge-runtime（需网络、Python 与批准）；没有它就不能声称 RAG 可用。')
  else if (state.rag.stale === true) push('warning', 'RAG 索引已过期：下一次 kb-search 会整项目重编译；正文/大纲不在输入集内，别把未命中当资料缺失。')
  else if (state.rag.stale === null) push('note', 'RAG 尚无项目索引：首次 kb-search 会建索引；若只需文件读取，可继续走 pinax_* 只读工具。')
  if (state.rag.current.indexWouldReject) push('critical', `RAG 索引会被整次拒绝：${state.rag.current.indexWouldReject.code}（${state.rag.current.blockers.map((item) => `${item.file}${item.detail ? ` · ${item.detail}` : ''}`).slice(0, 3).join('；')}${state.rag.current.blockers.length > 3 ? ` 等 ${state.rag.current.blockers.length} 处` : ''}）；符号链接与超容量不是「跳过」，必须先清来源。`)
  else if (state.rag.current.skipped.length) push('warning', `RAG 输入有 ${state.rag.current.skipped.length} 项本地读不到（不可读）：索引请求会在读取处报错，先修权限/编码。`)
  if (state.legacyKb.indexed && (state.legacyKb.notIndexed.length || state.legacyKb.missing.length)) push('note', '旧 .kb 与当前目录不一致：可选用；如继续用，先定标准目录再 build_index.py，避免把副本重复索引。')
  if (!state.sqlite.present) push('note', '没有 project.sqlite：这是 Electron 桌面内核的派生目录，不是项目完整性门槛；服务端/MCP 不依赖它。')
  for (const database of state.sqlite.databases) {
    if (!database.read.available) push('note', `${database.path}：${database.read.reason || '未读取内容'}`)
    else if (database.read.error) push('critical', `${database.path} 读取失败：${database.read.error}；先备份再处理，不要删库。`)
    else if (database.read.project_items === 0) push('note', `${database.path} 完整但 project_items=0：内核只是空骨架，需由桌面端导入/迁移才有目录，不由 MCP 伪造。`)
  }
  if (!list.length) push('ok', '状态卡无阻塞项：可按导入→查询→复核的节奏继续。')
  return list
}

function audit(root) {
  const markerPath = path.join(root, '.pinax/project.json')
  const manifest = readJson(markerPath)
  const usable = manifest && !manifest.__invalid
  const kind = usable ? (manifest.kind || 'novel') : 'novel'
  const expectedDirs = EXPECTED_DIRS[kind] || EXPECTED_DIRS.novel
  return {
    project: {
      root: posix(root),
      markerFound: Boolean(usable),
      markerInvalid: manifest?.__invalid === true,
      spec: usable ? manifest.spec || null : null,
      specSupported: usable ? (manifest.spec || PROJECT_SPEC) === PROJECT_SPEC : null,
      projectId: usable ? manifest.projectId || null : null,
      name: usable ? manifest.name || null : null,
      kind,
      expectedDirs,
      missingDirs: expectedDirs.filter((dir) => !isDirectory(path.join(root, dir)))
    },
    chapters: auditChapters(root),
    outline: auditOutline(root),
    rules: auditRules(root),
    worldbook: auditWorldbook(root),
    sources: auditSources(root),
    rag: auditRag(root, usable ? manifest.projectId : null),
    legacyKb: auditLegacyKb(root),
    sqlite: auditSqlite(root)
  }
}

function printText(state) {
  const p = state.project
  console.log(`project: ${p.name || '(未命名)'}  kind=${p.kind}  projectId=${p.projectId || '-'}`)
  console.log(`root: ${p.root}`)
  console.log(`marker: ${p.markerFound ? (p.specSupported === false ? `spec=${p.spec} (unsupported)` : 'ok') : p.markerInvalid ? 'invalid JSON' : 'missing'}  missingDirs=${p.missingDirs.length ? p.missingDirs.join(',') : 'none'}`)
  console.log(`chapters: ${state.chapters.count} / ${state.chapters.chars} chars  outline: ${state.outline.structuredNodes ?? 'no-json'} nodes, ${state.outline.markdownFiles} md`)
  console.log(`rules: ${state.rules.count} (${state.rules.byDir['约束'] || 0} in 约束, ${state.rules.byDir['规则'] || 0} in 规则)`)
  console.log(`worldbook: ${state.worldbook.parsed}/${state.worldbook.total} parsed  types=${Object.entries(state.worldbook.byType).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}  auxiliary=${state.worldbook.auxiliary.length}`)
  console.log(`worldbook duplicates: basename=${state.worldbook.duplicates.basename.length} (同名不同内容 ${state.worldbook.duplicates.sameNameDifferentBytes}), id=${state.worldbook.duplicates.id.length}, name=${state.worldbook.duplicates.name.length}, content=${state.worldbook.duplicates.content.length}, invalid=${state.worldbook.invalid.length}`)
  console.log(`sources: ${state.sources.count} files / ${state.sources.bytes} bytes (${state.sources.archives} archives)`)
  console.log(`RAG: runtime=${state.rag.runtimeReady ? 'ready' : 'missing'}  index=${state.rag.index ? `${state.rag.index.cards} cards @ ${state.rag.index.indexedAt || '?'}` : 'none'}  stale=${state.rag.stale === null ? 'n/a' : state.rag.stale ? 'yes' : 'no'}  inputs=${state.rag.current.files}/${state.rag.current.bytes}B  reject=${state.rag.current.indexWouldReject ? state.rag.current.indexWouldReject.code : 'no'}`)
  const kb = state.legacyKb
  if (kb.present) console.log(`legacy .kb: ${kb.indexed ? `built ${kb.built || '?'}，${kb.chunks} chunks/${kb.files} files，未索引 ${kb.notIndexed.length}，失踪 ${kb.missing.length}` : '目录存在但无 index.json'}`)
  console.log(`SQLite: ${state.sqlite.present ? state.sqlite.databases.map((db) => `${db.path} ${db.bytes}B items=${db.read.project_items ?? '未读'} integrity=${db.read.integrity || db.read.reason || db.read.error || '未读'}`).join(' | ') : 'none（桌面内核可选）'}`)
  console.log('next:')
  for (const item of recommendations(state)) console.log(`  [${item.level}] ${item.text}`)
}

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const target = args.find((value) => !value.startsWith('--'))
if (!target) {
  console.error('用法：node project-state.mjs <项目绝对路径> [--json]（全程只读）')
  process.exit(2)
}
const root = path.resolve(target)
if (!isDirectory(root)) {
  console.error(`目录不存在或不是目录：${root}`)
  process.exit(2)
}
const state = audit(root)
state.recommendations = recommendations(state)
if (jsonMode) console.log(JSON.stringify(state, null, 2))
else printText(state)
