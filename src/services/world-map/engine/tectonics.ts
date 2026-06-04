/**
 * 板块构造（azgaar 风格：板块是源头，不是 heightmap 派生物）
 *
 * 步骤：
 *  1. 选 N 个种子（保证至少 2 块大陆 + 海洋，纯空间分布，无 cells.h 依赖）
 *  2. Voronoi 划 plateId
 *  3. 建 Plate[]（type / direction / speed）
 *  4. 检测相邻 plateId 边界对 → segments
 *  5. 计算每个段法线 + 分类（convergent/divergent/transform）
 *  6. 洋-陆汇聚标记 subductionSide
 *
 * 本文件**不**写 cells.h —— heightmap 由 `heightmap.ts` 用本文件的 plates/boundaries 生成。
 */

import type {
  GridCells, Plate, PlateBoundary, MapConstraints,
} from './types'

interface BoundarySegment {
  plateA: number
  plateB: number
  cellsA: number[]
  cellsB: number[]
  normalX: number
  normalY: number
  /** 俯冲侧 plate.i（仅洋-陆碰撞 convergent 有） */
  subductionSide?: number
}

/**
 * 生成板块构造（纯结构，**不**修改 cells.h）
 */
export function generateTectonics(
  cells: GridCells,
  width: number,
  height: number,
  rng: () => number,
  plateCount = 6,
  plateSpeedFactor = 1,
  constraints?: MapConstraints,
): { plates: Plate[]; boundaries: PlateBoundary[]; plateId: Int16Array } {
  plateCount = Math.max(2, Math.min(12, plateCount))

  // 步骤 1：选种子（纯空间分布，确保至少 2 块大陆）
  const seeds = pickPlateSeeds(cells, width, height, plateCount, rng)

  // 步骤 2：Voronoi 划 plateId
  const plateId = new Int16Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    let bestP = 0
    let bestDist = Infinity
    for (let p = 0; p < seeds.length; p++) {
      const dx = cells.p[i * 2] - cells.p[seeds[p] * 2]
      const dy = cells.p[i * 2 + 1] - cells.p[seeds[p] * 2 + 1]
      const d = dx * dx + dy * dy
      if (d < bestDist) { bestDist = d; bestP = p }
    }
    plateId[i] = bestP
  }

  // 步骤 3：建 Plate[]（type / direction / speed）
  const plates: Plate[] = []
  const cellCounts = new Uint32Array(seeds.length)
  for (let i = 0; i < cells.length; i++) cellCounts[plateId[i]]++

  for (let p = 0; p < seeds.length; p++) {
    plates.push({
      i: p,
      center: seeds[p],
      direction: rng() * Math.PI * 2,
      speed: (0.3 + rng() * 0.7) * plateSpeedFactor,
      oceanic: plateIsOceanic(p, seeds.length, rng),
      cells: cellCounts[p],
    })
  }

  // 步骤 4-6：检测 + 分类边界
  const rawBoundaries = detectBoundaries(cells, plateId, plates)
  const boundaries: PlateBoundary[] = []
  for (const seg of rawBoundaries) {
    const pa = plates[seg.plateA]
    const pb = plates[seg.plateB]
    const relX = Math.cos(pa.direction) * pa.speed - Math.cos(pb.direction) * pb.speed
    const relY = Math.sin(pa.direction) * pa.speed - Math.sin(pb.direction) * pb.speed
    const dot = relX * seg.normalX + relY * seg.normalY

    let type: PlateBoundary['type']
    if (dot > 0.3) type = 'convergent'
    else if (dot < -0.3) type = 'divergent'
    else type = 'transform'

    if (type === 'convergent' && pa.oceanic && !pb.oceanic) seg.subductionSide = pa.i
    else if (type === 'convergent' && pb.oceanic && !pa.oceanic) seg.subductionSide = pb.i

    const cellIds = [...new Set([...seg.cellsA, ...seg.cellsB])]
    boundaries.push({
      type,
      plateA: seg.plateA,
      plateB: seg.plateB,
      cellIds,
      subductionSide: seg.subductionSide,
    })
  }

  // 应用世界书 volcano 约束：仅 metadata 标记，渲染时读取
  if (constraints?.mountains) {
    if (!cells.volcano) cells.volcano = new Uint8Array(cells.length)
    for (const m of constraints.mountains) {
      if (m.type !== 'volcano') continue
      for (const cellId of m.cells) {
        if (cellId >= 0 && cellId < cells.length) {
          cells.volcano[cellId] = 1 // VOLCANO_STRATO
        }
      }
    }
  }

  return { plates, boundaries, plateId }
}

// ── 步骤 1：选种子（纯空间分布） ─────────────────────────

/**
 * 选 N 个空间上分散的种子。**不**读 cells.h。
 * 海洋/大陆类型在 `plateIsOceanic` 中按比例随机分配。
 */
function pickPlateSeeds(
  cells: GridCells,
  width: number,
  height: number,
  plateCount: number,
  rng: () => number,
): number[] {
  // 最小间距 = 画布对角线 / sqrt(plateCount) / 2
  const minDist = Math.hypot(width, height) / Math.sqrt(plateCount) / 2
  const minDistSq = minDist * minDist
  const seeds: number[] = []
  const indices = new Uint32Array(cells.length)
  for (let i = 0; i < cells.length; i++) indices[i] = i
  // 洗牌后按洗牌顺序取，命中最小距离的保留
  shuffleIndices(indices, rng)

  for (let i = 0; i < indices.length && seeds.length < plateCount; i++) {
    const candidate = indices[i]
    const cx = cells.p[candidate * 2]
    const cy = cells.p[candidate * 2 + 1]
    let tooClose = false
    for (const s of seeds) {
      const dx = cells.p[s * 2] - cx
      const dy = cells.p[s * 2 + 1] - cy
      if (dx * dx + dy * dy < minDistSq) { tooClose = true; break }
    }
    if (!tooClose) seeds.push(candidate)
  }

  // 不够时放宽距离限制（只在前一轮没凑齐 plateCount 的极端稀疏场景发生）
  if (seeds.length < plateCount) {
    for (let i = 0; i < indices.length && seeds.length < plateCount; i++) {
      const candidate = indices[i]
      if (!seeds.includes(candidate)) seeds.push(candidate)
    }
  }

  return seeds
}

/**
 * 决定第 p 个板块是洋还是陆。
 * 概率 ~ 1/3 海洋 + 2/3 大陆；保证至少 2 块大陆（≥ 1 块海洋也有概率）。
 */
function plateIsOceanic(p: number, total: number, rng: () => number): boolean {
  if (total <= 2) return p === total - 1 // 2 板块：1 大陆 1 海洋
  if (total <= 4) return p >= total - 1
  // 5+ 板块：1/3 海洋概率
  return rng() < 0.33
}

// ── 步骤 4：边界检测 ──────────────────────────────────

function detectBoundaries(
  cells: GridCells,
  plateId: Int16Array,
  plates: Plate[],
): BoundarySegment[] {
  const segMap = new Map<string, {
    plateA: number; plateB: number
    cellsA: Set<number>; cellsB: Set<number>
  }>()

  for (let i = 0; i < cells.length; i++) {
    const pidA = plateId[i]
    for (const nb of cells.c[i]) {
      const pidB = plateId[nb]
      if (pidA === pidB) continue
      const lo = Math.min(pidA, pidB)
      const hi = Math.max(pidA, pidB)
      const key = `${lo}_${hi}`
      if (!segMap.has(key)) {
        segMap.set(key, { plateA: lo, plateB: hi, cellsA: new Set(), cellsB: new Set() })
      }
      const seg = segMap.get(key)!
      if (pidA === lo) {
        seg.cellsA.add(i)
        seg.cellsB.add(nb)
      } else {
        seg.cellsB.add(i)
        seg.cellsA.add(nb)
      }
    }
  }

  const result: BoundarySegment[] = []
  for (const [, seg] of segMap) {
    const arrA = [...seg.cellsA]
    const arrB = [...seg.cellsB]
    let avgAx = 0, avgAy = 0, avgBx = 0, avgBy = 0
    for (const c of arrA) { avgAx += cells.p[c * 2]; avgAy += cells.p[c * 2 + 1] }
    for (const c of arrB) { avgBx += cells.p[c * 2]; avgBy += cells.p[c * 2 + 1] }
    avgAx /= arrA.length; avgAy /= arrA.length
    avgBx /= arrB.length; avgBy /= arrB.length
    let nx = avgBx - avgAx
    let ny = avgBy - avgAy
    const len = Math.sqrt(nx * nx + ny * ny) || 1
    nx /= len
    ny /= len
    result.push({
      plateA: seg.plateA,
      plateB: seg.plateB,
      cellsA: arrA,
      cellsB: arrB,
      normalX: nx,
      normalY: ny,
    })
  }

  return result
}

// ── 工具 ────────────────────────────────────────────

function shuffleIndices(arr: Uint32Array, rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
}
