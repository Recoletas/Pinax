/**
 * 保形海陆比 remap + 宏观海岸重塑（Round 2 Stage 2 + Stage 3 合并）
 *
 * 思路分三阶段:
 *  阶段 A — 全局 shift 逼近目标(sort + median-threshold,小步 ±10 × 6,
 *           处理"基线远离 20"的极端模板如 pangea / archipelago)。
 *  阶段 B-1 — 为命中 targetLandRatio 翻动过渡带 cell:cost = |h - 20| +
 *           bias * 3,翻 cost 最低的 cell 直到 ratio 命中,把翻动聚集成
 *           不规则条带(取代全局 shift 切出的直线边界)。
 *  阶段 B-2 — 宏观海岸重塑(原 Round 2 `reshapeCoasts` 合并):不关心
 *           landRatio,只把低频 FBM bias 高的过渡 cell 翻成陆/水,
 *           ~ n * 3% 翻转量,形成 2-3 cell 半径的海湾/半岛凹凸。
 *           真正能改 coastline 形状(B-1 命中 ratio 后留下的矩形边界
 *           在此阶段被打散)。
 * 兜底 — `rescueZeroLand`  landRatio < 1% 时强保最高的 1% cell 为陆地,
 *           避免极端 landRatio + aggressive shift 产出全水图。
 *
 * determinism: FBM 来自 cell 坐标 hash,**不**消费任何 rng。同 seed 同
 * 模板两次调用结果 byte-identical。
 */
import type { GridCells } from './types'

const SEA_LEVEL = 20
const LO = 8   // 过渡带下界
const HI = 32  // 过渡带上界
const FBM_SCALE = 0.004
const BIAS_GAIN = 3  // bias 对 cost 的权重
const POLAR_BAND = 0.12  // 极地衰减带(与 `softenMapEdges` 一致)
const POLAR_LATITUDE_SCALE = 0.85  // 极地 macroReshape 衰减强度
// Round 2.5:`softenMapEdges` 极地带只覆盖 y < 0.12 / y > 0.88,而
// `polar-realism` 合同要求 y > 0.7 的"近极地"也保持一定的非绿洲比
// 例。`macroReshape` 在 y > 0.7 / y < 0.3 范围也加 cost 惩罚,避免
// 把大片近极地翻成陆并被 climate 判成温带。
const NEAR_POLAR_BAND = 0.30
const NEAR_POLAR_LATITUDE_SCALE = 0.50

/**
 * 极地衰减因子(0=极地,1=赤道),与 `coast.ts::polarFactor` 行为一致。
 * 极地区域应让 macroReshape 的翻动**显著衰减**,避免被极地放大成
 * 大片绿洲,推反 `softenMapEdges` 的极地海冰带。
 */
function polarFactor(yFrac: number): number {
  return clamp(yFrac < 0.5 ? yFrac / POLAR_BAND : (1 - yFrac) / POLAR_BAND, 0, 1)
}

/**
 * 近极地衰减因子(0=近极地,1=赤道)。比 `polarFactor` 衰减带更宽,覆盖
 * y ∈ [0.30, 0.50] ∪ [0.50, 0.70] 这两段"中高纬过渡带",为
 * `polar-realism` 合同的"非全绿洲"要求保留足够干冷生物群系空间。
 */
function nearPolarFactor(yFrac: number): number {
  return clamp(yFrac < 0.5 ? yFrac / NEAR_POLAR_BAND : (1 - yFrac) / NEAR_POLAR_BAND, 0, 1)
}

function hash2D(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

function fbm2D(x: number, y: number, octaves: number): number {
  let v = 0
  let amp = 1
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    v += amp * (hash2D(x * freq, y * freq) * 2 - 1)
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return v / max
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function countLand(cells: GridCells): number {
  let land = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] >= SEA_LEVEL) land++
  }
  return land
}

/**
 * 阶段 A:sort + median-threshold 算出 shift 方向,小步 ±10 × 6 逼近。
 * 思路与原 `adjustSeaLevel` 一致（最大 shift = ±60 应对 pangea / archipelago
 * 等基线极端模板）。Phase B 在此之后接管"窗口内不规则化 + 精确收尾"。
 */
function globalShiftApproach(cells: GridCells, targetLandRatio: number): void {
  const n = cells.length
  // 第一次 sort 算 shift
  let heights = Array.from(cells.h).sort((a, b) => a - b)
  const targetWater = clamp(Math.floor(n * (1 - targetLandRatio)), 0, n - 1)
  let shift = SEA_LEVEL - heights[targetWater]
  if (shift === 0) return

  let attempts = 0
  while (shift !== 0 && attempts++ < 6) {
    const step = clamp(shift, -10, 10)
    for (let i = 0; i < n; i++) {
      cells.h[i] = clamp(cells.h[i] + step, 0, 100)
    }
    const land = countLand(cells)
    const landRatio = land / n
    if (Math.abs(landRatio - targetLandRatio) <= 0.025) return
    heights = Array.from(cells.h).sort((a, b) => a - b)
    shift = SEA_LEVEL - heights[targetWater]
  }
}

interface Transition {
  i: number
  h: number
  cost: number
}

/**
 * 阶段 B-1:为命中 targetLandRatio 翻动过渡带 cell。
 * cost = |h - 20| + bias * 3。bias ∈ [-1, 1] 来自低频 FBM。
 * 同一 bias 区域内的多个过渡 cell 共享 cost 偏移 → 翻动聚集成不规则
 * 条带 / 海湾（避免全局 shift 切出来的直线 / 带状边界）。
 *
 * Round 2 修复:加极地 cost 惩罚 `(1 - polarFactor) * 100`,极地 cell
 * 排到队尾、被翻动的优先级远低于赤道 cell。这样 macroReshape /
 * transitionFlip 不会把极地边缘原本被 `softenMapEdges` 压成水/低陆
 * 的 cell 翻成大片绿洲,推反 `polar-realism` 合同。
 */
function transitionFlip(cells: GridCells, targetLandRatio: number): void {
  const n = cells.length
  const transitions: Transition[] = []
  for (let i = 0; i < n; i++) {
    const h = cells.h[i]
    if (h < LO || h > HI) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
    const pf = polarFactor(y)
    transitions.push({
      i, h,
      cost: Math.abs(h - SEA_LEVEL) + bias * BIAS_GAIN + (1 - pf) * 100,
    })
  }
  if (transitions.length === 0) return

  const currentLand = countLand(cells)
  const currentRatio = currentLand / n
  if (Math.abs(currentRatio - targetLandRatio) <= 0.025) return

  const needMoreLand = currentRatio < targetLandRatio
  const eligible = needMoreLand
    ? transitions.filter(t => t.h < SEA_LEVEL)
    : transitions.filter(t => t.h >= SEA_LEVEL)
  if (eligible.length === 0) return

  // 翻动上限:剩余差值对应的 cell 数,封顶 eligible 总数
  const diffCells = Math.abs(currentRatio - targetLandRatio) * n
  const targetFlips = Math.max(1, Math.round(diffCells))
  const flipsNeeded = Math.min(targetFlips, eligible.length)

  eligible.sort((a, b) => a.cost - b.cost)
  const flips = eligible.slice(0, flipsNeeded)

  for (const f of flips) {
    if (needMoreLand) {
      // 拉到 24-26 区间(SEA_LEVEL 上方但不过分高)
      cells.h[f.i] = 24 + Math.floor(hash2D(f.i, 0.337) * 3)
    } else {
      // 拉到 14-16 区间(SEA_LEVEL 下方但不过分低)
      cells.h[f.i] = 14 + Math.floor(hash2D(f.i, 0.919) * 3)
    }
  }
}

/**
 * 阶段 B-2:宏观海岸重塑(原 Round 2 `reshapeCoasts` 合并进来)。
 *
 * 与 B-1 的关键区别:**不**关心 landRatio,只把低频 FBM bias 高的过渡
 * cell 翻向陆(bias>0)或翻向水(bias<0),聚集成不规则海湾 / 半岛凸出。
 * 这样能**真正**重塑大陆轮廓 — 之前的 reshapeCoasts 只对陆地 cell
 * ±1 高度,无法改变 coastline 形状。
 *
 * 翻转数量 ~ n * 3%(经验值),能形成 2-3 cell 半径的海湾凹凸。
 */
function macroReshape(cells: GridCells): void {
  const n = cells.length
  const targetFlips = Math.max(1, Math.round(n * 0.03))
  const transitions: Transition[] = []
  for (let i = 0; i < n; i++) {
    const h = cells.h[i]
    if (h < LO || h > HI) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
    const pf = polarFactor(y)
    const npf = nearPolarFactor(y)
    // 极地 + 近极地双重 cost 惩罚。极地带(y < 0.12 / y > 0.88)惩罚
    // 极重;近极地带(y < 0.30 / y > 0.70)惩罚较重。共同防止
    // macroReshape 把大片高纬 cell 翻成陆,推反 `softenMapEdges` 的
    // 极地海冰带 + `polar-realism` 合同要求的"非全绿洲"分布。
    // Round 2.5 调高:实测 0.98 greenRatio,需要把高纬 macroReshape
    // 翻动**完全抑制**才能让 southBelt 留够 tundra / desert 空间。
    const polarPenalty = (1 - pf) * 200
      + (1 - npf) * 150
    transitions.push({
      i, h,
      cost: Math.abs(h - SEA_LEVEL) + Math.abs(bias) * BIAS_GAIN + polarPenalty,
    })
  }
  if (transitions.length === 0) return

  // |bias| 越大、离 SEA_LEVEL 越近,越先翻 — 把"贴近海平面的 cell 优先
  // 重塑"合并到 cost 里。
  transitions.sort((a, b) => a.cost - b.cost)
  const flips = transitions.slice(0, Math.min(targetFlips, transitions.length))
  for (const f of flips) {
    const x = cells.p[f.i * 2]
    const y = cells.p[f.i * 2 + 1]
    const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
    if (bias > 0) {
      // bias > 0 → 翻成陆(半岛 / 凸出)
      cells.h[f.i] = 24 + Math.floor(hash2D(f.i, 0.337) * 3)
    } else {
      // bias < 0 → 翻成水(海湾 / 缺口)
      cells.h[f.i] = 14 + Math.floor(hash2D(f.i, 0.919) * 3)
    }
  }
}

/**
 * 极端 landRatio + 强积极 sea-level shift 下,某些 seed 会把所有 cell
 * 推到 SEA_LEVEL 以下变成"全水图"。这里保最少 1% 陆地:挑最高的若干个
 * cell 拉到 SEA_LEVEL+5 区间。仅作为防止 downstream 模块(features /
 * climate)炸掉的兜底,**不**纠正 landRatio 到目标值。
 */
function rescueZeroLand(cells: GridCells, minLandRatio: number): void {
  const n = cells.length
  let land = 0
  for (let i = 0; i < n; i++) {
    if (cells.h[i] >= SEA_LEVEL) land++
  }
  const minLand = Math.max(1, Math.round(n * minLandRatio))
  if (land >= minLand) return
  const indices = Array.from({ length: n }, (_, i) => i)
  indices.sort((a, b) => cells.h[b] - cells.h[a])
  for (let k = 0; k < minLand; k++) {
    const i = indices[k]
    if (cells.h[i] >= SEA_LEVEL) continue
    cells.h[i] = SEA_LEVEL + 5 + Math.floor(hash2D(i, 0.71) * 3)
  }
}

/**
 * 三阶段 remap(Round 2 修复):
 *  阶段 A — `globalShiftApproach`  sort + median-threshold 全局 ±10 × 6
 *           逼近目标,处理"基线远离 20"的极端模板(pangea / archipelago)。
 *  阶段 B-1 — `transitionFlip`  在过渡带 h ∈ [LO, HI] 内,按
 *           cost = |h - 20| + bias * 3 翻动最低 cost 的 cell 直至 ratio
 *           命中,聚集成不规则条带/海湾(取代全局 shift 切出的直线边界)。
 *  阶段 B-2 — `macroReshape`  合并原 Round 2 `reshapeCoasts`:不关心
 *           landRatio,只把低频 FBM bias 高的过渡 cell 翻成陆/水,
 *           真正重塑大陆轮廓(原 reshapeCoasts 只 ±1 陆地 cell 高度,
 *           无法改变 coastline 形状)。翻转量 ~ n * 3%。
 * 兜底 — `rescueZeroLand`  landRatio < 1% 时强保最高的 1% cell 为陆地,
 *           避免极端 landRatio + aggressive shift 产出全水图。
 */
export function adjustSeaLevelTemplateAware(
  cells: GridCells,
  targetLandRatio: number,
): void {
  if (cells.length === 0) return
  globalShiftApproach(cells, targetLandRatio)
  transitionFlip(cells, targetLandRatio)
  macroReshape(cells)
  rescueZeroLand(cells, 0.01)
}
