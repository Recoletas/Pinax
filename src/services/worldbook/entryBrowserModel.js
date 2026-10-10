/**
 * 统一条目浏览器纯逻辑模型（W2·B1）——只读浏览器（UnifiedEntryBrowser）的数据层。
 *
 * 冻结契约：docs/plan/worldbook-unification-abc-20261008.md §2 B1 行、§3.1/§3.4。
 * 交互蓝本：storyflow-kit panel/kitapp（WorldbookPage/WorldbookGraphView/EntryWikiView +
 * lib/worldbook-data.ts + core/src/kernel-view.ts worldbookSearch）。
 *
 * 硬约束：
 * - 零 Vue / store / 路由依赖：纯函数 + 模块内 WeakMap 缓存，node 冒烟直跑
 *   （scripts/worldbook-browser-smoke.mjs）。档位是唯一例外口径：tier 判定委托注入端
 *   worldbookContextBuilder.entryTierOf（node 亦可直载），本模块不自定第二套档位规则。
 * - 唯一的 cat/type→目录、links 合成、summary、graph 语义真源是
 *   shared/worldbookFileContract.js（W1·A1）：本模块镜像其纯判定函数
 *   （目录映射/标签归一/首段摘要），并用 buildWorldbookGraphFile 产出图谱与
 *   引用解析的 path 索引——冒烟对三者逐一与契约产物 deepStrictEqual 防漂移。
 * - Entry 形状（§3.4）：id/name/type/keys/keysSecondary/content/injection/relations/metadata
 *   必有；status/version/cat/tags/links/profile/summary/kind 可选。旧 relations
 *   对象分组（tags/locations/characters/events/placeIds/characterIds）与富关系
 *   数组（[{to,type,...}]）都接受，归一口径与契约 normalizeRelations 一致。
 * - 文本检索自 W1-A 起走 kit worldbook_search 代理（knowledgeSearchClient.js）：打分与
 *   一跳扩展只认 kit 返回值，本模块不再持有第二份打分器（§5-7 裁定），只留 cat/status/tier
 *   过滤与「过滤后可见集合/命中集合」两个下发图谱的纯派生函数（W2-A-2）。
 */

import { buildWorldbookGraphFile } from '../../../shared/worldbookFileContract.js'
import { entryTierOf } from './worldbookContextBuilder.js'

/** type→cat 目录映射（镜像契约 §3.1；未知 type→设定） */
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

/** 分类树一级顺序（= 契约 CAT_ORDER：kit init dirs + Pinax 扩展 资料） */
export const CAT_DIRS = ['设定', '人物', '势力', '地理', '编年', '资料']

/** 分类配色（kit CAT_PALETTE 的 Pinax cat 名移植；hex 是数据色、不分主题） */
export const CAT_PALETTE = {
  人物: '#c96f4a',
  地理: '#5b7fa6',
  势力: '#8a6fb0',
  编年: '#6a9aa0',
  设定: '#5f9c7a',
  资料: '#a06a8a',
  总览: '#b09a5f'
}

/** kit catColorOf：未知分类的兜底色 */
export function catColorOf(cat) {
  return CAT_PALETTE[cat] || '#8a8375'
}

/** kind/type 中文标签（与 WorldBookEditor entryTypes 词汇一致；source=Pinax 扩展） */
export const KIND_LABELS = {
  general: '通用',
  rule: '规则',
  style: '风格',
  forbidden: '禁忌',
  location: '地点',
  character: '角色',
  organization: '组织',
  item: '物品',
  lore: '设定',
  quest: '任务',
  event: '事件',
  source: '资料'
}

/** 未知 kind 原样返回（自定义 kind 过渡期可见） */
export function kindLabelOf(entry) {
  const kind = String(entry?.kind ?? entry?.type ?? 'general').trim() || 'general'
  return KIND_LABELS[kind] || kind
}

/** 状态机（体系标准）：draft → active → retired；缺省/未知值 → active */
const STATUS_VALUES = new Set(['draft', 'active', 'retired'])

export function entryStatusOf(entry) {
  const s = String(entry?.status ?? '').trim().toLowerCase()
  return STATUS_VALUES.has(s) ? s : 'active'
}

/** type/kind → cat 目录名（镜像契约 catForEntry） */
export function entryCatDirOf(entry) {
  const kind = String(entry?.kind ?? entry?.type ?? 'general').trim() || 'general'
  return TYPE_TO_CAT[kind] || '设定'
}

function str(value) {
  return String(value ?? '')
}

/* ---------- 标签 / 摘要（镜像契约 tagsOfEntry / firstPara，供检索与卡片） ---------- */

/** tags：entry.tags ∪ 旧 relations.tags 桶（首现去重；契约 tagsOfEntry 同口径） */
export function entryTagsOf(entry) {
  const out = []
  const seen = new Set()
  const push = (t) => {
    const s = str(t)
    if (s && !seen.has(s)) { seen.add(s); out.push(s) }
  }
  if (Array.isArray(entry?.tags)) for (const t of entry.tags) push(t)
  const rel = entry?.relations
  if (rel && typeof rel === 'object' && !Array.isArray(rel) && Array.isArray(rel.tags)) {
    for (const t of rel.tags) push(t)
  }
  return out
}

/** kit firstPara：首个 ≥8 字的段落去标记字符，≤120 字（按码点），超出补 … */
export function entrySummaryOf(entry) {
  const body = typeof entry?.content === 'string' ? entry.content : str(entry?.content)
  for (const para of body.split('\n\n')) {
    const t = Array.from(para.replace(/[#*`>[\]]/g, '')).join('').trim()
    if (t.length >= 8) {
      const cut = Array.from(t).slice(0, 120).join('')
      return cut + (t.length > 120 ? '…' : '')
    }
  }
  return ''
}

/** wiki 详情首段（去标记、不截断；与 entrySummaryOf 同源不同限长） */
export function entryLedeOf(entry) {
  const body = typeof entry?.content === 'string' ? entry.content : str(entry?.content)
  for (const para of body.split('\n\n')) {
    const t = Array.from(para.replace(/[#*`>[\]]/g, '')).join('').trim()
    if (t.length >= 8) return t
  }
  return ''
}

/* ---------- 分类树（一级=cat 目录带计数，二级=injection.group 自由分组） ---------- */

/**
 * 分类树带计数。返回 { total, cats: [{ id, label, count, groups: [{ id, label, count }] }] }；
 * 一级按 CAT_DIRS 定序（多余目录字母序兜底），二级按计数降序。
 * group 取 injection.group（trim 后非空才计）。
 */
export function buildCategoryTree(entries) {
  const list = Array.isArray(entries) ? entries : []
  const byCat = new Map()
  for (const entry of list) {
    const cat = entryCatDirOf(entry)
    if (!byCat.has(cat)) byCat.set(cat, { count: 0, groups: new Map() })
    const bucket = byCat.get(cat)
    bucket.count += 1
    const group = str(entry?.injection?.group).trim()
    if (group) bucket.groups.set(group, (bucket.groups.get(group) || 0) + 1)
  }
  const ordered = [
    ...CAT_DIRS.filter((cat) => byCat.has(cat)),
    ...[...byCat.keys()].filter((cat) => !CAT_DIRS.includes(cat)).sort()
  ]
  const cats = ordered.map((cat) => {
    const bucket = byCat.get(cat)
    const groups = [...bucket.groups.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
      .map(([label, count]) => ({ id: `${cat}/${label}`, label, count }))
    return { id: cat, label: cat, count: bucket.count, groups }
  })
  return { total: list.length, cats }
}

/* ---------- 检索（kit 代理单源）+ cat/status/tier 本地过滤 ---------- */

/**
 * cat/status/tier 本地过滤（文本检索已改走 kit worldbook_search 代理，见 knowledgeSearchClient.js；
 * §5-7 裁定移除本地打分轨——避免第二实现漂移，打分/一跳扩展只认 kit 返回值）。
 * - cat：''/'全部' 不过滤；'人物' 按目录；'人物/皇室' 目录+自由分组二级联合。
 * - status：'' 不过滤，否则 entryStatusOf(entry) === status。
 * - tier：'' 不过滤，否则按注入端 entryTierOf 档位（core/support/background）——
 *   档位规则单源在 worldbookContextBuilder，本处不另定。
 */
export function filterEntries(entries, { cat = '', status = '', tier = '' } = {}) {
  let pool = Array.isArray(entries) ? entries.slice() : []
  const catKey = str(cat).trim()
  if (catKey && catKey !== '全部') {
    const slash = catKey.indexOf('/')
    const dir = slash >= 0 ? catKey.slice(0, slash) : catKey
    pool = pool.filter((entry) => entryCatDirOf(entry) === dir)
    if (slash >= 0) {
      const group = catKey.slice(slash + 1)
      pool = pool.filter((entry) => str(entry?.injection?.group).trim() === group)
    }
  }
  const statusKey = str(status).trim()
  if (statusKey) pool = pool.filter((entry) => entryStatusOf(entry) === statusKey)
  const tierKey = str(tier).trim()
  if (tierKey) pool = pool.filter((entry) => entryTierOf(entry) === tierKey)
  return pool
}

/**
 * 过滤后可见 id 集合（词条墙与图谱共用同一份过滤真相）。
 * 无任何过滤轴时返回 null——图谱据此显示全量并在页脚报总数，避免「12 / 12」这类假过滤。
 */
export function visibleIdsOf(entries, { cat = '', status = '', tier = '' } = {}) {
  const catKey = str(cat).trim()
  const filtering = Boolean((catKey && catKey !== '全部') || str(status).trim() || str(tier).trim())
  if (!filtering) return null
  return new Set(filterEntries(entries, { cat, status, tier }).map((entry) => entry.id))
}

/**
 * kit 检索命中 + 一跳扩展的节点 id 集合（图谱描环用；渲染 kit 结果，不重算打分）。
 * 空结果/无检索返回 null，与 visibleIdsOf 的「null = 不适用」口径一致。
 */
export function hitIdsOf(searchResult) {
  if (!searchResult) return null
  const ids = new Set()
  for (const hit of searchResult.hits || []) if (hit.id) ids.add(hit.id)
  for (const item of searchResult.expansion || []) if (item.id) ids.add(item.id)
  return ids.size ? ids : null
}

/* ---------- 关联 chips：三来源合并 + 四级兜底解析（kit resolveEntryRef 同款） ---------- */

/** 引用解析索引：从契约 graph 取 path 索引（保证与 graph.json/kit 完全同 path 语义）。 */
const RESOLVE_CACHE = new WeakMap()

function resolveIndexFor(entries) {
  let index = RESOLVE_CACHE.get(entries)
  if (index) return index
  const graph = buildWorldbookGraphFile({ entries })
  const byId = new Map()
  const byTitle = new Map()
  const byPath = new Map()
  const byTail = new Map()
  for (const node of graph.entries) {
    if (!byId.has(node.id)) byId.set(node.id, node)
    if (!byTitle.has(node.title)) byTitle.set(node.title, node)
    byPath.set(node.path, node)
    const tail = node.path.split('/').pop().replace(/\.md$/i, '')
    if (!byTail.has(tail)) byTail.set(tail, node)
  }
  index = { byId, byTitle, byPath, byTail }
  RESOLVE_CACHE.set(entries, index)
  return index
}

/**
 * 引用 → 词条四级兜底解析（照 kit resolveEntryRef）：
 * 全路径（path 或 path+.md）→ .md 尾段 → 裸标题 → id。找不到返回 null。
 */
export function resolveEntryRef(entries, ref) {
  const raw = str(ref).trim()
  if (!raw || !Array.isArray(entries) || !entries.length) return null
  const index = resolveIndexFor(entries)
  const bare = raw.replace(/\.md$/i, '')
  return (
    index.byPath.get(raw) ||
    index.byPath.get(`${raw}.md`) ||
    index.byTail.get(bare) ||
    index.byTitle.get(bare) ||
    index.byTitle.get(raw) ||
    index.byId.get(bare) ||
    index.byId.get(raw) ||
    null
  )
}

/**
 * 关联引用三来源合并（首现去重，未解析原样保留）：
 * ① entry.links（字符串或 {to}）② entry.relations（富关系数组 [{to}] 或旧对象分组桶，
 * tags 桶不算关联）③ 正文 `[[id]]` 交叉链接。
 */
export function relationRefsOf(entry) {
  const refs = []
  const seen = new Set()
  const push = (value) => {
    const s = str(value).trim()
    if (s && !seen.has(s)) { seen.add(s); refs.push(s) }
  }
  if (Array.isArray(entry?.links)) {
    for (const link of entry.links) push(link && typeof link === 'object' ? link.to : link)
  }
  const rel = entry?.relations
  if (Array.isArray(rel)) {
    for (const r of rel) push(r && typeof r === 'object' ? r.to : r)
  } else if (rel && typeof rel === 'object') {
    for (const [bucket, value] of Object.entries(rel)) {
      if (bucket === 'tags' || !Array.isArray(value)) continue
      for (const to of value) push(to)
    }
  }
  const content = typeof entry?.content === 'string' ? entry.content : str(entry?.content)
  for (const m of content.matchAll(/\[\[([^\]]+)\]\]/g)) push(m[1])
  return refs
}

/**
 * 关联 chips：relationRefsOf 三来源合并后逐条四级兜底解析。
 * 返回 [{ ref, resolved, entry }]——entry 为契约 graph 节点（id/cat/title/status/path/...），
 * 未解析 resolved=false、entry=null（上层显式标「未解析」，不静默丢弃）。
 */
export function buildRelationChips(entry, entries) {
  return relationRefsOf(entry).map((ref) => {
    const target = resolveEntryRef(entries, ref)
    return { ref, resolved: Boolean(target), entry: target }
  })
}

/* ---------- 图谱：直接复用契约 buildWorldbookGraphFile ---------- */

/**
 * worldbook-graph@1 图谱对象（与 kit worldbook_index.py 产物同构）。
 * 直接委托 shared/worldbookFileContract.js——图谱语义零新增、零漂移。
 */
export function buildGraph(worldbook) {
  return buildWorldbookGraphFile(worldbook)
}
