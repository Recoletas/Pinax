/**
 * 世界书文件格式契约（W1·A1）——kit 对齐 md + frontmatter 双层关系。
 *
 * 冻结契约：docs/plan/worldbook-unification-abc-20261008.md §3.1（v2）。
 * 体系标准：storyflow-kit knowledge/continuity/worldbook.md（文件即真相）。
 * 兼容目标：本模块产出的 md 必须能被 kit tools/worldbook_index.py 的
 * parse_frontmatter（YAML 子集解析器）解析出 id/title/status/version/tags[]/links[]，
 * 且 buildWorldbookGraphFile 产物与 kit build_index 产物同构（format=worldbook-graph@1）。
 *
 * 双层关系设计（兼容关键）：
 * - `links: [targetId, ...]` 纯 id 字符串数组 = kit 声明边（weight 2，kit 直接消费）。
 *   序列化时由 entry.links（纯 id 层）∪ entry.relations[].to（富关系层）按首现顺序去重合成，
 *   解析时再减去 relations[].to 还原 entry.links——对 Pinax 运行时往返无损，
 *   对 kit 则把富关系目标也暴露为声明边（kit 重建 graph.json 时边集一致）。
 * - `relations:` 缩进对象列表 [{to,type,stance,covert,weight,src}, ...] = Pinax 富关系。
 *   每行都有缩进 → kit 解析器对缩进行完全不可见（它只认行首 key 与行首 '- '），互不干扰。
 *
 * 受限 YAML 子集（emitter/parser 双向支持）：
 * - 行首 key（无缩进）+ 标量 / 单引号字符串 / `[a, b]` 行内数组 / 一层嵌套 map（两空格缩进，
 *   实现为可递归——kit 对任意缩进行均不可见，递归不破坏兼容）。
 * - 值含 :[]{}#&*!|>'"%@` 任一字符、逗号、首尾空白、为空串，或形如数字/布尔/null 的字符串，
 *   必须单引号包裹，内部 `'` 转义为 `''`。
 * - 多行字符串用块标量 `key: |`（恰好一个尾随换行）/ `key: |-`（无尾随换行）+ 两空格缩进行；
 *   含 `---` 行首文本或多个尾随换行的病态值走 `JSON:` 转义舱（`key: 'JSON:<json>'`）。
 * - 未知 frontmatter 键无损保留在 entry.extra 并在序列化时回写（顶层原键名）。
 *
 * `content` = md 正文原样（注入真相），profile→content 单向渲染不在本契约（调用方负责）。
 */

export const WORLDBOOK_FILE_SCHEMA_VERSION = 1

const WBDIR = '世界书'

/** type→cat 目录映射（§3.1）；未知 type→设定 */
const TYPE_TO_CAT = {
  character: '人物',
  location: '地理',
  organization: '势力',
  event: '编年',
  rule: '设定',
  style: '设定',
  lore: '设定',
  item: '设定',
  quest: '设定',
  general: '设定',
  forbidden: '设定',
  source: '资料'
}

/** index.json 指针账本的 list 型 section 顺序（kit init dirs + Pinax 扩展 资料） */
const CAT_ORDER = ['设定', '人物', '势力', '地理', '编年', '资料']

/** 序列化器认识的 frontmatter 键（其余键 → entry.extra 回写；worldbook 归属键也归 extra） */
const KNOWN_FM_KEYS = new Set([
  'schemaVersion', 'id', 'title', 'name', 'kind', 'type', 'status', 'version',
  'tags', 'links', 'cat', 'keys', 'keysSecondary', 'summary', 'sourceRefs',
  'updatedAt', 'relations', 'injection', 'profile'
])

/** entry 运行时形状里的已知字段（content 是正文不进 frontmatter；title 由 name 镜像） */
const KNOWN_ENTRY_FIELDS = new Set([
  'id', 'name', 'title', 'kind', 'type', 'status', 'version', 'tags', 'links',
  'cat', 'keys', 'keysSecondary', 'summary', 'sourceRefs', 'updatedAt',
  'relations', 'injection', 'profile', 'extra', 'content'
])

const NUMERIC_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const NEEDS_QUOTE_RE = /[:[\]{}#&*!|>'"%@`,]/
const FRONTMATTER_DELIM_RE = /^---\r?\n([\s\S]*?)\r?\n---/

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function str(value) {
  return String(value ?? '')
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(v => (typeof v === 'string' ? v : str(v))) : []
}

/** type/kind → cat 目录名；未知 type→设定 */
function catForEntry(entry) {
  const kind = str(entry?.kind ?? entry?.type ?? 'general').trim() || 'general'
  return TYPE_TO_CAT[kind] || '设定'
}

/**
 * 文件名安全化（§3.1：文件名 = sanitizeFilename(entry.name)）。
 * 去除 Windows 非法字符与控制符、首尾点空格、保留名防护；空名回退 untitled。
 */
function sanitizeFilename(name) {
  let s = str(name).replace(/[\\/:*?"<>|]/g, '').replace(/[\x00-\x1f\x7f]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^\.+/, '').replace(/[. ]+$/, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`
  if (!s) s = 'untitled'
  return s.slice(0, 80)
}

/* ---------- 富关系归一（兼容旧 relations 对象分组形状） ---------- */

const LEGACY_RELATION_BUCKETS = {
  locations: 'location',
  placeIds: 'location',
  characters: 'character',
  characterIds: 'character',
  events: 'event'
}

/**
 * 归一 entry.relations 为富关系边数组。
 * - 数组：逐项归一（字符串 → {to}），其余原样保留（含未知字段，往返无损）。
 * - 旧运行时对象分组 {tags,locations,characters,events,placeIds,characterIds}：
 *   id 桶 → 边 {to, type, weight:2, src:'declared'}；tags 桶 → 返回值.tags（并入 frontmatter tags）。
 * 返回 { edges, legacyTags }。
 */
function normalizeRelations(relations) {
  if (Array.isArray(relations)) {
    return {
      edges: relations.map(r => (isPlainObject(r) ? r : (r === null || r === undefined ? { to: '' } : { to: str(r) }))),
      legacyTags: []
    }
  }
  if (!isPlainObject(relations)) return { edges: [], legacyTags: [] }
  const edges = []
  const legacyTags = []
  for (const [bucket, value] of Object.entries(relations)) {
    if (!Array.isArray(value)) continue
    if (bucket === 'tags') {
      for (const t of value) legacyTags.push(str(t))
      continue
    }
    const type = LEGACY_RELATION_BUCKETS[bucket] || bucket
    for (const to of value) {
      edges.push({ to: str(to), type, weight: 2, src: 'declared' })
    }
  }
  return { edges, legacyTags }
}

/** 富关系边数组（序列化与图谱共用） */
function richRelationEdges(entry) {
  return normalizeRelations(entry?.relations).edges
}

/** tags：entry.tags ∪ 旧 relations.tags 桶（首现去重） */
function tagsOfEntry(entry) {
  const out = []
  const seen = new Set()
  for (const t of arrayOfStrings(entry?.tags)) {
    if (!seen.has(t)) { seen.add(t); out.push(t) }
  }
  for (const t of normalizeRelations(entry?.relations).legacyTags) {
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
}

/**
 * frontmatter links（kit 声明边）= entry.links ∪ relations[].to，首现顺序去重。
 * 解析侧用「links − relations.to」还原 entry.links，双向均无损。
 */
function declaredLinkIds(entry) {
  const out = []
  const seen = new Set()
  const push = v => {
    const s = str(v).trim()
    if (s && !seen.has(s)) { seen.add(s); out.push(s) }
  }
  const links = entry?.links
  if (Array.isArray(links)) {
    for (const l of links) push(isPlainObject(l) ? l.to : l)
  }
  for (const r of richRelationEdges(entry)) push(r?.to)
  return out
}

/* ---------- 受限 YAML 子集：emitter ---------- */

function quoteSingle(s) {
  return `'${s.replace(/'/g, "''")}'`
}

/** 标量 →受限子集文本（不含 key）。数字/布尔裸写，其余按需单引号。 */
function emitScalar(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : quoteSingle(`JSON:${JSON.stringify(value)}`)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === null || value === undefined) return `''`
  const s = str(value)
  if (s === '') return `''`
  // 字符串若形如数字/布尔/null，必须引号包裹以保住字符串类型（如 id '00123'、version '1.20'）
  const typeAmbiguous = NUMERIC_RE.test(s) || s === 'true' || s === 'false' || s === 'null'
  // 'JSON:' 前缀是转义舱保留字：这类字符串一律再包一层，保证往返不歧义
  const hatch = s.startsWith('JSON:') || (s.includes('\n') && needsHatch(s))
  if (hatch || typeAmbiguous || NEEDS_QUOTE_RE.test(s) || /^\s|\s$/.test(s)) {
    return quoteSingle(hatch ? `JSON:${JSON.stringify(s)}` : s)
  }
  return s
}

/** 病态多行（含 --- 行首文本 / 多个尾随换行）→ JSON 转义舱 */
function needsHatch(s) {
  if (!s.includes('\n')) return false
  if (/(^|\n)---/.test(s)) return true
  if (/\n\n$/.test(s)) return true
  return false
}

function emitInlineArray(items) {
  return `[${items.map(emitScalar).join(', ')}]`
}

/**
 * 通用 key: value 行（含递归 map / 块标量 / JSON 舱），返回行数组。
 * 所有嵌套行都有缩进 → kit 解析器不可见。
 */
function emitKeyValue(key, value, indent) {
  const pad = '  '.repeat(indent)
  if (Array.isArray(value)) {
    const inlineSafe = value.every(v => {
      if (v === null || v === undefined) return true
      if (typeof v === 'object') return false
      if (typeof v === 'string' && (v.includes('\n') || needsHatch(v))) return false
      return true
    })
    if (inlineSafe) return [`${pad}${key}: ${emitInlineArray(value)}`]
    return [`${pad}${key}: ${quoteSingle(`JSON:${JSON.stringify(value)}`)}`]
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (!entries.length) return [`${pad}${key}: {}`]
    const lines = [`${pad}${key}:`]
    for (const [k, v] of entries) lines.push(...emitKeyValue(k, v, indent + 1))
    return lines
  }
  if (typeof value === 'string' && value.includes('\n') && !needsHatch(value)) {
    const marker = /\n$/.test(value) ? '|' : '|-'
    const body = /\n$/.test(value) ? value.slice(0, -1) : value
    const lines = [`${pad}${key}: ${marker}`]
    for (const l of body.split('\n')) lines.push(l === '' ? '' : `${pad}  ${l}`)
    return lines
  }
  return [`${pad}${key}: ${emitScalar(value)}`]
}

/** relations 块列表：每行都有缩进（kit 解析器不可见的兼容关键） */
function emitRelationBlock(edges) {
  if (!edges.length) return ['relations: []']
  const lines = ['relations:']
  for (const edge of edges) {
    const fields = Object.entries(isPlainObject(edge) ? edge : { to: str(edge) })
    if (!fields.length) { lines.push('  - {}'); continue }
    fields.forEach(([k, v], idx) => {
      const kv = emitKeyValue(k, v, 2) // 两空格缩进档（'    k: v'）
      if (idx === 0) lines.push(`  - ${kv[0].slice(4)}`)
      else lines.push(kv[0])
      for (let j = 1; j < kv.length; j += 1) lines.push(kv[j])
    })
  }
  return lines
}

/* ---------- 受限 YAML 子集：parser ---------- */

function tryJsonParse(text) {
  try { return { ok: true, value: JSON.parse(text) } } catch { return { ok: false } }
}

function unescapeSingle(inner) {
  if (inner.startsWith('JSON:')) {
    const parsed = tryJsonParse(inner.slice(5))
    if (parsed.ok) return parsed.value
  }
  return inner.replace(/''/g, "'")
}

function unescapeDouble(inner) {
  if (inner.startsWith('JSON:')) {
    const parsed = tryJsonParse(inner.slice(5))
    if (parsed.ok) return parsed.value
  }
  const parsed = tryJsonParse(`"${inner}"`)
  return parsed.ok ? parsed.value : inner
}

/** 裸标量类型推断：数字/布尔/null，其余字符串 */
function inferScalar(s) {
  if (s === '') return ''
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  if (NUMERIC_RE.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n)) return n
  }
  return s
}

function parseScalarText(raw) {
  const s = raw.trim()
  const empty = parseInlineEmpty(s)
  if (empty !== undefined) return empty
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return unescapeSingle(s.slice(1, -1))
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return unescapeDouble(s.slice(1, -1))
  return inferScalar(s)
}

/** 行内数组切分（引号感知；kit 的朴素切分不支持引号内逗号——那是已记录的子集边界） */
function parseInlineArray(text) {
  const inner = text.trim().slice(1, -1)
  if (!inner.trim()) return []
  const tokens = []
  let cur = ''
  let q = null
  for (const ch of inner) {
    if (q) {
      cur += ch
      if (ch === q) q = null
      continue
    }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue }
    if (ch === ',') { tokens.push(cur); cur = ''; continue }
    cur += ch
  }
  tokens.push(cur)
  // 裸空 token（`[a, , b]`）丢弃；带引号空串 `''` 保留
  return tokens.map(t => t.trim()).filter(t => t !== '').map(t => parseScalarText(t))
}

/** 行内空对象/空数组 */
function parseInlineEmpty(text) {
  const s = text.trim()
  if (s === '{}') return {}
  if (s === '[]') return []
  return undefined
}

/**
 * 递归下降解析缩进块。lines: { indent, text }（text 已去行尾）。
 * 返回 [value, nextIndex]。
 */
function takeNode(lines, i, indent) {
  const first = lines[i]
  if (first.text.startsWith('- ')) return takeList(lines, i, indent)
  return takeMap(lines, i, indent)
}

function takeList(lines, i, indent) {
  const items = []
  while (i < lines.length) {
    const line = lines[i]
    if (line.text === '') { i += 1; continue }
    if (line.indent !== indent || !line.text.startsWith('- ')) break
    const rest = line.text.slice(2).trim()
    if (rest === '') {
      const child = nextDeeper(lines, i + 1, indent)
      if (child) { const [v, j] = takeNode(lines, child.index, child.indent); items.push(v); i = j; continue }
      items.push(''); i += 1; continue
    }
    const pair = splitKeyValue(rest)
    if (!pair) { items.push(parseScalarText(rest)); i += 1; continue }
    // 对象项：首键来自 '- ' 行（视觉缩进 = indent+1），其余字段来自更深的行
    const obj = {}
    let cursor = i
    const deeper = nextDeeper(lines, i + 1, indent)
    if (pair.value === '' && deeper) {
      const [v, j] = takeNode(lines, deeper.index, deeper.indent)
      obj[pair.key] = v
      cursor = j
    } else {
      obj[pair.key] = parseValueText(pair.value, lines, i, indent + 1)
      cursor = i + 1
      if (pair.value === '') {
        const deeper2 = nextDeeper(lines, cursor, indent)
        if (deeper2) {
          const [v, j] = takeNode(lines, deeper2.index, deeper2.indent)
          obj[pair.key] = v
          cursor = j
        }
      }
    }
    const more = takeMapLines(lines, cursor, indent + 1)
    if (more) { Object.assign(obj, more.value); cursor = more.nextIndex }
    items.push(obj)
    i = cursor
  }
  return [items, i]
}

function takeMap(lines, i, indent) {
  const obj = {}
  let cursor = i
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.text === '') { cursor += 1; continue }
    if (line.indent < indent) break
    if (line.indent > indent) { cursor += 1; continue } // 孤儿缩进行（kit 同样忽略）
    if (line.text.startsWith('- ')) break
    const pair = splitKeyValue(line.text)
    if (!pair) { cursor += 1; continue }
    if (pair.value === '') {
      const deeper = nextDeeper(lines, cursor + 1, indent)
      const sameList = nextNonBlank(lines, cursor + 1)
      if (deeper) {
        const [v, j] = takeNode(lines, deeper.index, deeper.indent)
        obj[pair.key] = v
        cursor = j
        continue
      }
      if (sameList && sameList.indent === indent && sameList.text.startsWith('- ')) {
        const [v, j] = takeList(lines, sameList.index, indent)
        obj[pair.key] = v
        cursor = j
        continue
      }
      obj[pair.key] = ''
      cursor += 1
      continue
    }
    obj[pair.key] = parseValueText(pair.value, lines, cursor, indent)
    cursor += 1
  }
  return [obj, cursor]
}

/** takeList 的字段续行（indent+1 起的 key 行 + 各自嵌套） */
function takeMapLines(lines, i, indent) {
  const obj = {}
  let cursor = i
  let started = false
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.text === '') { cursor += 1; continue }
    if (line.indent !== indent) break
    if (line.text.startsWith('- ')) break
    const pair = splitKeyValue(line.text)
    if (!pair) break
    started = true
    if (pair.value === '') {
      const deeper = nextDeeper(lines, cursor + 1, indent)
      if (deeper) {
        const [v, j] = takeNode(lines, deeper.index, deeper.indent)
        obj[pair.key] = v
        cursor = j
        continue
      }
      obj[pair.key] = ''
      cursor += 1
      continue
    }
    obj[pair.key] = parseValueText(pair.value, lines, cursor, indent)
    cursor += 1
  }
  return started ? { value: obj, nextIndex: cursor } : null
}

function nextNonBlank(lines, i) {
  for (let j = i; j < lines.length; j += 1) {
    if (lines[j].text !== '') return { index: j, indent: lines[j].indent, text: lines[j].text }
  }
  return null
}

function nextDeeper(lines, i, indent) {
  for (let j = i; j < lines.length; j += 1) {
    if (lines[j].text === '') continue
    return lines[j].indent > indent ? { index: j, indent: lines[j].indent } : null
  }
  return null
}

/** 值文本 → 值（块标量需回看上下文行，故单独处理） */
function parseValueText(value, lines, keyIndex, keyIndent) {
  const s = value.trim()
  if (s === '|' || s === '|-' || s === '|+') {
    return takeBlockScalar(lines, keyIndex + 1, keyIndent, s)
  }
  if (s.startsWith('[') && s.endsWith(']')) return parseInlineArray(s)
  const empty = parseInlineEmpty(s)
  if (empty !== undefined) return empty
  return parseScalarText(s)
}

/** 块标量收集：空行 lookahead（后随更深行才归块）；'|' 补一个尾随换行。缩进档 = 两空格。 */
function takeBlockScalar(lines, i, keyIndent, marker) {
  const base = keyIndent + 1 // 缩进档（level）
  const strip = base * 2 // 两空格
  const collected = []
  let j = i
  while (j < lines.length) {
    const line = lines[j]
    if (line.text === '') {
      const later = nextNonBlank(lines, j + 1)
      if (later && later.indent >= base) { collected.push(''); j += 1; continue }
      break
    }
    if (line.indent < base) break
    collected.push(line.raw.slice(strip)) // raw 保留原始前导空格，块内容自身缩进不丢
    j += 1
  }
  const value = collected.join('\n')
  return marker === '|' ? `${value}\n` : value
}

/** key: value 切分（首个冒号；值可含冒号） */
function splitKeyValue(text) {
  const m = /^([^\s:]+):(.*)$/.exec(text)
  if (!m) return null
  return { key: m[1], value: m[2].trim() }
}

/* ---------- frontmatter ↔ entry ---------- */

/**
 * 序列化条目为 md 全文（frontmatter + 正文）。
 * @param {object} entry 运行时条目（§3.4 形状；content=正文注入真相）
 * @param {{ worldbookName?: string }} [options] 非空时写入 worldbook 键（多世界书归属标记）
 * @returns {string}
 */
export function serializeWorldbookEntryFile(entry, { worldbookName = '' } = {}) {
  const safeEntry = isPlainObject(entry) ? entry : {}
  const lines = []
  const emit = (k, v) => lines.push(...emitKeyValue(k, v, 0))
  const name = str(safeEntry.name ?? safeEntry.title ?? safeEntry.id ?? '')
  const kind = str(safeEntry.kind ?? safeEntry.type ?? 'general') || 'general'
  const type = str(safeEntry.type ?? safeEntry.kind ?? kind) || kind

  emit('schemaVersion', WORLDBOOK_FILE_SCHEMA_VERSION)
  emit('id', str(safeEntry.id ?? ''))
  emit('title', name)
  emit('name', name)
  emit('kind', kind)
  if (type !== kind) emit('type', type)
  emit('status', str(safeEntry.status || 'active'))
  emit('version', safeEntry.version ?? '')
  emit('tags', tagsOfEntry(safeEntry))
  emit('links', declaredLinkIds(safeEntry))
  emit('cat', arrayOfStrings(safeEntry.cat))
  emit('keys', arrayOfStrings(safeEntry.keys))
  emit('keysSecondary', arrayOfStrings(safeEntry.keysSecondary))
  emit('summary', str(safeEntry.summary ?? ''))
  emit('sourceRefs', arrayOfStrings(safeEntry.sourceRefs))
  emit('updatedAt', str(safeEntry.updatedAt ?? ''))
  lines.push(...emitRelationBlock(richRelationEdges(safeEntry)))
  emit('injection', isPlainObject(safeEntry.injection) ? safeEntry.injection : {})
  emit('profile', isPlainObject(safeEntry.profile) ? safeEntry.profile : {})
  const wbName = str(worldbookName ?? '')
  if (wbName) emit('worldbook', wbName)

  // 未知键回写：entry.extra 优先，其次是 entry 上的未知自有字段（metadata/avatar 等）
  const emitted = new Set()
  for (const line of lines) {
    const pair = splitKeyValue(line.replace(/^(\s*)- /, ''))
    if (pair) emitted.add(pair.key)
  }
  const unknown = {}
  if (isPlainObject(safeEntry.extra)) Object.assign(unknown, safeEntry.extra)
  for (const [k, v] of Object.entries(safeEntry)) {
    if (KNOWN_ENTRY_FIELDS.has(k)) continue
    if (!(k in unknown)) unknown[k] = v
  }
  for (const k of Object.keys(unknown).sort()) {
    if (KNOWN_FM_KEYS.has(k) || emitted.has(k)) continue
    emit(k, unknown[k])
  }

  const content = typeof safeEntry.content === 'string' ? safeEntry.content : str(safeEntry.content ?? '')
  return `---\n${lines.join('\n')}\n---\n${content}`
}

/**
 * 解析条目 md。返回 { ok:true, entry } | { ok:false, error:{ code, message } }。
 * 未知 frontmatter 键归入 entry.extra；不认识的缩进块（含 relations 之外的块）同样进 extra。
 */
export function parseWorldbookEntryFile(text) {
  const source = str(text)
  const m = FRONTMATTER_DELIM_RE.exec(source)
  if (!m) {
    return { ok: false, error: { code: 'MISSING_FRONTMATTER', message: '未找到 frontmatter（文件须以 --- 开头）' } }
  }
  const raw = m[1]
  const body = source.slice(m[0].length).replace(/^\r?\n/, '')
  // 缩进档 = 两空格（受限子集约定；与 emitter 对齐）。raw 保留原行（块标量需要原始前导空格）
  const lines = raw.split(/\r?\n/).map(text2 => {
    const bare = text2.replace(/\r$/, '')
    const stripped = bare.replace(/^ +/, '')
    return { indent: Math.floor((bare.length - stripped.length) / 2), text: stripped, raw: bare }
  })
  const [fm] = takeMap(lines, 0, 0)

  if (fm.schemaVersion !== undefined && Number(fm.schemaVersion) !== WORLDBOOK_FILE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        message: `不支持的 schemaVersion: ${JSON.stringify(fm.schemaVersion)}（当前 ${WORLDBOOK_FILE_SCHEMA_VERSION}）`
      }
    }
  }
  const id = str(fm.id ?? '')
  if (!id.trim()) {
    return { ok: false, error: { code: 'MISSING_ID', message: 'frontmatter 缺少 id' } }
  }

  const relations = Array.isArray(fm.relations)
    ? fm.relations.filter(r => isPlainObject(r))
    : []
  const relationTargets = new Set(relations.map(r => str(r.to)).filter(Boolean))
  // links − relations.to 还原纯 id 层（序列化时的合成逆运算）
  const links = (Array.isArray(fm.links) ? fm.links : [])
    .map(l => str(l))
    .filter(l => l && !relationTargets.has(l))

  const extra = {}
  for (const [k, v] of Object.entries(fm)) {
    if (!KNOWN_FM_KEYS.has(k)) extra[k] = v
  }

  const entry = {
    id,
    name: str(fm.name ?? fm.title ?? id),
    title: str(fm.title ?? fm.name ?? id),
    kind: str(fm.kind ?? fm.type ?? 'general') || 'general',
    type: str(fm.type ?? fm.kind ?? 'general') || 'general',
    status: str(fm.status ?? '') || 'active',
    version: fm.version ?? '',
    tags: arrayOfStrings(fm.tags),
    links,
    cat: arrayOfStrings(fm.cat),
    keys: arrayOfStrings(fm.keys),
    keysSecondary: arrayOfStrings(fm.keysSecondary),
    summary: typeof fm.summary === 'string' ? fm.summary : str(fm.summary ?? ''),
    sourceRefs: arrayOfStrings(fm.sourceRefs),
    updatedAt: str(fm.updatedAt ?? ''),
    relations,
    injection: isPlainObject(fm.injection) ? fm.injection : {},
    profile: isPlainObject(fm.profile) ? fm.profile : {},
    extra,
    content: body
  }
  return { ok: true, entry }
}

/* ---------- index.json 指针账本 ---------- */

function localDateStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * kit index.json 指针账本（唯一 RAG 入口；A2 写侧确定性重建）。
 * 结构对齐 kit tools/worldbook.py init：sections = 六个 list 型分类 + 伏笔/底牌 两个 text 型骨架指针。
 */
export function buildWorldbookIndexFile(worldbook) {
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  const byCat = new Map(CAT_ORDER.map(cat => [cat, []]))
  for (const entry of entries) {
    const cat = catForEntry(entry)
    const name = str(entry?.name ?? entry?.title ?? entry?.id ?? '')
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push({
      id: str(entry?.id ?? ''),
      title: name,
      tags: tagsOfEntry(entry),
      links: declaredLinkIds(entry),
      status: str(entry?.status || 'active'),
      version: strVersion(entry?.version),
      updated: str(entry?.updatedAt ?? ''),
      file: `${WBDIR}/${cat}/${sanitizeFilename(name)}.md`
    })
  }
  const sections = []
  for (const [cat, list] of byCat) {
    list.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    sections.push({ id: cat, title: cat, format: 'list', file: `${WBDIR}/${cat}/`, entries: list })
  }
  sections.push({ id: '伏笔', title: '伏笔台账', format: 'text', file: `${WBDIR}/伏笔/台账.md` })
  sections.push({ id: '底牌', title: '暗线底牌（作者专用·永不入正文）', format: 'text', file: `${WBDIR}/底牌/暗线底牌.md` })

  const name = str(worldbook?.name ?? '')
  return {
    世界书: `${name ? `${name} ` : ''}世界书（小说变体）`,
    变体: 'novel',
    version: '1.0.0',
    updated: localDateStamp(),
    note: '唯一 RAG 入口；文件即真相；章(集)回交稿后按 纪律.md 结算五件',
    状态机: 'draft → active → retired',
    sections
  }
}

/* ---------- worldbook-graph@1（与 kit worldbook_index.py build_index 同构） ---------- */

/** kit first_para：首段去标记字符，≥8 字才取，≤120 字（按码点） */
function firstPara(body, limit = 120) {
  for (const para of str(body).split('\n\n')) {
    const t = Array.from(para.replace(/[#*`>[\]]/g, '')).join('').trim()
    if (t.length >= 8) {
      const cut = Array.from(t).slice(0, limit).join('')
      return cut + (t.length > limit ? '…' : '')
    }
  }
  return ''
}

function mtimeStamp(updatedAt) {
  const m = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(str(updatedAt))
  return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}` : ''
}

/** kit 侧 version 一律读字符串；数字版本号如 2 → '2' */
function strVersion(value) {
  if (value === undefined || value === null || value === '') return ''
  return String(value)
}

function localMinuteStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * worldbook-graph@1 图谱对象（与 kit build_index 产物同构）。
 * 三来源边：① links/relations 声明边（weight 2，src link）② 正文标题互涉（min(n,3)，src mention，
 * 扫描序列化全文——kit 读整文件文本，frontmatter 命中也计数，保证 kit 重建结果一致）
 * ③ tag 交叉（tag 恰为其他词条 id/标题，weight 1，src tag）。多来源 src 用 '+' 拼接。
 */
export function buildWorldbookGraphFile(worldbook) {
  const list = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  // 序列化全文与词条一一绑定后再排序（kit 读整文件文本做 mention 计数）
  const pairs = list.map(item => {
    const entry = isPlainObject(item) ? item : {}
    const name = str(entry.name ?? entry.title ?? entry.id ?? '')
    const cat = catForEntry(entry)
    return {
      graph: {
        id: str(entry.id ?? ''),
        cat,
        title: name,
        status: str(entry.status || 'active'),
        version: strVersion(entry.version),
        tags: tagsOfEntry(entry),
        links: declaredLinkIds(entry),
        summary: firstPara(typeof entry.content === 'string' ? entry.content : str(entry.content ?? '')),
        path: `${WBDIR}/${cat}/${sanitizeFilename(name)}.md`,
        mtime: mtimeStamp(entry.updatedAt)
      },
      text: serializeWorldbookEntryFile(item)
    }
  }).sort((a, b) => (a.graph.path < b.graph.path ? -1 : a.graph.path > b.graph.path ? 1 : 0))

  const entries = pairs.map(p => p.graph)
  const fileText = new Map(pairs.map(p => [p.graph.path, p.text]))

  const byId = {}
  for (const e of entries) {
    byId[e.id] = e
    byId[e.title] = e // 标题也能当键（mention 归并，kit 同款）
  }

  const edges = {}
  const addEdge = (a, b, src, weight) => {
    if (a === b || !a || !b) return
    const key = a < b ? [a, b] : [b, a]
    const rec = edges[key] || (edges[key] = { a: key[0], b: key[1], src: new Set(), weight: 0 })
    rec.src.add(src)
    rec.weight += weight
  }

  for (const e of entries) {
    for (const lk of e.links) {
      const tgt = byId[lk]
      if (tgt) addEdge(e.id, tgt.id, 'link', 2)
    }
    const bodyText = fileText.get(e.path) || ''
    for (const other of entries) {
      if (other.id === e.id || other.title.length < 2) continue
      const n = bodyText.split(other.title).length - 1
      if (n) addEdge(e.id, other.id, 'mention', Math.min(n, 3))
    }
    for (const t of e.tags) {
      const hit = byId[t]
      if (hit && hit.id !== e.id) addEdge(e.id, hit.id, 'tag', 1)
    }
  }

  const relations = Object.values(edges)
    .map(rec => ({ a: rec.a, b: rec.b, src: Array.from(rec.src).sort().join('+'), weight: rec.weight }))
    .sort((x, y) => (y.weight - x.weight) || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0))

  const deg = {}
  for (const r of relations) {
    deg[r.a] = (deg[r.a] || 0) + 1
    deg[r.b] = (deg[r.b] || 0) + 1
  }
  const byCat = {}
  for (const e of entries) byCat[e.cat] = (byCat[e.cat] || 0) + 1

  return {
    format: 'worldbook-graph@1',
    project: str(worldbook?.name ?? ''),
    built_at: Object.prototype.hasOwnProperty.call(worldbook ?? {}, 'builtAt')
      ? str(worldbook.builtAt)
      : localMinuteStamp(),
    entries,
    relations,
    stats: {
      entries: entries.length,
      edges: relations.length,
      isolated: entries.filter(e => !deg[e.id]).length,
      byCat: Object.fromEntries(Object.keys(byCat).sort().map(k => [k, byCat[k]]))
    }
  }
}

/**
 * 解析 graph.json 文本 → { ok:true, graph } | { ok:false, error:{ code, message } }。
 */
export function parseWorldbookGraphFile(text) {
  let data
  try {
    data = JSON.parse(str(text))
  } catch (err) {
    return { ok: false, error: { code: 'BAD_JSON', message: `graph.json 不是合法 JSON：${err?.message || err}` } }
  }
  if (!isPlainObject(data) || data.format !== 'worldbook-graph@1') {
    return { ok: false, error: { code: 'BAD_FORMAT', message: '缺少 format=worldbook-graph@1' } }
  }
  if (!Array.isArray(data.entries) || !Array.isArray(data.relations) || !isPlainObject(data.stats)) {
    return { ok: false, error: { code: 'BAD_SHAPE', message: 'entries/relations 须为数组且 stats 须为对象' } }
  }
  return { ok: true, graph: data }
}

/* ---------- 体系标准骨架件（幂等补齐用；文案对齐 kit tools/worldbook.py） ---------- */

const VARIANT_SPECS = {
  novel: {
    variantName: '小说',
    unit: '章',
    ledger: '编年/章账.md',
    extra: '名目层入 设定/名目与黑话.md；成长阶/招式名目先登记再进正文'
  },
  drama: {
    variantName: '剧本',
    unit: '集',
    ledger: '分集账/集账.md',
    extra: '场景卡联动有名场景≤3 硬约束；道具卡管连续性信物；与 词汇表.json 并行（词汇表管专名安全，世界书管设定真相）'
  }
}

function disciplineText(variant) {
  const spec = VARIANT_SPECS[variant] || VARIANT_SPECS.novel
  const unit = spec.unit
  return `# 世界书纪律（${spec.variantName}变体）

> 体系标准：knowledge/continuity/worldbook.md ｜ 结算单位：**${unit}** ｜ 状态机：draft → active → retired（不删档）

## 章回结算五件（每${unit}交稿后、下一${unit}派发前）

1. 章卡/集卡（一句话+梗点+钩型+新名目）→ ${spec.ledger}
2. 人物状态推进（伤/钱/知情/关系/位置）→ 人物/*.md（当前状态改写+变动史追加）
3. 交接（下一${unit}写手必知的 3-5 条）→ ${spec.ledger} 末节
4. 伏笔变动（新埋/回收/顺期）→ 伏笔/台账.md
5. 世界揭示（本${unit}确立的新设定事实）→ 设定/*.md

## RAG 规则（写第 N ${unit}的开工动作）

1. 读 index.json 按 tags 拉词条（不重读全书）
2. 读 ${spec.ledger} 末节（=上一${unit} handoff）
3. 读伏笔台账中 open 且临近回收的条目
4. 底牌按节点号取段，禁止整读

## 变体特例

${spec.extra}
`
}

function ledgerText(variant) {
  const unit = (VARIANT_SPECS[variant] || VARIANT_SPECS.novel).unit
  return `# ${unit}账（逐${unit}结算 = handoff）

> 每${unit}交稿后追加一节；下一${unit}写手只读末节。

## 交接（开局状态 · 第 1 ${unit}前）

- （待填）
`
}

function covertCardsText() {
  return `---
schemaVersion: ${WORLDBOOK_FILE_SCHEMA_VERSION}
id: covert-cards
title: 暗线底牌（作者专用·永不入正文）
name: 暗线底牌（作者专用·永不入正文）
kind: general
status: draft
version: ''
tags: [底牌, 暗线]
links: []
---

# 暗线底牌（作者专用·永不入正文）

> status: draft 永不入正文；注入端显式排除。按节点号取段，禁止整读。

## 底牌登记

- （待填：节点号 ｜ 内容 ｜ 揭示条件）
`
}

/**
 * 体系标准骨架件（相对 世界书/ 的路径 → 内容；幂等补齐用，不覆盖已有）。
 * 契约固定四键：纪律.md / 伏笔/台账.md / 底牌/暗线底牌.md / 编年/章账.md。
 * drama 变体同样落这四键（章账键内文案随变体用「集」）——kit 的 分集账/集账.md 路径
 * 由消费方（A2）按变体映射。
 */
export function buildWorldbookAuxFiles({ variant = 'novel' } = {}) {
  return {
    '纪律.md': disciplineText(variant),
    '伏笔/台账.md': '# 伏笔台账\n\n| fid | 内容 | 埋点 | 预定回收 | 状态 |\n| --- | --- | --- | --- | --- |\n',
    '底牌/暗线底牌.md': covertCardsText(),
    '编年/章账.md': ledgerText(variant)
  }
}
