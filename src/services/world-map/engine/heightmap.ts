/**
 * 高度图生成 — Voronoi 种子 + FBM 扰动
 *
 * 算法（在 `generateTectonics` 之后调用）：
 *  1. 泊松盘取 N 个大陆种子（continentCount 决定 N）
 *  2. 每个 cell 分配到最近种子的 Voronoi 区域（per-cell 硬归属，杜绝合并）
 *  3. 每个 cell 基础值 = 1 - dist(cell, itsSeed) / maxRadius, 叠 FBM 噪声
 *  4. **per-Voronoi-cell 阈值切分**：每个种子区域独立按 landRatio 切陆/海，
 *     这样 N 个种子在边缘的 FBM 噪声再大也不会把多个大陆焊成一块
 *  5. 板块边界效果
 *  6. 边缘遮罩
 *  7. 一次平滑（threshold=0，杜绝 rim）
 */

import type { GridCells, Plate, PlateBoundary, MapRealism } from './types'
import {
  applyConvergentRange,
  applyDivergentRift,
  applyTransformShear,
  applyVolcanicArc,
} from './boundary-terrain'

const SEA_LEVEL = 20
const FBM_LOW_SCALE = 0.012
const FBM_HIGH_SCALE = 0.04
const NOISE_LOW_AMP = 0.20
const NOISE_HIGH_AMP = 0.12

/**
 * 生成高度图（Voronoi 种子 + FBM 噪声 + per-Voronoi 阈值）
 *
 * 假定 `generateTectonics` 已先调用,且 `cells.tectonic.plateId` 已被填充。
 */
export function generateHeightmap(
  cells: GridCells,
  width: number,
  height: number,
  rng: () => number,
  landRatio = 0.45,
  plates: Plate[] = [],
  boundaries: PlateBoundary[] = [],
  continentCount = 4,
  realism?: MapRealism,
): void {
  const n = cells.length
  const plateId = cells.tectonic?.plateId
  if (!plateId) {
    throw new Error('generateHeightmap: cells.tectonic.plateId not initialized. Call generateTectonics first.')
  }

  // 步骤 1:取大陆种子
  const seeds = pickContinentSeeds(cells, width, height, continentCount, rng)

  // 步骤 2 + 3:Voronoi 归属 + 基础值 + FBM 扰动 → 写入 cells.h
  const cellSeed = assignVoronoiAndHeights(cells, width, height, seeds)

  // 步骤 4:per-Voronoi-cell 阈值切分（保证 N 块独立）
  thresholdPerVoronoiCell(cells, cellSeed, landRatio)

  // 步骤 5:板块边界效果
  const rangeWidth = clamp(realism?.tectonics?.rangeWidth ?? 3, 1, 8)
  const riftDepth = clamp(realism?.tectonics?.riftDepth ?? 25, 5, 60)
  for (const boundary of boundaries) {
    const seg = {
      cellsA: splitCellsByPlate(boundary.cellIds, plateId, boundary.plateA),
      cellsB: splitCellsByPlate(boundary.cellIds, plateId, boundary.plateB),
      normalX: 0,
      normalY: 0,
    }
    computeBoundaryNormal(cells, boundary, seg)
    if (boundary.type === 'convergent') {
      const peakHeight = 50 + rangeWidth * 5
      applyConvergentRange(cells, seg, { peakHeight, rangeWidth, rng })
      if (boundary.subductionSide !== undefined) {
        const overriding = boundary.subductionSide === boundary.plateA
          ? plates[boundary.plateB]
          : plates[boundary.plateA]
        applyVolcanicArc(cells, seg, overriding.i, { offsetCell: 4, peakHeight: 35, rng })
      }
    } else if (boundary.type === 'divergent') {
      applyDivergentRift(cells, seg, { riftDepth })
    } else {
      applyTransformShear(cells, seg, rng)
    }
  }

  // 步骤 6:边缘遮罩
  for (let i = 0; i < n; i++) {
    const x = cells.p[i * 2] / width
    const y = cells.p[i * 2 + 1] / height
    const edgeMask = (1 - (2 * x - 1) ** 6) * (1 - (2 * y - 1) ** 6)
    cells.h[i] = Math.max(0, Math.min(100, Math.round(cells.h[i] * edgeMask)))
  }

  // 步骤 7:一次平滑（无 threshold,杜绝 rim）
  smooth(cells, 1)
}

// ── 步骤 1:分层网格取大陆种子 ──────────────────────

interface Seed {
  x: number
  y: number
}

function pickContinentSeeds(
  _cells: GridCells,
  width: number,
  height: number,
  continentCount: number,
  rng: () => number,
): Seed[] {
  const N = Math.max(1, continentCount)
  // 分层网格:cols × rows ≈ N,根据画布宽高比调整 cols
  // 例如 1200x800 + N=4 → cols=2,rows=2 → 2x2 网格
  // 1200x800 + N=6 → cols=3,rows=2 → 3x2 网格
  // 这么取种子能保证均匀铺开(避免 Poisson 在边界扎堆)
  const cols = Math.max(1, Math.round(Math.sqrt((N * width) / height)))
  const rows = Math.max(1, Math.ceil(N / cols))
  const total = cols * rows
  const skip = total - N  // 多余的格子跳过(从末尾开始)

  const cellW = width / cols
  const cellH = height / rows
  const seeds: Seed[] = []
  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, i++) {
      if (i >= total - skip) continue
      // 格子中心 + ±25% jitter(避免完全规则排列看起来像棋盘)
      const jx = (rng() - 0.5) * cellW * 0.5
      const jy = (rng() - 0.5) * cellH * 0.5
      seeds.push({ x: (c + 0.5) * cellW + jx, y: (r + 0.5) * cellH + jy })
    }
  }
  return seeds
}

// ── 步骤 2+3:Voronoi 归属 + 基础值 + FBM 扰动 ──────────────────────

/**
 * 对每个 cell:找到最近种子(Voronoi 归属),并按到该种子的距离 + FBM 写入 cells.h。
 * 返回 cellSeed: 每个 cell 所属的种子索引。
 */
function assignVoronoiAndHeights(
  cells: GridCells,
  width: number,
  height: number,
  seeds: Seed[],
): Int32Array {
  const N = Math.max(1, seeds.length)
  // 控制半径:每个 Voronoi 区域"陆地核心区"的半径。
  // 取 sqrt(W*H/N) 约一半,保证多块 Voronoi 区域在边缘有重叠
  // (FBM 噪声主要在重叠区发挥作用,让大陆形状不规则)
  const maxRadius = Math.sqrt((width * height) / N) * 0.5
  const invMaxRadius = 1 / maxRadius

  const cellSeed = new Int32Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]

    // 找最近种子
    let minD2 = Infinity
    let minS = 0
    for (let s = 0; s < seeds.length; s++) {
      const dx = x - seeds[s].x
      const dy = y - seeds[s].y
      const d2 = dx * dx + dy * dy
      if (d2 < minD2) { minD2 = d2; minS = s }
    }
    cellSeed[i] = minS
    const d = Math.sqrt(minD2) * invMaxRadius  // 归一化距离 0~?

    // 基础值:0(远处) → 1(种子处), 平方衰减(平顶)
    const base = Math.max(0, 1 - d * d)

    // FBM 扰动
    const lowNoise = fbm2D(x * FBM_LOW_SCALE, y * FBM_LOW_SCALE, 3) * NOISE_LOW_AMP
    const highNoise = fbm2D(x * FBM_HIGH_SCALE, y * FBM_HIGH_SCALE, 2) * NOISE_HIGH_AMP

    // 合并 value ∈ [-0.32, 1.32] (基底 0~1, 噪声 ±0.32)
    const value = base + lowNoise + highNoise

    // 归一到 0-100(不直接做陆/海切分,留给步骤 4 per-Voronoi 阈值)
    cells.h[i] = Math.max(0, Math.min(100, Math.round(value * 70 + 30)))
  }
  return cellSeed
}

// ── 步骤 4:per-Voronoi-cell 阈值切分 ──────────────────────

/**
 * 对每个 Voronoi 区域,独立做"高值=陆,低值=海"的切分。
 * 每个区域的陆地比例统一按 landRatio,从而全局 landRatio ≈ landRatio。
 * 关键:N 个 Voronoi 区域的阈值是独立的,FBM 噪声再大也不会把两个区域焊起来。
 */
function thresholdPerVoronoiCell(
  cells: GridCells,
  cellSeed: Int32Array,
  landRatio: number,
): void {
  // 按种子分组
  const seedBuckets: number[][] = []
  for (let i = 0; i < cells.length; i++) {
    const s = cellSeed[i]
    while (seedBuckets.length <= s) seedBuckets.push([])
    seedBuckets[s].push(i)
  }

  for (const bucket of seedBuckets) {
    if (bucket.length === 0) continue

    // 收集该 Voronoi 区域的 h 值,排序,取分位
    const values: number[] = []
    for (const i of bucket) values.push(cells.h[i])
    values.sort((a, b) => a - b)

    // 让 landRatio 比例的 cell 升为陆
    const targetLand = Math.max(1, Math.floor(bucket.length * landRatio))
    const idx = Math.max(0, bucket.length - targetLand)
    const threshold = values[idx]

    // 应用:land 30-100(按 value 归一), sea 0-15
    const maxAbove = Math.max(1, 100 - threshold)
    for (const i of bucket) {
      const v = cells.h[i]
      if (v >= threshold) {
        const t = (v - threshold) / maxAbove
        cells.h[i] = Math.round(30 + t * 70)
      } else if (v > 0) {
        const t = v / threshold
        cells.h[i] = Math.round(5 + t * 10)
      } else {
        cells.h[i] = 0
      }
    }
  }
}

// ── 工具 ────────────────────────────────────────────

/** 简单确定性 hash */
function hash2D(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** 分形布朗运动 */
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

/** 把 boundary.cellIds 按 plateId 拆成 cellsA / cellsB(供 apply* 函数) */
function splitCellsByPlate(
  cellIds: number[],
  plateId: Int16Array,
  plateA: number,
): number[] {
  const out: number[] = []
  for (const id of cellIds) {
    if (plateId[id] === plateA) out.push(id)
  }
  return out
}

/** 计算 boundary 的法线(质心差) */
function computeBoundaryNormal(
  cells: GridCells,
  boundary: PlateBoundary,
  seg: { cellsA: number[]; cellsB: number[]; normalX: number; normalY: number },
): void {
  let avgAx = 0, avgAy = 0, avgBx = 0, avgBy = 0
  for (const c of seg.cellsA) { avgAx += cells.p[c * 2]; avgAy += cells.p[c * 2 + 1] }
  for (const c of seg.cellsB) { avgBx += cells.p[c * 2]; avgBy += cells.p[c * 2 + 1] }
  const nA = Math.max(1, seg.cellsA.length)
  const nB = Math.max(1, seg.cellsB.length)
  avgAx /= nA; avgAy /= nA
  avgBx /= nB; avgBy /= nB
  let nx = avgBx - avgAx
  let ny = avgBy - avgAy
  const len = Math.sqrt(nx * nx + ny * ny) || 1
  seg.normalX = nx / len
  seg.normalY = ny / len
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 平滑:Azgaar 公式,fr=3 保留峰值。threshold=0(已移除,杜绝 rim)。 */
function smooth(cells: GridCells, passes: number): void {
  const fr = 3
  for (let pass = 0; pass < passes; pass++) {
    const newH = new Uint8Array(cells.length)
    for (let i = 0; i < cells.length; i++) {
      const neighbors = cells.c[i]
      if (neighbors.length === 0) { newH[i] = cells.h[i]; continue }
      let sum = cells.h[i]
      let count = 1
      for (const n of neighbors) { sum += cells.h[n]; count++ }
      const mean = sum / count
      newH[i] = Math.max(0, Math.min(100, Math.round((cells.h[i] * (fr - 1) + mean) / fr)))
    }
    cells.h.set(newH)
  }
}
