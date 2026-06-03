/**
 * 板块构造模拟（重写版）
 *
 * 算法：先识别已有大陆区域 → 空间 Voronoi 分割 → 双侧边界检测 →
 *       局部法线分类 → 渐进式地形修改
 */

import type { GridCells, Plate, PlateBoundary, MapRealism, MapConstraints } from './types'
import { computeTectonicData } from './tectonic-data'
import {
  applyConvergentRange,
  applyDivergentRift,
  applyTransformShear,
  applyVolcanicArc,
} from './boundary-terrain'

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
 * 生成板块构造
 */
export function generateTectonics(
  cells: GridCells,
  width: number,
  height: number,
  rng: () => number,
  plateCount = 6,
  plateSpeedFactor = 1,
  realism: MapRealism = { level: 'classic' },
  constraints?: MapConstraints,
): { plates: Plate[]; boundaries: PlateBoundary[] } {
  plateCount = Math.max(2, Math.min(12, plateCount))

  // Step 1: 识别连通的大陆区域
  const landmasses = findLandmasses(cells)

  // Step 2: 选择板块种子
  const seeds = selectPlateSeeds(cells, landmasses, width, height, plateCount, rng)

  // Step 3: 空间 Voronoi 分割（欧氏距离）
  const plateId = new Int16Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    let bestP = 0
    let bestDist = Infinity
    for (let p = 0; p < seeds.length; p++) {
      const dx = cells.p[i * 2] - cells.p[seeds[p].seed * 2]
      const dy = cells.p[i * 2 + 1] - cells.p[seeds[p].seed * 2 + 1]
      const d = dx * dx + dy * dy
      if (d < bestDist) { bestDist = d; bestP = p }
    }
    plateId[i] = bestP
  }

  // Step 4: 构建板块数据
  const plates: Plate[] = []
  const cellCounts = new Uint32Array(seeds.length)
  for (let i = 0; i < cells.length; i++) cellCounts[plateId[i]]++

  for (let p = 0; p < seeds.length; p++) {
    plates.push({
      i: p,
      center: seeds[p].seed,
      direction: rng() * Math.PI * 2,
      speed: (0.3 + rng() * 0.7) * plateSpeedFactor,
      oceanic: !seeds[p].isLand && cellCounts[p] > 0,
      cells: cellCounts[p],
    })
  }

  // Step 5: 双侧边界检测 + 局部法线
  const rawBoundaries = detectBoundaries(cells, plateId, plates)

  // Step 6a: 分类 + 识别俯冲侧 + 收集 boundaries（先于 tectonic data 与地形修改）
  const boundaries: PlateBoundary[] = []
  const classified: Array<{ seg: BoundarySegment; type: PlateBoundary['type']; pa: Plate; pb: Plate }> = []

  for (const seg of rawBoundaries) {
    const pa = plates[seg.plateA]
    const pb = plates[seg.plateB]

    // 相对运动
    const relX = Math.cos(pa.direction) * pa.speed - Math.cos(pb.direction) * pb.speed
    const relY = Math.sin(pa.direction) * pa.speed - Math.sin(pb.direction) * pb.speed

    // 在局部法线上的投影
    const dot = relX * seg.normalX + relY * seg.normalY

    let type: PlateBoundary['type']
    if (dot > 0.3) type = 'convergent'
    else if (dot < -0.3) type = 'divergent'
    else type = 'transform'

    // 识别俯冲：洋-陆碰撞时，洋壳是俯冲侧
    if (type === 'convergent' && pa.oceanic && !pb.oceanic) seg.subductionSide = pa.i
    else if (type === 'convergent' && pb.oceanic && !pa.oceanic) seg.subductionSide = pb.i

    // 合并双侧单元格为 cellIds
    const cellIds = [...new Set([...seg.cellsA, ...seg.cellsB])]
    boundaries.push({
      type,
      plateA: seg.plateA,
      plateB: seg.plateB,
      cellIds,
      subductionSide: seg.subductionSide,
    })

    classified.push({ seg, type, pa, pb })
  }

  // Step 7: 填 cells.tectonic（6 个并行数组，applyVolcanicArc 需要 plateId）
  cells.tectonic = computeTectonicData(cells, plateId, boundaries)

  // Step 8: 渐进式地形修改（dispatch by realism level）
  for (const { seg, type, pa, pb } of classified) {
    applyBoundaryTerrain(cells, seg, type, pa, pb, rng, realism)
  }

  // Step 7: 填 cells.tectonic（6 个并行数组，现实化数据基础）
  cells.tectonic = computeTectonicData(cells, plateId, boundaries)

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

  return { plates, boundaries }
}

// ── Step 1: 识别连通大陆区域 ────────────────────────

function findLandmasses(cells: GridCells): number[][] {
  const visited = new Uint8Array(cells.length)
  const regions: number[][] = []

  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < 20 || visited[i]) continue
    const region: number[] = []
    const queue = [i]
    visited[i] = 1

    let head = 0
    while (head < queue.length) {
      const cell = queue[head++]
      region.push(cell)
      for (const nb of cells.c[cell]) {
        if (!visited[nb] && cells.h[nb] >= 20) {
          visited[nb] = 1
          queue.push(nb)
        }
      }
    }

    if (region.length > 30) regions.push(region)
  }

  return regions
}

// ── Step 2: 板块种子选择 ────────────────────────────

function selectPlateSeeds(
  cells: GridCells,
  landmasses: number[][],
  width: number,
  height: number,
  plateCount: number,
  rng: () => number,
): { seed: number; isLand: boolean }[] {
  const seeds: { seed: number; isLand: boolean }[] = []

  // 每个大陆区域的中心作为一个板块种子
  for (const region of landmasses) {
    let cx = 0, cy = 0
    for (const c of region) {
      cx += cells.p[c * 2]
      cy += cells.p[c * 2 + 1]
    }
    cx /= region.length
    cy /= region.length
    seeds.push({ seed: findNearestCell(cells, cx, cy), isLand: true })
  }

  // 海洋板块补充到 plateCount
  const seaPool: number[] = []
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < 20) seaPool.push(i)
  }
  shuffle(seaPool, rng)

  let seaIdx = 0
  while (seeds.length < plateCount && seaIdx < seaPool.length) {
    // 确保海洋种子不要太靠近已有种子
    const candidate = seaPool[seaIdx++]
    const cx = cells.p[candidate * 2]
    const cy = cells.p[candidate * 2 + 1]
    let tooClose = false
    for (const s of seeds) {
      const dx = cells.p[s.seed * 2] - cx
      const dy = cells.p[s.seed * 2 + 1] - cy
      if (dx * dx + dy * dy < (width * 0.15) ** 2) {
        tooClose = true
        break
      }
    }
    if (!tooClose) {
      seeds.push({ seed: candidate, isLand: false })
    }
  }

  // 如果还不够，放宽距离限制
  while (seeds.length < plateCount && seaPool.length > 0) {
    const idx = Math.floor(rng() * seaPool.length)
    seeds.push({ seed: seaPool[idx], isLand: false })
    seaPool.splice(idx, 1)
  }

  return seeds
}

// ── Step 5: 双侧边界检测 ────────────────────────────

function detectBoundaries(
  cells: GridCells,
  plateId: Int16Array,
  plates: Plate[],
): BoundarySegment[] {
  // 收集每对板块之间的双侧边界单元格
  const segMap = new Map<string, { plateA: number; plateB: number; cellsA: Set<number>; cellsB: Set<number> }>()

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

  // 计算每个边界段的局部法线
  const result: BoundarySegment[] = []

  for (const [, seg] of segMap) {
    const arrA = [...seg.cellsA]
    const arrB = [...seg.cellsB]

    // 质心
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

// ── Step 6/8: 渐进式地形修改（dispatch by realism level） ─────────────

/**
 * 经典模式地形修改：保留原有 byte-for-byte 行为
 *（测试套件 217 个测试期望此实现的输出）
 */
function applyBoundaryTerrainClassic(
  cells: GridCells,
  seg: BoundarySegment,
  type: PlateBoundary['type'],
  pa: Plate,
  pb: Plate,
  rng: () => number,
): void {
  const { cellsA, cellsB } = seg
  const allCells = cellsA.concat(cellsB)
  const setA = new Set(cellsA)

  // 质心距离（O(1) 每单元格）
  let bcx = 0, bcy = 0
  for (const c of allCells) { bcx += cells.p[c * 2]; bcy += cells.p[c * 2 + 1] }
  bcx /= allCells.length
  bcy /= allCells.length

  // 上盘判断：mixed 碰撞时大陆侧是上盘
  const overrideIsA = pa.oceanic === pb.oceanic ? true : !pa.oceanic

  if (type === 'convergent') {
    const bothContinental = !pa.oceanic && !pb.oceanic
    const mixed = pa.oceanic !== pb.oceanic

    for (const cell of allCells) {
      const dx = cells.p[cell * 2] - bcx
      const dy = cells.p[cell * 2 + 1] - bcy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const effect = Math.max(0, 1 - dist / 60)

      // 侧判断：用法线区分 A/B 侧
      const cellIsA = setA.has(cell)
      const isUpstream = overrideIsA ? cellIsA : !cellIsA

      if (bothContinental) {
        const sideMul = isUpstream ? 1.2 : 0.8
        const boost = (18 + rng() * 22) * effect * sideMul
        if (boost > 1) {
          cells.h[cell] = Math.min(100, cells.h[cell] + Math.round(boost))
        }
      } else if (mixed) {
        if (cells.h[cell] >= 20) {
          const sideMul = isUpstream ? 1.3 : 0.7
          const boost = (10 + rng() * 15) * effect * sideMul
          if (boost > 1) {
            cells.h[cell] = Math.min(100, cells.h[cell] + Math.round(boost))
          }
          if (isUpstream && rng() < 0.25 && effect > 0.3) {
            cells.h[cell] = Math.min(100, cells.h[cell] + Math.round(15 + rng() * 20))
          }
        } else {
          const sideMul = isUpstream ? 0.6 : 1.4
          const drop = (6 + rng() * 10) * effect * sideMul
          if (drop > 1) {
            cells.h[cell] = Math.max(0, cells.h[cell] - Math.round(drop))
          }
        }
      }
    }
  } else if (type === 'divergent') {
    for (const cell of allCells) {
      const dx = cells.p[cell * 2] - bcx
      const dy = cells.p[cell * 2 + 1] - bcy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const effect = Math.max(0, 1 - dist / 50)

      if (cells.h[cell] >= 20) {
        const drop = (10 + rng() * 15) * effect
        if (drop > 1) {
          cells.h[cell] = Math.max(0, cells.h[cell] - Math.round(drop))
        }
      } else {
        const boost = (3 + rng() * 6) * effect
        if (boost > 0.5) {
          cells.h[cell] = Math.min(19, cells.h[cell] + Math.round(boost))
        }
      }
    }
  } else {
    // transform: 断层崖
    for (const cell of allCells) {
      const dx = cells.p[cell * 2] - bcx
      const dy = cells.p[cell * 2 + 1] - bcy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const effect = Math.max(0, 1 - dist / 40)

      if (cells.h[cell] >= 20) {
        const boost = (4 + rng() * 8) * effect
        if (boost > 0.5) {
          cells.h[cell] = Math.min(100, cells.h[cell] + Math.round(boost))
        }
      }
    }
  }
}

/**
 * Dispatcher：按 realism.level 选择地形修改实现
 * - 'classic' → 经典实现（保留 byte-for-byte 行为）
 * - 'azgaar' / 'geologic' → 4 个新 apply 函数（山带/裂谷/断层/火山弧）
 */
function applyBoundaryTerrain(
  cells: GridCells,
  seg: BoundarySegment,
  type: PlateBoundary['type'],
  pa: Plate,
  pb: Plate,
  rng: () => number,
  realism: MapRealism,
): void {
  if (realism.level === 'classic') {
    applyBoundaryTerrainClassic(cells, seg, type, pa, pb, rng)
    return
  }

  // 新现实化路径：4 个 apply 函数
  if (type === 'convergent') {
    applyConvergentRange(cells, seg, {
      peakHeight: 50 + Math.floor((realism.tectonics?.rangeWidth ?? 3) * 5),
      rangeWidth: realism.tectonics?.rangeWidth ?? 3,
      rng,
    })
    if (seg.subductionSide !== undefined) {
      const overriding = seg.subductionSide === pa.i ? pb : pa
      applyVolcanicArc(cells, seg, overriding.i, {
        offsetCell: 4,
        peakHeight: 35,
        rng,
      })
    }
  } else if (type === 'divergent') {
    applyDivergentRift(cells, seg, { riftDepth: realism.tectonics?.riftDepth ?? 25 })
  } else {
    applyTransformShear(cells, seg, rng)
  }
}

// ── 工具 ────────────────────────────────────────────

function findNearestCell(cells: GridCells, x: number, y: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < cells.length; i++) {
    const dx = cells.p[i * 2] - x
    const dy = cells.p[i * 2 + 1] - y
    const d = dx * dx + dy * dy
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
