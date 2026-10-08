// 条目关系（relations）纯函数模块 —— W1-A4 关系地基修复。
//
// Bug 背景（worldbook-unification-20261007 §0.3 / §5 P0.1）：写入端
// （src/stores/worldStore.js ~867-872、src/services/worldbook/worldbookDraftAssets.js
// ~188-193）写 `relations.locations / relations.characters`，而注入端
// （worldbookContextBuilder.js）读 `relations.placeIds / relations.characterIds`，
// 字段名不一致导致「地点绑定/角色绑定」激活路径对 store 生成的条目一直空转。
// 修复口径：以 store 侧 locations/characters 为准，读取端兼容两种命名。
//
// 本模块必须保持零依赖：不 import 任何 Vue / composable / store，
// 供 worldbookContextBuilder.js（生产判定路径）、W3 编辑面组件与
// scripts/worldbook-relations-smoke.mjs / worldbook-editing-smoke.mjs（回归冒烟）共用同一实现。
// W3·B3 增量：双层 links 同步（relationRowsFromEntry/applyRelationRows）、
// 共现归纳建议（coOccurrenceEdgesForEntry，min(n,3)）、注入一跳邻居
// （relationNeighborWeights，weight 降序 top-N）；normalizeEntryRelations
// 增加富关系数组形状支持（编辑面写回 relations 数组后绑定激活路径不空转）。

function toTrimmedString(value) {
  return String(value ?? '').trim()
}

// 任意列表 → 字符串化、去空、去重后的 id/名称列表
export function normalizeIdList(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const result = []
  for (const item of value) {
    const id = toTrimmedString(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

// 归一化条目 relations → { locations, characters }。
// 三种形状：
// - 富关系数组（W3 双层编辑面写回）：type=地点归属/location → locations，type=character → characters；
// - 优先 store 命名 relations.locations / relations.characters（非空时直接采用），
// - 回落旧命名 relations.placeIds / relations.characterIds（兼容历史/手写数据）。
export function normalizeEntryRelations(entry) {
  const relations = entry?.relations && typeof entry.relations === 'object' ? entry.relations : {}
  if (Array.isArray(relations)) {
    const edges = normalizeRichRelations(relations).edges.filter((edge) => toTrimmedString(edge?.to))
    return {
      locations: normalizeIdList(edges
        .filter((edge) => edge.type === '地点归属' || edge.type === 'location')
        .map((edge) => edge.to)),
      characters: normalizeIdList(edges
        .filter((edge) => edge.type === 'character')
        .map((edge) => edge.to))
    }
  }
  const locations = normalizeIdList(relations.locations)
  const characters = normalizeIdList(relations.characters)
  return {
    locations: locations.length ? locations : normalizeIdList(relations.placeIds),
    characters: characters.length ? characters : normalizeIdList(relations.characterIds)
  }
}

// 条目来源引用：metadata.sourceRef 优先，回落 relations.sourceRef
export function entrySourceRef(entry) {
  const relations = entry?.relations && typeof entry.relations === 'object' ? entry.relations : {}
  return toTrimmedString(entry?.metadata?.sourceRef || relations.sourceRef || '')
}

/* ---------- W3·B3 富关系层（双层 links 契约 §3.1） ---------- */

// 关系类型 10 枚举（worldbook-unification-20261007 §4.2）；值为中文字面量，
// 直接存进 links[].type / relations[].type。历史数据里的英文桶名（location/
// character/event）原样保留展示，不改写。
export const RELATION_TYPE_VALUES = Object.freeze([
  '亲属', '师承', '主从', '同僚', '敌对', '情感', '债务', '秘密知情', '地点归属', '势力成员'
])

// stance 三值（正/负/暧昧）；covert=暗线布尔
export const RELATION_STANCE_VALUES = Object.freeze(['正', '负', '暧昧'])

// 与 shared/worldbookFileContract.js normalizeRelations 同口径（本地实现保持零依赖）：
// 数组 → 富关系边原样归一；旧运行时对象分组 → id 桶转边（tags 桶单列回传）。
const LEGACY_RELATION_BUCKETS = {
  locations: 'location',
  placeIds: 'location',
  characters: 'character',
  characterIds: 'character',
  events: 'event'
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function normalizeRichRelations(relations) {
  if (Array.isArray(relations)) {
    return {
      edges: relations.map((edge) => (isPlainObject(edge) ? edge : (edge === null || edge === undefined ? { to: '' } : { to: toTrimmedString(edge) }))),
      legacyTags: []
    }
  }
  if (!isPlainObject(relations)) return { edges: [], legacyTags: [] }
  const edges = []
  const legacyTags = []
  for (const [bucket, value] of Object.entries(relations)) {
    if (!Array.isArray(value)) continue
    if (bucket === 'tags') {
      for (const tag of value) legacyTags.push(toTrimmedString(tag))
      continue
    }
    const type = LEGACY_RELATION_BUCKETS[bucket] || bucket
    for (const to of value) {
      edges.push({ to: toTrimmedString(to), type, weight: 2, src: 'declared' })
    }
  }
  return { edges, legacyTags }
}

// 富关系边数组（一跳扩展与双层同步共用）
export function richRelationEdgesOf(entry) {
  return normalizeRichRelations(entry?.relations).edges
}

/**
 * 条目 relations → 编辑行 [{to,type,stance,covert,weight,src}]。
 * 来源顺序：relations 富关系层（数组或旧对象分组）→ links 纯 id 层中未被富关系
 * 覆盖的剩余 id（src:'link'、type:''）。空 to 行丢弃；按 to 首现去重（kit 同款
 * 每对目标一条边）。
 */
export function relationRowsFromEntry(entry) {
  const rows = []
  const seen = new Set()
  const push = (to, row) => {
    const id = toTrimmedString(to)
    if (!id || seen.has(id)) return
    seen.add(id)
    rows.push({
      to: id,
      type: toTrimmedString(row?.type ?? ''),
      stance: RELATION_STANCE_VALUES.includes(row?.stance) ? row.stance : '',
      covert: row?.covert === true,
      weight: Number.isFinite(Number(row?.weight)) && Number(row.weight) > 0 ? Number(row.weight) : 2,
      src: toTrimmedString(row?.src ?? '') || 'declared'
    })
  }
  for (const edge of richRelationEdgesOf(entry)) {
    push(edge?.to, edge)
  }
  const links = Array.isArray(entry?.links) ? entry.links : []
  for (const link of links) {
    const to = link && typeof link === 'object' ? link?.to : link
    push(to, { type: '', weight: 2, src: 'link' })
  }
  return rows
}

/**
 * 编辑行 → 双层写回载荷（保存/删行共用同一实现，两层必然一致）：
 * - links = 全部 to 的去重 id 数组（纯 id 层）
 * - relations = 富对象数组 [{to,type,stance,covert,weight,src}]
 * - tags = 原 tags ∪ 旧 relations.tags 桶（对象分组升数组时防丢标签）
 * 自引用（to === entry.id）与空 to 丢弃；重复 to 取首现。
 */
export function applyRelationRows(entry, rows) {
  const selfId = toTrimmedString(entry?.id)
  const edges = []
  const seen = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    const to = toTrimmedString(row?.to)
    if (!to || to === selfId || seen.has(to)) continue
    seen.add(to)
    edges.push({
      to,
      type: toTrimmedString(row?.type ?? ''),
      stance: RELATION_STANCE_VALUES.includes(row?.stance) ? row.stance : '',
      covert: row?.covert === true,
      weight: Number.isFinite(Number(row?.weight)) && Number(row.weight) > 0 ? Number(row.weight) : 2,
      src: toTrimmedString(row?.src ?? '') || 'declared'
    })
  }
  const { legacyTags } = normalizeRichRelations(entry?.relations)
  const ownTags = Array.isArray(entry?.tags) ? entry.tags.map((tag) => toTrimmedString(tag)).filter(Boolean) : []
  return { links: edges.map((edge) => edge.to), relations: edges, tags: normalizeIdList([...ownTags, ...legacyTags]) }
}

/**
 * 共现归纳建议（kit mention 边同款，min(n,3)）：扫 source 条目 content 中
 * 其他条目标题出现次数；产出 src='co-occurrence' 的建议边（只进复核清单，
 * 不自动写入 relations）。已在新关系层/旧桶/links 里的目标不重复建议。
 */
export function coOccurrenceEdgesForEntry(entry, entries, { minTitleLength = 2 } = {}) {
  const content = typeof entry?.content === 'string' ? entry.content : toTrimmedString(entry?.content ?? '')
  if (!content) return []
  const existing = new Set([toTrimmedString(entry?.id), ...relationRowsFromEntry(entry).map((row) => row.to)])
  const suggestions = []
  for (const other of Array.isArray(entries) ? entries : []) {
    const to = toTrimmedString(other?.id)
    const title = toTrimmedString(other?.name ?? other?.title)
    if (!to || !title || title.length < minTitleLength || existing.has(to)) continue
    const count = content.split(title).length - 1
    if (count > 0) suggestions.push({ to, toTitle: title, count, weight: Math.min(count, 3), src: 'co-occurrence' })
  }
  return suggestions.sort((a, b) => b.weight - a.weight || b.count - a.count || a.to.localeCompare(b.to, 'zh'))
}

/**
 * 注入一跳扩展（kit kernel-view 一跳 top-N 同款）：命中条目的 relations/links
 * 邻居，按 weight 降序取 top-N（默认 3），去重、排除已命中条目与自环。
 * 目标解析：先 id、后条目名（四级兜底的 id/标题两级轻量版；生产热路径不建全图）。
 * 返回 [{ id, weight }]，weight 平分时按发现序稳定排序。
 */
export function relationNeighborWeights(matchedEntries, entries, { limit = 3 } = {}) {
  const list = Array.isArray(entries) ? entries : []
  const byId = new Map()
  const byName = new Map()
  for (const candidate of list) {
    const id = toTrimmedString(candidate?.id)
    if (id && !byId.has(id)) byId.set(id, candidate)
    const name = toTrimmedString(candidate?.name ?? candidate?.title)
    if (name && !byName.has(name)) byName.set(name, candidate)
  }
  const matchedIds = new Set((Array.isArray(matchedEntries) ? matchedEntries : []).map((m) => toTrimmedString(m?.id)))
  const best = new Map()
  let order = 0
  const consider = (ref, weight) => {
    const key = toTrimmedString(ref)
    if (!key) return
    const target = byId.get(key) || byName.get(key)
    const targetId = toTrimmedString(target?.id)
    if (!targetId || matchedIds.has(targetId)) return
    const known = best.get(targetId)
    if (known) known.weight = Math.max(known.weight, weight)
    else best.set(targetId, { id: targetId, weight, order: order += 1 })
  }
  for (const matched of Array.isArray(matchedEntries) ? matchedEntries : []) {
    for (const edge of richRelationEdgesOf(matched)) {
      consider(edge?.to, Number.isFinite(Number(edge?.weight)) && Number(edge.weight) > 0 ? Number(edge.weight) : 2)
    }
    const links = Array.isArray(matched?.links) ? matched.links : []
    for (const link of links) {
      consider(link && typeof link === 'object' ? link?.to : link, 2)
    }
  }
  return [...best.values()]
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .slice(0, Math.max(0, limit))
}

// boundContext / runtimeState 侧的 id 集合（接受数组或 Set，原样透传 Set）
function toIdSet(value) {
  if (value instanceof Set) return value
  return new Set(normalizeIdList(value))
}

// 场景地点判定：条目 relations 绑定的任一地点 id 命中场景地点集合
export function entryMatchesSceneLocation(entry, locationIds) {
  const ids = toIdSet(locationIds)
  if (!ids.size) return false
  return normalizeEntryRelations(entry).locations.some((id) => ids.has(id))
}

// 角色判定：条目 relations 绑定的任一角色 id 命中在场/说话角色集合
export function entryMentionsCharacter(entry, characterIds) {
  const ids = toIdSet(characterIds)
  if (!ids.size) return false
  return normalizeEntryRelations(entry).characters.some((id) => ids.has(id))
}

// 来源引用判定
export function entryMatchesSourceRef(entry, sourceRefs) {
  const refs = toIdSet(sourceRefs)
  const ref = entrySourceRef(entry)
  return Boolean(ref && refs.has(ref))
}

// P1-6 bound 绑定总判定 —— 返回与 contextBuilder 相同的 matchedKeysLabel。
// 优先级：地点绑定 > 角色绑定 > 来源绑定；未命中返回 null。
// 除字段名兼容（locations/characters 优先、placeIds/characterIds 回落）外，
// 判定语义与修复前完全一致。
export function entryBoundMatchLabel(entry, { placeIds = [], characterIds = [], sourceRefs = [] } = {}) {
  if (entryMatchesSceneLocation(entry, placeIds)) return '地点绑定'
  if (entryMentionsCharacter(entry, characterIds)) return '角色绑定'
  if (entryMatchesSourceRef(entry, sourceRefs)) return '来源绑定'
  return null
}
