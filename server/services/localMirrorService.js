// 本地文件镜像（P1→项目文件体系 @2）：把项目的正文/大纲/世界书/构思/资料/日志/媒体清单
// 单向落盘到本机文档目录，供 agent 与用户直接读取。
// 镜像是单向输出：托管子目录每次同步整体重建，本地手改会被覆盖——读拷贝语义。
// 位置解析：PINAX_MIRROR_ROOT env > <homedir>/Documents/Pinax。前端不传路径（防路径注入），服务端唯一决定权。
// 世界书写侧为契约 v2 布局（条目 → 世界书/<cat>/<name>.md + index.json + graph.json +
// manifest.json + 骨架件幂等补齐），并提供 readWorldbookFolder 读回——见「世界书文件契约 v2」节。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MIRROR_SCHEMA = 'pinax-project-fs@2'
export const PROJECT_SPEC = 'pinax-project@1'
/** 项目文件夹范式（Obsidian/VS Code 模式）：任意位置自包含文件夹，.pinax/project.json 为标记。 */
const KIND_TEMPLATES = {
  novel: ['正文', '大纲', '世界书', '构思', '资料', '日志'],
  screenplay: ['剧本', '人物', '场景', '大纲', '世界书', '资料', '日志'],
  generic: ['文档', '资料', '日志']
}
const MANAGED_SUBDIRS = ['正文', '大纲', '世界书', '构思', '资料', '日志']
const LIMITS = {
  maxChapters: 500,
  maxEntries: 2000,
  maxExplorations: 300,
  maxArtifacts: 50,
  maxArtifactChars: 50_000,
  maxSessions: 20,
  maxSessionChars: 200_000,
  maxRevisionsPerChapter: 10,
  maxRevisionChars: 20_000,
  maxBlockHistoryPerChapter: 20,
  maxConversationMessages: 60,
  maxTotalChars: 8_000_000
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

function totalPayloadChars(payload) {
  return JSON.stringify(payload ?? {}).length
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体必须是对象'
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
// A2 内联实现（契约 §3.1）——A1 合入后替换为 shared/worldbookFileContract import。
// 布局（=kit 体系标准）：世界书/<cat>/<name>.md + index.json（指针账本）+ graph.json
// （worldbook-graph@1 同构）+ manifest.json（旧消费方兼容）+ 骨架件（纪律/伏笔台账/
// 暗线底牌/章账）。cat 目录映射：character→人物 location→地理 organization→势力
// event→编年 rule/style/lore/item/quest/general/forbidden→设定 source→资料 未知→设定。
// frontmatter 双层关系（兼容关键）：links=纯目标 id 字符串数组（kit 声明边 weight2，kit
// 直接消费）；relations=缩进富关系对象块（kit 解析器对缩进行不可见）。运行时 relations
// 对象（tags/locations/characters/events/placeIds/…）经 entryRelations 一层 map 无损往返。
// 受限 YAML 子集：标量/单引号字符串（'' 转义）/行内数组/块列表/一层嵌套 map；含
// :[]{}#&*!|>'"%@`、首尾空白、空串或形似布尔/数字的字符串值必须单引号包裹。
// 正文 content 原样保留（注入真相），支持 [[id]] 交叉链接。

export const WORLDBOOK_FILE_SCHEMA_VERSION = 1

const WORLDBOOK_CAT_DIRS = { character: '人物', location: '地理', organization: '势力', event: '编年', source: '资料' }
const WORLDBOOK_DEFAULT_CAT_DIR = '设定'
const WORLDBOOK_CAT_ORDER = ['人物', '地理', '势力', '编年', '设定', '资料']
/** 已知 frontmatter 键（契约 v2）；其余键无损进 entry.extra 并回写（含 legacy group/worldbook）。 */
const WORLDBOOK_FM_KEYS = new Set([
  'id', 'title', 'name', 'kind', 'type', 'status', 'version', 'tags', 'links', 'cat', 'keys', 'keysSecondary',
  'summary', 'sourceRefs', 'updatedAt', 'schemaVersion', 'injection', 'profile', 'relations', 'entryRelations', 'metadata'
])
/** 体系标准骨架件（读回时按结构文件跳过，不当作条目解析）。 */
const WORLDBOOK_AUX_SKIP = ['纪律.md', '伏笔/台账.md', '底牌/暗线底牌.md', '编年/章账.md']

function worldbookCatDir(type) {
  return WORLDBOOK_CAT_DIRS[String(type ?? '')] || WORLDBOOK_DEFAULT_CAT_DIR
}

function worldbookScalarText(value) {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  return String(value)
}

function worldbookStringList(value) {
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : String(item ?? ''))) : []
}

// —— kit first_para 移植（worldbook_index.py first_para）：首段去标记 ≥8 字才取，≤120 字 ——
function worldbookFirstParaSummary(body, limit = 120) {
  for (const para of String(body ?? '').split('\n\n')) {
    const text = para.replace(/[#*`>\[\]]/g, '').trim()
    if (text.length >= 8) return text.slice(0, limit) + (text.length > limit ? '…' : '')
  }
  return ''
}

function worldbookMtime(updatedAt) {
  const date = new Date(worldbookScalarText(updatedAt))
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// —— 受限 YAML 子集序列化 ——
const YAML_SPECIAL_RE = /[:[\]{}#&*!|>'"%@`]/
const YAML_AMBIGUOUS_RE = /^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/i

function yamlNeedsQuote(text) {
  return text === '' || YAML_SPECIAL_RE.test(text) || text !== text.trim() || YAML_AMBIGUOUS_RE.test(text)
}

function yamlScalar(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : yamlScalar(String(value))
  if (value === null || value === undefined) return "''"
  const text = String(value)
  return yamlNeedsQuote(text) ? `'${text.replace(/'/g, "''")}'` : text
}

/** 字符串列表：行内数组为默认；含逗号的项无法安全内联（kit 按逗号切分），回落块列表。 */
function yamlList(items) {
  const list = worldbookStringList(items)
  if (!list.length) return '[]'
  if (list.every((item) => !item.includes(','))) return `[${list.map((item) => yamlScalar(item)).join(', ')}]`
  return ['', ...list.map((item) => `- ${yamlScalar(item)}`)].join('\n')
}

/** 字符串列表键行：行内数组为默认；含逗号的项无法安全内联（kit 按逗号切分），回落块列表。 */
function yamlKeyList(key, items) {
  const rendered = yamlList(items)
  return rendered.startsWith('\n') ? `${key}:${rendered}` : `${key}: ${rendered}`
}

/** 一层嵌套 map；键非 ident 或值超出子集时返回 null（调用方 JSON 折叠），空 map 返回 ''。 */
function yamlMapBlock(map) {
  const keys = Object.keys(map ?? {}).filter((key) => map[key] !== undefined)
  if (!keys.length) return ''
  if (!keys.every((key) => /^[A-Za-z_][\w-]*$/.test(key))) return null
  const lines = keys.map((key) => {
    const value = map[key]
    let rendered = null
    if (Array.isArray(value)) {
      rendered = value.length === 0 || value.every((item) => typeof item === 'string' && !item.includes(','))
        ? yamlList(value)
        : null
    } else if (value === null || typeof value !== 'object') {
      rendered = yamlScalar(value)
    }
    return rendered === null ? `  ${key}: ${yamlScalar(JSON.stringify(value))}` : `  ${key}: ${rendered}`
  })
  return `\n${lines.join('\n')}`
}

/** 富关系对象块：[{to,type,stance,covert,weight,src}]，两空格缩进排放（kit 解析器不可见）。 */
function yamlRelationBlock(relations) {
  if (!Array.isArray(relations) || !relations.length) return ''
  const items = relations
    .map((rel) => {
      if (!rel || typeof rel !== 'object' || Array.isArray(rel)) return null
      const ordered = {}
      for (const key of ['to', 'type', 'stance', 'covert', 'weight', 'src']) {
        if (rel[key] !== undefined) ordered[key] = rel[key]
      }
      for (const key of Object.keys(rel).sort()) {
        if (!(key in ordered) && rel[key] !== undefined) ordered[key] = rel[key]
      }
      const fields = Object.keys(ordered).filter((key) => /^[A-Za-z_][\w-]*$/.test(key))
      if (!fields.length) return null
      return [`  - ${fields[0]}: ${yamlScalar(ordered[fields[0]])}`, ...fields.slice(1).map((key) => `    ${key}: ${yamlScalar(ordered[key])}`)].join('\n')
    })
    .filter(Boolean)
  return items.length ? `\n${items.join('\n')}` : ''
}

function yamlExtraLine(key, value) {
  if (Array.isArray(value)) return `${key}: ${yamlList(value)}`
  if (value !== null && typeof value === 'object') {
    const block = yamlMapBlock(value)
    if (block) return `${key}:${block}`
    return `${key}: ${yamlScalar(JSON.stringify(value))}`
  }
  return `${key}: ${yamlScalar(value)}`
}

/**
 * 条目的富关系视图（fm relations 块数据源）：entry.relationsRich（人工富关系）优先；
 * 运行时 relations 对象的地点/人物/事件桶与 placeIds/characterIds 派生为 {to,type,src:'entry'}
 * （与富关系按 (type,to) 去重）。src:'entry' 为派生保留字——解析侧据此把派生边还原为桶。
 */
function worldbookRichRelations(entry) {
  const rich = Array.isArray(entry?.relationsRich)
    ? entry.relationsRich.filter((rel) => rel && typeof rel === 'object' && !Array.isArray(rel))
    : []
  const seen = new Set(rich.map((rel) => `${worldbookScalarText(rel.type)}\u0000${worldbookScalarText(rel.to)}`))
  const runtime = entry?.relations && typeof entry.relations === 'object' && !Array.isArray(entry.relations) ? entry.relations : {}
  const derived = []
  for (const [bucket, type] of [['locations', 'location'], ['characters', 'character'], ['events', 'event'], ['placeIds', 'location'], ['characterIds', 'character']]) {
    for (const item of worldbookStringList(runtime[bucket])) {
      const to = item.trim()
      if (!to) continue
      const key = `${type}\u0000${to}`
      if (seen.has(key)) continue
      seen.add(key)
      derived.push({ to, type, src: 'entry' })
    }
  }
  return [...rich, ...derived]
}

/**
 * 条目 → 世界书/<cat>/<name>.md 全文。frontmatter 必含 kit 字段全集
 * （id/title/status/version/tags[]/links[]，title=name 双写）+ Pinax 扩展
 * （schemaVersion/name/kind/cat[]/keys[]/keysSecondary[]/summary/sourceRefs[]/updatedAt
 * + injection/profile 对象块 + relations 缩进富关系 + entryRelations 运行时对象 +
 * metadata JSON 折叠）+ extra 未知键回写。无 wall-clock（updatedAt 只来自条目），重跑不变。
 */
export function serializeWorldbookEntryFile(entry, { worldbookName = '' } = {}) {
  // worldbookName 保留契约签名但不写入：世界书归属由 manifest.json 承载，避免污染条目往返
  void worldbookName
  const name = worldbookScalarText(entry?.name)
  const type = worldbookScalarText(entry?.kind ?? entry?.type) || 'general'
  const cats = worldbookStringList(entry?.cat)
  const summary = entry?.summary !== undefined ? worldbookScalarText(entry.summary) : worldbookFirstParaSummary(entry?.content)
  const lines = [
    '---',
    `id: ${yamlScalar(entry?.id ?? name)}`,
    `title: ${yamlScalar(name)}`,
    `status: ${yamlScalar(entry?.status ?? 'active')}`,
    `version: ${yamlScalar(entry?.version ?? '1')}`,
    yamlKeyList('tags', entry?.tags),
    yamlKeyList('links', entry?.links),
    `schemaVersion: ${WORLDBOOK_FILE_SCHEMA_VERSION}`,
    `name: ${yamlScalar(name)}`,
    `kind: ${yamlScalar(type)}`,
    yamlKeyList('cat', cats.length ? cats : [worldbookCatDir(type)]),
    yamlKeyList('keys', entry?.keys),
    yamlKeyList('keysSecondary', entry?.keysSecondary),
    `summary: ${yamlScalar(summary)}`,
    yamlKeyList('sourceRefs', entry?.sourceRefs),
    `updatedAt: ${yamlScalar(entry?.updatedAt ?? '')}`
  ]
  const injectionBlock = yamlMapBlock(entry?.injection)
  if (injectionBlock) lines.push(`injection:${injectionBlock}`)
  const profileBlock = yamlMapBlock(entry?.profile)
  if (profileBlock) lines.push(`profile:${profileBlock}`)
  const relationBlock = yamlRelationBlock(worldbookRichRelations(entry))
  if (relationBlock) lines.push(`relations:${relationBlock}`)
  const entryRelationsBlock = yamlMapBlock(entry?.relations)
  if (entryRelationsBlock) lines.push(`entryRelations:${entryRelationsBlock}`)
  if (entry?.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata) && Object.keys(entry.metadata).length) {
    lines.push(`metadata: ${yamlScalar(JSON.stringify(entry.metadata))}`)
  }
  for (const key of Object.keys(entry?.extra ?? {}).sort()) lines.push(yamlExtraLine(key, entry.extra[key]))
  return `${lines.join('\n')}\n---\n\n${String(entry?.content ?? '')}`
}

function parseYamlScalarText(text) {
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~') return null
  if (/^-?\d+$/.test(text) || /^-?\d+\.\d+$/.test(text)) return Number(text)
  return text
}

function splitYamlInlineArray(raw) {
  const items = []
  let current = ''
  let quote = null
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (quote) {
      current += ch
      if (quote === "'" && ch === "'") {
        if (raw[i + 1] === "'") { current += "'"; i += 1 } else quote = null
      } else if (quote === '"' && ch === '\\') { current += raw[i + 1] ?? ''; i += 1 } else if (quote === '"' && ch === '"') quote = null
      continue
    }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue }
    if (ch === ',') { items.push(current); current = ''; continue }
    current += ch
  }
  if (current.trim() !== '' || items.length) items.push(current)
  return items.map((item) => item.trim()).filter((item) => item !== '')
}

function parseYamlValue(text) {
  const value = String(text ?? '').trim()
  if (value === '') return ''
  if (value.startsWith('[') && value.endsWith(']')) return splitYamlInlineArray(value.slice(1, -1)).map(parseYamlValue)
  if (value.length >= 2 && ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))) {
    if (value[0] === "'") return value.slice(1, -1).replace(/''/g, "'")
    try { return JSON.parse(value) } catch { return value.slice(1, -1) }
  }
  return parseYamlScalarText(value)
}

/** 受限 YAML 子集解析：顶层 key: value / 行内数组 / 块列表 / 一层嵌套 map / 缩进对象列表。 */
function parseWorldbookFrontmatter(raw) {
  const lines = String(raw ?? '').split('\n')
  const fields = new Map()
  const topLevelRe = /^([A-Za-z_][\w-]*):(.*)$/
  const nestedKeyRe = /^\s+([A-Za-z_][\w-]*):(.*)$/
  const listItemRe = /^(\s*)- (.*)$/
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i += 1; continue }
    const top = topLevelRe.exec(line)
    if (!top) { i += 1; continue }
    const key = top[1]
    const inline = top[2].trim()
    if (inline) { fields.set(key, parseYamlValue(inline)); i += 1; continue }
    let j = i + 1
    while (j < lines.length && !lines[j].trim()) j += 1
    if (j < lines.length && listItemRe.test(lines[j])) {
      const items = []
      while (j < lines.length) {
        const item = listItemRe.exec(lines[j])
        if (!item) break
        const dashIndent = item[1].length
        const kv = topLevelRe.exec(item[2])
        if (kv) {
          const object = {}
          object[kv[1]] = parseYamlValue(kv[2])
          j += 1
          while (j < lines.length) {
            const cont = nestedKeyRe.exec(lines[j])
            const indent = cont ? lines[j].length - lines[j].trimStart().length : 0
            if (!cont || indent <= dashIndent) break
            object[cont[1]] = parseYamlValue(cont[2])
            j += 1
          }
          items.push(object)
        } else {
          items.push(parseYamlValue(item[2]))
          j += 1
        }
      }
      fields.set(key, items)
      i = j
      continue
    }
    if (j < lines.length && nestedKeyRe.test(lines[j])) {
      const object = {}
      while (j < lines.length) {
        const cont = nestedKeyRe.exec(lines[j])
        if (!cont) break
        object[cont[1]] = parseYamlValue(cont[2])
        j += 1
      }
      fields.set(key, object)
      i = j
      continue
    }
    fields.set(key, '')
    i += 1
  }
  return fields
}

/** 对象块值里的 JSON 折叠字符串还原（序列化侧超子集值以 JSON 串折叠；非 JSON 字面量保留原串）。 */
function worldbookReviveJson(map) {
  const out = {}
  for (const [key, value] of Object.entries(map ?? {})) {
    if (typeof value === 'string' && /^[{[]/.test(value)) {
      try { out[key] = JSON.parse(value); continue } catch { /* 保留字符串 */ }
    }
    out[key] = value
  }
  return out
}

/** md 全文 → { ok: true, entry } | { ok: false, error: { code, message } }。未知键入 entry.extra。 */
export function parseWorldbookEntryFile(text) {
  if (typeof text !== 'string') return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: '内容必须是字符串' } }
  const normalized = text.replace(/\r\n/g, '\n')
  const matched = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized)
  if (!matched) return { ok: false, error: { code: 'ERR_NO_FRONTMATTER', message: '缺少 frontmatter（--- … --- 块）' } }
  try {
    const fm = parseWorldbookFrontmatter(matched[1])
    const body = normalized.slice(matched[0].length)
    const name = worldbookScalarText(fm.get('name')) || worldbookScalarText(fm.get('title'))
    if (!name.trim()) return { ok: false, error: { code: 'ERR_NO_NAME', message: 'frontmatter 缺少 name/title' } }
    const tags = worldbookStringList(fm.get('tags'))
    const entry = {
      id: worldbookScalarText(fm.get('id')) || name,
      name,
      type: worldbookScalarText(fm.get('kind')) || worldbookScalarText(fm.get('type')) || 'general',
      keys: worldbookStringList(fm.get('keys')),
      keysSecondary: worldbookStringList(fm.get('keysSecondary')),
      content: body.startsWith('\n') ? body.slice(1) : body
    }
    if (fm.has('kind')) entry.kind = worldbookScalarText(fm.get('kind'))
    entry.status = worldbookScalarText(fm.get('status')) || 'active'
    entry.tags = tags
    entry.links = worldbookStringList(fm.get('links'))
    entry.cat = worldbookStringList(fm.get('cat'))
    if (fm.has('version')) entry.version = fm.get('version')
    if (fm.has('summary')) entry.summary = worldbookScalarText(fm.get('summary'))
    if (fm.has('sourceRefs')) entry.sourceRefs = worldbookStringList(fm.get('sourceRefs'))
    if (fm.has('updatedAt')) entry.updatedAt = worldbookScalarText(fm.get('updatedAt'))
    if (fm.get('injection') && typeof fm.get('injection') === 'object' && !Array.isArray(fm.get('injection'))) entry.injection = worldbookReviveJson(fm.get('injection'))
    if (fm.get('profile') && typeof fm.get('profile') === 'object' && !Array.isArray(fm.get('profile'))) entry.profile = worldbookReviveJson(fm.get('profile'))
    const fmRelations = Array.isArray(fm.get('relations'))
      ? fm.get('relations').filter((rel) => rel && typeof rel === 'object' && !Array.isArray(rel))
      : []
    const rich = fmRelations.filter((rel) => !(rel.src === 'entry' && !('stance' in rel) && !('covert' in rel) && !('weight' in rel)))
    if (rich.length) entry.relationsRich = rich
    const entryRelations = fm.get('entryRelations') && typeof fm.get('entryRelations') === 'object' && !Array.isArray(fm.get('entryRelations'))
      ? worldbookReviveJson(fm.get('entryRelations'))
      : null
    if (entryRelations) {
      entry.relations = entryRelations
    } else if (fmRelations.length) {
      const buckets = { locations: [], characters: [], events: [] }
      for (const rel of fmRelations) {
        const bucket = { location: 'locations', character: 'characters', event: 'events' }[worldbookScalarText(rel.type)]
        const to = worldbookScalarText(rel.to).trim()
        if (bucket && to && !buckets[bucket].includes(to)) buckets[bucket].push(to)
      }
      entry.relations = { tags: tags.slice(), ...buckets }
    }
    if (fm.has('metadata')) {
      const raw = fm.get('metadata')
      if (typeof raw === 'string') {
        try { entry.metadata = JSON.parse(raw) } catch { entry.metadata = raw }
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        entry.metadata = worldbookReviveJson(raw)
      }
    }
    const extra = {}
    for (const [key, value] of fm) if (!WORLDBOOK_FM_KEYS.has(key)) extra[key] = value
    if (Object.keys(extra).length) entry.extra = extra
    return { ok: true, entry }
  } catch (error) {
    return { ok: false, error: { code: 'ERR_PARSE', message: error.message } }
  }
}

function worldbookEntriesOf(worldbook) {
  return Array.isArray(worldbook?.entries) ? worldbook.entries : []
}

/** cat 目录 + 去重文件名分配（与写侧 writeDeduped 同序同规则，index/graph 指针与磁盘一致）。 */
function worldbookAllocateFiles(worldbook) {
  const used = new Map()
  return worldbookEntriesOf(worldbook).map((entry) => {
    const type = worldbookScalarText(entry.kind ?? entry.type) || 'general'
    const cat = worldbookCatDir(type)
    const taken = used.get(cat) ?? new Set()
    used.set(cat, taken)
    const base = sanitizeFilename(entry.name)
    let file = `${base}.md`
    for (let n = 2; taken.has(file); n += 1) file = `${base}-${n}.md`
    taken.add(file)
    return { entry, cat, file, relFile: `世界书/${cat}/${file}` }
  })
}

function worldbookEntryPointer(allocation) {
  const { entry, relFile } = allocation
  return {
    id: worldbookScalarText(entry.id) || worldbookScalarText(entry.name),
    title: worldbookScalarText(entry.name),
    tags: worldbookStringList(entry.tags),
    links: worldbookStringList(entry.links),
    status: worldbookScalarText(entry.status) || 'active',
    version: worldbookScalarText(entry.version ?? '1'),
    updated: worldbookScalarText(entry.updatedAt),
    file: relFile
  }
}

/** kit index.json 指针账本（确定性重建；sections[].entries[].file 为项目根相对路径，kit check 可验）。 */
export function buildWorldbookIndexFile(worldbook) {
  const allocations = worldbookAllocateFiles(worldbook)
  const byCat = new Map()
  for (const allocation of allocations) {
    const list = byCat.get(allocation.cat) ?? []
    list.push(worldbookEntryPointer(allocation))
    byCat.set(allocation.cat, list)
  }
  const cats = [...byCat.keys()].sort((a, b) => {
    const ia = WORLDBOOK_CAT_ORDER.indexOf(a)
    const ib = WORLDBOOK_CAT_ORDER.indexOf(b)
    return (ia === -1 ? WORLDBOOK_CAT_ORDER.length : ia) - (ib === -1 ? WORLDBOOK_CAT_ORDER.length : ib) || a.localeCompare(b, 'zh-CN')
  })
  const sections = [
    ...cats.map((cat) => ({ id: cat, title: cat, format: 'list', file: `世界书/${cat}/`, entries: byCat.get(cat) })),
    { id: '伏笔', title: '伏笔台账', format: 'text', file: '世界书/伏笔/台账.md', entries: [] },
    { id: '底牌', title: '暗线底牌（作者专用·永不入正文）', format: 'text', file: '世界书/底牌/暗线底牌.md', entries: [] }
  ]
  const updated = allocations.map(({ entry }) => worldbookScalarText(entry.updatedAt)).filter(Boolean).sort().at(-1) ?? ''
  return {
    世界书: worldbookScalarText(worldbook?.name),
    变体: 'novel',
    version: '1.0.0',
    updated,
    note: '唯一 RAG 入口；文件即真相；章回交稿后按 纪律.md 结算五件',
    状态机: 'draft → active → retired',
    sections
  }
}

/** worldbook-graph@1 图账本（与 kit worldbook_index.py 产物同构）。relations 来源=links 声明边
 *  （src:link weight2）+ 条目富关系（src:declared，weight=rel.weight||1），同对边按 kit 规则合并。
 *  无 wall-clock 字段（built_at 由 kit 重建时自加），同 payload 重跑逐字节不变。 */
export function buildWorldbookGraphFile(worldbook) {
  const allocations = worldbookAllocateFiles(worldbook)
  const entries = allocations.map(({ entry, cat, relFile }) => ({
    id: worldbookScalarText(entry.id) || worldbookScalarText(entry.name),
    cat,
    title: worldbookScalarText(entry.name),
    status: worldbookScalarText(entry.status) || 'active',
    version: worldbookScalarText(entry.version ?? '1'),
    tags: worldbookStringList(entry.tags),
    links: worldbookStringList(entry.links),
    summary: entry.summary !== undefined ? worldbookScalarText(entry.summary) : worldbookFirstParaSummary(entry.content),
    path: relFile,
    mtime: worldbookMtime(entry.updatedAt)
  }))
  const byKey = new Map()
  for (const node of entries) {
    byKey.set(node.id, node)
    if (node.title && !byKey.has(node.title)) byKey.set(node.title, node)
  }
  const edges = new Map()
  const addEdge = (a, b, src, weight) => {
    if (!a || !b || a === b) return
    const [x, y] = a < b ? [a, b] : [b, a]
    const key = `${x}\u0000${y}`
    const rec = edges.get(key) ?? { a: x, b: y, src: new Set(), weight: 0 }
    rec.src.add(src)
    rec.weight += weight
    edges.set(key, rec)
  }
  allocations.forEach(({ entry }, index) => {
    const node = entries[index]
    for (const link of node.links) {
      const target = byKey.get(link)
      if (target) addEdge(node.id, target.id, 'link', 2)
    }
    for (const rel of worldbookRichRelations(entry)) {
      const target = byKey.get(worldbookScalarText(rel.to).trim())
      if (target) addEdge(node.id, target.id, 'declared', Number(rel.weight) || 1)
    }
  })
  const relations = [...edges.values()]
    .sort((x, y) => y.weight - x.weight || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0) || (x.b < y.b ? -1 : 1))
    .map((rec) => ({ a: rec.a, b: rec.b, src: [...rec.src].sort().join('+'), weight: rec.weight }))
  const degree = new Map()
  for (const rel of relations) {
    degree.set(rel.a, (degree.get(rel.a) ?? 0) + 1)
    degree.set(rel.b, (degree.get(rel.b) ?? 0) + 1)
  }
  const byCat = {}
  for (const node of entries) byCat[node.cat] = (byCat[node.cat] ?? 0) + 1
  return {
    format: 'worldbook-graph@1',
    project: worldbookScalarText(worldbook?.name),
    entries,
    relations,
    stats: {
      entries: entries.length,
      edges: relations.length,
      isolated: entries.filter((node) => !degree.get(node.id)).length,
      byCat
    }
  }
}

/** worldbook-graph@1 校验读入：{ ok, graph } | { ok: false, error }。 */
export function parseWorldbookGraphFile(text) {
  try {
    const graph = JSON.parse(text)
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw new Error('graph 必须是对象')
    if (graph.format !== 'worldbook-graph@1') throw new Error(`format 非法：${JSON.stringify(graph.format ?? null)}`)
    if (!Array.isArray(graph.entries) || !Array.isArray(graph.relations)) throw new Error('entries/relations 必须是数组')
    if (!graph.stats || typeof graph.stats !== 'object' || Array.isArray(graph.stats)) throw new Error('stats 缺失')
    return { ok: true, graph }
  } catch (error) {
    return { ok: false, error: { code: 'ERR_GRAPH_PARSE', message: error.message } }
  }
}

/** 体系标准骨架件（相对 世界书/ 的 relPath → content；幂等补齐用）。文案对齐 kit
 *  tools/worldbook.py 的 DISCIPLINE / 台账表头 / 章账 handoff 头（小说变体；暗线底牌
 *  为 Pinax 侧骨架：status: draft，注入端显式排除，永不入正文）。 */
export function buildWorldbookAuxFiles({ variant = 'novel' } = {}) {
  void variant // Pinax 主形态为小说变体；剧本变体骨架由结算波次（B5）扩展
  return {
    '纪律.md': [
      '# 世界书纪律（小说变体）',
      '',
      '> 体系标准：knowledge/continuity/worldbook.md ｜ 结算单位：**章** ｜ 状态机：draft → active → retired（不删档）',
      '',
      '## 章回结算五件（每章交稿后、下一章派发前）',
      '',
      '1. 章卡/集卡（一句话+梗点+钩型+新名目）→ 编年/章账.md',
      '2. 人物状态推进（伤/钱/知情/关系/位置）→ 人物/*.md（当前状态改写+变动史追加）',
      '3. 交接（下一章写手必知的 3-5 条）→ 编年/章账.md 末节',
      '4. 伏笔变动（新埋/回收/顺期）→ 伏笔/台账.md',
      '5. 世界揭示（本章确立的新设定事实）→ 设定/*.md',
      '',
      '## RAG 规则（写第 N 章的开工动作）',
      '',
      '1. 读 index.json 按 tags 拉词条（不重读全书）',
      '2. 读 编年/章账.md 末节（=上一章 handoff）',
      '3. 读伏笔台账中 open 且临近回收的条目',
      '4. 底牌按节点号取段，禁止整读',
      '',
      '## 变体特例',
      '',
      '名目层入 设定/名目与黑话.md；成长阶/招式名目先登记再进正文',
      ''
    ].join('\n'),
    '伏笔/台账.md': '# 伏笔台账\n\n| fid | 内容 | 埋点 | 预定回收 | 状态 |\n| --- | --- | --- | --- | --- |\n',
    '底牌/暗线底牌.md': [
      '---',
      'id: hidden_cards',
      'title: 暗线底牌',
      'status: draft',
      'version: 1',
      'tags: []',
      'links: []',
      '---',
      '',
      '# 暗线底牌（作者专用 · 永不入正文）',
      '',
      '> status: draft——注入端显式排除，永不入正文；仅暗线节点需要时按节点号取段，禁止整读。',
      '',
      '## 节点',
      '',
      '- （待填）',
      ''
    ].join('\n'),
    '编年/章账.md': [
      '# 章账（逐章结算 = handoff）',
      '',
      '> 每章交稿后追加一节；下一章写手只读末节。',
      '',
      '## 交接（开局状态 · 第 1 章前）',
      '',
      '- （待填）',
      ''
    ].join('\n')
  }
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
 * 托管子目录整体重建（先删后写），meta.json 最后写——它是「本次同步完整」的标记。
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

  function mirrorBook(payload) {
    const error = validatePayload(payload)
    if (error) throw Object.assign(new Error(error), { code: 'ERR_INVALID_INPUT' })
    const root = resolveRoot()
    const book = payload.book
    const located = resolveBookDir(book)
    const dir = located.dir
    for (const sub of MANAGED_SUBDIRS) fs.rmSync(path.join(dir, sub), { recursive: true, force: true })
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
      artifacts: artifactCount,
      media: Array.isArray(payload.media) ? payload.media.length : 0
    }
    if (located.projectRoot) {
      const appData = resolveAppDataDir()
      const projects = readRegistry(appData).map((item) => (registryKeyOf(item.rootPath) === registryKeyOf(located.projectRoot) ? { ...item, lastSyncAt: now() } : item))
      writeRegistry(appData, projects)
    }
    writeFileAtomic(path.join(dir, 'meta.json'), JSON.stringify({ schema: MIRROR_SCHEMA, bookId: book.id, title: book.title, mirroredAt: now(), ...counts }, null, 2) + '\n')
    return { dir, counts, projectRoot: located.projectRoot }
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
    return { ok: true, worldbook, warnings }
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

  return { resolveRoot, mirrorBook, writeProjectIndex, createProjectAt, openProjectAt, listProjects, setProjectBinding, removeProjectEntry, updateProjectAt, browseDirectories, createDirectory, readProjectChapters, resolveAppDataDir, ensureWorldbookAuxFiles, readWorldbookFolder, validateWorldbookFiles }
}
