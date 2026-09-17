/**
 * 确定性资源账（CX19–CX24 最小纵切）。原创轻规则：两类白名单资源
 * （活力/灯油），全部数值变化必须经本模块的事务路径：
 *   - 白名单之外/非整数/越界结果/非法 revision 一律本地拒绝（XC-G21）；
 *   - 同 actionId 的结算效果只应用一次——重试叙述/重复检查不再扣（XC-G22）；
 *   - expectedRevision CAS：并发或过期写拒绝；
 *   - 当前值 = 基线 + 已确认 delta 序列，可随时对账（reconcile，CX24）；
 *   - 模型不能写资源：唯一入口是确定性结算钩子与显式使用命令。
 * 物品（CX23）：白名单单次消耗品（灯油壶），获取幂等、使用一次即失效。
 */

export const ROLEPLAY_RESOURCES_SCHEMA_VERSION = 1

// 冻结的原创轻规则 v1（不冒称完整规则系统）：
//   部分成功 → 灯油 -1（推进消耗）；失败前进 → 活力 -2（受挫代价）。
export const ROLEPLAY_RESOURCE_RULES = Object.freeze({
  version: 1,
  outcomeCosts: Object.freeze({
    success: Object.freeze([]),
    partial: Object.freeze([{ resource: 'lampOil', amount: -1 }]),
    failure: Object.freeze([{ resource: 'vitality', amount: -2 }])
  })
})

export const ROLEPLAY_RESOURCE_WHITELIST = Object.freeze({
  vitality: Object.freeze({ label: '活力', min: 0, max: 100, initial: 100 }),
  lampOil: Object.freeze({ label: '灯油', min: 0, max: 20, initial: 10 })
})

// 白名单消耗品（CX23）：使用效果即一组资源 delta，一次性。
export const ROLEPLAY_ITEM_WHITELIST = Object.freeze({
  lampOilFlask: Object.freeze({
    label: '灯油壶',
    effect: Object.freeze([{ resource: 'lampOil', amount: 3 }]),
    maxCount: 2
  })
})

const RESOURCE_DELTA_MAX_ABS = 20
const APPLIED_SOURCE_LIMIT = 1000

export function createResourceState() {
  return {
    version: ROLEPLAY_RESOURCES_SCHEMA_VERSION,
    baseline: Object.fromEntries(Object.entries(ROLEPLAY_RESOURCE_WHITELIST).map(([key, def]) => [key, def.initial])),
    // 确认 delta 流（对账真源）；只追加，不静默裁剪。
    deltas: [],
    // 物品：itemId → { count, acquired: [sourceActionId|'manual'] }
    items: {},
    // 已应用结算后果的 actionId（幂等键，与 scenarioRun.appliedActionIds 独立）。
    appliedActionIds: []
  }
}

export function normalizeResourceState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw.version) !== ROLEPLAY_RESOURCES_SCHEMA_VERSION) return null
  const state = createResourceState()
  for (const key of Object.keys(ROLEPLAY_RESOURCE_WHITELIST)) {
    const value = Number(raw.baseline?.[key])
    if (Number.isSafeInteger(value)) {
      const { min, max } = ROLEPLAY_RESOURCE_WHITELIST[key]
      state.baseline[key] = Math.max(min, Math.min(max, value))
    }
  }
  state.deltas = (Array.isArray(raw.deltas) ? raw.deltas : [])
    .filter((delta) => isValidDeltaShape(delta))
    .map((delta) => ({ ...delta, branchId: delta.branchId ? String(delta.branchId) : null }))
  state.items = {}
  if (raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items)) {
    for (const [itemId, entry] of Object.entries(raw.items)) {
      if (!ROLEPLAY_ITEM_WHITELIST[itemId] || !entry || typeof entry !== 'object') continue
      state.items[itemId] = {
        count: Math.max(0, Math.min(ROLEPLAY_ITEM_WHITELIST[itemId].maxCount, Number(entry.count) || 0)),
        acquired: Array.isArray(entry.acquired) ? entry.acquired.map(String).slice(-50) : []
      }
    }
  }
  state.appliedActionIds = Array.isArray(raw.appliedActionIds) ? raw.appliedActionIds.map(String).slice(-APPLIED_SOURCE_LIMIT) : []
  return state
}

function isValidDeltaShape(delta) {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return false
  if (!ROLEPLAY_RESOURCE_WHITELIST[delta.resource]) return false
  const amount = Number(delta.amount)
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > RESOURCE_DELTA_MAX_ABS || amount === 0) return false
  return Boolean(String(delta.deltaId || '').trim())
}

/** 当前值 = 基线 + Σ已确认 delta（夹紧到白名单上下限）。 */
export function computeResourceValues(state) {
  const values = { ...state.baseline }
  for (const delta of state.deltas) {
    const { min, max } = ROLEPLAY_RESOURCE_WHITELIST[delta.resource]
    values[delta.resource] = Math.max(min, Math.min(max, values[delta.resource] + delta.amount))
  }
  return values
}

/**
 * 应用一条资源 delta（事务）：CAS(expectedRevision) + 结果越界拒绝 +
 * deltaId 幂等。revision 每次 +1。拒绝时返回 { ok:false, reason }，绝不部分生效。
 */
export function applyResourceDelta(state, { deltaId, resource, amount, sourceRef = '', branchId = null, expectedRevision }) {
  if (!ROLEPLAY_RESOURCE_WHITELIST[resource]) {
    return { ok: false, reason: 'ROLEPLAY_RESOURCE_UNKNOWN' }
  }
  const numeric = Number(amount)
  if (!Number.isSafeInteger(numeric) || numeric === 0 || Math.abs(numeric) > RESOURCE_DELTA_MAX_ABS) {
    return { ok: false, reason: 'ROLEPLAY_RESOURCE_AMOUNT_INVALID' }
  }
  if (state.deltas.some((delta) => delta.deltaId === deltaId)) {
    return { ok: true, duplicate: true }
  }
  const revision = getResourceRevision(state)
  if (Number.isSafeInteger(expectedRevision) && expectedRevision !== revision) {
    return { ok: false, reason: 'ROLEPLAY_RESOURCE_REVISION_CONFLICT', expected: revision }
  }
  const values = computeResourceValues(state)
  const next = values[resource] + numeric
  const { min, max } = ROLEPLAY_RESOURCE_WHITELIST[resource]
  if (next < min || next > max) {
    return { ok: false, reason: 'ROLEPLAY_RESOURCE_RANGE', limit: next < min ? min : max }
  }
  state.deltas.push({
    schemaVersion: ROLEPLAY_RESOURCES_SCHEMA_VERSION,
    deltaId: String(deltaId),
    resource,
    amount: numeric,
    sourceRef: String(sourceRef || '').slice(0, 120),
    branchId: branchId ? String(branchId) : null,
    revision: revision + 1,
    createdAt: Date.now()
  })
  return { ok: true, revision: revision + 1 }
}

export function getResourceRevision(state) {
  return state.deltas.length
}

/**
 * 分支过滤视图（CX38/XC-G23 数据基础）：给定分支可见的 delta 集合
 * （本分支的 delta + 无分支归属的共享 delta），计算该分支视角的当前值。
 * 完整祖先链过滤需回合拓扑，属下一窗口；当前先支持"本分支 + 共享"口径。
 */
export function computeResourceValuesForBranch(state, branchId) {
  const branch = String(branchId || 'main')
  const values = { ...state.baseline }
  for (const delta of state.deltas) {
    // 冻结口径：本分支 + 主干 main + 无归属的共享 delta 计入；
    // 完整祖先链过滤需回合拓扑，属下一窗口。
    if (delta.branchId && delta.branchId !== branch && delta.branchId !== 'main') continue
    const { min, max } = ROLEPLAY_RESOURCE_WHITELIST[delta.resource]
    values[delta.resource] = Math.max(min, Math.min(max, values[delta.resource] + delta.amount))
  }
  return values
}

/**
 * 结算后果（CX22）：按冻结规则把 outcome 映射为资源消耗，每 actionId 一次。
 * 重试叙述不重复扣；正反方向都不经模型。
 */
export function applyOutcomeResourceCost(state, { actionId, outcome, branchId = null }) {
  if (!actionId) return { applied: false, reason: 'no-action-id' }
  if (state.appliedActionIds.includes(actionId)) return { applied: false, reason: 'already-applied' }
  const costs = ROLEPLAY_RESOURCE_RULES.outcomeCosts[outcome]
  if (!costs || !costs.length) {
    state.appliedActionIds.push(actionId)
    return { applied: true, changes: [] }
  }
  const applied = []
  for (const cost of costs) {
    const result = applyResourceDelta(state, {
      deltaId: `cost_${actionId}_${cost.resource}`,
      resource: cost.resource,
      amount: cost.amount,
      sourceRef: `outcome:${outcome}`,
      branchId
    })
    if (result.ok && !result.duplicate) applied.push({ resource: cost.resource, amount: cost.amount })
  }
  state.appliedActionIds.push(actionId)
  return { applied: true, changes: applied }
}

/** 物品获取（CX23）：幂等（同来源不重复计数），上限外拒绝。 */
export function grantItem(state, { itemId, sourceActionId = 'manual' }) {
  const def = ROLEPLAY_ITEM_WHITELIST[itemId]
  if (!def) return { ok: false, reason: 'ROLEPLAY_ITEM_UNKNOWN' }
  const entry = state.items[itemId] || { count: 0, acquired: [] }
  if (entry.acquired.includes(String(sourceActionId))) return { ok: true, duplicate: true }
  if (entry.count >= def.maxCount) return { ok: false, reason: 'ROLEPLAY_ITEM_CAPACITY' }
  entry.count += 1
  entry.acquired.push(String(sourceActionId))
  state.items[itemId] = entry
  return { ok: true }
}

/** 物品使用：一次性（count-1），效果为固定资源 delta；无库存拒绝。 */
export function useItem(state, { itemId }) {
  const def = ROLEPLAY_ITEM_WHITELIST[itemId]
  if (!def) return { ok: false, reason: 'ROLEPLAY_ITEM_UNKNOWN' }
  const entry = state.items[itemId]
  if (!entry || entry.count <= 0) return { ok: false, reason: 'ROLEPLAY_ITEM_NONE' }
  for (const effect of def.effect) {
    const result = applyResourceDelta(state, {
      deltaId: `item_${itemId}_${getResourceRevision(state)}`,
      resource: effect.resource,
      amount: effect.amount,
      sourceRef: `item-use:${itemId}`
    })
    if (!result.ok) return { ok: false, reason: result.reason }
  }
  entry.count -= 1
  return { ok: true }
}

/**
 * 对账（CX24）：当前展示值应等于 基线+Σdelta（含夹紧）。不一致 = 数据损坏，
 * 显式告警，不靠任何"修复"掩盖。
 */
export function reconcileResources(state, displayedValues) {
  const expected = computeResourceValues(state)
  const mismatches = Object.keys(expected)
    .filter((key) => Number(displayedValues?.[key]) !== expected[key])
    .map((key) => key)
  return { consistent: mismatches.length === 0, mismatches }
}

/** 玩家可见资源行（组件/UI 只读这个）；branchId 给定时按分支口径计算。 */
export function buildResourceProjection(state, { branchId = null } = {}) {
  const values = branchId ? computeResourceValuesForBranch(state, branchId) : computeResourceValues(state)
  return {
    values: Object.fromEntries(Object.entries(ROLEPLAY_RESOURCE_WHITELIST).map(([key, def]) => [key, { label: def.label, value: values[key], min: def.min, max: def.max }])),
    items: Object.fromEntries(Object.entries(state.items).map(([itemId, entry]) => [itemId, { label: ROLEPLAY_ITEM_WHITELIST[itemId]?.label || itemId, count: entry.count }])),
    revision: getResourceRevision(state)
  }
}
