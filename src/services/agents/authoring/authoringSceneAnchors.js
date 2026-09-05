// Authoring 项目级场景锚点（worldbook scene closure Task 4）。
// 锚点保存在 chapter.sceneAnchors，绑定 unitId + worldbookId；
// 纯函数模块：归一化、活动锚点解析、upsert 与单元拆分/合并/删除迁移。

export const SCENE_ANCHOR_SCHEMA_VERSION = 1
export const MAX_AUTHORING_PRESENT_CHARACTERS = 8

function stableString(value) {
  return String(value ?? '').trim()
}

// 确定性 ID（同输入同输出，跨会话可复算）。
function deterministicId(seed) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `anchor-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function normalizeSceneAnchor(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const unitId = stableString(source.unitId)
  if (!unitId) {
    return { status: 'invalid', unitId: '', worldbookId: '', presentCharacterIds: [], plannedCharacterIds: [] }
  }
  const seen = new Set()
  const presentCharacterIds = (Array.isArray(source.presentCharacterIds) ? source.presentCharacterIds : [])
    .map((id) => stableString(id))
    .filter(Boolean)
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  // V5 领域语义：planned = “安排下一段入场”。约束下一次推演/大纲 intent，
  // 不立即改变当前现场；采纳兑现后由页面移入 presentCharacterIds。
  const plannedSeen = new Set()
  const plannedCharacterIds = (Array.isArray(source.plannedCharacterIds) ? source.plannedCharacterIds : [])
    .map((id) => stableString(id))
    .filter(Boolean)
    .filter((id) => (plannedSeen.has(id) ? false : (plannedSeen.add(id), true)))
    .filter((id) => (presentCharacterIds.includes(id) ? false : true))
  return Object.freeze({
    schemaVersion: SCENE_ANCHOR_SCHEMA_VERSION,
    id: stableString(source.id) || deterministicId(`${unitId}\u0000${stableString(source.worldbookId)}`),
    unitId,
    worldbookId: stableString(source.worldbookId),
    castMode: source.castMode === 'auto' ? 'auto' : 'manual',
    presentCharacterIds,
    plannedCharacterIds,
    locationId: stableString(source.locationId),
    viewpointCharacterId: stableString(source.viewpointCharacterId),
    time: {
      label: stableString(source.time?.label),
      period: stableString(source.time?.period)
    },
    status: stableString(source.status),
    staleReason: stableString(source.staleReason),
    source: stableString(source.source)
  })
}

export function normalizeSceneAnchors(input) {
  const list = Array.isArray(input) ? input : []
  const anchors = []
  const seenUnits = new Set()
  for (const item of list) {
    const anchor = normalizeSceneAnchor(item)
    if (anchor.status === 'invalid') continue
    // 同一单元只保留一个锚点：后来者覆盖。
    if (seenUnits.has(anchor.unitId)) {
      const index = anchors.findIndex((existing) => existing.unitId === anchor.unitId)
      anchors.splice(index, 1, anchor)
      continue
    }
    seenUnits.add(anchor.unitId)
    anchors.push(anchor)
  }
  return anchors
}

// 活动锚点解析：优先 activeUnit 自己的显式锚点；否则沿单元顺序向前找最近的
// 有效锚点（inherited）；worldbook 不匹配时返回 typed 冲突，绝不静默使用。
export function resolveActiveSceneAnchor({ anchors, unitOrder, activeUnitId, worldbookId }) {
  const normalized = normalizeSceneAnchors(anchors)
  const order = Array.isArray(unitOrder) ? unitOrder : []
  const activeIndex = order.indexOf(stableString(activeUnitId))
  if (activeIndex < 0) return { anchor: null, status: 'no-anchor', conflictingAnchor: null }

  const byUnit = new Map(normalized.map((anchor) => [anchor.unitId, anchor]))
  const expectedWorldbookId = stableString(worldbookId)

  // 显式锚点优先。
  const explicit = byUnit.get(stableString(activeUnitId))
  if (explicit && !explicit.status) {
    if (explicit.worldbookId !== expectedWorldbookId) {
      return { anchor: null, status: 'worldbook-mismatch', conflictingAnchor: explicit }
    }
    return { anchor: explicit, status: 'explicit', conflictingAnchor: null }
  }

  // 向前找最近的有效锚点（跳过 stale / 缺失单元的锚点）。
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const candidate = byUnit.get(order[index])
    if (!candidate || candidate.status) continue
    if (candidate.worldbookId !== expectedWorldbookId) {
      return { anchor: null, status: 'worldbook-mismatch', conflictingAnchor: candidate }
    }
    return { anchor: candidate, status: 'inherited', conflictingAnchor: null }
  }

  // activeUnit 自己有锚点但已 stale → no-anchor（不静默沿用）。
  return { anchor: null, status: 'no-anchor', conflictingAnchor: null }
}

// 原子 upsert：revision 守卫 + 不可变数组更新。失败时返回原文档状态。
export function upsertSceneAnchor({ anchors, anchor, expectedDocumentRevision, liveDocumentRevision }) {
  if (
    String(expectedDocumentRevision ?? '') !== String(liveDocumentRevision ?? '')
  ) {
    return { ok: false, reason: 'stale', anchors: normalizeSceneAnchors(anchors) }
  }
  const next = normalizeSceneAnchor(anchor)
  if (next.status === 'invalid') {
    return { ok: false, reason: 'invalid-anchor', anchors: normalizeSceneAnchors(anchors) }
  }
  const current = normalizeSceneAnchors(anchors)
  const index = current.findIndex((existing) => existing.unitId === next.unitId)
  const nextAnchors = current.slice()
  if (index >= 0) nextAnchors.splice(index, 1, next)
  else nextAnchors.push(next)
  return { ok: true, anchors: nextAnchors }
}

// 删除当前单元自己的显式锚点，让解析器重新沿单元顺序继承前文。
// 与 upsert 使用同一 revision 守卫，避免光标/正文已变化时误删别处状态。
export function removeSceneAnchor({ anchors, unitId, expectedDocumentRevision, liveDocumentRevision }) {
  const current = normalizeSceneAnchors(anchors)
  if (String(expectedDocumentRevision ?? '') !== String(liveDocumentRevision ?? '')) {
    return { ok: false, reason: 'stale', anchors: current }
  }
  const targetUnitId = stableString(unitId)
  if (!targetUnitId) return { ok: false, reason: 'invalid-anchor', anchors: current }
  const nextAnchors = current.filter((anchor) => anchor.unitId !== targetUnitId)
  if (nextAnchors.length === current.length) return { ok: false, reason: 'no-anchor', anchors: current }
  return { ok: true, anchors: nextAnchors }
}

// 单元转换迁移（split/merge/delete/move/clear/replace-all）：
// - split：锚点留在 keptUnitId，不复制到 createdUnitId；
// - merge：removedUnitId 的锚点移动到 keptUnitId，后一个来源胜出；
// - delete：锚点保留为 status:'stale' + staleReason:'unit-deleted'（可诊断、可恢复）；
// - move：unitId 不变，无需改写。
export function reconcileSceneAnchorsForUnitTransition({ anchors, transition }) {
  const type = transition?.type
  if (type === 'move') {
    return { ok: true, anchors: normalizeSceneAnchors(anchors) }
  }
  const current = normalizeSceneAnchors(anchors)

  if (type === 'split') {
    // keptUnitId 保留原锚点；createdUnitId 不复制。
    return { ok: true, anchors: current }
  }

  if (type === 'merge') {
    const keptUnitId = stableString(transition.keptUnitId)
    const removedUnitId = stableString(transition.removedUnitId)
    if (!keptUnitId || !removedUnitId) return { ok: false, reason: 'invalid-transition', anchors: current }
    const removed = current.find((anchor) => anchor.unitId === removedUnitId)
    const keptIndex = current.findIndex((anchor) => anchor.unitId === keptUnitId)
    const nextAnchors = current.slice()
    if (removed && keptIndex >= 0) {
      // 后一个来源（removed）胜出：替换 kept 的锚点。
      nextAnchors.splice(keptIndex, 1, removed)
      const droppedIndex = nextAnchors.findIndex((anchor) => anchor.unitId === removedUnitId)
      if (droppedIndex >= 0) nextAnchors.splice(droppedIndex, 1)
      return { ok: true, anchors: nextAnchors.map((anchor) => ({ ...anchor, unitId: anchor.unitId === removedUnitId ? keptUnitId : anchor.unitId })) }
    }
    if (removed) {
      // kept 无锚点：removed 锚点直接迁移到 kept。
      const migratedIndex = nextAnchors.findIndex((anchor) => anchor.unitId === removedUnitId)
      nextAnchors.splice(migratedIndex, 1, { ...removed, unitId: keptUnitId })
      return { ok: true, anchors: nextAnchors }
    }
    return { ok: true, anchors: nextAnchors }
  }

  if (type === 'delete') {
    const removedUnitId = stableString(transition.removedUnitId)
    const nextAnchors = current.map((anchor) => (
      anchor.unitId === removedUnitId
        ? { ...anchor, status: 'stale', staleReason: 'unit-deleted' }
        : anchor
    ))
    return { ok: true, anchors: nextAnchors }
  }

  if (type === 'clear' || type === 'replace-all') {
    const affected = new Set((transition.affectedUnitIds || []).map(stableString).filter(Boolean))
    if (!affected.size) return { ok: false, reason: 'invalid-transition', anchors: current }
    const nextAnchors = current.map((anchor) => (
      affected.has(anchor.unitId)
        ? { ...anchor, status: 'stale', staleReason: type === 'clear' ? 'unit-content-cleared' : 'unit-content-replaced' }
        : anchor
    ))
    return { ok: true, anchors: nextAnchors }
  }

  return { ok: false, reason: 'unknown-transition', anchors: current }
}

// 确定性指纹：撤销前校验当前锚点是否仍是回执记录的状态。
export function fingerprintSceneAnchors(anchors) {
  const normalized = normalizeSceneAnchors(anchors)
  const source = normalized
    .map((anchor) => JSON.stringify(anchor))
    .sort()
    .join('|')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${normalized.length}:${(hash >>> 0).toString(36)}`
}
