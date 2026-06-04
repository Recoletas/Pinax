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
  continentCount = Math.max(2, Math.round(plateCount * 0.5)),
  constraints?: MapConstraints,
): { plates: Plate[]; boundaries: PlateBoundary[]; plateId: Int16Array } {
  plateCount = Math.max(2, Math.min(12, plateCount))
  continentCount = Math.max(1, Math.min(continentCount, plateCount))

  // 步骤 1：选种子（先放大陆种子，再补海洋种子）
  const seeds = pickPlateSeeds(cells, width, height, plateCount, continentCount, rng)

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
      oceanic: p >= continentCount,
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
 * 选 N 个空间上分散的种子。先放大陆种子，再补海洋种子。
 */
function pickPlateSeeds(
  cells: GridCells,
  width: number,
  height: number,
  plateCount: number,
  continentCount: number,
  rng: () => number,
): number[] {
  const seeds: number[] = []
  const used = new Uint8Array(cells.length)

  for (let i = 0; i < continentCount; i++) {
    const seed = selectSeed(cells, width, height, seeds, used, rng, 'interior')
    if (seed === -1) break
    seeds.push(seed)
    used[seed] = 1
  }

  while (seeds.length < plateCount) {
    const seed = selectSeed(cells, width, height, seeds, used, rng, 'edge')
    if (seed === -1) break
    seeds.push(seed)
    used[seed] = 1
  }

  if (seeds.length < plateCount) {
    for (let i = 0; i < cells.length && seeds.length < plateCount; i++) {
      if (used[i]) continue
      seeds.push(i)
      used[i] = 1
    }
  }

  return seeds
}

function selectSeed(
  cells: GridCells,
  width: number,
  height: number,
  seeds: number[],
  used: Uint8Array,
  rng: () => number,
  mode: 'interior' | 'edge',
): number {
  const diagSq = width * width + height * height
  let best = -1
  let bestScore = -Infinity

  for (let i = 0; i < cells.length; i++) {
    if (used[i]) continue
    const x = cells.p[i * 2] / width
    const y = cells.p[i * 2 + 1] / height
    const interior = (1 - Math.abs(x * 2 - 1)) * (1 - Math.abs(y * 2 - 1))
    const edge = 1 - interior
    let nearest = diagSq
    for (const seed of seeds) {
      const dx = cells.p[seed * 2] - cells.p[i * 2]
      const dy = cells.p[seed * 2 + 1] - cells.p[i * 2 + 1]
      const distSq = dx * dx + dy * dy
      if (distSq < nearest) nearest = distSq
    }
    const bias = mode === 'interior'
      ? interior * diagSq * 0.22
      : edge * diagSq * 0.18
    const score = nearest + bias + rng() * diagSq * 0.002
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }

  return best
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
