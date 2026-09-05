/**
 * MapFeature v2 — MapDocument v2 内的语义 feature 单元。
 *
 * 规则（计划 §3.1/§3.3）：
 * - 生成器只能产出 map-native feature / binding candidate / relation candidate；
 * - feature 不携带世界书正文、历史或当前场状态；
 * - `mapObjectId` 只在 `mapAssetId + revision` 内唯一，重生成允许更换。
 */

export type MapFeatureType =
  | 'landmass'
  | 'water'
  | 'region'
  | 'river'
  | 'route'
  | 'settlement'
  | 'narrative-place'

export type MapFeatureGeometry =
  | { type: 'point'; coordinates: [number, number] }
  | { type: 'line'; coordinates: [number, number][] }
  | { type: 'polygon'; coordinates: [number, number][][] }

/**
 * 地点语义（P1.5 Task B）：displayPriority 应从此处派生，而不是生成器随意写入。
 * - kind：地点种类；
 * - scope：空间范围粗细，world > region > local > site；
 * - parentFeatureId：上级地点（村属于区域、房间属于建筑）。
 */
export type MapFeatureKind =
  | 'capital' | 'city' | 'town' | 'village' | 'landmark' | 'site' | 'interior'

export type MapFeatureScope = 'world' | 'region' | 'local' | 'site'

/** scope 粗细序：数值越大越细。子地点 scope 必须不粗于父。 */
export const SCOPE_RANK: Record<MapFeatureScope, number> = {
  world: 0,
  region: 1,
  local: 2,
  site: 3,
}

export function isMapFeatureKind(v: unknown): v is MapFeatureKind {
  return typeof v === 'string' && ['capital', 'city', 'town', 'village', 'landmark', 'site', 'interior'].includes(v)
}

export function isMapFeatureScope(v: unknown): v is MapFeatureScope {
  return typeof v === 'string' && ['world', 'region', 'local', 'site'].includes(v)
}

/**
 * 写作上下文信号：视口 projection 的运行时输入，不持久化进 feature。
 */
export interface MapContextSignal {
  featureId: string
  reason: 'selected' | 'current-scene' | 'current-unit' | 'chapter-reference' | 'search-result'
  sourceRef?: string
}

/** 视口可消费的最小渲染/命中属性（计划 §3.4）。 */
export interface MapFeatureProperties {
  featureId: string
  featureType: MapFeatureType
  /** 该 feature 所属地图版本；渲染层用它拒绝跨版本混渲。 */
  mapRevision: number
  /** LOD/绘制顺序权重，越大越优先。P1.5 起应从 kind/scope/context 派生。 */
  displayPriority: number
  /** 与世界书绑定状态的无状态摘要：详情由 inspector 按 ID 查询。 */
  bindingStatus?: 'unbound' | 'candidate' | 'confirmed' | 'conflict' | 'stale'
  /** 纯显示字段（名称、图标 key），不承载业务真源。 */
  label?: string
  icon?: string
  kind?: MapFeatureKind
  scope?: MapFeatureScope
  parentFeatureId?: string
}

export interface MapFeature {
  mapObjectId: string
  geometry: MapFeatureGeometry
  properties: MapFeatureProperties
}

/** MapDocument v2 的七个语义集合（计划 §3.1 featureCollections）。 */
export type MapFeatureCollectionName =
  | 'land'
  | 'water'
  | 'regions'
  | 'rivers'
  | 'routes'
  | 'settlements'
  | 'narrativePlaces'

export const MAP_FEATURE_COLLECTION_NAMES: readonly MapFeatureCollectionName[] = [
  'land',
  'water',
  'regions',
  'rivers',
  'routes',
  'settlements',
  'narrativePlaces',
] as const

/** featureType -> 所属集合的固定归属，避免生成器自选集合。 */
export const COLLECTION_BY_FEATURE_TYPE: Record<MapFeatureType, MapFeatureCollectionName> = {
  landmass: 'land',
  water: 'water',
  region: 'regions',
  river: 'rivers',
  route: 'routes',
  settlement: 'settlements',
  'narrative-place': 'narrativePlaces',
}

export function isMapFeatureType(value: unknown): value is MapFeatureType {
  return typeof value === 'string' && value in COLLECTION_BY_FEATURE_TYPE
}

export function featureCollectionOf(feature: MapFeature): MapFeatureCollectionName {
  return COLLECTION_BY_FEATURE_TYPE[feature.properties.featureType]
}

/** 校验 feature 几何坐标有限性；不合法即拒绝进入 MapDocument。 */
export function isFiniteGeometry(geometry: MapFeatureGeometry): boolean {
  const check = (c: [number, number]) =>
    Number.isFinite(c[0]) && Number.isFinite(c[1])
  if (geometry.type === 'point') return check(geometry.coordinates)
  if (geometry.type === 'line') return geometry.coordinates.every(check)
  return geometry.coordinates.every((ring) => ring.every(check))
}
