import { extractMapSemantics, flattenSemantics } from './mapSemantics'
import { generateGeoHistory } from './historyGenerator'
import { attachPlaceRefsToGeoHistory } from './placeRefs'

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

function semanticSiteId(site) {
  return String(site?.id || site?.siteId || '').trim()
}

function compareSemanticSites(a, b) {
  const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0)
  if (scoreDiff !== 0) return scoreDiff
  return semanticSiteId(a).localeCompare(semanticSiteId(b))
}

/**
 * 给地图页提供一份小而有代表性的审阅清单。
 *
 * 先按类别轮转，保证边境、沃土、凶土等不同地理语义都有机会进入历史，
 * 再用分数补足上限。这样 UI 不需要展示数百个地图检测点，历史生成也不会
 * 因一次地图生成把全部低价值候选写入世界书。
 */
export function selectSemanticSitesForReview(mapSemantics, { maxSites = 24 } = {}) {
  const limit = Math.max(1, Math.floor(Number(maxSites) || 24))
  const byCategory = REVIEW_CATEGORY_ORDER.map((category) => (
    Array.isArray(mapSemantics?.[category])
      ? mapSemantics[category].filter((site) => semanticSiteId(site)).sort(compareSemanticSites)
      : []
  ))
  const selected = []
  const seen = new Set()

  for (let index = 0; selected.length < limit; index += 1) {
    let added = false
    for (const category of byCategory) {
      const site = category[index]
      const id = semanticSiteId(site)
      if (!site || !id || seen.has(id)) continue
      selected.push(site)
      seen.add(id)
      added = true
      if (selected.length >= limit) break
    }
    if (!added) break
  }

  return selected
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
  if (semanticSites.length === 0) {
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
  const selectedSites = hasExplicitSelection
    ? semanticSites.filter((site) => selectedIds.has(semanticSiteId(site)))
    : semanticSites

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
