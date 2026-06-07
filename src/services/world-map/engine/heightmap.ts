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
const FBM_AMP = 1

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
  boundaries: PlateBoundary[] = [],
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
    if (cells.h[i] <= SEA_LEVEL + 4) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    cells.h[i] += Math.round(fbm2D(x * FBM_SCALE, y * FBM_SCALE, 4) * FBM_AMP)
  }

  // 保留 realism.tectonics 参数兼容旧配置，并用于实际板块边界地形。
  const rangeWidth = clamp(realism?.tectonics?.rangeWidth ?? 3, 1, 8)
  const riftDepth = clamp(realism?.tectonics?.riftDepth ?? 25, 5, 60)

  // 保证画布边缘以海洋为主，避免 coastline 提取在边界处分裂成开放折线。
  softenMapEdges(cells, width, height)

  // 步骤 3：调整海陆比
  adjustSeaLevel(cells, landRatio)

  // 步骤 3.5：板块边界地形。汇聚边界形成山带，张裂边界形成浅裂谷。
  applyPlateBoundaryRelief(cells, width, height, boundaries, plates, { rangeWidth, riftDepth })

  // 步骤 4：轻平滑，保留模板骨架与海岸大形。
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
    if (edgeDist < 0.05) {
      const factor = clamp(edgeDist / 0.05, 0, 1)
      const shaped = factor * factor
      cells.h[i] = lim(Math.round(cells.h[i] * shaped))
    }

    const poleDist = Math.min(y, 1 - y)
    if (poleDist >= 0.12) continue
    const polarFactor = clamp(poleDist / 0.12, 0, 1)
    const shaped = 0.28 + polarFactor * polarFactor * 0.72
    cells.h[i] = lim(Math.round(cells.h[i] * shaped))
  }
}

/**
 * 调整海平面以达到目标海陆比例（gap-aware）。
 *
 * 历史步幅：
 *   原版：       step ±12 × 4 attempts = 48 max shift
 *   Round 1：    step ±3 → ±6 × 4 attempts = 24 max shift（plan 阶段 6 要求限幅）
 *   Round 1.5：  step ±10 × 6 attempts = 60 max shift
 *
 * Round 1 退到 ±6 × 4 = 24 在 pangea / mediterranean 类高基线模板下
 * 完全拉不到目标 0.45 landRatio（实测 cc=1 pangea 0.658, cc=6
 * mediterranean 0.613）。Round 1.5 给到 60 max shift，2.4× 余量
 * 应对最坏基线。步幅仍保持小（±10 < 原版 ±12），分多轮逼近以减少
 * 单步模板细节扭曲。真正的「保形」remap（海岸带侵蚀/扩张 + 低频噪声）
 * 放 Round 2 的 `adjustSeaLevelTemplateAware`。
 *
 * 落入容差（±0.025）即提前返回；末尾不再做 ±N 强制截断。
 */
function adjustSeaLevel(cells: GridCells, targetLandRatio: number): void {
  const heights = Array.from(cells.h)
  if (heights.length === 0) return
  heights.sort((a, b) => a - b)
  const targetWater = clamp(Math.floor(cells.length * (1 - targetLandRatio)), 0, heights.length - 1)
  const seaLevel = heights[targetWater]
  let shift = SEA_LEVEL - seaLevel
  if (shift === 0) return

  let attempts = 0
  while (shift !== 0 && attempts++ < 6) {
    const step = clamp(shift, -10, 10)
    for (let i = 0; i < cells.length; i++) {
      cells.h[i] = Math.max(0, Math.min(100, cells.h[i] + step))
    }

    let land = 0
    for (let i = 0; i < cells.length; i++) {
      if (cells.h[i] >= SEA_LEVEL) land++
    }
    const landRatio = land / cells.length
    if (Math.abs(landRatio - targetLandRatio) <= 0.025) return

    const nextHeights = Array.from(cells.h).sort((a, b) => a - b)
    const nextSeaLevel = nextHeights[targetWater]
    shift = SEA_LEVEL - nextSeaLevel
  }
}

function applyPlateBoundaryRelief(
  cells: GridCells,
  width: number,
  height: number,
  boundaries: PlateBoundary[],
  plates: Plate[],
  options: { rangeWidth: number; riftDepth: number },
): void {
  if (boundaries.length === 0) return

  const uplift = new Uint8Array(cells.length)
  const rift = new Uint8Array(cells.length)

  for (const boundary of boundaries) {
    if (boundary.cellIds.length === 0) continue
    if (boundary.type === 'convergent') {
      const peak = getConvergentPeak(boundary, plates)
      const effectiveWidth = getConvergentWidth(boundary, plates, options.rangeWidth)
      spreadBoundaryEffect(cells, boundary.cellIds, effectiveWidth, (cellId, layer) => {
        if (cells.h[cellId] < SEA_LEVEL) return
        if (!isUpliftSide(cells, boundary, cellId)) return
        const attenuation = getReliefAttenuation(cells, cellId, width, height)
        if (attenuation <= 0.06) return
        const sigma = Math.max(0.85, effectiveWidth / 3)
      const localRelief = 0.82 + hash2D(cellId * 0.73, layer * 13.17) * 0.36
      const lift = Math.round(peak * localRelief * attenuation * Math.exp(-(layer * layer) / (2 * sigma * sigma)))
        if (lift > uplift[cellId]) uplift[cellId] = lift
      })
    } else if (boundary.type === 'divergent') {
      const width = Math.max(1, Math.floor(options.rangeWidth * 0.45))
      const depth = Math.max(2, Math.round(options.riftDepth * 0.22))
      spreadBoundaryEffect(cells, boundary.cellIds, width, (cellId, layer) => {
        const cut = Math.round(depth * Math.max(0, 1 - layer / (width + 1)))
        if (cut > rift[cellId]) rift[cellId] = cut
      })
    }
  }

  for (let i = 0; i < cells.length; i++) {
    let h = cells.h[i]
    if (uplift[i] > 0) h = lim(h + uplift[i])
    if (rift[i] > 0) {
      h = h >= SEA_LEVEL ? Math.max(SEA_LEVEL, h - rift[i]) : Math.max(0, h - rift[i])
    }
    cells.h[i] = h
  }
}

function getConvergentPeak(boundary: PlateBoundary, plates: Plate[]): number {
  const plateA = plates[boundary.plateA]
  const plateB = plates[boundary.plateB]
  if (!plateA || !plateB) return boundary.subductionSide === undefined ? 28 : 22

  if (!plateA.oceanic && !plateB.oceanic) return 36
  if (plateA.oceanic !== plateB.oceanic) return 26
  return 16
}

function getConvergentWidth(boundary: PlateBoundary, plates: Plate[], configuredWidth: number): number {
  const plateA = plates[boundary.plateA]
  const plateB = plates[boundary.plateB]
  const baseWidth = Math.max(1, configuredWidth)
  if (!plateA || !plateB) return baseWidth + 2
  if (!plateA.oceanic && !plateB.oceanic) return baseWidth + 2
  if (plateA.oceanic !== plateB.oceanic) return baseWidth + 1
  return Math.max(1, Math.floor(baseWidth * 0.6))
}

function isUpliftSide(cells: GridCells, boundary: PlateBoundary, cellId: number): boolean {
  if (boundary.subductionSide === undefined) return true
  return cells.tectonic?.plateId[cellId] !== boundary.subductionSide
}

function getReliefAttenuation(cells: GridCells, cellId: number, width: number, height: number): number {
  const x = cells.p[cellId * 2] / width
  const y = cells.p[cellId * 2 + 1] / height
  const edgeDist = Math.min(x, y, 1 - x, 1 - y)
  const poleDist = Math.min(y, 1 - y)
  const edgeFactor = smoothstep(0.04, 0.1, edgeDist)
  const polarFactor = smoothstep(0.1, 0.24, poleDist)
  return Math.min(edgeFactor, polarFactor)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function spreadBoundaryEffect(
  cells: GridCells,
  seeds: number[],
  width: number,
  visit: (cellId: number, layer: number) => void,
): void {
  const visited = new Uint8Array(cells.length)
  let frontier: number[] = []
  for (const seed of seeds) {
    if (seed < 0 || seed >= cells.length || visited[seed]) continue
    visited[seed] = 1
    frontier.push(seed)
  }

  for (let layer = 0; layer <= width && frontier.length > 0; layer++) {
    const next: number[] = []
    for (const cellId of frontier) {
      visit(cellId, layer)
      if (layer === width) continue
      for (const nb of cells.c[cellId]) {
        if (visited[nb]) continue
        visited[nb] = 1
        next.push(nb)
      }
    }
    frontier = next
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

