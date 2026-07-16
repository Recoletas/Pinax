import { flattenSemantics } from './mapSemantics'

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeIds(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : []
}

export function buildPlaceId({ worldbookId, mapId, siteId } = {}) {
  const world = normalizeText(worldbookId) || 'world'
  const map = normalizeText(mapId) || 'map'
  const site = normalizeText(siteId)
  return site ? `place:${world}:${map}:${site}` : ''
}

export function buildPlaceRef({ worldbookId, mapId, site } = {}) {
  const siteId = normalizeText(site?.id || site?.siteId)
  const placeId = buildPlaceId({ worldbookId, mapId, siteId })
  if (!placeId) return null

  return {
    placeId,
    worldbookId: normalizeText(worldbookId),
    mapId: normalizeText(mapId),
    siteId,
    name: normalizeText(site?.title || site?.name),
    semanticType: normalizeText(site?.type || site?.semanticType),
    cellIds: normalizeIds(site?.cellIds),
    markerIds: normalizeIds(site?.markerIds),
    routeIds: normalizeIds(site?.routeIds)
  }
}

/**
 * 为 geoHistory 节点补齐跨地图/历史/冒险共用的地点引用。
 * 同一 site 只保留一份 placeRefs，节点通过 placeRef.placeId 关联。
 */
export function attachPlaceRefsToGeoHistory(geoHistory, { worldbookId, mapSemantics } = {}) {
  if (!geoHistory || typeof geoHistory !== 'object') return geoHistory

  const siteById = new Map(
    flattenSemantics(mapSemantics)
      .map((site) => [normalizeText(site?.id || site?.siteId), site])
      .filter(([siteId]) => siteId)
  )
  const placeRefs = []
  const placeRefById = new Map()
  const nodes = Array.isArray(geoHistory.nodes)
    ? geoHistory.nodes.map((node) => {
        const siteId = normalizeText(node?.mapBinding?.siteId)
        const site = siteById.get(siteId)
        const placeRef = buildPlaceRef({
          worldbookId,
          mapId: geoHistory.mapId,
          site: site || {
            id: siteId,
            title: node?.mapBinding?.scene || node?.title,
            type: node?.mapBinding?.semanticType,
            cellIds: node?.mapBinding?.cellIds,
            markerIds: node?.mapBinding?.markerIds,
            routeIds: node?.mapBinding?.routeIds
          }
        })
        if (!placeRef) return node
        if (!placeRefById.has(placeRef.placeId)) {
          placeRefById.set(placeRef.placeId, placeRef)
          placeRefs.push(placeRef)
        }
        return { ...node, placeRef }
      })
    : []

  return { ...geoHistory, placeRefs, nodes }
}
