/**
 * 边界地形修改（4 个 apply 函数）
 * 沿板块边界 spine 应用高度修改
 *
 * 本文件只导出纯函数；Task 5 会替换 `tectonics.ts` 中的
 * `applyBoundaryTerrain` 来调用这里的函数。
 */
import type { GridCells } from './types'

const SEA_LEVEL = 20

/** 板块边界段（内部类型，与 `tectonics.ts` 内的形态对应） */
interface BoundarySegment {
  cellsA: number[]
  cellsB: number[]
  normalX: number
  normalY: number
}

interface ConvergentParams {
  /** 山峰最大抬升高度 */
  peakHeight: number
  /** 山带半宽（1-8），控制 BFS 扩散层数与高斯衰减 σ */
  rangeWidth: number
  rng: () => number
}

/** 标准高斯衰减（d=距 spine 的 BFS 层数，sigma=山带宽度控制量） */
function gaussian(d: number, sigma: number): number {
  return Math.exp(-(d * d) / (2 * sigma * sigma))
}

/**
 * 汇聚边界：沿 spine 拉山脊，垂直高斯衰减
 * - spine cell：layer=0 → 抬升 peakHeight
 * - BFS 扩散 layer=1..rangeWidth，按 gaussian(layer, sigma) 衰减
 * - 海水位以下的 cell 不抬升（保留海底）
 */
export function applyConvergentRange(
  cells: GridCells,
  seg: BoundarySegment,
  params: ConvergentParams,
): void {
  const { peakHeight, rangeWidth } = params
  const sigma = rangeWidth / 2.5
  const spine = new Set([...seg.cellsA, ...seg.cellsB])

  for (const cellId of spine) {
    if (cells.h[cellId] < SEA_LEVEL) continue
    // 沿邻接表向外 BFS 扩散
    const visited = new Set<number>([cellId])
    const frontier: number[] = [cellId]
    for (let layer = 0; layer <= rangeWidth; layer++) {
      const next: number[] = []
      for (const c of frontier) {
        // 只抬升至 SEA_LEVEL 以上的 cell（避免海底被抬升成陆地）
        if (cells.h[c] >= SEA_LEVEL) {
          const lift = gaussian(layer, sigma) * peakHeight
          cells.h[c] = Math.min(100, Math.round(cells.h[c] + lift))
        }
        for (const nb of cells.c[c]) {
          if (!visited.has(nb)) {
            visited.add(nb)
            next.push(nb)
          }
        }
      }
      frontier.length = 0
      for (const n of next) frontier.push(n)
    }
  }
}

interface DivergentParams {
  /** 裂谷最大下凹深度 */
  riftDepth: number
}

/**
 * 离散边界：spine 下凹 + 邻居抬升
 * - spine cell：h -= riftDepth（clamp ≥ 0）
 * - 直接邻居（cells.c[i]）：h += riftDepth/3
 */
export function applyDivergentRift(
  cells: GridCells,
  seg: BoundarySegment,
  params: DivergentParams,
): void {
  const { riftDepth } = params
  const spine = new Set([...seg.cellsA, ...seg.cellsB])
  const shoulderBoost = Math.round(riftDepth / 3)

  for (const cellId of spine) {
    cells.h[cellId] = Math.max(0, Math.round(cells.h[cellId] - riftDepth))
    for (const nb of cells.c[cellId]) {
      cells.h[nb] = Math.min(100, Math.round(cells.h[nb] + shoulderBoost))
    }
  }
}

/**
 * 转换边界：小起伏（断层崖）
 * - spine cell：h += floor(rng() * 4) - 1 ∈ {-1, 0, 1, 2}
 * - clamp 至 [0, 100]
 */
export function applyTransformShear(
  cells: GridCells,
  seg: BoundarySegment,
  rng: () => number,
): void {
  const spine = new Set([...seg.cellsA, ...seg.cellsB])
  for (const cellId of spine) {
    const delta = Math.floor(rng() * 4) - 1
    cells.h[cellId] = Math.max(0, Math.min(100, Math.round(cells.h[cellId] + delta)))
  }
}

interface VolcanicParams {
  /** 从 spine 向内陆走的步数 */
  offsetCell: number
  /** 火山峰顶最大抬升高度 */
  peakHeight: number
  rng: () => number
}

/**
 * 俯冲带火山弧：在 overriding plate 侧、距 spine `offsetCell` 步的内陆处
 * - 沿 normal 方向走 offsetCell 步
 * - 抬升 + 标 volcano（strato/shield）+ 标 tectonic.volcanoArc
 * - 若 cells.tectonic 未初始化，直接返回（防御）
 */
export function applyVolcanicArc(
  cells: GridCells,
  seg: BoundarySegment,
  overridingPlate: number,
  params: VolcanicParams,
): void {
  const { offsetCell, peakHeight, rng } = params
  if (!cells.tectonic) return  // need tectonic data for pickNeighborInDirection + volcanoArc
  if (!cells.volcano) cells.volcano = new Uint8Array(cells.length)

  const spine = [...seg.cellsA, ...seg.cellsB]
  for (const cellId of spine) {
    let current = cellId
    let walked = true
    for (let step = 0; step < offsetCell; step++) {
      const next = pickNeighborInDirection(
        cells, current, seg.normalX, seg.normalY, overridingPlate,
      )
      if (next < 0) { walked = false; break }
      current = next
    }
    if (!walked) continue

    // base lift 25-44，加 peakHeight 缩放后不超过 100
    const lift = 25 + Math.floor(rng() * 20) + Math.floor(peakHeight * 0.2)
    cells.h[current] = Math.min(100, Math.round(cells.h[current] + lift))
    cells.volcano[current] = rng() < 0.3 ? 2 : 1  // 2=shield, 1=strato
    cells.tectonic.volcanoArc[current] = 1
  }
}

/**
 * 在 normal 方向 (nx, ny) 上最远、且 plateId 匹配的邻居；
 * 找不到则返回 -1。
 */
function pickNeighborInDirection(
  cells: GridCells,
  cell: number,
  nx: number,
  ny: number,
  plate: number,
): number {
  let best = -1
  let bestDot = -Infinity
  const cx = cells.p[cell * 2]
  const cy = cells.p[cell * 2 + 1]
  for (const nb of cells.c[cell]) {
    if (cells.tectonic && cells.tectonic.plateId[nb] !== plate) continue
    const dx = cells.p[nb * 2] - cx
    const dy = cells.p[nb * 2 + 1] - cy
    const dot = dx * nx + dy * ny
    if (dot > bestDot) {
      bestDot = dot
      best = nb
    }
  }
  return best
}
