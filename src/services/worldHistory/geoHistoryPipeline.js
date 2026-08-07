import { extractMapSemantics, flattenSemantics } from './mapSemantics'
import { generateGeoHistory } from './historyGenerator'
import { attachPlaceRefsToGeoHistory } from './placeRefs'
import { collectWorldbookLocationEntries } from '../ai/worldbookMapBridge'

const REVIEW_CATEGORY_ORDER = [
  'tradeHubs',
  'borderCrossings',
  'frontierZones',
  'isolatedSites',
  'fertileRegions',
  'hostileRegions',
  'strategicRoutes',
  'riverMouths',
  'mountainPasses'
]

// These labels are diagnostic names emitted by the map analyser, not places
// a writer can refer to in a historical event. They are useful internally for
// scoring terrain, but should never fill the user's review list.
const SYNTHETIC_SITE_TITLE_RE = /^(?:边境荒域|沃土|凶土|山口|主道|fertile region|hostile region|frontier zone|mountain pass|main road)(?:\s*#?\d+)?(?:\s*[（(].*)?$/i
const WORLD_LOCATION_TYPE_RE = /^(?:location|place|landmark|city|town|village|port|fortress|ruin|region|river|route)$/i

function semanticSiteId(site) {
  return String(site?.id || site?.siteId || '').trim()
}

function compareSemanticSites(a, b) {
  const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0)
  if (scoreDiff !== 0) return scoreDiff
  return semanticSiteId(a).localeCompare(semanticSiteId(b))
}

function isReviewableSemanticSite(site) {
  const title = String(site?.title || site?.name || '').replace(/\s+/g, ' ').trim()
  if (!title || SYNTHETIC_SITE_TITLE_RE.test(title)) return false
  return Boolean(semanticSiteId(site))
}

function sharesMapAnchor(a, b) {
  const aMarkers = new Set(Array.isArray(a?.markerIds) ? a.markerIds : [])
  const bMarkers = Array.isArray(b?.markerIds) ? b.markerIds : []
  if (bMarkers.some((markerId) => aMarkers.has(markerId))) return true

  const aCells = new Set(Array.isArray(a?.cellIds) ? a.cellIds : [])
  const bCells = Array.isArray(b?.cellIds) ? b.cellIds : []
  // A single-cell overlap is a strong signal that two categories describe the
  // same map feature. Large region overlaps are intentionally left alone.
  return bCells.length > 0 && bCells.length <= 3 && bCells.some((cellId) => aCells.has(cellId))
}

/**
 * 给地图页提供一份小而有代表性的审阅清单。
 *
 * 先按类别轮转，保证边境、沃土、凶土等不同地理语义都有机会进入历史，
 * 再用分数补足上限。这样 UI 不需要展示数百个地图检测点，历史生成也不会
 * 因一次地图生成把全部低价值候选写入世界书。
 */
export function selectSemanticSitesForReview(mapSemantics, {
  maxSites = 24,
  allowedNames = [],
  requireAllowedNames = false,
  authoredSites = [],
} = {}) {
  const limit = Math.min(12, Math.max(1, Math.floor(Number(maxSites) || 12)))
  const allowed = normalizeAllowedNames(allowedNames)
  const authored = (Array.isArray(authoredSites) ? authoredSites : [])
    .filter(isReviewableSemanticSite)
  const byCategory = REVIEW_CATEGORY_ORDER.map((category) => (
    Array.isArray(mapSemantics?.[category])
      ? mapSemantics[category]
        .filter(isReviewableSemanticSite)
        .filter((site) => !requireAllowedNames && !allowed.length || siteMatchesAllowedName(site, allowed))
        .sort(compareSemanticSites)
      : []
  ))
  if (authored.length > 0) byCategory.push(authored)
  const selected = []
  const seen = new Set()

  for (let index = 0; selected.length < limit; index += 1) {
    let added = false
    for (const category of byCategory) {
      const site = category[index]
      const id = semanticSiteId(site)
      if (!site || !id || seen.has(id)) continue
      if (selected.some((existing) => normalizeSiteTitle(existing) === normalizeSiteTitle(site))) continue
      if (selected.some((existing) => sharesMapAnchor(existing, site))) continue
      selected.push(site)
      seen.add(id)
      added = true
      if (selected.length >= limit) break
    }
    if (!added) break
  }

  return selected
}

function normalizeSiteTitle(site) {
  return String(site?.title || site?.name || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[\s·・_\-—–]+/g, '')
    .trim()
    .toLocaleLowerCase('zh-Hans-CN')
}

function normalizeAllowedNames(names) {
  return [...new Set((Array.isArray(names) ? names : [])
    .map((name) => normalizeSiteTitle({ name }))
    .filter((name) => name.length >= 2))]
}

function siteMatchesAllowedName(site, allowedNames) {
  const title = normalizeSiteTitle(site)
  return Boolean(title && allowedNames.some((name) => title.includes(name)))
}

/**
 * 返回作者已经在世界书中写出的地点名，不把地图引擎内置名字算作事实。
 * 关系引用和历史 placeRef 也纳入匹配，但正文里的普通名词不纳入。
 */
export function collectWorldbookPlaceNames(worldbook) {
  const names = []
  const seen = new Set()
  const add = (value) => {
    const name = String(value || '').replace(/\s+/g, ' ').trim()
    const key = normalizeSiteTitle({ name })
    if (!name || key.length < 2 || seen.has(key)) return
    seen.add(key)
    names.push(name)
  }
  for (const entry of Array.isArray(worldbook?.entries) ? worldbook.entries : []) {
    const type = String(entry?.type || '').trim()
    if (WORLD_LOCATION_TYPE_RE.test(type) || entry?.mapBinding?.status === 'confirmed') {
      add(entry?.name || entry?.keys?.[0])
      for (const key of Array.isArray(entry?.keys) ? entry.keys : []) add(key)
    }
    for (const reference of Array.isArray(entry?.relations?.locations) ? entry.relations.locations : []) {
      add(typeof reference === 'object' ? (reference.name || reference.title) : reference)
    }
  }
  for (const reference of Array.isArray(worldbook?.geoHistory?.placeRefs) ? worldbook.geoHistory.placeRefs : []) {
    add(reference?.name || reference?.title)
  }
  return names
}

/**
 * 将世界书里已经明确写出的地点转换成可审阅的地理站点。
 * 这不是地图引擎生成的地点：它们没有地图算法分数，默认只作为作者地点
 * 候选进入审阅区，用户确认后才会生成历史引用。
 */
export function buildWorldbookSemanticSites(worldbook) {
  const entries = collectWorldbookLocationEntries(worldbook)
  const seen = new Set()
  return entries
    .filter((entry) => entry?.__placeSource === 'explicit' || entry?.__placeSource === 'relation' || entry?.mapBinding?.status === 'confirmed')
    .map((entry, index) => {
      const name = String(entry?.name || '').replace(/\s+/g, ' ').trim()
      const key = normalizeSiteTitle({ name })
      if (!name || seen.has(key)) return null
      seen.add(key)
      const haystack = `${name}\n${entry?.content || ''}`
      const type = /河|江|溪|川|湖|river|stream|brook|lake/i.test(haystack)
        ? 'riverMouth'
        : /道|路|商道|航线|route|road|trail|trade/i.test(haystack)
          ? 'strategicRoute'
          : /遗迹|废墟|孤岛|前哨|ruin|outpost|island/i.test(haystack)
            ? /遗迹|废墟|ruin/i.test(haystack) ? 'ruinSite' : 'isolatedSite'
            : 'tradeHub'
      const markerId = entry?.mapBinding?.markerId
      return {
        id: `worldbook-place:${String(entry?.__worldbookEntryId || entry?.id || index)}`,
        title: name,
        name,
        type,
        score: 100,
        markerIds: markerId ? [String(markerId)] : [],
        cellIds: Number.isInteger(Number(entry?.mapBinding?.cellId)) ? [Number(entry.mapBinding.cellId)] : [],
        reasons: ['世界书明确地点'],
        source: 'worldbook',
        worldbookEntryId: entry?.__worldbookEntryId || entry?.id || ''
      }
    })
    .filter(Boolean)
}

/**
 * 将一次完整地图生成结果接到历史生成器。
 *
 * 这个边界故意保持纯函数：地图页负责收集输入和确认写入，服务只负责
 * “地图 -> 语义站点 -> 历史草案”，避免在生成过程中偷偷覆盖世界书。
 */
export function buildGeoHistoryDraft({ worldbook = null, mapData = null, seed, mapId, selectedSiteIds } = {}) {
  if (!mapData || typeof mapData !== 'object' || !mapData.cells || typeof mapData.cells.length !== 'number') {
    return {
      ok: false,
      code: 'INVALID_MAP',
      message: '缺少可用的地图数据，无法整理地理历史。',
      mapSemantics: null,
      geoHistory: null
    }
  }

  const mapSemantics = extractMapSemantics(mapData)
  const semanticSites = flattenSemantics(mapSemantics)
  const authoredWorldbookSites = mapData.cells.length > 0
    ? buildWorldbookSemanticSites(worldbook)
    : []
  const allSemanticSites = [...semanticSites, ...authoredWorldbookSites]
  if (allSemanticSites.length === 0) {
    return {
      ok: false,
      code: 'NO_SEMANTIC_SITES',
      message: '当前地图没有提取出可用的贸易、边境、聚落或地形语义点。',
      mapSemantics,
      semanticSites: [],
      selectedSiteCount: 0,
      geoHistory: null
    }
  }

  const hasExplicitSelection = Array.isArray(selectedSiteIds)
  const selectedIds = hasExplicitSelection
    ? new Set(selectedSiteIds.map((id) => String(id || '').trim()).filter(Boolean))
    : null
  const allowedWorldbookNames = collectWorldbookPlaceNames(worldbook)
  const selectedSites = hasExplicitSelection
    ? allSemanticSites.filter((site) => (
        selectedIds.has(semanticSiteId(site))
        && isReviewableSemanticSite(site)
        && (!allowedWorldbookNames.length || siteMatchesAllowedName(site, normalizeAllowedNames(allowedWorldbookNames)))
      ))
    : selectSemanticSitesForReview(mapSemantics, {
      maxSites: 12,
      allowedNames: allowedWorldbookNames,
      requireAllowedNames: true,
      authoredSites: authoredWorldbookSites,
    })

  if (hasExplicitSelection && selectedSites.length === 0) {
    return {
      ok: false,
      code: 'NO_SELECTED_SITES',
      message: '请至少保留一个地理语义点，再整理世界历史。',
      mapSemantics,
      semanticSites,
      selectedSiteCount: 0,
      geoHistory: null
    }
  }

  const resolvedSeed = seed ?? mapData.seed ?? 'pinax'
  const resolvedMapId = mapId || mapData.mapId || `map-${resolvedSeed}`
  const generated = generateGeoHistory(worldbook, selectedSites, {
    seed: resolvedSeed,
    mapId: resolvedMapId
  })

  const geoHistory = generated.nodes.length > 0
    ? attachPlaceRefsToGeoHistory({
        version: 1,
        source: 'map-semantics-v1',
        semanticMeta: mapSemantics.meta,
        semanticSiteCount: selectedSites.length,
        ...generated
      }, {
        worldbookId: worldbook?.id,
        mapSemantics: selectedSites
      })
    : null

  return {
    ok: generated.nodes.length > 0,
    code: generated.nodes.length > 0 ? 'OK' : 'NO_HISTORY_NODES',
    message: generated.nodes.length > 0 ? '' : '地图语义不足以整理出历史节点。',
    mapSemantics,
    semanticSites,
    selectedSiteCount: selectedSites.length,
    geoHistory
  }
}
