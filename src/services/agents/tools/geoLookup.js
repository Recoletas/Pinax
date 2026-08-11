import {
  getNarrativeResources,
  getRelatedNarrativeResources,
  searchNarrativeResources
} from '../narrativeResourceIndex'

function routeResources(index, input) {
  const [fromId, toId] = input.ids
  const from = index?.byId?.get(fromId)
  const to = index?.byId?.get(toId)
  if (from?.domain !== 'geo' || to?.domain !== 'geo') return []
  const fromRoutes = new Set(from.relations.filter((item) => item.type === 'route').map((item) => item.targetId))
  const sharedRoutes = to.relations
    .filter((item) => item.type === 'route' && fromRoutes.has(item.targetId))
    .map((item) => item.targetId)
  if (sharedRoutes.length === 0) return []
  return [{
    ...from,
    id: `${from.id}->${to.id}`,
    type: 'route',
    title: `${from.title} → ${to.title}`,
    summary: `存在已绑定路线：${sharedRoutes.join('、')}`,
    relations: [
      { type: 'from', targetId: from.id },
      { type: 'to', targetId: to.id },
      ...sharedRoutes.map((targetId) => ({ type: 'route', targetId }))
    ],
    relationPath: [
      { from: from.id, to: to.id, edgeType: 'route', depth: 1 },
      ...sharedRoutes.map((targetId) => ({
        from: from.id,
        to: targetId,
        edgeType: 'bound-route',
        depth: 1
      }))
    ],
    depth: 1,
    sourceRefs: [...new Set([...from.sourceRefs, ...to.sourceRefs])],
    matchReasons: ['shared-route']
  }]
}

function nearbyResources(index, ids, input) {
  const sources = ids
    .map((id) => index?.byId?.get(id))
    .filter((item) => item?.domain === 'geo')
  const sourceIds = new Set(sources.map((item) => item.id))
  const routeIds = new Set(sources.flatMap((item) => (
    item.relations.filter((relation) => relation.type === 'route').map((relation) => relation.targetId)
  )))
  if (routeIds.size === 0) return []
  return (index?.byDomain?.get('geo') || [])
    .filter((item) => !sourceIds.has(item.id))
    .filter((item) => item.relations.some((relation) => relation.type === 'route' && routeIds.has(relation.targetId)))
    .filter((item) => {
      if (input.filters.entityTypes.length > 0 && !input.filters.entityTypes.includes(item.type)) return false
      return true
    })
    .slice(0, input.limit)
    .map((item) => ({ ...item, matchReasons: ['shared-route'] }))
}

export function executeGeoLookup(index, input, context = {}) {
  if (input.action === 'current') {
    return context.currentPlaceId
      ? getNarrativeResources(index, 'geo', [context.currentPlaceId], input.filters)
      : []
  }
  if (input.action === 'get') return getNarrativeResources(index, 'geo', input.ids, input.filters, input)
  if (input.action === 'route') return routeResources(index, input)
  const ids = input.ids.length > 0
    ? input.ids
    : (context.currentPlaceId ? [context.currentPlaceId] : [])
  const nearby = nearbyResources(index, ids, input)
  if (nearby.length > 0) return nearby
  const related = getRelatedNarrativeResources(index, 'geo', ids, input.filters, input.limit)
  if (related.length > 0) return related
  return searchNarrativeResources(index, 'geo', input, context)
}

export default { executeGeoLookup }
