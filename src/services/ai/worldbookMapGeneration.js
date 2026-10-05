import { getPlaceOverviewText } from '../../../shared/placeEntryContract.js'
import { listPlaceEntries } from '../worldbook/worldbookPlaceCatalog'

const text = value => String(value || '').trim()

// The selected worldbook owns this context. Global geography-store leftovers
// and name-pool defaults are not evidence about the author's current story.
export function buildWorldbookMapBasis(worldbook = {}, { scope: requestedScope = 'auto' } = {}) {
  const places = listPlaceEntries(worldbook)
  const overview = getPlaceOverviewText(worldbook)
  const constraints = (worldbook.entries || [])
    .filter(entry => ['rule', 'forbidden'].includes(entry?.type))
    .map(entry => text(entry.content)).filter(Boolean).slice(0, 6)
  const context = [text(worldbook.worldDescription), overview, ...constraints,
    ...places.map(place => `${place.name}：${place.description}`)].filter(Boolean).join('\n')
  const hasGeography = Boolean(overview || places.length || text(worldbook.worldDescription))
  const macroPlaces = places.some(place => ['continent', 'region'].includes(place.kind) || place.scale === 'macro')
  const settlementKinds = new Set(['city', 'town', 'village', 'port', 'fortress', 'academy', 'site'])
  const localPlaces = places.length > 0 && places.every(place => settlementKinds.has(place.kind) || place.scale === 'local')
  const localDescription = /(?:渔村|村落|港湾|港镇|小港|小镇|街区|城区|局部地图|只画|只发生在|港口及|(?:故事|场景|范围).{0,12}(?:村|镇|港|湾|街)|town map|local map|neighbou?rhood|\bvillage\b|\bharbou?r\b)/i.test(context)
  const worldDescription = /(?:(?:世界|全球|区域)(?:地图|由|分为|包含)|[二三四五六七八九十两\d]+(?:个|块|片)?大陆|多大陆|整个地区|全境|world map|regional map|continents)/i.test(context)
  const inferredScope = !macroPlaces && !worldDescription && (localPlaces || localDescription) ? 'local' : 'world'
  const scope = ['local', 'world'].includes(requestedScope) ? requestedScope : inferredScope
  return {
    ok: hasGeography,
    scope,
    overview: context.slice(0, 6500),
    locations: places.map(place => ({ name: place.name, type: place.kind, description: place.description })),
    namingStyle: /[\u3400-\u9fff]/.test(context) ? 'chinese' : null,
    coastal: /(?:临海|沿海|海岸|港口|小港|码头|coast|harbou?r|port)/i.test(context),
    reason: hasGeography ? '' : '请先在设定中填写地理环境或建立地点，再生成地图。'
  }
}

export function constrainMapConfigToWorldbook(config, basis) {
  if (!basis?.ok) throw new Error(basis?.reason || '缺少地图依据。')
  const next = { ...config, geographicScope: basis.scope }
  if (basis.namingStyle) next.namingStyle = basis.namingStyle
  if (basis.scope !== 'local') return next
  // Local stories need usable terrain, not an invented geopolitical world.
  // Author places keep their exact names and enter through reviewed bindings.
  Object.assign(next, {
    authoredPlacesOnly: true,
    width: 1200,
    height: 800,
    pointCount: 12000,
    stateCount: 0,
    burgDensity: 0,
    generateProvinces: false,
    generateRoads: false,
    plateCount: 2,
    continentCount: 1,
    heightmapTemplate: basis.coastal ? 'peninsula' : 'pangea',
    landRatio: basis.coastal ? 0.65 : 0.8,
    kmPerPixel: 0.005,
    stateNames: [], burgNames: [], riverNames: []
  })
  return next
}
