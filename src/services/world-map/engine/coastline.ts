/**
 * 海岸线多边形提取
 *
 * 在 `generateHeightmap` + `perturbCoast` 之后调用。
 * 对每个主要陆块(>= MIN_LANDMASS_CELLS 个 cell),沿其 Voronoi 边界走一圈,
 * 输出闭合的 `Point[]` 多边形(坐标归一化到 [0, 1])。
 *
 * 算法(arc-stitching):
 *  1. BFS 找出所有 landmass(连通陆块)
 *  2. 对每个 land cell,沿其 Voronoi 顶点顺序收集 "boundary arc":
 *     连续 water-facing 边对应的顶点序列
 *  3. arc 间按端点匹配,贪心拼接成闭合环
 *  4. 过滤掉太小的陆块 / 短多边形
 */

import type { GridCells, GridVertices } from './types'

export type Point = [number, number]

const SEA_LEVEL = 20
const MIN_LANDMASS_CELLS = 30
const MIN_POLYGON_POINTS = 8

interface Arc {
  /** 起点 Voronoi vertex id(也是上一个 arc 的终点) */
  v0: number
  /** 终点 Voronoi vertex id(也是下一个 arc 的起点) */
  v1: number
  /** 顶点序列(包含 v0 和 v1) */
  verts: number[]
}

/**
 * 提取所有主要陆块的海岸线多边形(每块 1 个 Point[])。
 * 失败时(走不到闭合)返回空数组,不让下游崩。
 */
export function extractCoastlines(
  cells: GridCells,
  vertices: GridVertices,
  width: number,
  height: number,
): Point[][] {
  const n = cells.length
  if (n === 0) return []

  const isLand = (i: number): boolean => cells.h[i] >= SEA_LEVEL

  // 1. BFS 找连通陆块
  const landmassOfCell = new Int32Array(n).fill(-1)
  const landmassCells: number[][] = []
  for (let i = 0; i < n; i++) {
    if (!isLand(i) || landmassOfCell[i] !== -1) continue
    const m = landmassCells.length
    const queue = [i]
    landmassOfCell[i] = m
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      for (const nb of cells.c[c]) {
        if (isLand(nb) && landmassOfCell[nb] === -1) {
          landmassOfCell[nb] = m
          queue.push(nb)
        }
      }
    }
    landmassCells.push(queue)
  }

  // 2. 对每个陆块:collect arcs, then stitch
  const coastlines: Point[][] = []
  for (let m = 0; m < landmassCells.length; m++) {
    if (landmassCells[m].length < MIN_LANDMASS_CELLS) continue

    const arcs = collectArcsForLandmass(cells, landmassCells[m], isLand)
    if (arcs.length === 0) continue

    const polygons = stitchArcs(arcs, vertices, width, height)
    for (const p of polygons) {
      if (p.length >= MIN_POLYGON_POINTS) coastlines.push(p)
    }
  }

  return coastlines
}

/**
 * 对一个 landmass 的所有 cell,收集 boundary arcs(每 cell 可能有 0~多个 arc)。
 * Arc: 连续 water-facing 边对应的顶点序列,沿 cell 顶点顺序走。
 */
function collectArcsForLandmass(
  cells: GridCells,
  landmass: number[],
  isLand: (i: number) => boolean,
): Arc[] {
  const arcs: Arc[] = []
  for (const L of landmass) {
    const verts = cells.v[L]
    const neighbors = cells.c[L]
    const N = verts.length
    if (N === 0) continue

    let current: number[] = []
    for (let k = 0; k < N; k++) {
      const nb = neighbors[k]
      const isBoundaryEdge = !isLand(nb)
      if (isBoundaryEdge) {
        if (current.length === 0) current.push(verts[k])
        current.push(verts[(k + 1) % N])
      } else {
        if (current.length >= 2) {
          arcs.push({ v0: current[0], v1: current[current.length - 1], verts: current })
        }
        current = []
      }
    }
    if (current.length >= 2) {
      arcs.push({ v0: current[0], v1: current[current.length - 1], verts: current })
    }
  }
  return arcs
}

/**
 * 按端点匹配把 arcs 拼接成闭合环。
 * 每个 arc 的 v0 = 上一个 arc 的 v1, v1 = 下一个 arc 的 v0。
 */
function stitchArcs(
  arcs: Arc[],
  vertices: GridVertices,
  width: number,
  height: number,
): Point[][] {
  // 按 v0 索引
  const byStart = new Map<number, Arc[]>()
  for (const a of arcs) {
    let bucket = byStart.get(a.v0)
    if (!bucket) { bucket = []; byStart.set(a.v0, bucket) }
    bucket.push(a)
  }
  const used = new Set<Arc>()

  const polygons: Point[][] = []
  for (const startArc of arcs) {
    if (used.has(startArc)) continue
    used.add(startArc)

    // polygon = startArc.verts,然后向后追加
    const vertexIds: number[] = [...startArc.verts]
    let lastV = startArc.v1
    const firstV = startArc.v0

    // 最多循环 arcs.length 次(防止死循环)
    let iter = 0
    while (lastV !== firstV && iter++ < arcs.length + 5) {
      const candidates = byStart.get(lastV)
      if (!candidates) break
      const next = candidates.find(a => !used.has(a))
      if (!next) break
      used.add(next)
      // 追加 next.verts[1..] (skip verts[0] = lastV)
      for (let i = 1; i < next.verts.length; i++) {
        vertexIds.push(next.verts[i])
      }
      lastV = next.v1
    }

    if (vertexIds.length >= MIN_POLYGON_POINTS) {
      const poly: Point[] = vertexIds.map(v => vertexToPoint(vertices, v, width, height))
      polygons.push(poly)
    }
  }

  return polygons
}

function vertexToPoint(
  vertices: GridVertices,
  v: number,
  width: number,
  height: number,
): Point {
  return [vertices.p[v * 2] / width, vertices.p[v * 2 + 1] / height]
}
