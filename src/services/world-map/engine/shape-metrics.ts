/**
 * 形状指标 — 纯几何 / 结构性度量,作用于 GridCells.heightmap。
 * 与 realism-metrics.ts(评估/报告层)职责分离:本文件只做无 RNG 的纯计算。
 * 输出被 enforceTemplateContract(第二轮)、heightmap-template-semantics 测试
 * 以及 4 代表模板硬断言测试消费。给定相同 cells.h / cells.p 结果完全一致。
 */
import type { GridCells } from './types'

// heightmap.ts 中 SEA_LEVEL = 20 是 private const;此处用字面量避免新增跨文件导出。
const SEA_LEVEL = 20
const DEFAULT_MIN_SIZE = 100

export interface LandmassInfo {
  cellIds: number[]
  size: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number; area: number }
  centroid: { x: number; y: number }
  /** 主轴(协方差矩阵主特征向量,dx/dy 已归一化) */
  mainAxis: { dx: number; dy: number; length: number }
}

export interface LandmassMetrics {
  /** size >= minSize 的连通陆块数 */
  componentCount: number
  /** 各主要陆块大小,降序 */
  sizes: number[]
  largestRatio: number
  secondRatio: number
  /** largest.size / bbox 内总 cell 数 ∈ [0, 1]。越大越 compact（bbox 内几乎全陆） */
  bboxFillRatio: number
  /** largest bbox 短长比 = max/max-min / min */
  bboxAspectRatio: number
  /** 唯一边界 cell 数 / sqrt(largest.size) */
  coastRoughness: number
  /** 最大陆块边界中靠近 bbox 四边的比例。越大越像矩形裁块。 */
  edgeLinearity: number
  /** 归一化 y<0.15 或 y>0.85 的陆地 cell / 全部陆地 */
  polarLandRatio: number
}

const isLand = (cells: GridCells, i: number): boolean => cells.h[i] >= SEA_LEVEL

function bboxAndCentroid(cells: GridCells, ids: number[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let sumX = 0, sumY = 0
  for (const id of ids) {
    const x = cells.p[id * 2], y = cells.p[id * 2 + 1]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    sumX += x; sumY += y
  }
  const size = ids.length
  return {
    bbox: { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) },
    centroid: { x: sumX / size, y: sumY / size },
  }
}

/** 主轴 = 2x2 协方差矩阵的主特征向量(dx/dy 归一化);length = sqrt(主特征值)。 */
function mainAxis(cells: GridCells, ids: number[], cx: number, cy: number) {
  let vx = 0, vy = 0, cxy = 0
  for (const id of ids) {
    const dx = cells.p[id * 2] - cx, dy = cells.p[id * 2 + 1] - cy
    vx += dx * dx; vy += dy * dy; cxy += dx * dy
  }
  // 2x2 对称矩阵特征值闭式解
  const disc = Math.sqrt(Math.max(0, (vx - vy) * (vx - vy) + 4 * cxy * cxy))
  const lambda = (vx + vy + disc) / 2
  let ex = lambda - vy, ey = cxy
  if (ex === 0 && ey === 0) { ex = 1; ey = 0 }
  const n = Math.hypot(ex, ey) || 1
  return { dx: ex / n, dy: ey / n, length: Math.sqrt(Math.max(0, lambda)) }
}

function findComponents(cells: GridCells): number[][] {
  const n = cells.length
  const owner = new Int32Array(n).fill(-1)
  const comps: number[][] = []
  for (let i = 0; i < n; i++) {
    if (!isLand(cells, i) || owner[i] !== -1) continue
    const m = comps.length
    const queue: number[] = [i]
    owner[i] = m
    for (let h = 0; h < queue.length; h++) {
      const nbs = cells.c[queue[h]]
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k]
        if (isLand(cells, nb) && owner[nb] === -1) { owner[nb] = m; queue.push(nb) }
      }
    }
    comps.push(queue)
  }
  return comps
}

function buildInfo(cells: GridCells, ids: number[]): LandmassInfo {
  const { bbox, centroid } = bboxAndCentroid(cells, ids)
  return { cellIds: ids, size: ids.length, bbox, centroid, mainAxis: mainAxis(cells, ids, centroid.x, centroid.y) }
}

/** 找最大陆块(>= minSize)。多个并列最大时取先 BFS 到的那块(确定性)。无符合条件返回 null。 */
export function getLargestLandmass(
  cells: GridCells,
  options?: { minSize?: number },
): LandmassInfo | null {
  const minSize = options?.minSize ?? DEFAULT_MIN_SIZE
  let best: number[] | null = null
  for (const c of findComponents(cells)) {
    if (c.length < minSize) continue
    if (!best || c.length > best.length) best = c
  }
  return best ? buildInfo(cells, best) : null
}

/**
 * 全套陆块形状指标。width/height 用于 polarLandRatio 的归一化;
 * 不传时跳过 polar 计算(返回 0)。
 */
export function getLandmassMetrics(
  cells: GridCells,
  options?: { minSize?: number; width?: number; height?: number },
): LandmassMetrics {
  const minSize = options?.minSize ?? DEFAULT_MIN_SIZE
  const width = options?.width, height = options?.height
  const all = findComponents(cells)
  const major = all.filter(c => c.length >= minSize).map(c => c.length).sort((a, b) => b - a)
  const totalLand = all.reduce((s, c) => s + c.length, 0)
  const largest = getLargestLandmass(cells, { minSize })
  const largestSize = major[0] ?? 0
  const secondSize = major[1] ?? 0

  // bboxFillRatio: largest 陆块 cell 数 / bbox 内总 cell 数（cells 数 / cells 数，单位一致）
  // 物理意义：bbox 内陆地填充密度 ∈ [0, 1]。1 = bbox 全部是陆地（最 compact），
  //          0 = largest 散在 bbox 边缘，bbox 内多数 cell 是水。Round 1.5 修正
  //          旧版的 `largest.size / boxArea`（cells / pixel²）单位不一致问题。
  let bboxFillRatio = 0, bboxAspectRatio = 1
  if (largest) {
    const minX = largest.bbox.minX, maxX = largest.bbox.maxX
    const minY = largest.bbox.minY, maxY = largest.bbox.maxY
    const w = maxX - minX, h = maxY - minY
    const minDim = Math.min(w, h), maxDim = Math.max(w, h)
    bboxAspectRatio = minDim > 0 ? maxDim / minDim : 1

    let cellsInBbox = 0
    for (let i = 0; i < cells.length; i++) {
      const x = cells.p[i * 2], y = cells.p[i * 2 + 1]
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) cellsInBbox++
    }
    bboxFillRatio = cellsInBbox > 0 ? largest.size / cellsInBbox : 0
  }

  // coastRoughness:陆-水边界 cell 数(去重) / sqrt(largest.size)
  let coastRoughness = 0, edgeLinearity = 0
  if (largest && largestSize > 0) {
    const set = new Set<number>()
    for (const id of largest.cellIds) {
      const nbs = cells.c[id]
      for (let k = 0; k < nbs.length; k++) {
        if (cells.h[nbs[k]] < SEA_LEVEL) { set.add(id); break }
      }
    }
    coastRoughness = set.size / Math.sqrt(largestSize)

    const w = Math.max(1, largest.bbox.maxX - largest.bbox.minX)
    const h = Math.max(1, largest.bbox.maxY - largest.bbox.minY)
    const edgeBand = Math.max(24, Math.min(w, h) * 0.12)
    let nearBoxEdge = 0
    for (const id of set) {
      const x = cells.p[id * 2]
      const y = cells.p[id * 2 + 1]
      const edgeDist = Math.min(
        x - largest.bbox.minX,
        largest.bbox.maxX - x,
        y - largest.bbox.minY,
        largest.bbox.maxY - y,
      )
      if (edgeDist <= edgeBand) nearBoxEdge++
    }
    edgeLinearity = set.size > 0 ? nearBoxEdge / set.size : 0
  }

  // polarLandRatio:y 归一化后 y<0.15 或 y>0.85 的陆地 cell / 全部陆地
  let polarLandRatio = 0
  if (totalLand > 0 && width && height) {
    const yLow = height * 0.15, yHigh = height * 0.85
    let polar = 0
    for (const c of all) for (const id of c) {
      const y = cells.p[id * 2 + 1]
      if (y < yLow || y > yHigh) polar++
    }
    polarLandRatio = polar / totalLand
  }

  return {
    componentCount: major.length,
    sizes: major,
    largestRatio: totalLand > 0 ? largestSize / totalLand : 0,
    secondRatio: totalLand > 0 ? secondSize / totalLand : 0,
    bboxFillRatio, bboxAspectRatio, coastRoughness, edgeLinearity, polarLandRatio,
  }
}
