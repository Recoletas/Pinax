/**
 * 保形海陆比 remap（Round 2 Stage 2）
 *
 * 思路分两阶段:
 *  阶段 A — 全局 shift 逼近目标（与原 `adjustSeaLevel` 同样的 sort +
 *           median-threshold 思路,小步 ±10 × 2 attempts,处理"基线远离
 *           20"的极端模板如 pangea / archipelago）
 *  阶段 B — 过渡带翻动（h ∈ [LO, HI] 区间）:
 *           1. 收集过渡带 cell
 *           2. cost = |h - 20| + bias * 3（bias 来自低频 FBM,coherent 大区域）
 *           3. 翻 cost 最低的 cell 直至目标命中
 *           4. 翻动时把 cell 拉离 20（陆地侧 → 24-26,水域侧 → 14-16）
 *
 * 阶段 A 处理"基线远离 20"的极端模板;阶段 B 收尾到精确目标 + 把窗口内
 * 过渡带翻动聚集成不规则条带（这是 Round 2 才被识别的视觉缺陷）。
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
 * 阶段 B:过渡带翻动。
 * cost = |h - 20| + bias * 3。bias ∈ [-1, 1] 来自低频 FBM。
 * 同一 bias 区域内的多个过渡 cell 共享 cost 偏移 → 翻动聚集成不规则
 * 条带 / 海湾（避免全局 shift 切出来的直线 / 带状边界）。
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
    transitions.push({ i, h, cost: Math.abs(h - SEA_LEVEL) + bias * BIAS_GAIN })
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
 * 两阶段 remap。先 sort-threshold 逼近（处理"基线远离 20"的极端模板）,
 * 再过渡带翻动收尾（打破 Azgaar 矩形坡面 + 命中精确目标）。
 * 最后兜底:landRatio < 1% 时强制保留最高的 1% cell 为陆地,避免极端
 * landRatio + aggressive shift 产出全水图导致下游模块崩溃。
 */
export function adjustSeaLevelTemplateAware(
  cells: GridCells,
  targetLandRatio: number,
): void {
  if (cells.length === 0) return
  globalShiftApproach(cells, targetLandRatio)
  transitionFlip(cells, targetLandRatio)
  rescueZeroLand(cells, 0.01)
}
