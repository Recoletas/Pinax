// 本地文件镜像（P1→项目文件体系 @2）：把项目的正文/大纲/世界书/构思/资料/日志/媒体清单
// 单向落盘到本机文档目录，供 agent 与用户直接读取。
// 镜像按域事务输出：省略域保持原样，手动修改需先读取确认，不能静默覆盖。
// 位置解析：PINAX_MIRROR_ROOT env > <homedir>/Documents/Pinax。前端不传路径（防路径注入），服务端唯一决定权。
// 世界书写侧为契约 v2 布局（条目 → 世界书/<cat>/<name>.md + index.json + graph.json +
// manifest.json + 骨架件幂等补齐），并提供 readWorldbookFolder 读回——见「世界书文件契约 v2」节。
import { commitMirrorTransaction, recoverMirrorTransaction, mirrorDomainFingerprint } from './localMirrorTransaction.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// 世界书文件格式契约（W1·A1）——frontmatter/index/graph/骨架件的格式 canonical。
import {
  WORLDBOOK_FILE_SCHEMA_VERSION,
  serializeWorldbookEntryFile as contractSerializeEntryFile,
  parseWorldbookEntryFile as contractParseEntryFile,
  buildWorldbookIndexFile as contractBuildIndexFile,
  buildWorldbookGraphFile as contractBuildGraphFile,
  parseWorldbookGraphFile,
  buildWorldbookAuxFiles
} from '../../shared/worldbookFileContract.js'
// 词汇表文件契约（pinax-lexicon@1）——项目根「词汇表.json」三段式（禁用/偏好/专名口径）。
import { LEXICON_FILE_NAME, buildLexiconFile, parseLexiconFile } from '../../shared/lexiconFileContract.js'

export const MIRROR_SCHEMA = 'pinax-project-fs@2'
export const PROJECT_SPEC = 'pinax-project@1'
/** 项目文件夹范式（Obsidian/VS Code 模式）：任意位置自包含文件夹，.pinax/project.json 为标记。 */
const KIND_TEMPLATES = {
  novel: ['正文', '大纲', '世界书', '构思', '资料', '日志', '约束'],
  screenplay: ['剧本', '人物', '场景', '大纲', '世界书', '资料', '日志', '约束'],
  generic: ['文档', '资料', '日志', '约束']
}
// 「约束」是用户手写自由区，不纳入自动镜像的文件清单。
const LIMITS = {
  maxChapters: 500,
  maxEntries: 2000,
  maxExplorations: 300,
  maxArtifacts: 50,
  maxArtifactChars: 50_000,
  maxSessions: 20,
  maxSessionChars: 200_000,
  maxSessionPayloads: 100,
  maxArchiveDocs: 500,
  maxRevisionsPerChapter: 10,
  maxRevisionChars: 20_000,
  maxBlockHistoryPerChapter: 20,
  maxConversationMessages: 60,
  maxTotalChars: 8_000_000,
  maxRuleFiles: 8,
  maxRuleFileBytes: 1024 * 1024,
  maxRuleFileChars: 50_000
}

export function resolveMirrorRoot(env = process.env) {
  return env.PINAX_MIRROR_ROOT || path.join(os.homedir(), 'Documents', 'Pinax')
}

/** 应用侧数据（注册表/索引）："代码安装位置附近"——PINAX_APP_DATA > <server>/.pinax-app/（桌面阶段换 Electron userData）。 */
export function resolveAppData(env = process.env, serverDir = path.resolve(import.meta.dirname, '..')) {
  return env.PINAX_APP_DATA || path.join(serverDir, '.pinax-app')
}

function readRegistry(appData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(appData, 'projects.registry.json'), 'utf-8'))
    return Array.isArray(parsed.projects) ? parsed.projects : []
  } catch { return [] }
}

/** 词汇表播种（pinax-lexicon@1，create-if-absent）：目录初始化时补默认三段式骨架，已存在绝不覆盖。 */
function seedLexiconFile(root, projectName) {
  const target = path.join(root, LEXICON_FILE_NAME)
  if (fs.existsSync(target)) return false
  writeFileAtomic(target, buildLexiconFile({ project: projectName || '' }))
  return true
}

function writeRegistry(appData, projects) {
  fs.mkdirSync(appData, { recursive: true })
  writeFileAtomic(path.join(appData, 'projects.registry.json'), JSON.stringify({ schema: PROJECT_SPEC, projects }, null, 2) + '\n')
}

function validateProjectPathInput(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) return '路径必须是绝对路径'
  if (rootPath.includes('..')) return '路径不允许包含 ..'
  return null
}

/** Windows/通用文件名消毒：去控制符与非法字符，截断，空则回落占位。 */
export function sanitizeFilename(input, fallback = '未命名') {
  const cleaned = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '')
  return cleaned || fallback
}

/** 本地约束文件 kind：按文件名关键字判类（禁用→forbidden / 文风→style / 备注→note / 其余 rule）。 */
function ruleKindOfName(name) {
  if (/禁用|禁词|黑名单|避雷/u.test(name)) return 'forbidden'
  if (/文风|文笔|风格|语气/u.test(name)) return 'style'
  if (/备注|说明|提示/u.test(name)) return 'note'
  return 'rule'
}

function totalPayloadChars(payload) {
  return JSON.stringify(payload ?? {}).length
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体必须是对象'
  if (payload.domains !== undefined && (!Array.isArray(payload.domains) || !payload.domains.length || payload.domains.some(domain => !['book', 'worldbook', 'logs', 'materials', 'media'].includes(domain)))) return '同步范围无效'
  const book = payload.book
  if (!book || typeof book !== 'object') return '缺少 book 对象'
  if (typeof book.id !== 'string' || !book.id.trim() || book.id.length > 120) return 'book.id 非法'
  if (typeof book.title !== 'string' || !book.title.trim()) return 'book.title 非法'
  if (!Array.isArray(book.chapters) || book.chapters.length > LIMITS.maxChapters) return `chapters 必须是数组且 ≤ ${LIMITS.maxChapters}`
  for (const chapter of book.chapters) {
    if (!chapter || typeof chapter.title !== 'string' || typeof chapter.content !== 'string') return 'chapter 需要 title/content 字符串'
  }
  const explorations = Array.isArray(book.explorations) ? book.explorations : []
  if (explorations.length > LIMITS.maxExplorations) return `explorations ≤ ${LIMITS.maxExplorations}`
  const wb = payload.worldbook
  if (wb !== null && wb !== undefined) {
    if (typeof wb !== 'object' || !Array.isArray(wb.entries) || wb.entries.length > LIMITS.maxEntries) return `worldbook.entries 必须是数组且 ≤ ${LIMITS.maxEntries}`
    for (const entry of wb.entries) {
      if (!entry || typeof entry.content !== 'string' || typeof entry.name !== 'string') return 'entry 需要 name/content 字符串'
    }
  }
  const logs = payload.logs
  if (logs !== undefined && logs !== null && typeof logs !== 'object') return 'logs 非法'
  if (logs) {
    if (!Array.isArray(logs.sessions) || logs.sessions.length > LIMITS.maxSessions) return `logs.sessions ≤ ${LIMITS.maxSessions}`
    for (const session of logs.sessions) {
      if (!session || typeof session !== 'object') return 'session 项非法'
    }
    if (!Array.isArray(logs.revisions) || logs.revisions.length > LIMITS.maxChapters) return 'logs.revisions 非法'
    if (!Array.isArray(logs.memory)) return 'logs.memory 必须是数组'
  }
  const materials = payload.materials
  if (materials !== undefined && materials !== null) {
    if (typeof materials !== 'object' || !Array.isArray(materials.artifacts) || materials.artifacts.length > LIMITS.maxArtifacts) return `materials.artifacts ≤ ${LIMITS.maxArtifacts}`
    for (const artifact of materials.artifacts) {
      if (!artifact || typeof artifact.content !== 'string' || typeof artifact.title !== 'string') return 'artifact 需要 title/content 字符串'
    }
  }
  if (payload.media !== undefined && !Array.isArray(payload.media)) return 'media 必须是数组'
  // W6·C 全量本地化扩展载荷：会话快照（助手/体验会话）与 IndexedDB 资料归档。
  const sessionsPayload = payload.sessions
  if (sessionsPayload !== undefined && sessionsPayload !== null) {
    if (!Array.isArray(sessionsPayload) || sessionsPayload.length > LIMITS.maxSessionPayloads) return `sessions 必须是数组且 ≤ ${LIMITS.maxSessionPayloads}`
    for (const session of sessionsPayload) {
      if (!session || typeof session !== 'object' || Array.isArray(session)) return 'sessions 项必须是对象'
    }
  }
  const sourceArchive = payload.sourceArchive
  if (sourceArchive !== undefined && sourceArchive !== null) {
    if (typeof sourceArchive !== 'object' || Array.isArray(sourceArchive)) return 'sourceArchive 必须是 { docId → { meta, chunks[] } } 对象'
    const docIds = Object.keys(sourceArchive)
    if (docIds.length > LIMITS.maxArchiveDocs) return `sourceArchive 文档数 ≤ ${LIMITS.maxArchiveDocs}`
    for (const [docId, record] of Object.entries(sourceArchive)) {
      if (!docId.trim()) return 'sourceArchive docId 不能为空'
      if (!record || typeof record !== 'object' || Array.isArray(record)) return `sourceArchive[${docId}] 必须是对象`
      if (record.meta !== undefined && record.meta !== null && (typeof record.meta !== 'object' || Array.isArray(record.meta))) return `sourceArchive[${docId}].meta 必须是对象`
      if (!Array.isArray(record.chunks)) return `sourceArchive[${docId}].chunks 必须是数组`
    }
  }
  if (totalPayloadChars(payload) > LIMITS.maxTotalChars) return `payload 超过 ${LIMITS.maxTotalChars} 字符`
  return null
}

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`)
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, filePath)
}

function outlineMarkdown(book) {
  const nodes = Array.isArray(book.outline?.nodes) ? book.outline.nodes : []
  const edges = Array.isArray(book.outline?.edges) ? book.outline.edges : []
  const lines = [`# 《${book.title}》大纲`, '']
  for (const node of nodes) {
    const status = node.status ? `（${node.status}）` : ''
    lines.push(`- ${node.title || node.id}${status}${node.intent ? `：${node.intent}` : ''}`)
  }
  if (edges.length) {
    lines.push('', '## 关系', '')
    const kindLabel = { causes: '导致', foreshadows: '伏笔', alternative: '备选', parallel: '并行' }
    for (const edge of edges) {
      const from = nodes.find((n) => n.id === edge.fromNodeId)?.title || edge.fromNodeId
      const to = nodes.find((n) => n.id === edge.toNodeId)?.title || edge.toNodeId
      lines.push(`- ${from} —${kindLabel[edge.kind] || edge.kind}→ ${to}`)
    }
  }
  return lines.join('\n') + '\n'
}

// ── 世界书文件契约 v2 ─────────────────────────────────────────────────────────
// 格式 canonical = shared/worldbookFileContract.js（W1·A1）：frontmatter 排布（引号/块标量/
// JSON 转义舱）、index.json 指针账本、worldbook-graph@1 图账本、体系标准骨架件全部随契约。
// 本节只保留服务层职责：
// ① 运行时条目形状 ↔ 契约条目形状双向投影——运行时 relations 是对象桶
//   {tags,locations,characters,events,placeIds,characterIds}（worldbookContextBuilder 消费）
//   + relationsRich 富关系数组 + metadata；契约 relations 是富关系边数组。桶派生边以
//   src:'entry' 保留字标记，读回时精确还原为桶（真富关系不受影响）；metadata 借道 extra
//   往返。id 缺省回落 name、cat 缺省回落落位目录（最小条目可写、「读回 cat 指向落位目录」）。
// ② 写盘路径分配（cat 目录 + 与契约 sanitize 同规则 + 同 cat 去重），index/graph 指针按
//   分配校正——命名冲突角落里指针仍与磁盘一致。
// ③ 同步确定性：index.updated 固定取条目 updatedAt 最大值、graph built_at 固定 ''——世界书
//   文件零 wall-clock，双跑逐字节幂等（kit 重建 graph 时自填 built_at）。
// graph 边语义随契约（kit 同构，kit 重建 graph.json 与 Pinax 写出一致）：links（含富关系目标
// 并入）= src:link weight2 + mention + tag；富关系权重/类型保存在 frontmatter relations 块
// （往返无损），不再展开为 graph 的 declared 边。

export { WORLDBOOK_FILE_SCHEMA_VERSION, parseWorldbookGraphFile, buildWorldbookAuxFiles }

const WORLDBOOK_CAT_DIRS = { character: '人物', location: '地理', organization: '势力', event: '编年', source: '资料' }
const WORLDBOOK_DEFAULT_CAT_DIR = '设定'
/** 体系标准骨架件（读回时按结构文件跳过，不当作条目解析）。 */
const WORLDBOOK_AUX_SKIP = ['纪律.md', '伏笔/台账.md', '底牌/暗线底牌.md', '编年/章账.md']
/** 运行时桶派生边的 src 保留字（读回时据此还原为 relations 对象桶；真富关系不用该值）。 */
const WORLDBOOK_DERIVED_SRC = 'entry'

function worldbookIsPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function worldbookStringList(value) {
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : String(item ?? ''))) : []
}

function worldbookEntriesOf(worldbook) {
  return Array.isArray(worldbook?.entries) ? worldbook.entries : []
}

function worldbookEntryKind(entry) {
  return String(entry?.kind ?? entry?.type ?? 'general') || 'general'
}

function worldbookCatDir(entry) {
  return WORLDBOOK_CAT_DIRS[worldbookEntryKind(entry)] || WORLDBOOK_DEFAULT_CAT_DIR
}

/** 与契约 sanitizeFilename 同规则（契约未导出；index/graph 指针路径与磁盘落点必须一致）。 */
function worldbookFilename(name) {
  let s = String(name ?? '').replace(/[\\/:*?"<>|]/g, '').replace(/[\x00-\x1f\x7f]/g, '')
  s = s.replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`
  if (!s) s = 'untitled'
  return s.slice(0, 80)
}

/** 运行时条目 → 契约条目（写侧投影）：relations 对象桶派生为 src:'entry' 边并与 relationsRich
 *  合成富关系边数组（已是数组的原样透传）；metadata 借道 extra；id 缺省回落 name；
 *  cat 缺省回落落位目录。 */
function runtimeEntryToContract(entry) {
  const out = { ...(worldbookIsPlainObject(entry) ? entry : {}) }
  const rich = Array.isArray(out.relationsRich) ? out.relationsRich.filter((rel) => worldbookIsPlainObject(rel)) : []
  let edges = []
  if (Array.isArray(out.relations)) {
    edges = out.relations
  } else if (worldbookIsPlainObject(out.relations)) {
    const seen = new Set(rich.map((rel) => `${String(rel.type ?? '')}\u0000${String(rel.to ?? '').trim()}`))
    edges = []
    for (const [bucket, type] of [['locations', 'location'], ['placeIds', 'location'], ['characters', 'character'], ['characterIds', 'character'], ['events', 'event']]) {
      for (const item of worldbookStringList(out.relations[bucket])) {
        const to = item.trim()
        const key = `${type}\u0000${to}`
        if (!to || seen.has(key)) continue
        seen.add(key)
        edges.push({ to, type, weight: 2, src: WORLDBOOK_DERIVED_SRC })
      }
    }
  }
  const runtimeRelations = worldbookIsPlainObject(out.relations) ? Object.fromEntries(Object.entries(out.relations).filter(([key]) => !['locations', 'placeIds', 'characters', 'characterIds', 'events'].includes(key))) : null
  out.relations = [...rich, ...edges]
  delete out.relationsRich
  const extra = worldbookIsPlainObject(out.extra) ? { ...out.extra } : {}
  if (runtimeRelations && Object.keys(runtimeRelations).length) extra.pinaxRelationExtensions = runtimeRelations
  if (worldbookIsPlainObject(out.metadata) && Object.keys(out.metadata).length) extra.metadata = out.metadata
  delete out.metadata
  if (Object.keys(extra).length) out.extra = extra
  else delete out.extra
  if (out.id === undefined || out.id === null || String(out.id).trim() === '') out.id = out.name ?? ''
  if (!worldbookStringList(out.cat).length) out.cat = [worldbookCatDir(out)]
  return out
}

/** worldbook → 契约 builder 输入视图（entries 逐条投影；name 等其余字段原样）。 */
function worldbookContractView(worldbook) {
  return { ...worldbook, entries: worldbookEntriesOf(worldbook).map(runtimeEntryToContract) }
}

/** 契约条目 → 运行时条目（读侧投影 = A2 读回形状）：src:'entry' 派生边还原为对象桶
 *  （placeIds/characterIds 归并 locations/characters），其余为 relationsRich；metadata/extra
 *  还位；空 profile/extra/version 等不产出键。 */
function contractEntryToRuntime(parsed) {
  const tags = worldbookStringList(parsed.tags)
  const rich = []
  const buckets = { locations: [], characters: [], events: [] }
  const bucketOf = { location: 'locations', character: 'characters', event: 'events' }
  for (const rel of Array.isArray(parsed.relations) ? parsed.relations : []) {
    if (!worldbookIsPlainObject(rel)) continue
    if (rel.src === WORLDBOOK_DERIVED_SRC) {
      const to = String(rel.to ?? '').trim()
      const bucket = bucketOf[String(rel.type ?? '')]
      if (bucket && to && !buckets[bucket].includes(to)) buckets[bucket].push(to)
      continue
    }
    rich.push(rel)
  }
  const entry = {
    id: String(parsed.id ?? ''),
    name: String(parsed.name ?? ''),
    type: String(parsed.type ?? '') || String(parsed.kind ?? '') || 'general',
    keys: worldbookStringList(parsed.keys),
    keysSecondary: worldbookStringList(parsed.keysSecondary),
    content: typeof parsed.content === 'string' ? parsed.content : String(parsed.content ?? '')
  }
  if (parsed.kind) entry.kind = parsed.kind
  entry.status = String(parsed.status ?? '') || 'active'
  entry.tags = tags
  entry.links = worldbookStringList(parsed.links)
  entry.cat = worldbookStringList(parsed.cat)
  if (parsed.version !== undefined && parsed.version !== '') entry.version = parsed.version
  if (parsed.summary) entry.summary = parsed.summary
  entry.sourceRefs = worldbookStringList(parsed.sourceRefs)
  if (parsed.updatedAt) entry.updatedAt = parsed.updatedAt
  if (worldbookIsPlainObject(parsed.injection) && Object.keys(parsed.injection).length) entry.injection = parsed.injection
  if (worldbookIsPlainObject(parsed.profile) && Object.keys(parsed.profile).length) entry.profile = parsed.profile
  entry.relations = { tags: tags.slice(), ...buckets }
  if (rich.length) entry.relationsRich = rich
  const extra = worldbookIsPlainObject(parsed.extra) ? { ...parsed.extra } : {}
  if (worldbookIsPlainObject(extra.pinaxRelationExtensions)) { Object.assign(entry.relations, extra.pinaxRelationExtensions); delete extra.pinaxRelationExtensions }
  if (extra.metadata !== undefined) {
    entry.metadata = extra.metadata
    delete extra.metadata
  }
  if (Object.keys(extra).length) entry.extra = extra
  return entry
}

/** 运行时条目 → md 全文（格式随契约；worldbookName 语义随契约：非空时写入 worldbook 键）。 */
export function serializeWorldbookEntryFile(entry, options = {}) {
  return contractSerializeEntryFile(runtimeEntryToContract(entry), options)
}

/** md 全文 → 运行时条目。ok:false 原样透传契约错误码（MISSING_FRONTMATTER/MISSING_ID/…）。 */
export function parseWorldbookEntryFile(text) {
  const parsed = contractParseEntryFile(String(text ?? '').replace(/\r\n/g, '\n'))
  if (!parsed.ok) return parsed
  return { ok: true, entry: contractEntryToRuntime(parsed.entry) }
}

/** cat 目录 + 去重文件名分配（写盘与指针共用的唯一路径真源）。 */
function worldbookAllocateFiles(worldbook) {
  const used = new Map()
  return worldbookEntriesOf(worldbook).map((entry) => {
    const cat = worldbookCatDir(entry)
    const taken = used.get(cat) ?? new Set()
    used.set(cat, taken)
    const base = worldbookFilename(entry?.name)
    let file = `${base}.md`
    for (let n = 2; taken.has(file); n += 1) file = `${base}-${n}.md`
    taken.add(file)
    return { entry, cat, file, relFile: `世界书/${cat}/${file}` }
  })
}

/** 分配路径查找（index 指针 / graph 节点按 id、名称对号）。 */
function worldbookAllocatedFileLookup(allocations) {
  const byId = new Map()
  const byName = new Map()
  for (const { entry, relFile } of allocations) {
    const id = String(entry?.id ?? '')
    const name = String(entry?.name ?? '')
    if (id && !byId.has(id)) byId.set(id, relFile)
    if (name && !byName.has(name)) byName.set(name, relFile)
  }
  return (record) => byId.get(String(record?.id ?? '')) ?? byName.get(String(record?.title ?? '')) ?? null
}

/** kit index.json 指针账本（形状随契约）；指针路径按写盘分配校正，updated 固定取条目
 *  updatedAt 最大值——零 wall-clock，双跑逐字节一致。 */
export function buildWorldbookIndexFile(worldbook) {
  const allocations = worldbookAllocateFiles(worldbook)
  const index = contractBuildIndexFile(worldbookContractView(worldbook))
  const lookup = worldbookAllocatedFileLookup(allocations)
  for (const section of Array.isArray(index.sections) ? index.sections : []) {
    if (!Array.isArray(section?.entries)) continue
    section.entries = section.entries.map((pointer) => {
      const file = lookup(pointer)
      return file ? { ...pointer, file } : pointer
    })
  }
  const updated = allocations.map(({ entry }) => String(entry?.updatedAt ?? '')).filter(Boolean).sort().at(-1) ?? ''
  return { ...index, updated }
}

/** worldbook-graph@1（形状随契约，kit 同构）；entries 投影后富关系目标并入 links 声明边，
 *  指针路径按写盘分配校正，built_at 固定 ''（kit 重建时自填）——同步产物逐字节幂等。 */
export function buildWorldbookGraphFile(worldbook) {
  const allocations = worldbookAllocateFiles(worldbook)
  const view = worldbookContractView(worldbook)
  const input = worldbookIsPlainObject(view) && Object.prototype.hasOwnProperty.call(view, 'builtAt') ? view : { ...view, builtAt: '' }
  const graph = contractBuildGraphFile(input)
  const lookup = worldbookAllocatedFileLookup(allocations)
  graph.entries = graph.entries.map((node) => {
    const file = lookup(node)
    return file ? { ...node, path: file } : node
  })
  return graph
}

// ── 世界书文件契约 v2 结束 ───────────────────────────────────────────────────

function writeDeduped(dir, base, content, usedNames, ext = '.md') {
  let name = `${base}${ext}`
  for (let n = 2; usedNames.has(name); n += 1) name = `${base}-${n}${ext}`
  usedNames.add(name)
  writeFileAtomic(path.join(dir, name), content)
  return name
}

function conversationMarkdown(projectId, conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages.slice(-LIMITS.maxConversationMessages) : []
  const lines = [`# 助手对话 ${projectId}`, '']
  for (const message of messages) {
    const who = message.role === 'user' ? '作者' : message.role === 'assistant' ? '助手' : (message.role || '系统')
    lines.push(`## ${who}${message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString('zh-CN')}` : ''}`, '', String(message.content ?? '').slice(0, 8000), '')
  }
  return lines.join('\n')
}

/**
 * 把一个项目的文件体系写入 root 下。返回 { dir, counts }。
 * 先生成待提交文件，再由 localMirrorTransaction 校验版本和文件指纹并提交；中断可恢复旧树。
 */
export function createLocalMirrorService({ rootPath, appDataPath, now = () => new Date().toISOString() } = {}) {
  function resolveRoot() {
    const root = rootPath || resolveMirrorRoot()
    fs.mkdirSync(root, { recursive: true })
    return root
  }

  function resolveAppDataDir() {
    const appData = appDataPath || resolveAppData()
    fs.mkdirSync(appData, { recursive: true })
    return appData
  }

  const registryKeyOf = (rootPath) => path.resolve(rootPath).toLowerCase()

  function upsertRegistry(entry) {
    const appData = resolveAppDataDir()
    const projects = readRegistry(appData).filter((item) => registryKeyOf(item.rootPath) !== registryKeyOf(entry.rootPath))
    projects.push(entry)
    writeRegistry(appData, projects)
    return entry
  }

  /** 在任意位置创建项目文件夹（Obsidian 建库）：空目录 + marker + kind 模板目录，并登记注册表。
   *  path 缺省时回落 <mirrorRoot>/<name>——「全部都是本地项目」的服务端兜底。 */
  function createProjectAt({ rootPath, path: pathInput, name, kind = 'novel', bookId = null }) {
    const fallbackRoot = path.join(resolveRoot(), sanitizeFilename(name || '未命名项目'))
    const target = rootPath || pathInput || fallbackRoot
    const invalid = validateProjectPathInput(target)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    if (!KIND_TEMPLATES[kind]) throw Object.assign(new Error(`未知项目类型 ${kind}（可用：${Object.keys(KIND_TEMPLATES).join('/')}）`), { code: 'ERR_INVALID_INPUT' })
    if (typeof name !== 'string' || !name.trim()) throw Object.assign(new Error('name 必填'), { code: 'ERR_INVALID_INPUT' })
    const root = path.resolve(target)
    const exists = fs.existsSync(root)
    if (exists && fs.readdirSync(root).length > 0) throw Object.assign(new Error('目标目录非空——创建项目需要空目录（打开已有项目用 /projects/open）'), { code: 'ERR_DIR_NOT_EMPTY' })
    fs.mkdirSync(root, { recursive: true })
    const projectId = `proj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const manifest = { schemaVersion: 1, spec: PROJECT_SPEC, projectId, name: sanitizeFilename(name), kind, createdAt: now(), updatedAt: now() }
    writeFileAtomic(path.join(root, '.pinax', 'project.json'), JSON.stringify(manifest, null, 2) + '\n')
    for (const dir of KIND_TEMPLATES[kind]) fs.mkdirSync(path.join(root, dir), { recursive: true })
    seedLexiconFile(root, manifest.name)
    return { manifest, entry: upsertRegistry({ projectId, bookId, name: manifest.name, kind, rootPath: root, lastOpenedAt: now(), lastSyncAt: null }) }
  }

  /** 打开已有项目文件夹：校验 marker 并登记/刷新注册表。 */
  function openProjectAt({ rootPath, path: pathInput, bookId = null }) {
    const target = rootPath || pathInput
    const invalid = validateProjectPathInput(target)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const root = path.resolve(target)
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(root, '.pinax', 'project.json'), 'utf-8'))
    } catch {
      throw Object.assign(new Error('目标目录不是 pinax 项目（缺少 .pinax/project.json）——可改用 /projects/create 创建'), { code: 'ERR_NOT_A_PROJECT' })
    }
    if (manifest.spec !== PROJECT_SPEC) throw Object.assign(new Error(`项目范式 ${manifest.spec} 与当前支持 ${PROJECT_SPEC} 不匹配`), { code: 'ERR_SPEC_MISMATCH' })
    const existing = readRegistry(resolveAppDataDir()).find((item) => registryKeyOf(item.rootPath) === registryKeyOf(root))
    const entry = upsertRegistry({
      projectId: manifest.projectId, bookId: bookId ?? existing?.bookId ?? null,
      name: manifest.name, kind: manifest.kind || 'generic', rootPath: root, lastOpenedAt: now(),
      lastSyncAt: existing?.lastSyncAt ?? null
    })
    return { manifest, entry }
  }

  function listProjects() {
    return readRegistry(resolveAppDataDir())
  }

  /** 改注册表绑定（bookId=null 解绑）；不动磁盘。 */
  function setProjectBinding({ projectId, rootPath, bookId }) {
    const appData = resolveAppDataDir()
    const projects = readRegistry(appData)
    const target = projects.find((item) => (projectId ? item.projectId === projectId : registryKeyOf(item.rootPath) === registryKeyOf(String(rootPath || ''))))
    if (!target) throw Object.assign(new Error('注册表中没有这个项目'), { code: 'ERR_PROJECT_NOT_FOUND' })
    target.bookId = bookId ?? null
    writeRegistry(appData, projects)
    return target
  }

  /** 从注册表移除条目（磁盘项目文件夹不动）。 */
  function removeProjectEntry({ projectId, rootPath }) {
    const appData = resolveAppDataDir()
    const projects = readRegistry(appData)
    const next = projects.filter((item) => !(projectId ? item.projectId === projectId : registryKeyOf(item.rootPath) === registryKeyOf(String(rootPath || ''))))
    if (next.length === projects.length) throw Object.assign(new Error('注册表中没有这个项目'), { code: 'ERR_PROJECT_NOT_FOUND' })
    writeRegistry(appData, next)
  }

  /** 编辑项目属性（name/kind）：同步 .pinax/project.json marker 与注册表。 */
  function updateProjectAt({ projectId, rootPath, name, kind }) {
    const appData = resolveAppDataDir()
    const projects = readRegistry(appData)
    const target = projects.find((item) => (projectId ? item.projectId === projectId : registryKeyOf(item.rootPath) === registryKeyOf(String(rootPath || ''))))
    if (!target) throw Object.assign(new Error('注册表中没有这个项目'), { code: 'ERR_PROJECT_NOT_FOUND' })
    if (kind !== undefined && !KIND_TEMPLATES[kind]) throw Object.assign(new Error(`未知项目类型 ${kind}`), { code: 'ERR_INVALID_INPUT' })
    const markerPath = path.join(target.rootPath, '.pinax', 'project.json')
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
    } catch {
      throw Object.assign(new Error('项目 marker 缺失或损坏，无法更新'), { code: 'ERR_NOT_A_PROJECT' })
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) throw Object.assign(new Error('name 非法'), { code: 'ERR_INVALID_INPUT' })
      manifest.name = sanitizeFilename(name)
      target.name = manifest.name
    }
    if (kind !== undefined) {
      manifest.kind = kind
      target.kind = kind
    }
    manifest.updatedAt = now()
    writeFileAtomic(markerPath, JSON.stringify(manifest, null, 2) + '\n')
    writeRegistry(appData, projects)
    return target
  }

  /** 同步落点：bookId 在注册表绑定过的项目根优先，否则回落文档根（旧行为兼容）。 */
  function resolveBookDir(book) {
    const entry = readRegistry(resolveAppDataDir()).find((item) => item.bookId === book.id && fs.existsSync(item.rootPath))
    if (entry) return { dir: entry.rootPath, projectRoot: entry.rootPath, kind: KIND_TEMPLATES[entry.kind] ? entry.kind : 'novel' }
    return {
      dir: path.join(resolveRoot(), `${sanitizeFilename(book.title)}-${String(book.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(-8)}`),
      projectRoot: null,
      kind: 'novel'
    }
  }

  function renderMirror(payload, located, dir) {
    const error = validatePayload(payload)
    if (error) throw Object.assign(new Error(error), { code: 'ERR_INVALID_INPUT' })
    const book = payload.book
    fs.mkdirSync(dir, { recursive: true })
    // 范式目录保留：同步只重写内容，kind 模板目录（可能为空）必须存在
    for (const templateDir of KIND_TEMPLATES[located.kind] ?? []) fs.mkdirSync(path.join(dir, templateDir), { recursive: true })

    const usedChapterNames = new Set()
    book.chapters.forEach((chapter, index) => {
      const base = `${String(index + 1).padStart(3, '0')}-${sanitizeFilename(chapter.title)}`
      writeDeduped(path.join(dir, '正文'), base, `${chapter.content}\n`, usedChapterNames)
    })

    writeFileAtomic(path.join(dir, '大纲', '大纲.md'), outlineMarkdown(book))
    writeFileAtomic(path.join(dir, '大纲', 'outline.json'), JSON.stringify({ nodes: book.outline?.nodes ?? [], edges: book.outline?.edges ?? [] }, null, 2) + '\n')

    const wb = payload.worldbook
    let entryCount = 0
    if (wb) {
      // 契约 v2 布局：条目 → 世界书/<cat>/<name>.md（cat 目录映射 + 同 cat 去重），
      // 确定性重建 index.json / graph.json，manifest.json 保留（旧消费方兼容），
      // 体系标准骨架件幂等补齐（同步整删后必缺，本地手改过的骨架不覆盖）。
      const wbDir = path.join(dir, '世界书')
      const allocations = worldbookAllocateFiles(wb)
      for (const { entry, cat, file } of allocations) {
        writeFileAtomic(path.join(wbDir, cat, file), serializeWorldbookEntryFile(entry))
        entryCount += 1
      }
      writeFileAtomic(path.join(wbDir, 'index.json'), JSON.stringify(buildWorldbookIndexFile(wb), null, 2) + '\n')
      writeFileAtomic(path.join(wbDir, 'graph.json'), JSON.stringify(buildWorldbookGraphFile(wb), null, 2) + '\n')
      writeFileAtomic(path.join(wbDir, 'manifest.json'), JSON.stringify({
        worldbookId: wb.id || null,
        name: wb.name || '',
        worldDescription: wb.worldDescription || '',
        writingStyle: wb.writingStyle || '',
        forbidden: wb.forbidden || '',
        groups: wb.groups ?? [],
        entryCount,
        entries: wb.entries.map((entry) => ({ name: entry.name, type: entry.type || 'general', group: entry.group || '', keys: entry.keys ?? [] }))
      }, null, 2) + '\n')
      ensureWorldbookAuxFiles(wbDir)
    }

    for (const doc of Array.isArray(book.explorations) ? book.explorations : []) {
      writeDeduped(path.join(dir, '构思'), sanitizeFilename(doc.title), `${doc.content}\n`, new Set())
    }

    const logs = payload.logs ?? {}
    const usedSessionNames = new Set()
    let sessionCount = 0
    for (const session of Array.isArray(logs.sessions) ? logs.sessions : []) {
      writeDeduped(path.join(dir, '日志', '体验会话'), sanitizeFilename(session.title || session.id || '会话'), `${JSON.stringify(session, null, 2)}\n`, usedSessionNames, '.json')
      sessionCount += 1
    }
    const usedRevisionNames = new Set()
    let revisionCount = 0
    for (const revision of Array.isArray(logs.revisions) ? logs.revisions : []) {
      writeDeduped(path.join(dir, '日志', '修订史'), sanitizeFilename(revision.chapterTitle || revision.chapterId || '章节'), `${JSON.stringify({
        chapterId: revision.chapterId,
        chapterTitle: revision.chapterTitle || '',
        snapshots: (revision.snapshots ?? []).map((snapshot) => ({ ...snapshot, markdown: String(snapshot.markdown ?? '').slice(0, LIMITS.maxRevisionChars) })),
        blockHistory: (revision.blockHistory ?? []).slice(0, LIMITS.maxBlockHistoryPerChapter)
      }, null, 2)}\n`, usedRevisionNames, '.json')
      revisionCount += 1
    }
    const usedConversationNames = new Set()
    let conversationCount = 0
    for (const conversation of Array.isArray(logs.conversations) ? logs.conversations : []) {
      writeDeduped(path.join(dir, '日志', '助手对话'), sanitizeFilename(conversation.projectId || '项目'), conversationMarkdown(conversation.projectId, conversation), usedConversationNames)
      conversationCount += 1
    }
    // W6·C 会话快照：payload.sessions（助手/体验会话原样）→ 日志/会话-<bookId>.json 单文件。
    let sessionFileCount = 0
    if (Array.isArray(payload.sessions) && payload.sessions.length) {
      writeFileAtomic(path.join(dir, '日志', `会话-${sanitizeFilename(book.id)}.json`), JSON.stringify({
        bookId: book.id,
        count: payload.sessions.length,
        sessions: payload.sessions
      }, null, 2) + '\n')
      sessionFileCount = 1
    }
    if (Array.isArray(logs.memory)) {
      writeFileAtomic(path.join(dir, '日志', '记忆台账.json'), JSON.stringify({
        count: logs.memory.length,
        byStatus: logs.memory.reduce((acc, candidate) => ({ ...acc, [candidate.status || 'unknown']: (acc[candidate.status || 'unknown'] || 0) + 1 }), {}),
        candidates: logs.memory
      }, null, 2) + '\n')
    }

    const materials = payload.materials
    let artifactCount = 0
    if (materials && Array.isArray(materials.artifacts) && materials.artifacts.length) {
      const usedArtifactNames = new Set()
      const index = []
      for (const artifact of materials.artifacts) {
        const base = `${artifact.ref || artifact.id || 'S'}-${sanitizeFilename(artifact.title)}`
        const name = writeDeduped(path.join(dir, '资料'), base, `${artifact.content}\n`, usedArtifactNames)
        index.push({ ref: artifact.ref || artifact.id || '', title: artifact.title, kind: artifact.kind || 'reference-text', file: name, chars: artifact.content.length })
        artifactCount += 1
      }
      writeFileAtomic(path.join(dir, '资料', 'sources.json'), JSON.stringify({ count: artifactCount, artifacts: index }, null, 2) + '\n')
    }

    // W6·C 资料归档文件化：payload.sourceArchive（IndexedDB pinax-source-archive 快照，
    // { docId → { meta, chunks[] } }）→ 资料/归档/<docId>.json 逐文档一份（meta=归档 artifact
    // 记录，chunks=SourceChunk 记录数组；docId 写进文件内容，文件名只作消毒落点，重名追加 -n）。
    let archiveDocCount = 0
    if (payload.sourceArchive && typeof payload.sourceArchive === 'object') {
      const usedDocNames = new Set()
      for (const [docId, record] of Object.entries(payload.sourceArchive)) {
        const safeDoc = sanitizeFilename(docId, '归档')
        let fileName = `${safeDoc}.json`
        for (let n = 2; usedDocNames.has(fileName); n += 1) fileName = `${safeDoc}-${n}.json`
        usedDocNames.add(fileName)
        writeFileAtomic(path.join(dir, '资料', '归档', fileName), JSON.stringify({
          docId,
          meta: record.meta ?? null,
          chunks: Array.isArray(record.chunks) ? record.chunks : []
        }, null, 2) + '\n')
        archiveDocCount += 1
      }
    }

    if (Array.isArray(payload.media) && payload.media.length) {
      writeFileAtomic(path.join(dir, '媒体清单.json'), JSON.stringify({ count: payload.media.length, assets: payload.media }, null, 2) + '\n')
    }

    const counts = {
      chapters: book.chapters.length,
      entries: entryCount,
      explorations: Array.isArray(book.explorations) ? book.explorations.length : 0,
      sessions: sessionCount,
      revisions: revisionCount,
      conversations: conversationCount,
      sessionFiles: sessionFileCount,
      artifacts: artifactCount,
      archiveDocs: archiveDocCount,
      media: Array.isArray(payload.media) ? payload.media.length : 0
    }
    writeFileAtomic(path.join(dir, 'meta.json'), JSON.stringify({ schema: MIRROR_SCHEMA, bookId: book.id, title: book.title, mirroredAt: now(), ...counts }, null, 2) + '\n')
    return { dir: located.dir, counts, projectRoot: located.projectRoot }
  }

  function readSyncState(bookId) {
    const entry = listProjects().find(item => String(item.bookId) === String(bookId))
    if (!entry) return { revision: 0 }
    recoverMirrorTransaction(entry.rootPath)
    const file = path.join(entry.rootPath, '.pinax', 'sync-manifest.json')
    return fs.existsSync(file) ? { revision: JSON.parse(fs.readFileSync(file, 'utf8')).revision } : { revision: 0 }
  }

  function mirrorBook(payload) {
    const error = validatePayload(payload)
    if (error) throw Object.assign(new Error(error), { code: 'ERR_INVALID_INPUT' })
    const located = resolveBookDir(payload.book)
    const result = commitMirrorTransaction({ dir: located.dir, payload, render: dir => renderMirror(payload, located, dir) })
    // 词汇表播种必须在事务提交之后落真实目录：renderMirror 写进 generated 临时壳，
    // 换壳只搬运 emitted 托管清单——词表是用户手改文件，不入托管清单（否则手改被
    // ERR_LOCAL_EDIT 拦截），只能在 rename 换壳后 create-if-absent。
    seedLexiconFile(located.dir, payload.book?.title || '')
    return { ...result, worldbookFingerprint: mirrorDomainFingerprint(path.join(located.dir, '世界书')) }
  }

  /** 应用侧项目索引：<appData>/index.json（注册表旁，不在项目文件夹内）。 */
  function writeProjectIndex(books) {
    const appData = resolveAppDataDir()
    const entries = (Array.isArray(books) ? books : []).map((book) => ({
      id: book.id,
      title: book.title,
      chapters: book.chapters ?? 0,
      words: book.words ?? 0,
      entries: book.entries ?? 0,
      updatedAt: book.updatedAt ?? null,
      mirroredAt: book.mirroredAt ?? null,
      dir: book.dir ?? null
    }))
    const file = path.join(appData, 'index.json')
    writeFileAtomic(file, JSON.stringify({ schema: MIRROR_SCHEMA, generatedAt: now(), projects: entries }, null, 2) + '\n')
    return file
  }

  /** 盘符枚举（Windows）：C:-Z 存在性探测。 */
  function listDrives() {
    const drives = []
    for (let code = 65; code <= 90; code += 1) {
      const letter = `${String.fromCharCode(code)}:\\`
      try { if (fs.existsSync(letter)) drives.push({ name: letter, hasPinax: false }) } catch { /* 探测失败跳过 */ }
    }
    return drives
  }

  /** 浏览目录（内置文件夹浏览器数据源）：空路径 → 盘符 + 常用位置；否则列子目录 + 是否 pinax 项目 + 顶层书稿计数。 */
  function browseDirectories(rootPath) {
    if (!rootPath || !String(rootPath).trim()) {
      const home = os.homedir()
      const quick = []
      for (const [name, dir] of [['文档', path.join(home, 'Documents')], ['桌面', path.join(home, 'Desktop')], ['下载', path.join(home, 'Downloads')]]) {
        if (fs.existsSync(dir)) quick.push({ name, path: dir })
      }
      return { drives: listDrives(), quick, home }
    }
    const invalid = validateProjectPathInput(rootPath)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const dir = path.resolve(rootPath)
    if (!fs.existsSync(dir)) throw Object.assign(new Error('目录不存在'), { code: 'ERR_DIR_NOT_FOUND' })
    const stat = fs.statSync(dir)
    if (!stat.isDirectory()) throw Object.assign(new Error('目标不是文件夹'), { code: 'ERR_INVALID_INPUT' })
    const parent = path.dirname(dir)
    const directories = []
    let bookFiles = 0
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        const hasPinax = fs.existsSync(path.join(dir, entry.name, '.pinax', 'project.json'))
        directories.push({ name: entry.name, hasPinax })
        continue
      }
      if (/\.(?:txt|md|markdown)$/iu.test(entry.name) && !fs.existsSync(path.join(dir, '.pinax', 'project.json'))) bookFiles += 1
    }
    directories.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    return { path: dir, parent: dir !== path.parse(dir).root ? parent : null, directories, bookFiles, isProject: fs.existsSync(path.join(dir, '.pinax', 'project.json')) }
  }

  /** 新建文件夹（浏览器内建能力）：父目录下按消毒名创建。 */
  function createDirectory(parentPath, name) {
    const invalid = validateProjectPathInput(parentPath)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const parent = path.resolve(parentPath)
    if (!fs.existsSync(parent)) throw Object.assign(new Error('父目录不存在'), { code: 'ERR_DIR_NOT_FOUND' })
    const safe = sanitizeFilename(name, '新建文件夹')
    const target = path.join(parent, safe)
    if (fs.existsSync(target)) throw Object.assign(new Error('同名文件夹已存在'), { code: 'ERR_DIR_NOT_EMPTY' })
    fs.mkdirSync(target)
    return target
  }

  /** 反向导入数据源：读项目文件夹 正文/*.md 章节（文件名=章节名；utf-8；单文件 ≤1MB；≤500 章）。 */
  function readProjectChapters(rootPath) {
    const invalid = validateProjectPathInput(rootPath)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const dir = path.resolve(rootPath)
    const manuscriptDir = path.join(dir, '正文')
    if (!fs.existsSync(manuscriptDir)) return { chapters: [] }
    const files = fs.readdirSync(manuscriptDir)
      .filter((name) => /\.(?:md|txt)$/iu.test(name))
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
      .slice(0, 500)
    const chapters = []
    for (const name of files) {
      const file = path.join(manuscriptDir, name)
      if (fs.statSync(file).size > 1024 * 1024) continue
      const content = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n').trim()
      if (!content) continue
      chapters.push({ title: name.replace(/\.(?:md|txt)$/iu, '').replace(/^\d+-/, '').trim() || `章节 ${chapters.length + 1}`, content })
    }
    return { chapters }
  }

  /** JSON 文件存在则解析返回，缺失/损坏返回 null（读侧容错，不整批失败）。 */
  function readJsonIfExists(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { return null }
  }

  /** 书读回（W6·C 全量本地化读侧）：从项目文件夹组装 book——.pinax/project.json 元数据 +
   *  正文/*.md 逐章（复用 readProjectChapters 的解析规则）+ 大纲/outline.json + 构思/*.md。
   *  bookId 取注册表绑定（registryKeyOf 匹配），无绑定时回落 manifest.projectId（此时不可
   *  直接写回 writing_books，由前端按 warnings 提示先绑定）。容忍非项目文件夹（warning）。 */
  function readBookFromFolder(absDir) {
    const invalid = validateProjectPathInput(absDir)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const root = path.resolve(String(absDir))
    recoverMirrorTransaction(root)
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Object.assign(new Error('目录不存在'), { code: 'ERR_DIR_NOT_FOUND' })
    const warnings = []
    const hasMarker = fs.existsSync(path.join(root, '.pinax', 'project.json'))
    if (!hasMarker) warnings.push('.pinax/project.json 缺失——不是 pinax 项目文件夹，按普通目录读取')
    const manifest = hasMarker ? readJsonIfExists(path.join(root, '.pinax', 'project.json')) : null
    if (hasMarker && !manifest) warnings.push('.pinax/project.json 解析失败——元数据缺失')
    const entry = readRegistry(resolveAppDataDir()).find((item) => registryKeyOf(item.rootPath) === registryKeyOf(root)) || null
    if (manifest && !entry) warnings.push('项目未在注册表登记（或未绑定 bookId）——读回 id 使用 projectId 占位')
    const manuscript = readProjectChapters(root)
    const outlineRaw = readJsonIfExists(path.join(root, '大纲', 'outline.json'))
    const outline = {
      nodes: Array.isArray(outlineRaw?.nodes) ? outlineRaw.nodes : [],
      edges: Array.isArray(outlineRaw?.edges) ? outlineRaw.edges : []
    }
    if (fs.existsSync(path.join(root, '大纲', '大纲.md')) && !outline.nodes.length) warnings.push('大纲/outline.json 缺失——大纲节点为空（仅 大纲.md 概览不可结构化读回）')
    const explorations = []
    const ideasDir = path.join(root, '构思')
    if (fs.existsSync(ideasDir)) {
      const files = fs.readdirSync(ideasDir)
        .filter((name) => /\.(?:md|txt)$/iu.test(name))
        .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
        .slice(0, LIMITS.maxExplorations)
      for (const name of files) {
        const file = path.join(ideasDir, name)
        if (fs.statSync(file).size > 1024 * 1024) continue
        const content = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n').trim()
        if (!content) continue
        const title = name.replace(/\.(?:md|txt)$/iu, '').trim() || `构思 ${explorations.length + 1}`
        explorations.push({ id: title, title, content })
      }
    }
    const book = {
      id: String(entry?.bookId || manifest?.projectId || ''),
      title: String(manifest?.name || path.basename(root)),
      kind: KIND_TEMPLATES[manifest?.kind] ? manifest.kind : 'novel',
      chapters: manuscript.chapters,
      outline,
      explorations,
      projectRoot: root,
      createdAt: manifest?.createdAt ?? null,
      updatedAt: manifest?.updatedAt ?? null,
      lastSyncAt: entry?.lastSyncAt ?? null
    }
    return { ok: true, book, warnings }
  }

  /** 资料归档读回（W6·C）：读 <root>/资料/归档/*.json（或 root 即 归档 目录），
   *  逐文件返回 { docId, meta, chunks, chunkCount, file }；损坏文件跳过记 warnings。 */
  function listArchivedSources(absDir) {
    const invalid = validateProjectPathInput(absDir)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const base = path.resolve(String(absDir))
    recoverMirrorTransaction(path.basename(base) === "世界书" ? path.dirname(base) : base)
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw Object.assign(new Error('目录不存在'), { code: 'ERR_DIR_NOT_FOUND' })
    const nested = path.join(base, '资料', '归档')
    const archiveDir = fs.existsSync(nested) ? nested : base
    const warnings = []
    const sources = []
    for (const name of fs.readdirSync(archiveDir).sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
      if (!/\.json$/iu.test(name) || name === 'index.json' || name === 'sources.json') continue
      const file = path.join(archiveDir, name)
      let parsed
      try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
      } catch (error) {
        warnings.push(`${name}: 解析失败（${error.message}）`)
        continue
      }
      if (!parsed || typeof parsed !== 'object' || typeof parsed.docId !== 'string' || !parsed.docId.trim()) {
        warnings.push(`${name}: 缺少 docId——不是资料归档文件，跳过`)
        continue
      }
      const chunks = Array.isArray(parsed.chunks) ? parsed.chunks : []
      sources.push({
        docId: parsed.docId,
        meta: parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta) ? parsed.meta : null,
        chunks,
        chunkCount: chunks.length,
        file: name
      })
    }
    if (!sources.length && !warnings.length) warnings.push('归档目录内未找到资料文件（*.json）')
    return { ok: true, sources, warnings, dir: archiveDir }
  }

  /** 体系标准骨架件幂等补齐（契约 §3.1）：已存在的不覆盖（纪律/台账/底牌/章账的本地手改保留）。 */
  function ensureWorldbookAuxFiles(absWbDir, { variant = 'novel' } = {}) {
    const written = []
    for (const [relPath, content] of Object.entries(buildWorldbookAuxFiles({ variant }))) {
      const target = path.join(absWbDir, relPath)
      if (fs.existsSync(target)) continue
      writeFileAtomic(target, content)
      written.push(relPath)
    }
    return { written }
  }

  function readWorldbookManifestSnapshot(wbDir) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(wbDir, 'manifest.json'), 'utf-8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch { return null }
  }

  /** 世界书读回（§3.2）：absDir=项目根或「世界书」目录绝对路径。递归读 *.md 按契约 v2
   *  parser 解析；解析失败的文件跳过并记 warnings（相对路径+原因），不整批失败；
   *  manifest.json 仅作 name/type/group/世界书名快照补充，不覆盖 md 解析结果。
   *  返回 { ok: true, worldbook: { id?, name, entries }, warnings }。 */
  function readWorldbookFolder(absDir) {
    const invalid = validateProjectPathInput(absDir)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const base = path.resolve(String(absDir))
    recoverMirrorTransaction(path.basename(base) === "世界书" ? path.dirname(base) : base)
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw Object.assign(new Error('目录不存在'), { code: 'ERR_DIR_NOT_FOUND' })
    const nested = path.join(base, '世界书')
    const wbDir = fs.existsSync(nested) ? nested : base
    const warnings = []
    const manifest = readWorldbookManifestSnapshot(wbDir)
    const snapshotByName = new Map((Array.isArray(manifest?.entries) ? manifest.entries : []).map((item) => [String(item?.name ?? ''), item]))
    const auxSkip = new Set(WORLDBOOK_AUX_SKIP)
    const entries = []
    const walk = (dir, relBase) => {
      const children = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      for (const dirent of children) {
        const rel = relBase ? `${relBase}/${dirent.name}` : dirent.name
        if (dirent.isDirectory()) {
          walk(path.join(dir, dirent.name), rel)
          continue
        }
        if (!/\.md$/iu.test(dirent.name) || auxSkip.has(rel)) continue
        let text = ''
        try {
          text = fs.readFileSync(path.join(dir, dirent.name), 'utf-8')
        } catch (error) {
          warnings.push(`${rel}: 读取失败（${error.message}）`)
          continue
        }
        const parsed = parseWorldbookEntryFile(text)
        if (!parsed.ok) {
          warnings.push(`${rel}: ${parsed.error.message}`)
          continue
        }
        const entry = parsed.entry
        const snapshot = snapshotByName.get(entry.name)
        if (snapshot) {
          if (entry.type === 'general' && snapshot.type && snapshot.type !== 'general') entry.type = String(snapshot.type)
          if (entry.group === undefined && snapshot.group) entry.group = String(snapshot.group)
        }
        entries.push(entry)
      }
    }
    walk(wbDir, '')
    if (!entries.length && !warnings.length) warnings.push('目录内未找到世界书条目（*.md）')
    const worldbook = { id: manifest?.worldbookId ?? undefined, name: String(manifest?.name ?? ''), entries }
    for (const key of ['worldDescription', 'writingStyle', 'forbidden', 'groups']) {
      if (manifest?.[key] !== undefined) worldbook[key] = manifest[key]
    }
    return { ok: true, worldbook, warnings, worldbookFingerprint: mirrorDomainFingerprint(wbDir) }
  }

  /** 世界书纯校验（§3.2，C 组预检复用）：files={ relPath: md 文本 } → 逐文件 { relPath, ok, error? }，不落盘。 */
  function validateWorldbookFiles(files) {
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      throw Object.assign(new Error('files 必须是 { relPath: text } 对象'), { code: 'ERR_INVALID_INPUT' })
    }
    return Object.entries(files).map(([relPath, text]) => {
      const parsed = parseWorldbookEntryFile(typeof text === 'string' ? text : String(text ?? ''))
      return parsed.ok ? { relPath, ok: true } : { relPath, ok: false, error: parsed.error }
    })
  }

  /** 本地约束读回（W6·C）：读 <root>/约束/*.md|*.txt（或「约束」目录本身），文件名判 kind。
   *  约束目录不纳入自动镜像文件清单，属用户手写自由区。
   *  返回 { ok: true, files: [{id,name,kind,content,sourceRef,truncated}], warnings, dir }。 */
  function readRuleFiles(absDir) {
    const invalid = validateProjectPathInput(absDir)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const base = path.resolve(String(absDir))
    recoverMirrorTransaction(path.basename(base) === "世界书" ? path.dirname(base) : base)
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw Object.assign(new Error('目录不存在'), { code: 'ERR_DIR_NOT_FOUND' })
    const nested = path.join(base, '约束')
    const ruleDir = fs.existsSync(nested) ? nested : (path.basename(base) === '约束' ? base : null)
    if (!ruleDir) return { ok: true, files: [], warnings: [], dir: null }
    const warnings = []
    const files = []
    const names = fs.readdirSync(ruleDir)
      .filter((name) => /\.(?:md|txt)$/iu.test(name))
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    for (const name of names) {
      if (files.length >= LIMITS.maxRuleFiles) {
        warnings.push(`约束文件超过 ${LIMITS.maxRuleFiles} 个，其余已忽略`)
        break
      }
      const file = path.join(ruleDir, name)
      try {
        const stat = fs.statSync(file)
        if (!stat.isFile()) continue
        if (stat.size > LIMITS.maxRuleFileBytes) {
          warnings.push(`${name}: 文件过大（>${Math.round(LIMITS.maxRuleFileBytes / 1024)}KB），已跳过`)
          continue
        }
        let content = fs.readFileSync(file, 'utf-8').replace(/\r\n?/g, '\n').trim()
        if (!content) continue
        let truncated = false
        if (content.length > LIMITS.maxRuleFileChars) {
          content = content.slice(0, LIMITS.maxRuleFileChars)
          truncated = true
        }
        const stem = name.replace(/\.(?:md|txt)$/iu, '').trim() || name
        files.push({
          id: stem,
          name: stem,
          kind: ruleKindOfName(stem),
          content,
          sourceRef: `local-rule:${name}`,
          truncated
        })
      } catch (error) {
        warnings.push(`${name}: 读取失败（${error.message}）`)
      }
    }
    if (!files.length && !warnings.length) warnings.push('约束目录内未找到约束文件（*.md/*.txt）')
    return { ok: true, files, warnings, dir: ruleDir }
  }

  /** 书绑定约束读回：注册表 bookId → 项目根 → readRuleFiles。无绑定/未登记返回空（fail-open）。 */
  function readRuleFilesForBook(bookId) {
    const id = String(bookId || '').trim()
    if (!id) return { ok: true, files: [], warnings: ['bookId 为空'], dir: null }
    const entry = readRegistry(resolveAppDataDir()).find((item) => item.bookId === id && fs.existsSync(item.rootPath))
    if (!entry) return { ok: true, files: [], warnings: [`未找到与 bookId=${id} 绑定的项目文件夹`], dir: null }
    return readRuleFiles(entry.rootPath)
  }

  /** 词汇表读回（pinax-lexicon@1）：读 <root>/词汇表.json 经 parseLexiconFile（容错，不抛错）。
   *  文件缺失 → { exists:false }（fail-open）。返回 { ok, exists, lexicon, warnings, dir }。 */
  function readLexicon(absDir) {
    const invalid = validateProjectPathInput(absDir)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const base = path.resolve(String(absDir))
    recoverMirrorTransaction(path.basename(base) === "世界书" ? path.dirname(base) : base)
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw Object.assign(new Error('目录不存在'), { code: 'ERR_DIR_NOT_FOUND' })
    const file = path.join(base, LEXICON_FILE_NAME)
    if (!fs.existsSync(file)) return { ok: true, exists: false, lexicon: null, warnings: [], dir: base }
    let raw = ''
    try {
      raw = fs.readFileSync(file, 'utf-8')
    } catch (error) {
      return { ok: true, exists: true, lexicon: null, warnings: [`${LEXICON_FILE_NAME}: 读取失败（${error.message}）`], dir: base }
    }
    const parsed = parseLexiconFile(raw)
    const { format, project, banned, own, canon } = parsed
    return { ok: true, exists: true, lexicon: { format, project, banned, own, canon }, warnings: parsed.warnings, dir: base }
  }

  /** 书绑定词汇表读回：注册表 bookId → 项目根 → readLexicon。无绑定/未登记返回 { exists:false }（fail-open）。 */
  function readLexiconForBook(bookId) {
    const id = String(bookId || '').trim()
    if (!id) return { ok: true, exists: false, lexicon: null, warnings: ['bookId 为空'], dir: null }
    const entry = readRegistry(resolveAppDataDir()).find((item) => item.bookId === id && fs.existsSync(item.rootPath))
    if (!entry) return { ok: true, exists: false, lexicon: null, warnings: [`未找到与 bookId=${id} 绑定的项目文件夹`], dir: null }
    return readLexicon(entry.rootPath)
  }

  return { resolveRoot, readSyncState, mirrorBook, writeProjectIndex, createProjectAt, openProjectAt, listProjects, setProjectBinding, removeProjectEntry, updateProjectAt, browseDirectories, createDirectory, readProjectChapters, resolveAppDataDir, ensureWorldbookAuxFiles, readWorldbookFolder, validateWorldbookFiles, readBookFromFolder, listArchivedSources, readRuleFiles, readRuleFilesForBook, readLexicon, readLexiconForBook }
}
