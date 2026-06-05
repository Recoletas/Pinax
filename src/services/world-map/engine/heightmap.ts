/**
 * 高度图生成（Azgaar template-driven）
 *
 * 算法（在 `generateTectonics` 之后调用）：
 *  1. 从 Azgaar 14 个模板中选择一个，执行 Hill / Range / Strait / Mask 操作链
 *  2. 追加轻量 FBM 噪声，缓解 Voronoi 采样后的几何感
 *  3. 按 landRatio 调整海平面
 *  4. 平滑稳定海岸与内陆过渡
 *
 * `plates / boundaries` 仍保留给 tectonic metadata、渲染和后续模块使用，
 * 但不再直接主导主高度图形状。
 */

import type { GridCells, Plate, PlateBoundary, MapRealism, HeightmapTemplate } from './types'
import { HEIGHTMAP_TEMPLATES, pickTemplate, applyTemplate } from './heightmap-templates'

function lim(v: number): number {
  return Math.max(0, Math.min(100, v))
}

const SEA_LEVEL = 20
const FBM_SCALE = 0.015
const FBM_AMP = 5

/**
 * 生成高度图（Azgaar template-driven）
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
  _boundaries: PlateBoundary[] = [],
  continentCount = Math.max(2, Math.round((plates.length || 6) * 0.5)),
  realism?: MapRealism,
  templateOverride?: HeightmapTemplate,
): void {
  const n = cells.length
  if (!cells.tectonic?.plateId) {
    throw new Error('generateHeightmap: cells.tectonic.plateId not initialized. Call generateTectonics first.')
  }

  // 步骤 1：Azgaar 模板（faithful port）
  const templateName = templateOverride ?? pickTemplate(continentCount, landRatio, rng)
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

  // 保留 realism.tectonics 参数兼容旧配置，但只做轻量幅度偏移。
  const rangeWidth = clamp(realism?.tectonics?.rangeWidth ?? 3, 1, 8)
  const riftDepth = clamp(realism?.tectonics?.riftDepth ?? 25, 5, 60)
  const tectonicBias = ((rangeWidth - 3) * 0.4) - ((riftDepth - 25) * 0.03)
  if (tectonicBias !== 0) {
    for (let i = 0; i < n; i++) {
      cells.h[i] = lim(cells.h[i] + tectonicBias)
    }
  }

  // 保证画布边缘以海洋为主，避免 coastline 提取在边界处分裂成开放折线。
  softenMapEdges(cells, width, height)

  // 步骤 3：调整海陆比
  adjustSeaLevel(cells, landRatio)

  // 步骤 4：平滑
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function softenMapEdges(cells: GridCells, width: number, height: number): void {
  for (let i = 0; i < cells.length; i++) {
    const x = cells.p[i * 2] / width
    const y = cells.p[i * 2 + 1] / height
    const edgeDist = Math.min(x, y, 1 - x, 1 - y)
    if (edgeDist < 0.08) {
      const factor = edgeDist / 0.08
      cells.h[i] = lim(Math.round(cells.h[i] * factor))
    }

    const poleDist = Math.min(y, 1 - y)
    if (poleDist >= 0.14) continue
    const polarFactor = clamp(poleDist / 0.14, 0, 1)
    const shaped = polarFactor * polarFactor
    const coastSafe = cells.h[i] > SEA_LEVEL ? SEA_LEVEL + (cells.h[i] - SEA_LEVEL) * shaped : cells.h[i] * shaped
    cells.h[i] = lim(Math.round(coastSafe))
  }
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

// ── 阶段 1:大尺度大陆形变 ──────────────────────────

/**
 * 在模板生成 + 边缘遮罩 + 海平面调整之后，对最大陆块做一次"宏观形变"：
 *  - 沿主轴线再放 1~2 个 Hill（拉长大陆）
 *  - 在陆块边缘的远端随机 1~3 个 Pit（海湾）
 *  - 15% 概率在陆块腰部加 1 条 Strait（陆地被切割）
 *  - 极地区域（|y/h - 0.5| > 0.38）整体高度乘 0.85，模拟冰盖平缓感
 *
 * 不修改 14 个原模板字符串；只复用 templates 提供的 Hill / Pit / Strait
 * 内部 helper（addHill / addPit / addStrait）通过专用参数调用。
 */
export function applyMacroLandmassShape(
  cells: GridCells,
  width: number,
  height: number,
  rng: () => number,
  targetLandRatio: number = 0.45,
): void {
  const n = cells.length
  if (n === 0) return

  // 1) 找最大连通陆块（>100 cells 才有意义）
  const seen = new Uint8Array(n)
  let best: number[] = []
  for (let start = 0; start < n; start++) {
    if (seen[start] || cells.h[start] < SEA_LEVEL) continue
    const queue: number[] = [start]
    seen[start] = 1
    const landmass: number[] = [start]
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      const nbs = cells.c[c]
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k]
        if (seen[nb] || cells.h[nb] < SEA_LEVEL) continue
        seen[nb] = 1
        queue.push(nb)
        landmass.push(nb)
      }
    }
    if (landmass.length > best.length) best = landmass
  }
  if (best.length < 100) return

  // 2) 陆块重心 + 远端点（主轴起点 & 终点）
  let cx = 0
  let cy = 0
  for (let k = 0; k < best.length; k++) {
    const id = best[k]
    cx += cells.p[id * 2]
    cy += cells.p[id * 2 + 1]
  }
  cx /= best.length
  cy /= best.length

  let farId = best[0]
  let farDist = -1
  for (let k = 0; k < best.length; k++) {
    const id = best[k]
    const dx = cells.p[id * 2] - cx
    const dy = cells.p[id * 2 + 1] - cy
    const d = dx * dx + dy * dy
    if (d > farDist) { farDist = d; farId = id }
  }
  const fx = cells.p[farId * 2]
  const fy = cells.p[farId * 2 + 1]
  const maxDist = Math.sqrt(farDist)
  if (maxDist < 1) return

  // 3) 沿主轴再放 1~2 个 Hill（拉长大陆）
  //   - 选 1~2 个等分点，x/y 范围缩到 ±15% (cover 那个点附近的细长条)
  //   - 使用模板的 addHill（通过模板字符串调用或直接 addHill）
  //   - 高度 20~35, blobPower 0.95
  const segments = 1 + Math.floor(rng() * 2)  // 1 or 2
  for (let s = 0; s < segments; s++) {
    const t = (s + 1) / (segments + 1)  // 等分 [0,1]
    const ax = cx + (fx - cx) * t
    const ay = cy + (fy - cy) * t
    // 拉一个细长矩形 (centered at ax,ay) — x/y 范围 ±15%
    const halfW = width * 0.15
    const halfH = height * 0.15
    const minX = Math.max(0, ax - halfW)
    const maxX = Math.min(width, ax + halfW)
    const minY = Math.max(0, ay - halfH)
    const maxY = Math.min(height, ay + halfH)
    const rangeX = `${Math.round((minX / width) * 100)}-${Math.round((maxX / width) * 100)}`
    const rangeY = `${Math.round((minY / height) * 100)}-${Math.round((maxY / height) * 100)}`
    const hStr = `20-35`
    addHillIsland(cells, width, height, '1', hStr, rangeX, rangeY, 0.95, rng)
  }

  // 4) 在陆块边缘(到陆块中心 > 0.7*maxDist) 随机 1~3 个 Pit
  //   - 收集候选 edge cells
  const edgePool: number[] = []
  for (let k = 0; k < best.length; k++) {
    const id = best[k]
    const dx = cells.p[id * 2] - cx
    const dy = cells.p[id * 2 + 1] - cy
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > 0.7 * maxDist) {
      // 也要求是边界 cell（至少有一个非陆邻居）
      const nbs = cells.c[id]
      let isEdge = false
      for (let m = 0; m < nbs.length; m++) {
        if (cells.h[nbs[m]] < SEA_LEVEL) { isEdge = true; break }
      }
      if (isEdge) edgePool.push(id)
    }
  }
  if (edgePool.length > 0) {
    const pitCount = 1 + Math.floor(rng() * 3)  // 1..3
    for (let p = 0; p < pitCount; p++) {
      const target = edgePool[Math.floor(rng() * edgePool.length)]
      const tx = cells.p[target * 2]
      const ty = cells.p[target * 2 + 1]
      const halfW = width * 0.1
      const halfH = height * 0.1
      const minX = Math.max(0, tx - halfW)
      const maxX = Math.min(width, tx + halfW)
      const minY = Math.max(0, ty - halfH)
      const maxY = Math.min(height, ty + halfH)
      const rangeX = `${Math.round((minX / width) * 100)}-${Math.round((maxX / width) * 100)}`
      const rangeY = `${Math.round((minY / height) * 100)}-${Math.round((maxY / height) * 100)}`
      addPitIsland(cells, width, height, '1', '10-20', rangeX, rangeY, 0.95, rng)
    }
  }

  // 5) 15% 概率在陆块腰部加 1 条 Strait（窄水带，宽度 1~2 cell）
  if (rng() < 0.15) {
    // 腰部：选主轴的 0.5 等分点；strat 方向：垂直主轴
    const mx = (cx + fx) * 0.5
    const my = (cy + fy) * 0.5
    // 把主轴方向归一化
    const axisX = (fx - cx) / maxDist
    const axisY = (fy - cy) / maxDist
    // 找腰部附近的一个 cell（最接近 (mx,my) 的 cell）
    const waistId = findNearestCell(cells, mx, my, n)
    addStraitIsland(cells, width, height, waistId, axisX, axisY, rng)
  }

  // 6) 极地：poleDist < 0.12 的 cell 整体高度乘 0.85
  for (let i = 0; i < n; i++) {
    if (cells.h[i] <= 0) continue
    const yNorm = cells.p[i * 2 + 1] / height
    const poleDist = Math.min(yNorm, 1 - yNorm)
    if (poleDist < 0.12) {
      cells.h[i] = lim(Math.round(cells.h[i] * 0.85))
    }
  }

  // 7) 重新调整海平面以维持目标 landRatio（Hills 拉升、Pits 切割综合下来
  //    会改变陆块净面积，调用 adjustSeaLevel 把 landRatio 拉回 target）
  //    等价于 spec 里"在 generateHeightmap 后、adjustSeaLevel 前"调用的位置
  adjustSeaLevel(cells, targetLandRatio)
}

// ── 私有 helper：借用 templates 的 addHill / addPit / addStrait 行为 ──

/** 简化版 addHill：单 count 字符串，整数 h，"minX-maxX" 范围。 */
function addHillIsland(
  cells: GridCells,
  width: number,
  height: number,
  count: string,
  h: string,
  rangeX: string,
  rangeY: string,
  blobPower: number,
  rng: () => number,
): void {
  addBlobIsland(cells, width, height, count, h, rangeX, rangeY, blobPower, rng, +1)
}

/** 简化版 addPit：单 count 字符串，整数 h，"minX-maxX" 范围。 */
function addPitIsland(
  cells: GridCells,
  width: number,
  height: number,
  count: string,
  h: string,
  rangeX: string,
  rangeY: string,
  blobPower: number,
  rng: () => number,
): void {
  addBlobIsland(cells, width, height, count, h, rangeX, rangeY, blobPower, rng, -1)
}

/** 内部 blob worker：sign=+1=Hill, sign=-1=Pit。 */
function addBlobIsland(
  cells: GridCells,
  width: number,
  height: number,
  count: string,
  h: string,
  rangeX: string,
  rangeY: string,
  blobPower: number,
  rng: () => number,
  sign: 1 | -1,
): void {
  const n = cells.length
  const desiredCount = parseCount(count, rng)
  const heightVal = parseH(h, rng)
  const [x0pct, x1pct] = parseRange(rangeX)
  const [y0pct, y1pct] = parseRange(rangeY)

  for (let i = 0; i < desiredCount; i++) {
    let cx = 0
    let cy = 0
    let start = 0
    let limit = 0
    do {
      cx = (x0pct + rng() * (x1pct - x0pct)) * width
      cy = (y0pct + rng() * (y1pct - y0pct)) * height
      start = findNearestCell(cells, cx, cy, n)
      limit++
    } while (limit < 50 && sign > 0 && cells.h[start] + heightVal > 90)
    if (limit >= 50 && sign > 0) continue

    const change = new Float32Array(n)
    change[start] = heightVal
    const queue: number[] = [start]
    while (queue.length) {
      const q = queue.shift()!
      for (let k = 0; k < cells.c[q].length; k++) {
        const c = cells.c[q][k]
        if (change[c] !== 0) continue
        change[c] = change[q] ** blobPower * (rng() * 0.2 + 0.9)
        if (change[c] > 1) queue.push(c)
      }
    }
    for (let j = 0; j < n; j++) {
      if (change[j] === 0) continue
      const newH = sign > 0
        ? cells.h[j] + change[j]
        : cells.h[j] - change[j]
      cells.h[j] = lim(Math.round(newH))
    }
  }
}

function parseCount(s: string, rng: () => number): number {
  const v = +s
  if (Number.isFinite(v) && s.indexOf('-') < 0) return Math.max(0, Math.floor(v))
  const parts = s.split('-').map(Number)
  if (parts.length === 2) {
    return Math.floor(parts[0] + rng() * (parts[1] - parts[0]))
  }
  return 0
}

function parseH(s: string, rng: () => number): number {
  const v = +s
  if (Number.isFinite(v) && s.indexOf('-') < 0) return v
  const parts = s.split('-').map(Number)
  if (parts.length === 2) return parts[0] + rng() * (parts[1] - parts[0])
  return 0
}

function parseRange(s: string): [number, number] {
  const parts = s.split('-').map(Number)
  if (parts.length === 2) return [parts[0] / 100, parts[1] / 100]
  if (parts.length === 1) return [parts[0] / 100, parts[0] / 100]
  return [0, 1]
}

function findNearestCell(cells: GridCells, x: number, y: number, n: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < n; i++) {
    const dx = cells.p[i * 2] - x
    const dy = cells.p[i * 2 + 1] - y
    const d = dx * dx + dy * dy
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/** 简化版 addStrait：从 start cell 出发沿垂直主轴方向 BFS 找路径（1~2 cell 宽）。 */
function addStraitIsland(
  cells: GridCells,
  width: number,
  height: number,
  waistId: number,
  axisX: number,
  axisY: number,
  rng: () => number,
): void {
  const n = cells.length
  // 垂直主轴方向（沿此方向画窄水带）
  const perpX = -axisY
  const perpY = axisX
  // 选方向（+perp 或 -perp）
  const dir = rng() < 0.5 ? -1 : 1
  // 沿 perp 方向上找一段连续 cell，长度 = maxDist * 0.4
  const startX = cells.p[waistId * 2]
  const startY = cells.p[waistId * 2 + 1]
  const length = Math.max(3, Math.min(20, Math.floor(cells.c[waistId].length * 0.5)))
  const cellsToLower: number[] = [waistId]
  let cur = waistId
  for (let step = 0; step < length; step++) {
    // 找最接近 (cur + dir * perp * stepSize) 的邻居
    const targetX = startX + dir * perpX * (step + 1) * 5
    const targetY = startY + dir * perpY * (step + 1) * 5
    let best = -1
    let bestD = Infinity
    for (const nb of cells.c[cur]) {
      const dx = cells.p[nb * 2] - targetX
      const dy = cells.p[nb * 2 + 1] - targetY
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = nb }
    }
    if (best < 0 || cells.h[best] < SEA_LEVEL) break
    cellsToLower.push(best)
    cur = best
  }
  // 把这些 cell 高度压到 ~3（海平面以下）
  for (const id of cellsToLower) {
    cells.h[id] = 3
  }
  // 邻接 cell 的 h 适度压低（软化边缘）
  for (const id of cellsToLower) {
    for (const nb of cells.c[id]) {
      if (cells.h[nb] < SEA_LEVEL) continue
      if (rng() < 0.4) {
        cells.h[nb] = lim(Math.round(cells.h[nb] * 0.85))
      }
    }
  }
}
