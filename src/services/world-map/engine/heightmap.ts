/**
 * 高度图生成（azgaar 风格：板块驱动）
 *
 * 算法（在 `generateTectonics` 之后调用）：
 *  1. 板块 base 高度：洋 5-15，陆 25-50
 *  2. FBM 噪声叠加（4 octaves, scale 0.015, amplitude 5）打破板块几何
 *  3. 边界效果：
 *     - 汇聚 → 沿 spine 拉山脊（applyConvergentRange）
 *     - 离散 → 沿 spine 挖裂谷（applyDivergentRift）
 *     - 转换 → 小起伏（applyTransformShear）
 *     - 俯冲带 → 内陆侧火山弧（applyVolcanicArc）
 *  4. 边缘遮罩
 *  5. 调整海陆比（gap-aware threshold）
 *  6. 平滑
 */

import type { GridCells, Plate, PlateBoundary, MapRealism } from './types'
import {
  applyConvergentRange,
  applyDivergentRift,
  applyTransformShear,
  applyVolcanicArc,
} from './boundary-terrain'
import { HEIGHTMAP_TEMPLATES, pickTemplate, applyTemplate } from './heightmap-templates'

function lim(v: number): number {
  return Math.max(0, Math.min(100, v))
}

const SEA_LEVEL = 20
const FBM_SCALE = 0.015
const FBM_AMP = 5

/**
 * 生成高度图（azgaar 风格：板块驱动）
 *
 * 假定 `generateTectonics` 已先调用，且 `cells.tectonic.plateId` 已被填充。
 */
export function generateHeightmap(
  cells: GridCells,
  width: number,
  height: number,
  rng: () => number,
  landRatio = 0.45,
  plates: Plate[] = [],
  boundaries: PlateBoundary[] = [],
  continentCount = Math.max(2, Math.round((plates.length || 6) * 0.5)),
  realism?: MapRealism,
): void {
  const n = cells.length
  const plateId = cells.tectonic?.plateId
  if (!plateId) {
    throw new Error('generateHeightmap: cells.tectonic.plateId not initialized. Call generateTectonics first.')
  }

  // 步骤 1：Azgaar 模板（faithful port）—— 从 0 起步，按 14 模板之一叠 hills / ranges / straits / mask。
  // 模板的设计前提是 cells.h 初始为 0（Azgaar 原版如此），plate 仅影响 boundary effects，不决定 base 高度。
  const templateName = pickTemplate(continentCount, landRatio, rng)
  const template = HEIGHTMAP_TEMPLATES[templateName]
  if (template) {
    applyTemplate(cells, width, height, template.template, rng)
  } else {
    // 没匹配到模板：fallback 到 30 等高（不读 plate，与 spec §4a 的 per-cell 简化路径不同）
    for (let i = 0; i < n; i++) cells.h[i] = 30
  }

  // 步骤 2：FBM 噪声叠加
  for (let i = 0; i < n; i++) {
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    cells.h[i] += Math.round(fbm2D(x * FBM_SCALE, y * FBM_SCALE, 4) * FBM_AMP)
  }

  // 步骤 3：边界效果
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

  // 步骤 4：边缘遮罩
  for (let i = 0; i < n; i++) {
    const x = cells.p[i * 2] / width
    const y = cells.p[i * 2 + 1] / height
    const edgeMask = (1 - (2 * x - 1) ** 6) * (1 - (2 * y - 1) ** 6)
    cells.h[i] = Math.max(0, Math.min(100, Math.round(cells.h[i] * edgeMask)))
  }

  // 步骤 5：调整海陆比
  adjustSeaLevel(cells, landRatio)

  // 步骤 6：平滑
  smooth(cells, 2, 2)
  smooth(cells, 1, 1)
}

// ── 工具 ────────────────────────────────────────────

/** 简单确定性 hash（per-call 时用 cell 坐标） */
function hash2D(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** 分形布朗运动：多层 hash 噪声叠加 */
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

/** 把 boundary.cellIds 按 plateId 拆成 cellsA / cellsB（按 apply* 期望的格式） */
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

/** 计算 boundary 的法线（与旧 tectonics.ts::detectBoundaries 同款：质心差） */
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

/** 调整海平面以达到目标海陆比例（gap-aware） */
function adjustSeaLevel(cells: GridCells, targetLandRatio: number): void {
  const landH: number[] = []
  let zeroCount = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] > 0) landH.push(cells.h[i])
    else zeroCount++
  }
  if (landH.length === 0) return

  landH.sort((a, b) => a - b)
  const targetLand = Math.floor(cells.length * targetLandRatio)
  const needFromLand = Math.max(0, Math.min(landH.length, targetLand))
  const waterInLand = landH.length - needFromLand
  const idx = Math.max(0, Math.min(waterInLand, landH.length - 1))
  const seaLevel = landH[idx]

  const shift = SEA_LEVEL - seaLevel
  for (let i = 0; i < cells.length; i++) {
    cells.h[i] = Math.max(0, Math.min(100, cells.h[i] + shift))
  }
}

/** 平滑处理：Azgaar `lim((h * (fr-1) + mean + add) / fr)` 公式，fr=3，保留峰值。
 *  threshold：newH 低于此值的格子视为海洋（h=0），避免向海渗色。 */
function smooth(cells: GridCells, passes: number, threshold: number = 0): void {
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
      const newV = lim(Math.round((cells.h[i] * (fr - 1) + mean) / fr))
      newH[i] = threshold > 0 && newV < threshold ? 0 : newV
    }
    cells.h.set(newH)
  }
}
