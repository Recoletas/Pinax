/**
 * MapBinding v2 — 世界书地点 ⇄ 地图对象的绑定合同（计划 §3.2/§6.3）。
 *
 * - `worldbookEntryId` 是地点身份；`mapObjectId` 是某地图版本中的空间对象；
 * - 绑定事务原子保存 MapBinding v2 + map revision receipt；
 * - 生成器候选（binding candidate）不是绑定，必须经用户确认；
 * - 绑定事务与 scene-anchor 事务分开（计划 §6.3）。
 */

import type { PlaceIdentity, MapObjectRef } from './placeIdentity'

export type MapBindingStatus =
  | 'unbound'
  | 'candidate'
  | 'confirmed'
  | 'conflict'
  | 'stale'

export type MapBindingMethod =
  | 'exact'
  | 'alias'
  | 'relation'
  | 'manual'
  | 'ghost-placement'
  | 'remap'

/** 一条已确认或待审的绑定。 */
export interface MapBindingV2 {
  bindingId: string
  identity: PlaceIdentity
  /** 绑定确认时的地图版本。 */
  object: MapObjectRef
  status: MapBindingStatus
  method: MapBindingMethod
  /** 用户确认或重映射的依据，进入上下文 ledger（计划 §6.4）。 */
  evidence: string
  createdAt: number
  updatedAt: number
}

/** 生成器输出：只是候选，不是绑定（计划 §3.3）。 */
export interface MapBindingCandidate {
  identity: PlaceIdentity
  mapObjectId: string
  method: Exclude<MapBindingMethod, 'ghost-placement' | 'remap'>
  confidence: number
  reason: string
}

/** 绑定事务 receipt：供审阅、上下文 ledger 与返回旅程追溯。 */
export interface MapBindingReceipt {
  bindingId: string
  mapAssetId: string
  mapRevision: number
  worldbookId: string
  worldbookEntryId: string
  statusBefore: MapBindingStatus
  statusAfter: MapBindingStatus
  method: MapBindingMethod
  evidence: string
  committedAt: number
}

export interface BindingDiff {
  before: MapObjectRef | null
  after: MapObjectRef
  identity: PlaceIdentity
}

/**
 * 绑定事务的输入。事务实现（P6）负责：
 * 原子保存 + receipt + 不触碰世界书正文。
 */
export interface BindWorldbookPlaceCommand {
  identity: PlaceIdentity
  diff: BindingDiff
  /** 并发保护：expectedRevision 不匹配时拒绝提交（stale 阻止覆盖）。 */
  expectedMapRevision: number
}

/** ghost placement 确认前不写任何真源（计划 §6.3）。 */
export interface GhostPlacementDraft {
  identity: PlaceIdentity
  draftCoordinates: { x: number; y: number }
  mapAssetId: string
  mapRevision: number
}
