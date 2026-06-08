/**
 * 世界地图"真实化"度量 — 共享纯函数模块
 *
 * 阶段 0（基线）：
 *   - 不写阈值,只记录"现状"
 *   - 阶段 1+ 的算法改动后,这些函数应输出**可证明的提升**
 *   - 严格无副作用,方便在测试和正式管线两边复用
 *
 * 约定:
 *   - 陆/海判定沿用 SEA_LEVEL = 20(与 generate.ts / coast.ts / nations.ts 一致)
 *   - 极地判定:y/height 归一化坐标 < 0.15(南)或 > 0.85(北)
 *   - 距离未归一化:用 cells.p 中的像素坐标;Gini 用"cell 数"作分母
 *   - 海岸线 Voronoi 边长近似:用相邻 cell 中心距离代替
 *     (签名只接 cells 不接 vertices;这是阶段 0 的简化,阶段 1 视需要再升级)
 */

import type { GridCells, Burg, State, VoronoiMapData, MapGenConfig } from './types'
import { generateMap } from './generate'

const SEA_LEVEL = 20
const POLAR_NORTH = 0.85
const POLAR_SOUTH = 0.15

// ── 公开返回类型 ─────────────────────────────────────

export interface CoastMetrics {
  coastLength: number
  landArea: number
  coastToLandRatio: number
  largestContinentRatio: number
  headlandBayCount: number
}

export interface BurgMetrics {
  portRate: number
  riverRate: number
  coastDistRate: number
  avgSpacing: number
  polarRate: number
}

export interface StateMetrics {
  connectivityRate: number
  exclaveCount: number
  gini: number
  capitalCentroidDist: number
}

// ── 内部 helper ──────────────────────────────────────

/** 两 cell 中心像素距离(用作 Voronoi 边长近似) */
function cellDistance(cells: GridCells, a: number, b: number): number {
  const dx = cells.p[a * 2] - cells.p[b * 2]
  const dy = cells.p[a * 2 + 1] - cells.p[b * 2 + 1]
  return Math.sqrt(dx * dx + dy * dy)
}

/** BFS 找所有连通陆块,返回每块 size 数组 */
function findLandmassSizes(cells: GridCells): number[] {
  const n = cells.length
  const seen = new Uint8Array(n)
  const sizes: number[] = []
  for (let start = 0; start < n; start++) {
    if (seen[start] || cells.h[start] < SEA_LEVEL) continue
    const queue: number[] = [start]
    seen[start] = 1
    let size = 0
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      size++
      for (const nb of cells.c[c]) {
        if (cells.h[nb] >= SEA_LEVEL && !seen[nb]) {
          seen[nb] = 1
          queue.push(nb)
        }
      }
    }
    sizes.push(size)
  }
  return sizes
}

/** Gini 系数(values 长度 > 0,sum > 0,返回值在 [0, 1])
 *  公式(1-indexed 排序后):G = (2 * Σ i·x_i) / (n·Σ x) - (n+1)/n
 *  边界:全等值 → 0,完全集中(1 个占全部)→ (n-1)/n
 */
function giniCoefficient(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  let sum = 0
  for (const v of sorted) sum += v
  if (sum === 0) return 0
  let weightedSum = 0
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i]
  }
  return (2 * weightedSum) / (n * sum) - (n + 1) / n
}

/** 在 cells.p 范围内估 height(归一化极地用) */
function deriveHeight(cells: GridCells): number {
  let maxY = 0
  for (let i = 0; i < cells.length; i++) {
    const y = cells.p[i * 2 + 1]
    if (y > maxY) maxY = y
  }
  return maxY + 1
}

// ── 公开 API ────────────────────────────────────────

/**
 * 海岸/大陆度量。
 *  - coastLength:沿海岸 land cell 的"水面向 Voronoi 边"累加(用 cell 距离近似)
 *  - landArea:陆地 cell 总数
 *  - coastToLandRatio:coastLength / landArea
 *  - largestContinentRatio:最大连通陆块 / 全部陆地
 *  - headlandBayCount:t === 1 的陆地 cell 连通块中 size >= 3 的数量
 *    (headland/bay 的凸包偏差近似,阶段 0 简化版)
 */
export function coastMetrics(cells: GridCells): CoastMetrics {
  const n = cells.length
  let landArea = 0
  let coastLength = 0

  // 1. landArea + coastLength
  for (let i = 0; i < n; i++) {
    if (cells.h[i] < SEA_LEVEL) continue
    landArea++
    if (Math.abs(cells.t[i]) <= 1) {
      // 沿海 cell:把每条水面向 Voronoi 边长度累加
      for (const nb of cells.c[i]) {
        if (cells.h[nb] < SEA_LEVEL) {
          coastLength += cellDistance(cells, i, nb)
        }
      }
    }
  }

  // 2. largestContinentRatio
  const landmassSizes = findLandmassSizes(cells)
  const maxContinent = landmassSizes.length > 0 ? Math.max(...landmassSizes) : 0
  const largestContinentRatio = landArea > 0 ? maxContinent / landArea : 0

  // 3. headlandBayCount:连通块 size >= 3
  const seen = new Uint8Array(n)
  let headlandBayCount = 0
  for (let start = 0; start < n; start++) {
    if (seen[start] || cells.h[start] < SEA_LEVEL || cells.t[start] !== 1) continue
    const queue: number[] = [start]
    seen[start] = 1
    let size = 0
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      size++
      for (const nb of cells.c[c]) {
        if (cells.h[nb] >= SEA_LEVEL && cells.t[nb] === 1 && !seen[nb]) {
          seen[nb] = 1
          queue.push(nb)
        }
      }
    }
    if (size >= 3) headlandBayCount++
  }

  return {
    coastLength,
    landArea,
    coastToLandRatio: landArea > 0 ? coastLength / landArea : 0,
    largestContinentRatio,
    headlandBayCount,
  }
}

/**
 * 城镇度量(过滤掉 burgs[0] 占位项)。
 *  - portRate:burgs.filter(b => b.port).length / n
 *  - riverRate:burgs.filter(b => cells.r[b.cell] > 0).length / n
 *  - coastDistRate:burgs.filter(b => |cells.t[b.cell]| <= 3).length / n
 *  - avgSpacing:两两距离平均(N > 200 时返回 0,避免 O(n²) 爆)
 *  - polarRate:y/height 在极地的比例
 */
export function burgMetrics(cells: GridCells, burgs: Burg[]): BurgMetrics {
  const valid = burgs.filter(b => b.i > 0)
  const n = valid.length
  if (n === 0) {
    return { portRate: 0, riverRate: 0, coastDistRate: 0, avgSpacing: 0, polarRate: 0 }
  }

  const height = deriveHeight(cells)
  let portCount = 0
  let riverCount = 0
  let coastCount = 0
  let polarCount = 0

  for (const b of valid) {
    if (b.port) portCount++
    if (cells.r[b.cell] > 0) riverCount++
    if (Math.abs(cells.t[b.cell]) <= 3) coastCount++
    const yRatio = cells.p[b.cell * 2 + 1] / height
    if (yRatio > POLAR_NORTH || yRatio < POLAR_SOUTH) polarCount++
  }

  // avgSpacing 仅在 N <= 200 时计算
  let avgSpacing = 0
  if (n > 1 && n <= 200) {
    let total = 0
    let count = 0
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const a = valid[i]
        const b = valid[j]
        total += cellDistance(cells, a.cell, b.cell)
        count++
      }
    }
    avgSpacing = count > 0 ? total / count : 0
  }

  return {
    portRate: portCount / n,
    riverRate: riverCount / n,
    coastDistRate: coastCount / n,
    avgSpacing,
    polarRate: polarCount / n,
  }
}

/**
 * 国家度量(过滤掉 states[0] 占位 + i === 0 的 state)。
 *  - connectivityRate:每 state BFS from capital / state.cells,取平均
 *  - exclaveCount:连通 BFS 达不到全部 state cells 的 state 数总和
 *  - gini:state 面积的 Gini 系数
 *  - capitalCentroidDist:|capital_pos - centroid| / (0.5 * sqrt(area/π)),平均
 *
 * 注意:states 为空或全是占位项时返回全 0,connectivityRate = 0
 *  ("无主之地"被 metrics 正确处理)
 */
export function stateMetrics(
  cells: GridCells,
  states: State[],
  burgs: Burg[],
): StateMetrics {
  const validStates = states.filter(s => s.i > 0)
  if (validStates.length === 0) {
    return { connectivityRate: 0, exclaveCount: 0, gini: 0, capitalCentroidDist: 0 }
  }

  // 预聚合:每个 state 的 cell 列表 + 面积
  const cellsByState = new Map<number, number[]>()
  for (let i = 0; i < cells.length; i++) {
    const sid = cells.state[i]
    if (sid === 0) continue
    let arr = cellsByState.get(sid)
    if (!arr) {
      arr = []
      cellsByState.set(sid, arr)
    }
    arr.push(i)
  }

  let totalConn = 0
  let exclaveCount = 0
  let totalCapDist = 0
  const sizes: number[] = []
  let counted = 0

  for (const state of validStates) {
    const stateCells = cellsByState.get(state.i) ?? []
    const totalCount = stateCells.length
    sizes.push(totalCount)

    const burg = burgs[state.capital]
    if (!burg || totalCount === 0) {
      counted++
      continue
    }

    // BFS from capital,仅在同 state cell 中
    const cellSet = new Set<number>(stateCells)
    const visited = new Uint8Array(cells.length)
    const queue: number[] = [burg.cell]
    visited[burg.cell] = 1
    let reachable = 0
    let sumX = 0
    let sumY = 0

    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      reachable++
      sumX += cells.p[c * 2]
      sumY += cells.p[c * 2 + 1]
      for (const nb of cells.c[c]) {
        if (!visited[nb] && cellSet.has(nb)) {
          visited[nb] = 1
          queue.push(nb)
        }
      }
    }

    totalConn += reachable / totalCount
    if (reachable < totalCount) exclaveCount++

    const cx = sumX / reachable
    const cy = sumY / reachable
    const capX = cells.p[burg.cell * 2]
    const capY = cells.p[burg.cell * 2 + 1]
    const dist = Math.sqrt((capX - cx) * (capX - cx) + (capY - cy) * (capY - cy))
    const radius = 0.5 * Math.sqrt(totalCount / Math.PI)
    totalCapDist += radius > 0 ? dist / radius : 0
    counted++
  }

  const denom = counted > 0 ? counted : validStates.length
  return {
    connectivityRate: totalConn / denom,
    exclaveCount,
    gini: giniCoefficient(sizes),
    capitalCentroidDist: totalCapDist / denom,
  }
}

// ── 测试辅助 ────────────────────────────────────────

/**
 * 给定 seeds 跑 generateMap,把 fn(data) 结果聚合返回。
 *  - perSeedConfig(seed, idx) → 额外 generateMap 配置(可选,用于 per-seed 调 cc 等)
 *
 * 阶段 0 用法:5 个 seed 跨 cc=1/3/5/8/12,统一 pointCount=1500
 */
export function seedBaseline<T>(
  seeds: string[],
  pointCount: number,
  fn: (data: VoronoiMapData) => T,
  perSeedConfig?: (seed: string, idx: number) => Partial<MapGenConfig>,
): Array<{ seed: string, config: MapGenConfig, metrics: T }> {
  return seeds.map((seed, idx) => {
    const extras = perSeedConfig ? perSeedConfig(seed, idx) : {}
    const config: MapGenConfig = { seed, pointCount, ...extras }
    const data = generateMap(config)
    return { seed, config, metrics: fn(data) }
  })
}
