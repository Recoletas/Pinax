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

interface CoastSegment {
  a: number
  b: number
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

  // 2. 对每个陆块:collect true land-water Voronoi edges, then stitch
  const coastlines: Point[][] = []
  for (let m = 0; m < landmassCells.length; m++) {
    if (landmassCells[m].length < MIN_LANDMASS_CELLS) continue

    const segments = collectSegmentsForLandmass(cells, landmassCells[m], isLand)
    if (segments.length === 0) continue

    let polygons = stitchSegments(segments, vertices, width, height)
    if (polygons.length === 0) {
      polygons = [fallbackHullPolygon(cells, landmassCells[m], width, height)]
    }
    for (const p of polygons) {
      if (p.length >= MIN_POLYGON_POINTS) coastlines.push(p)
    }
  }

  return coastlines
}

/**
 * 对一个 landmass 的所有 cell,收集真正的陆-水 Voronoi 边。
 *
 * 旧版按 `cells.v[L][k] -> cells.v[L][k+1]` 和 `cells.c[L][k]` 假定
 * 邻居顺序与顶点边顺序完全对齐。当前 `buildVoronoi` 只保证二者都是
 * 环绕枚举,并不保证 `k` 对应同一条边,复杂海岸会被拼成极短的粗环
 * (例如 400+ 边界段退化成 27 个点)。这里改为从陆 cell / 水 neighbor
 * 的共享顶点求真实边,不依赖数组索引对齐。
 */
function collectSegmentsForLandmass(
  cells: GridCells,
  landmass: number[],
  isLand: (i: number) => boolean,
): CoastSegment[] {
  const segments: CoastSegment[] = []
  const seen = new Set<string>()
  for (const L of landmass) {
    const landVerts = cells.v[L]
    if (!landVerts || landVerts.length < 2) continue
    for (const nb of cells.c[L]) {
      if (isLand(nb)) continue
      const waterVerts = cells.v[nb]
      if (!waterVerts || waterVerts.length < 2) continue
      const shared = sharedVertexIds(landVerts, waterVerts)
      if (shared.length < 2) continue
      const a = shared[0]
      const b = shared[1]
      if (a === b) continue
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const key = `${lo}:${hi}`
      if (seen.has(key)) continue
      seen.add(key)
      segments.push({ a, b })
    }
  }
  return segments
}

/**
 * 按端点匹配把 coastline segments 拼接成闭合环。
 */
function stitchSegments(
  segments: CoastSegment[],
  vertices: GridVertices,
  width: number,
  height: number,
): Point[][] {
  const byVertex = new Map<number, number[]>()
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    let bucket = byVertex.get(seg.a)
    if (!bucket) { bucket = []; byVertex.set(seg.a, bucket) }
    bucket.push(i)
    bucket = byVertex.get(seg.b)
    if (!bucket) { bucket = []; byVertex.set(seg.b, bucket) }
    bucket.push(i)
  }

  const used = new Uint8Array(segments.length)
  const polygons: Point[][] = []
  for (let startSeg = 0; startSeg < segments.length; startSeg++) {
    if (used[startSeg]) continue
    used[startSeg] = 1

    const start = segments[startSeg]
    const vertexIds = [start.a, start.b]
    const firstV = start.a
    let prevV = start.a
    let currentV = start.b

    let iter = 0
    while (currentV !== firstV && iter++ < segments.length + 5) {
      const nextSeg = pickBestNextSegment(
        byVertex.get(currentV) || [],
        used,
        segments,
        vertices,
        prevV,
        currentV,
      )
      if (nextSeg < 0) break
      used[nextSeg] = 1
      const seg = segments[nextSeg]
      const nextV = seg.a === currentV ? seg.b : seg.a
      vertexIds.push(nextV)
      prevV = currentV
      currentV = nextV
    }

    if (currentV === firstV && vertexIds.length >= MIN_POLYGON_POINTS) {
      const poly: Point[] = vertexIds.map(v => vertexToPoint(vertices, v, width, height))
      polygons.push(poly)
    }
  }

  return polygons
}

function pickBestNextSegment(
  candidates: number[],
  used: Uint8Array,
  segments: CoastSegment[],
  vertices: GridVertices,
  prevV: number,
  currentV: number,
): number {
  let best = -1
  let bestScore = Infinity

  for (const segId of candidates) {
    if (used[segId]) continue
    const seg = segments[segId]
    const nextV = seg.a === currentV ? seg.b : seg.a
    const score = turnPenalty(vertices, prevV, currentV, nextV)
    if (score < bestScore) {
      bestScore = score
      best = segId
    }
  }

  return best
}

function sharedVertexIds(a: number[], b: number[]): number[] {
  const bSet = new Set(b)
  const shared: number[] = []
  for (const v of a) {
    if (bSet.has(v)) shared.push(v)
  }
  return shared
}

function fallbackHullPolygon(
  cells: GridCells,
  landmass: number[],
  width: number,
  height: number,
): Point[] {
  const boundary: number[] = []
  for (const cellId of landmass) {
    for (const nb of cells.c[cellId]) {
      if (cells.h[nb] < SEA_LEVEL) {
        boundary.push(cellId)
        break
      }
    }
  }
  const source = boundary.length >= MIN_POLYGON_POINTS ? boundary : landmass
  if (source.length === 0) return []
  let cx = 0, cy = 0
  for (const cellId of source) {
    cx += cells.p[cellId * 2]
    cy += cells.p[cellId * 2 + 1]
  }
  cx /= source.length
  cy /= source.length

  const buckets = new Map<number, { cellId: number; dist: number; angle: number }>()
  const bucketCount = Math.max(MIN_POLYGON_POINTS, Math.min(96, Math.round(Math.sqrt(source.length) * 4)))
  for (const cellId of source) {
    const x = cells.p[cellId * 2]
    const y = cells.p[cellId * 2 + 1]
    const angle = Math.atan2(y - cy, x - cx)
    const idx = Math.floor((((angle + Math.PI) / (Math.PI * 2)) * bucketCount)) % bucketCount
    const dist = (x - cx) ** 2 + (y - cy) ** 2
    const current = buckets.get(idx)
    if (!current || dist > current.dist) buckets.set(idx, { cellId, dist, angle })
  }

  const poly = [...buckets.values()]
    .sort((a, b) => a.angle - b.angle)
    .map(({ cellId }): Point => [
      Math.max(0, Math.min(1, cells.p[cellId * 2] / width)),
      Math.max(0, Math.min(1, cells.p[cellId * 2 + 1] / height)),
    ])
  if (poly.length > 0) poly.push(poly[0])
  return poly
}

function turnPenalty(
  vertices: GridVertices,
  a: number,
  b: number,
  c: number,
): number {
  const bax = vertices.p[b * 2] - vertices.p[a * 2]
  const bay = vertices.p[b * 2 + 1] - vertices.p[a * 2 + 1]
  const bcx = vertices.p[c * 2] - vertices.p[b * 2]
  const bcy = vertices.p[c * 2 + 1] - vertices.p[b * 2 + 1]
  const len1 = Math.hypot(bax, bay) || 1
  const len2 = Math.hypot(bcx, bcy) || 1
  const dot = (bax * bcx + bay * bcy) / (len1 * len2)
  return 1 - dot
}

function vertexToPoint(
  vertices: GridVertices,
  v: number,
  width: number,
  height: number,
): Point {
  const x = vertices.p[v * 2] / width
  const y = vertices.p[v * 2 + 1] / height
  return [
    Math.max(0, Math.min(1, x)),
    Math.max(0, Math.min(1, y)),
  ]
}
