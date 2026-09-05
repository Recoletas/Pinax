/**
 * 旧地图数据 → MapDocument v2 迁移（计划 P0/P2/P8）。
 *
 * - legacy `VoronoiMapData`（engine/types.ts）→ v2 feature collections；
 * - legacy `mapConfigJSON = { voronoiConfig, markers, lastGenerationMeta, mapVersions, activeMapRevision }`
 *   → recipe（voronoiConfig）+ asset reference（其余为 legacy 资产引用）；
 * - 旧 map-scoped placeId / marker 建 alias index，只读不写；
 * - 迁移不删除旧 renderer；WorldMapVoronoi 保留到 P7 退役 Gate。
 */

import type { VoronoiMapData, River, Road, Feature, Burg } from '../engine/types'
import type { MapMarker } from '../../../types/world-map'
import {
  emptyFeatureCollections,
  validateMapDocumentV2,
  type MapDocumentV2,
} from './mapDocumentV2'
import type { MapFeatureType } from './mapFeature'
import { formatLegacyPlaceId, type MapObjectAlias } from './placeIdentity'
import { computeConfigHash } from '../generators/generatorContract'
import type { MapFeatureKind, MapFeatureScope } from './mapFeature'

/**
 * P1.5 保守语义派生：只用 legacy 已有证据（capital 标志、人口、port 标志），
 * 不发明规则。capital 优先于人口规则。
 * - capital → capital / region
 * - 人口 ≥ 2× 中位数（非 capital）→ city / region
 * - port → town / local
 * - 其余 → village / local
 */
export function deriveSettlementSemantics(
  burg: Pick<Burg, 'capital' | 'port' | 'population'>,
  allBurgs: Array<Pick<Burg, 'population'>>,
): { kind: MapFeatureKind; scope: MapFeatureScope } {
  if (burg.capital) return { kind: 'capital', scope: 'region' }
  const pops = allBurgs.map((b) => Number(b.population) || 0).sort((a, b) => a - b)
  const median = pops.length ? pops[Math.floor(pops.length / 2)] : 0
  const population = Number(burg.population) || 0
  if (median > 0 && population >= median * 2) return { kind: 'city', scope: 'region' }
  if (burg.port) return { kind: 'town', scope: 'local' }
  return { kind: 'village', scope: 'local' }
}

export interface LegacyMapConfigJSON {
  voronoiConfig?: Record<string, unknown> | null
  markers?: MapMarker[]
  lastGenerationMeta?: Record<string, unknown> | null
  mapVersions?: Array<Record<string, unknown>>
  activeMapRevision?: string | number | null
}

export interface LegacyAssetReference {
  /** recipe + asset reference 分离（计划 P2）：recipe 是生成配置真源，其余是旧资产引用。 */
  recipe: Record<string, unknown> | null
  legacyMarkers: MapMarker[]
  legacyVersions: Array<Record<string, unknown>>
  activeLegacyRevisionId: string | number | null
  /** 解析失败或字段缺失时的可解释信息，不静默丢失（计划 P8）。 */
  issues: string[]
}

/**
 * `mapConfigJSON` → recipe + asset reference。
 * 兼容两种旧格式：带 voronoiConfig 的分桶格式，和整包即 config 的最老格式。
 */
export function parseLegacyMapConfig(raw: string | null | undefined): LegacyAssetReference {
  const result: LegacyAssetReference = {
    recipe: null,
    legacyMarkers: [],
    legacyVersions: [],
    activeLegacyRevisionId: null,
    issues: [],
  }
  if (!raw) {
    result.issues.push('mapConfigJSON is empty; treat as never-generated')
    return result
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    result.issues.push('mapConfigJSON is not valid JSON; quarantine record instead of dropping')
    return result
  }
  if (typeof parsed !== 'object' || parsed === null) {
    result.issues.push('mapConfigJSON is not an object')
    return result
  }
  const obj = parsed as Record<string, unknown>
  if ('voronoiConfig' in obj) {
    result.recipe = (obj.voronoiConfig as Record<string, unknown>) ?? null
    result.legacyMarkers = Array.isArray(obj.markers) ? (obj.markers as MapMarker[]) : []
    result.legacyVersions = Array.isArray(obj.mapVersions) ? (obj.mapVersions as Array<Record<string, unknown>>) : []
    result.activeLegacyRevisionId = (obj.activeMapRevision as string | number | null) ?? null
    if (result.recipe === null) result.issues.push('voronoiConfig is null inside bucketed format')
  } else {
    result.recipe = obj
    result.issues.push('legacy pre-bucket format: entire payload treated as recipe, no marker/version history')
  }
  return result
}

export interface LegacyProjectionContext {
  mapAssetId: string
  projectId: string
  worldbookId: string
  revision: number
  generatorVersion: string
  terrainRef?: string
  thumbnailRef?: string
  styleId?: MapDocumentV2['style']['styleId']
  /** 旧 mapId（legacy placeId 的第二段）。 */
  legacyMapId?: string
  /** store 层当前激活的 markers（VoronoiMapData 不携带 markers）。 */
  legacyMarkers?: MapMarker[]
  now?: number
}

function featureIdFor(type: MapFeatureType, index: number): string {
  return `${type}:${index}`
}

/**
 * VoronoiMapData → MapDocumentV2。
 *
 * 迁移范围（P0）：landmass（聚合陆块）、water（湖）、rivers、routes（roads）、
 * settlements（burgs）、narrativePlaces（旧 markers）。
 * regions 留空：连续边界在 P4 由 azgaar/borderPaths 重建，不从 cell 聚合硬造。
 */
export function projectLegacyToMapDocumentV2(
  legacy: VoronoiMapData,
  ctx: LegacyProjectionContext,
): { document: MapDocumentV2; aliases: MapObjectAlias[] } {
  const now = ctx.now ?? Date.now()
  const collections = emptyFeatureCollections()
  const aliases: MapObjectAlias[] = []
  const width = legacy.width || 1200
  const height = legacy.height || 800

  // 聚合陆块：一个 feature 一个陆块多边形，不复制 12,000 个 cell（计划 §3.1）。
  const landFeatures: Feature[] = (legacy.features || []).filter(
    (f) => f.type === 'island' || f.type === 'continent',
  )
  for (const f of landFeatures) {
    const ring = legacy.coastlines?.[landFeatures.indexOf(f)]
    if (!ring || ring.length < 3) continue
    const id = featureIdFor('landmass', f.i)
    collections.land.push({
      mapObjectId: id,
      geometry: {
        type: 'polygon',
        coordinates: [ring.map((p) => [p[0] * width, p[1] * height] as [number, number])],
      },
      properties: {
        featureId: id,
        featureType: 'landmass',
        mapRevision: ctx.revision,
        displayPriority: 10,
      },
    })
  }

  // 水体特征（湖）。
  for (const f of (legacy.features || []).filter((f) => f.type === 'lake')) {
    const center = cellCenter(legacy, f.cellIds[0])
    if (!center) continue
    const id = featureIdFor('water', f.i)
    collections.water.push({
      mapObjectId: id,
      geometry: { type: 'point', coordinates: center },
      properties: { featureId: id, featureType: 'water', mapRevision: ctx.revision, displayPriority: 5 },
    })
  }

  // 河流：直接使用渲染路径点。
  for (const river of legacy.rivers || []) {
    pushLineFeature(collections, 'river', river.i, river, ctx.revision, nameOf(river.name), 6)
  }

  // 道路 → routes。
  for (const road of legacy.roads || []) {
    pushLineFeature(collections, 'route', road.i, road, ctx.revision, nameOf(road.name), 7)
  }

  // 城镇 → settlements；kind/scope 由保守派生，displayPriority 随语义派生。
  for (const burg of legacy.burgs || []) {
    if (!(burg.i > 0)) continue
    const semantics = deriveSettlementSemantics(burg, legacy.burgs || [])
    const id = `settlement:${burg.i}`
    collections.settlements.push({
      mapObjectId: id,
      geometry: { type: 'point', coordinates: [burg.x, burg.y] },
      properties: {
        featureId: id,
        featureType: 'settlement',
        mapRevision: ctx.revision,
        displayPriority:
          semantics.kind === 'capital' ? 40 : semantics.kind === 'city' ? 30 : 20,
        label: burg.name,
        icon: semantics.kind === 'capital' ? 'capital' : burg.port ? 'port' : 'town',
        ...semantics,
      },
    })
    aliases.push({
      legacyKey: `burg:${burg.i}`,
      mapObjectId: id,
      mapRevision: ctx.revision,
      kind: 'legacy-marker-id',
    })
  }

  // 旧 markers → narrativePlaces（binding candidate，不是确认绑定）。
  for (const marker of ctx.legacyMarkers || []) {
    const id = `narrative-place:${marker.id}`
    // 保守派生：高重要度(>=0.8)的作者地点给 region 档，其余 local。
    const scope: MapFeatureScope = (marker.importance ?? 0) >= 0.8 ? 'region' : 'local'
    collections.narrativePlaces.push({
      mapObjectId: id,
      geometry: { type: 'point', coordinates: [marker.x, marker.y] },
      properties: {
        featureId: id,
        featureType: 'narrative-place',
        mapRevision: ctx.revision,
        displayPriority: 50,
        label: marker.name,
        kind: 'landmark',
        scope,
        bindingStatus:
          marker.bindingStatus === 'confirmed' ? 'confirmed' : marker.worldbookEntryId ? 'candidate' : 'unbound',
      },
    })
    if (marker.worldbookId && ctx.legacyMapId) {
      aliases.push({
        legacyKey: formatLegacyPlaceId(marker.worldbookId, ctx.legacyMapId, marker.id),
        mapObjectId: id,
        mapRevision: ctx.revision,
        kind: 'legacy-place-id',
      })
    }
  }

  const document: MapDocumentV2 = {
    schemaVersion: 2,
    mapAssetId: ctx.mapAssetId,
    projectId: ctx.projectId,
    worldbookId: ctx.worldbookId,
    revision: ctx.revision,
    seed: String(legacy.seed || ''),
    bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    coordinateSystem: { kind: 'fictional-plane', yAxis: 'down', units: 'legacy-normalized-canvas' },
    generator: {
      id: 'pinax-legacy',
      version: ctx.generatorVersion,
      // 旧数据没有 config hash；用 seed 派生一个稳定占位，迁移后真实 hash 由
      // MapAssetRepository 在下一次保存时写回。
      configHash: computeConfigHash({ seed: legacy.seed, pointCount: legacy.cells.length }),
    },
    baseAsset: { terrainRef: ctx.terrainRef, thumbnailRef: ctx.thumbnailRef, width, height },
    featureCollections: collections,
    aliases,
    style: { styleId: ctx.styleId ?? 'atlas-clean' },
    createdAt: now,
    updatedAt: now,
  }
  return { document, aliases }
}

function pushLineFeature(
  collections: ReturnType<typeof emptyFeatureCollections>,
  type: 'river' | 'route',
  index: number,
  source: River | Road,
  revision: number,
  label: string | undefined,
  priority: number,
) {
  const points = source.points
  if (!Array.isArray(points) || points.length < 2) return
  const id = `${type}:${index}`
  collections[type === 'river' ? 'rivers' : 'routes'].push({
    mapObjectId: id,
    geometry: { type: 'line', coordinates: points.map((p) => [p[0], p[1]] as [number, number]) },
    properties: {
      featureId: id,
      featureType: type,
      mapRevision: revision,
      displayPriority: priority,
      label,
    },
  })
}

function nameOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function cellCenter(legacy: VoronoiMapData, cellId: number | undefined): [number, number] | null {
  if (!Number.isInteger(cellId) || (cellId as number) < 0) return null
  const px = legacy.cells.p[(cellId as number) * 2]
  const py = legacy.cells.p[(cellId as number) * 2 + 1]
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null
  return [px, py]
}

export { validateMapDocumentV2 }
