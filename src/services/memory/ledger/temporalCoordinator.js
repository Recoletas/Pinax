// 时序协调（M01/M02，nightly-20260918）：functional 单值状态关系的矛盾检测
// 与区间闭合**提案**。移植自 Utopia temporal 引擎的纯算法核心：
//
// 上游：deeplethe/utopia @ ca4678084da46311c1d24cb65d05f340d8903e54
//       crates/utopia-store/src/temporal.rs（Apache-2.0，无 NOTICE 文件）
// 移植函数：desired_ends / arrive / Row(key, is_open, recomputable,
//           end_before, holds_at) / same_value / End(earlier)。
// 修改（适配边界，其余语义逐行对应）：
// - Rust/Postgres 事务与咨询锁不移植：本项目是单作者浏览器流程，落库原子性
//   由既有 factLedger 的 Dexie 事务承担（M03 接线）；本模块零 IO、零内依。
// - 上游置信度阈值（AUTO_CLOSE_MIN_CONFIDENCE=0.75）不照搬：按计划要求
//   "保留作者确认"，低置信 analogue = 非作者权威（derived）的后任不得改写
//   前任历史，改记 needs-author 冲突交人裁决。
// - 双侧唯一（inverse functional）时间线不移植：Pinax 谓词合同 v1 尚无
//   该声明；宾语侧方向留待合同扩展。
// - 闭合一律是提案输出，绝不直接改行；"作废+改写"的落库形状由消费方按
//   factLedger 既有 supersedes/invalidatedSeq 合同执行。
//
// 原则（对应上游头注）：纯规则判定、零模型；闭合点只用世界时间；拿不准
// （缺时间/同时开始/低置信）绝不硬闭合，输出冲突原因交人。结果只取决于
// 现有哪些行，与到达先后无关——迟到补录与顺序输入得到同一份计划。

export const TEMPORAL_KINDS = Object.freeze({
  SINGLE_VALUE_STATE: 'single-value-state',
  MULTI_VALUE_RELATION: 'multi-value-relation',
  EVENT: 'event'
})

const CONFLICT_REASONS = Object.freeze({
  SIMULTANEOUS: 'simultaneous',
  NO_TIME: 'no-time',
  NEEDS_AUTHOR: 'needs-author'
})

/**
 * M02 分类合同：谓词声明为单值状态才允许自动闭合；多值关系与事件永远
 * 不会被后任"接替"——多值不得误关闭旧事实，事件区间只接受显式更正。
 */
export function classifyTemporalFact({ temporalKind } = {}) {
  if (temporalKind === TEMPORAL_KINDS.SINGLE_VALUE_STATE) return TEMPORAL_KINDS.SINGLE_VALUE_STATE
  if (temporalKind === TEMPORAL_KINDS.MULTI_VALUE_RELATION) return TEMPORAL_KINDS.MULTI_VALUE_RELATION
  return TEMPORAL_KINDS.EVENT
}

// "还开着"：没有写下的终点，也没有"结束了，不知哪天"的标记。unknown-end
// 行已经是闭合的形状（0022：未知日期不是开放终点），引擎不得再改写。
function isOpen(row) {
  if (row.endUnknown === true) return false
  return row.to === null || row.to === undefined
}

// 排序用的时刻：起点；没有起点时，最早自带日期的证据——但只对还开着、
// 或由引擎关上的行成立（原文说已结束的行，证据日期只说明"那天之前结束了"）。
function rowKey(row) {
  if (row.from !== null && row.from !== undefined) return row.from
  if (isOpen(row) || row.endDerived === true) return row.anchorAt ?? null
  return null
}

function isRecomputable(row) {
  return isOpen(row) || row.endDerived === true
}

// 前一段止于这一行开始时：有起点就是那一刻；没有起点是"结束了，不知哪天"，
// 锚在这一行自带日期的证据上。
function endBefore(row) {
  if (row.from !== null && row.from !== undefined) {
    return { kind: 'at', at: row.from, precision: row.fromPrecision || 'day', derivedFrom: row.id }
  }
  return { kind: 'unknown-end', anchor: row.anchorAt ?? null, derivedFrom: row.id }
}

// 在 at 这一刻还成立：开着，或终点（含 unknown-end 的锚点）在那之后。
function holdsAt(row, at) {
  if (isOpen(row)) return true
  if (row.endUnknown === true) return row.anchorAt !== null && row.anchorAt > at
  return row.to !== null && row.to !== undefined && row.to > at
}function sameValue(a, b) {
  return a.objectKey === b.objectKey
}

function currentEndOf(row) {
  if (!isOpen(row)) return { kind: 'at', at: row.to, precision: row.toPrecision || 'day' }
  if (row.endUnknown === true) return { kind: 'unknown-end', anchor: row.anchorAt ?? null }
  return { kind: 'open' }
}

function endEquals(a, b) {
  if (a.kind !== b.kind) return false
  if (a.kind === 'open') return true
  if (a.kind === 'at') return a.at === b.at
  return (a.anchor ?? null) === (b.anchor ?? null)
}

/**
 * 一条时间线上每一行该有的终点（纯函数）：只含终点由引擎定的行。
 *
 * 能排进时间线的行（有起点，或开着的行带证据锚点）按时刻排好；终点是
 * 写明的行不动。其余每一行——开着的、引擎关上的——止于它之后最近的、
 * 值不同的那一行开始时；后面没有这样的行就开着。那一行不是作者权威时
 * 不许它改写历史：跳过它、记 needs-author，再看下一行。
 */
function desiredEnds(rows) {
  const keyed = rows
    .map(row => ({ row, key: rowKey(row) }))
    .filter(entry => entry.key !== null)
  // 同一刻开始的几行，写着起点的排前面：后任取它，前任就止于一个日期而不是一个锚点
  keyed.sort((a, b) => (
    a.key - b.key
    || ((a.row.from === null || a.row.from === undefined) ? 1 : 0) - ((b.row.from === null || b.row.from === undefined) ? 1 : 0)
    || String(a.row.id).localeCompare(String(b.row.id))
  ))
  const ends = new Map()
  const needsAuthor = []
  for (let index = 0; index < keyed.length; index += 1) {
    const { row, key } = keyed[index]
    if (!isRecomputable(row)) continue
    let end = { kind: 'open' }
    let doubtful = null
    for (let laterIndex = index + 1; laterIndex < keyed.length; laterIndex += 1) {
      const later = keyed[laterIndex]
      if (later.key <= key || sameValue(row, later.row)) continue
      // 低置信 analogue：非作者权威的后任不允许自动改写前任的历史
      if (later.row.authority !== 'author') {
        if (!doubtful) doubtful = later.row
        continue
      }
      end = endBefore(later.row)
      break
    }
    if (doubtful) needsAuthor.push({ row, doubtful })
    ends.set(row.id, end)
  }
  return { ends, needsAuthor }
}

function normalizeRow(row) {
  return {
    id: String(row?.id ?? ''),
    objectKey: String(row?.objectKey ?? ''),
    from: Number.isFinite(row?.from) ? row.from : null,
    fromPrecision: row?.fromPrecision || null,
    to: Number.isFinite(row?.to) ? row.to : null,
    toPrecision: row?.toPrecision || null,
    endUnknown: row?.endUnknown === true,
    anchorAt: Number.isFinite(row?.anchorAt) ? row.anchorAt : null,
    endDerived: row?.endDerived === true,
    authority: row?.authority === 'author' ? 'author' : 'derived'
  }
}

/**
 * 单值状态时间线的协调计划（M01 主入口）。
 *
 * 入参 rows：同一 scope + subjectKey + predicate 下、尚未作废的现存版本，
 * 外加 `incoming`（新断言；也算进时间线，但不作为闭合候选——它自己还没有
 * 历史可改写）。输出：
 * - closes: 该收口的旧行（end 与现状不同的），附新旧区间与依据行
 * - conflicts: 交人裁决的对子（simultaneous / no-time / needs-author）
 * - skipped: 分类合同排除的原因（多值/事件不参与自动闭合）
 *
 * 顺序无关：计划只是 rows+incoming 这个集合的函数；迟到补录与按序到达
 * 得到同一份 closes/conflicts。
 */
export function planSingleValueTimeline({ rows = [], incoming = null, temporalKind = TEMPORAL_KINDS.SINGLE_VALUE_STATE } = {}) {
  const kind = classifyTemporalFact({ temporalKind })
  if (kind !== TEMPORAL_KINDS.SINGLE_VALUE_STATE) {
    return {
      kind,
      closes: [],
      conflicts: [],
      skipped: { reason: kind === TEMPORAL_KINDS.MULTI_VALUE_RELATION ? 'multi-valued' : 'event' }
    }
  }
  const all = [...(rows || []).map(normalizeRow)]
  const normalizedIncoming = incoming ? normalizeRow(incoming) : null
  if (normalizedIncoming) all.push(normalizedIncoming)

  const { ends, needsAuthor } = desiredEnds(all)

  // 该收口的行：期望终点与眼下写着的不同的那些。incoming 同样参与：迟到
  // 的旧行会被现存更晚的后任闭合（上游 tidy 对整条时间线重算，不分先后）。
  const closes = []
  for (const row of all) {
    if (!isRecomputable(row)) continue
    const desired = ends.get(row.id) || { kind: 'open' }
    if (endEquals(currentEndOf(row), desired)) continue
    closes.push({
      id: row.id,
      from: row.from,
      currentEnd: currentEndOf(row),
      proposedEnd: desired,
      reason: desired.kind === 'unknown-end' ? 'superseded-unknown-end' : 'superseded'
    })
  }

  const conflicts = []
  const conflictSeen = new Set()
  const pushConflict = (oldRow, newRow, reason) => {
    const keyPair = [oldRow.id, newRow.id].sort().join('→') + ':' + reason
    if (conflictSeen.has(keyPair)) return
    conflictSeen.add(keyPair)
    conflicts.push({ oldId: oldRow.id, newId: newRow.id, reason })
  }
  if (normalizedIncoming) {
    // 新断言来到它的时间线上，记下重算裁不了的：
    // - 同一刻开始、两边那一刻都还成立：谁接替谁说不清
    // - 两边都还开着、有一边说不出时间：谁先谁后无从谈起
    for (const row of all) {
      if (row.id === normalizedIncoming.id || sameValue(row, normalizedIncoming)) continue
      const newKey = rowKey(normalizedIncoming)
      const otherKey = rowKey(row)
      if (newKey !== null && otherKey !== null && newKey === otherKey
        && holdsAt(normalizedIncoming, newKey) && holdsAt(row, otherKey)) {
        pushConflict(row, normalizedIncoming, CONFLICT_REASONS.SIMULTANEOUS)
      } else if ((newKey === null || otherKey === null) && isOpen(normalizedIncoming) && isOpen(row)) {
        pushConflict(row, normalizedIncoming, CONFLICT_REASONS.NO_TIME)
      }
    }
  }
  for (const { row, doubtful } of needsAuthor) {
    pushConflict(row, doubtful, CONFLICT_REASONS.NEEDS_AUTHOR)
  }

  return { kind, closes, conflicts, skipped: null }
}
