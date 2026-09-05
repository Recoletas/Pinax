/**
 * MapDocument v2 — 唯一地图数据合同（计划 §3.1）。
 *
 * - 所有生成器只输出此合同，视口只消费此合同；
 * - TypedArray 原始计算数据作为内部 binary asset 保存，
 *   不要求 UI/世界书/Authoring 理解生成器私有字段；
 * - `bookId` 暂兼作 `projectId`；桌面项目真源接入后两者分离，不得隐式互换。
 */

import {
  MAP_FEATURE_COLLECTION_NAMES,
  SCOPE_RANK,
  featureCollectionOf,
  isFiniteGeometry,
  isMapFeatureKind,
  isMapFeatureScope,
  isMapFeatureType,
  type MapFeature,
  type MapFeatureCollectionName,
} from './mapFeature'
import type { MapObjectAlias } from './placeIdentity'

export interface MapDocumentBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface MapCoordinateSystem {
  kind: 'fictional-plane'
  yAxis: 'down' | 'up'
  units: string
}

export type MapGeneratorId = 'pinax-legacy' | 'azgaar-adapter' | 'mapgen4-terrain'

export interface MapGeneratorReceipt {
  id: MapGeneratorId
  version: string
  upstreamCommit?: string
  configHash: string
}

export interface MapBaseAsset {
  terrainRef?: string
  thumbnailRef?: string
  width: number
  height: number
}

export interface MapStyleRef {
  styleId: 'atlas-clean' | 'topographic' | 'parchment'
  overrides?: Record<string, unknown>
}

export interface MapDocumentV2 {
  schemaVersion: 2
  mapAssetId: string
  projectId: string
  worldbookId: string
  revision: number
  seed: string
  bounds: MapDocumentBounds
  coordinateSystem: MapCoordinateSystem
  generator: MapGeneratorReceipt
  baseAsset: MapBaseAsset
  featureCollections: Record<MapFeatureCollectionName, MapFeature[]>
  aliases: MapObjectAlias[]
  style: MapStyleRef
  createdAt: number
  updatedAt: number
}

export interface MapDocumentValidationError {
  path: string
  message: string
}

export interface MapDocumentValidationResult {
  ok: boolean
  errors: MapDocumentValidationError[]
  /** 重复的 feature id（跨集合全局唯一）。 */
  duplicateFeatureIds: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Schema validation + feature ID uniqueness（计划 §4.2 规则）。
 * 只校验合同本身，不理解任何生成器私有字段。
 */
export function validateMapDocumentV2(doc: unknown): MapDocumentValidationResult {
  const errors: MapDocumentValidationError[] = []
  const fail = (path: string, message: string) => errors.push({ path, message })

  if (!isPlainObject(doc)) {
    return { ok: false, errors: [{ path: '', message: 'MapDocument v2 must be an object' }], duplicateFeatureIds: [] }
  }
  const d = doc as Record<string, unknown>

  if (d.schemaVersion !== 2) fail('schemaVersion', 'must be 2')
  for (const key of ['mapAssetId', 'projectId', 'worldbookId', 'seed'] as const) {
    if (typeof d[key] !== 'string' || !(d[key] as string).length) fail(key, 'must be a non-empty string')
  }
  if (!Number.isInteger(d.revision) || (d.revision as number) < 1) fail('revision', 'must be a positive integer')

  const bounds = d.bounds
  if (!isPlainObject(bounds)) fail('bounds', 'must be an object')
  else {
    for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const) {
      if (!Number.isFinite(bounds[key])) fail(`bounds.${key}`, 'must be a finite number')
    }
    if (
      Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX) && bounds.minX >= bounds.maxX
    ) fail('bounds', 'minX must be < maxX')
    if (
      Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxY) && bounds.minY >= bounds.maxY
    ) fail('bounds', 'minY must be < maxY')
  }

  const cs = d.coordinateSystem
  if (!isPlainObject(cs)) fail('coordinateSystem', 'must be an object')
  else {
    if (cs.kind !== 'fictional-plane') fail('coordinateSystem.kind', "must be 'fictional-plane'")
    if (cs.yAxis !== 'down' && cs.yAxis !== 'up') fail('coordinateSystem.yAxis', "must be 'down' | 'up'")
    if (typeof cs.units !== 'string' || !cs.units.length) fail('coordinateSystem.units', 'must be a non-empty string')
  }

  const gen = d.generator
  if (!isPlainObject(gen)) fail('generator', 'must be an object')
  else {
    const allowed = new Set(['pinax-legacy', 'azgaar-adapter', 'mapgen4-terrain'])
    if (typeof gen.id !== 'string' || !allowed.has(gen.id)) fail('generator.id', 'unknown generator id')
    if (typeof gen.version !== 'string' || !gen.version.length) fail('generator.version', 'must be a non-empty string')
    if (typeof gen.configHash !== 'string' || !gen.configHash.length) fail('generator.configHash', 'must be a non-empty string')
  }

  const base = d.baseAsset
  if (!isPlainObject(base)) fail('baseAsset', 'must be an object')
  else {
    if (!Number.isInteger(base.width) || (base.width as number) <= 0) fail('baseAsset.width', 'must be a positive integer')
    if (!Number.isInteger(base.height) || (base.height as number) <= 0) fail('baseAsset.height', 'must be a positive integer')
  }

  const collections = d.featureCollections
  if (!isPlainObject(collections)) {
    fail('featureCollections', 'must be an object')
  } else {
    for (const name of MAP_FEATURE_COLLECTION_NAMES) {
      const list = collections[name]
      if (!Array.isArray(list)) fail(`featureCollections.${name}`, 'must be an array')
    }
  }

  const duplicateFeatureIds: string[] = []
  const parentLinks = new Map<string, string>()
  const scopeOf = new Map<string, string>()
  if (!errors.length) {
    const doc2 = d as unknown as MapDocumentV2
    const seen = new Set<string>()
    for (const name of MAP_FEATURE_COLLECTION_NAMES) {
      for (const [index, feature] of doc2.featureCollections[name].entries()) {
        const path = `featureCollections.${name}[${index}]`
        if (!isPlainObject(feature) || typeof (feature as MapFeature).mapObjectId !== 'string') {
          fail(path, 'feature must have a string mapObjectId')
          continue
        }
        const f = feature as MapFeature
        if (!f.properties || !isMapFeatureType(f.properties.featureType)) {
          fail(`${path}.properties.featureType`, 'unknown featureType')
          continue
        }
        // 集合归属由 featureType 决定，放错集合视为合同违规。
        if (featureCollectionOf(f) !== name) {
          fail(path, `featureType '${f.properties.featureType}' belongs in '${featureCollectionOf(f)}'`)
        }
        if (!isFiniteGeometry(f.geometry)) fail(`${path}.geometry`, 'coordinates must be finite')
        // P1.5 语义合同：kind/scope 枚举
        if (f.properties.kind !== undefined && !isMapFeatureKind(f.properties.kind)) {
          fail(`${path}.properties.kind`, `unknown kind '${f.properties.kind}'`)
        }
        if (f.properties.scope !== undefined) {
          if (!isMapFeatureScope(f.properties.scope)) {
            fail(`${path}.properties.scope`, `unknown scope '${f.properties.scope}'`)
          } else {
            scopeOf.set(f.mapObjectId, f.properties.scope)
          }
        }
        if (f.properties.parentFeatureId !== undefined) {
          parentLinks.set(f.mapObjectId, f.properties.parentFeatureId)
        }
        if (seen.has(f.mapObjectId)) duplicateFeatureIds.push(f.mapObjectId)
        seen.add(f.mapObjectId)
      }
    }
    // parent 引用：必须存在、非自身、无环、子 scope 不得粗于父
    for (const [child, parent] of parentLinks) {
      if (parent === child) fail(`feature '${child}'`, 'parentFeatureId must not reference itself')
      else if (!seen.has(parent)) fail(`feature '${child}'`, `parentFeatureId '${parent}' not found in document`)
    }
    for (const child of parentLinks.keys()) {
      const chain = new Set<string>()
      let cur = child
      while (parentLinks.has(cur)) {
        if (chain.has(cur)) {
          fail(`feature '${child}'`, 'parentFeatureId cycle detected')
          break
        }
        chain.add(cur)
        const parent = parentLinks.get(cur)!
        const cr = scopeOf.get(cur)
        const pr = scopeOf.get(parent)
        if (cr && pr && SCOPE_RANK[cr as keyof typeof SCOPE_RANK] < SCOPE_RANK[pr as keyof typeof SCOPE_RANK]) {
          fail(`feature '${child}'`, 'child scope must not be coarser than parent scope')
          break
        }
        cur = parent
      }
    }
    if (duplicateFeatureIds.length) {
      fail('featureCollections', `duplicate mapObjectId: ${[...new Set(duplicateFeatureIds)].join(', ')}`)
    }
  }

  return { ok: errors.length === 0, errors, duplicateFeatureIds }
}

/** 数据分类（P0 退出条件）：任一地图数据必须归入四类之一。 */
export type MapDataClassification = 'canonical' | 'derived' | 'cache' | 'ui-state'

export const MAP_DATA_CLASSIFICATION: Record<MapDataClassification, string[]> = {
  // 真源：身份、绑定、审阅事务结果
  canonical: ['MapDocumentV2.identity', 'MapBindingV2', 'placeIdentity'],
  // 从 canonical + seed + config 可确定性重算
  derived: ['featureCollections', 'baseAsset.terrain', 'generatorReceipt'],
  // 可随时删除重建的加速层
  cache: ['thumbnail', 'binaryTerrainCache', 'aliasIndex'],
  // 只存在于组件/store 的瞬时状态
  'ui-state': ['viewState', 'activeSelection', 'editSessionDraft', 'inspectorOwner'],
}

export function emptyFeatureCollections(): Record<MapFeatureCollectionName, MapFeature[]> {
  return {
    land: [],
    water: [],
    regions: [],
    rivers: [],
    routes: [],
    settlements: [],
    narrativePlaces: [],
  }
}
