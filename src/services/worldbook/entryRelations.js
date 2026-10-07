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
// 供 worldbookContextBuilder.js（生产判定路径）与
// scripts/worldbook-relations-smoke.mjs（回归冒烟）共用同一实现。

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
// 优先 store 命名 relations.locations / relations.characters（非空时直接采用），
// 回落旧命名 relations.placeIds / relations.characterIds（兼容历史/手写数据）。
export function normalizeEntryRelations(entry) {
  const relations = entry?.relations && typeof entry.relations === 'object' ? entry.relations : {}
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
