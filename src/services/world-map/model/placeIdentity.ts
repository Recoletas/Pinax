/**
 * 三层地点身份（计划 §3.2）——不能再混用：
 *
 * 1. 稳定叙事地点：worldbookId + worldbookEntryId
 * 2. 版本化空间投影：mapAssetId + mapRevision + mapObjectId
 * 3. 稿件场景出现：bookId + chapterId + writingUnitId + worldbookEntryId
 *
 * 旧 `place:{worldbookId}:{mapId}:{siteId}` 只作为 legacy alias 读取，
 * 不再产生新的身份字符串。
 */

export interface PlaceIdentity {
  worldbookId: string
  worldbookEntryId: string
}

export interface MapObjectRef {
  mapAssetId: string
  mapRevision: number
  mapObjectId: string
}

export interface SceneOccurrenceRef {
  bookId: string
  chapterId: string
  writingUnitId: string
  worldbookEntryId: string
}

export type LegacyPlaceId = string & { __legacyPlaceId: true }

export function formatLegacyPlaceId(
  worldbookId: string,
  mapId: string,
  siteId: string,
): LegacyPlaceId {
  return `place:${worldbookId}:${mapId}:${siteId}` as LegacyPlaceId
}

export function parseLegacyPlaceId(
  value: string,
): { worldbookId: string; mapId: string; siteId: string } | null {
  if (typeof value !== 'string' || !value.startsWith('place:')) return null
  const parts = value.split(':')
  if (parts.length !== 4) return null
  const [, worldbookId, mapId, siteId] = parts
  if (!worldbookId || !mapId || !siteId) return null
  return { worldbookId, mapId, siteId }
}

/** 地图对象 alias：旧 map-scoped placeId / marker 名到当前 mapObjectId 的只读映射。 */
export interface MapObjectAlias {
  /** 旧标识，例如 legacy `place:{worldbookId}:{mapId}:{siteId}` 或旧 marker id。 */
  legacyKey: string
  mapObjectId: string
  mapRevision: number
  /** alias 只在读取时使用，永远不作为新写入的身份。 */
  kind: 'legacy-place-id' | 'legacy-marker-id'
}

/** 地点身份是否相同（不做 mapAssetId/mapRevision 比较——那是空间投影层）。 */
export function samePlaceIdentity(a: PlaceIdentity, b: PlaceIdentity): boolean {
  return a.worldbookId === b.worldbookId && a.worldbookEntryId === b.worldbookEntryId
}

/**
 * 地图重生成允许换 mapObjectId，不能换叙事地点身份（计划 §3.2）。
 * 该函数供 binding transaction 在换 revision 时校验身份不变。
 */
export function identitySurvivesRemap(
  bindingBefore: { identity: PlaceIdentity; object: MapObjectRef },
  objectAfter: MapObjectRef,
): boolean {
  return (
    bindingBefore.object.mapAssetId === objectAfter.mapAssetId &&
    bindingBefore.object.mapRevision !== objectAfter.mapRevision &&
    bindingBefore.identity.worldbookId.length > 0 &&
    bindingBefore.identity.worldbookEntryId.length > 0
  )
}
