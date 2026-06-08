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
import { HEIGHTMAP_TEMPLATES, applyTemplate, resolveHeightmapTemplate, type TemplateShapeIntent } from './heightmap-templates'
import { adjustSeaLevelTemplateAware } from './heightmap-template-aware'
import { evaluateContract } from './enforceTemplateContract'
import { seedRandom } from './random'

function lim(v: number): number {
  return Math.max(0, Math.min(100, v))
}

const SEA_LEVEL = 20
const FBM_SCALE = 0.015
const FBM_AMP = 1

/**
 * Round 2 Stage 1:派生 sub-RNG 用于模板层（选择 + 执行 + 后续反轴向偏移）。
 *
 * `attempt` 是合同 reroll 计数器（Stage 5），从 0 开始每次 reroll +1。
 * 模板层**不**消费主 rng；主世界（grid / plates / cultures / nations）的
 * determinism 不会被模板层任何重试扰动。显式模板和自动模板走同一套
 * sub-RNG，避免同 seed 显式 / 自动底层世界不同。
 */
function templateRngFor(seed: string, attempt = 0): () => number {
  return seedRandom(`${seed}:heightmap:${attempt}`)
}

/**
 * 生成高度图（Azgaar template-driven）
 *
 * 假定 `generateTectonics` 已先调用，且 `cells.tectonic.plateId` 已被填充。
 *
 * Round 2 Stage 1 起，自动模板选择走独立 sub-RNG（由 `heightmapSeed` 派生），
 * 不消费主 `rng`。这保证：
 *  1. 显式模板 vs 同 seed 自动模板的**底层世界**（grid / plates / cultures）
 *     一致（仅模板层选择走 sub-RNG，不影响其它层）。
 *  2. Stage 5 reroll 改 attempt 后缀只换模板，**不**扰动主世界 determinism。
 *
 * 显式 `templateOverride` 仍由调用方传入（`generateMap` 用 `config.heightmapTemplate`）。
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
  heightmapSeed?: string,
): { shapeIntent: TemplateShapeIntent | undefined; templateName: HeightmapTemplate | undefined } {
  const n = cells.length
  if (!cells.tectonic?.plateId) {
    throw new Error('generateHeightmap: cells.tectonic.plateId not initialized. Call generateTectonics first.')
  }

  // 步骤 1：Azgaar 模板（faithful port）
  // Stage 4：模板层（含 `applyTemplate` 内部 rng 调用 + 反轴向偏移）走
  // 独立 sub-RNG `templateRng`，**不**消费主 rng。主 rng 仍保留在签名
  // 中供后续 FBM 噪声叠加 / 板块边界地形使用。
  //
  // Stage 5：合同评估 + reroll。snapshot 记录 applyTemplate 前的 cells.h
  // (此时全 0),reroll 时回滚 + 重新跑 applyTemplate + FBM + seaLevel
  // + smooth。sub-RNG 的 attempt 计数器 +1,主世界 determinism 不变。
  const seedKey = heightmapSeed ?? 'heightmap-default'
  const heightmapSnapshot = new Uint8Array(cells.h)  // applyTemplate 前的高度场

  const pickAndApply = (attempt: number): { templateName: HeightmapTemplate; shapeIntent: TemplateShapeIntent | undefined; tplRng: () => number } => {
    const tplRng = templateRngFor(seedKey, attempt)
    const resolved = resolveHeightmapTemplate({
      continentCount,
      landRatio,
      rng: tplRng,
      explicitTemplate: templateOverride,
    })
    const tplName = resolved.templateName
    // 回滚到 snapshot(attempt > 0 时 cells.h 是上一次 applyTemplate 的结果)
    cells.h.set(heightmapSnapshot)
    const tpl = HEIGHTMAP_TEMPLATES[tplName]
    if (tpl) {
      applyTemplate(cells, width, height, tpl.template, tplRng)
    } else {
      // 没匹配到模板：fallback 到 30 等高
      for (let i = 0; i < n; i++) cells.h[i] = 30
    }
    return { templateName: tplName, shapeIntent: resolved.shapeIntent, tplRng }
  }

  // 第一次选 + 跑
  let { templateName, shapeIntent, tplRng: _ } = pickAndApply(0)

  // 跑剩余管线（FBM + seaLevel + smooth）— 必须在 contract 评估之前完成，
  // 因为 landmass 形状需要 sea level 调整过的高度场。
  const runPostTemplate = () => {
    for (let i = 0; i < n; i++) {
      if (cells.h[i] <= SEA_LEVEL + 4) continue
      const x = cells.p[i * 2]
      const y = cells.p[i * 2 + 1]
      cells.h[i] += Math.round(fbm2D(x * FBM_SCALE, y * FBM_SCALE, 4) * FBM_AMP)
    }
    softenMapEdges(cells, width, height)
    adjustSeaLevelTemplateAware(cells, landRatio)
  }
  runPostTemplate()

  // 步骤 1.5：合同评估 + reroll（最多 3 次 attempt）
  const maxAttempts = templateOverride ? 1 : 4  // attempt 0 + 3 rerolls
  let contractAttempt = 0
  let contract = evaluateContract({
    cells, width, height, templateName, shapeIntent: shapeIntent ?? 'continents', explicit: !!templateOverride,
  })
  while (!contract.met && contractAttempt + 1 < maxAttempts) {
    contractAttempt++
    ;({ templateName, shapeIntent } = pickAndApply(contractAttempt))
    runPostTemplate()
    contract = evaluateContract({
      cells, width, height, templateName, shapeIntent: shapeIntent ?? 'continents', explicit: !!templateOverride,
    })
  }
  if (!contract.met) {
    console.warn(`[generateHeightmap] template contract NOT met after ${contractAttempt} rerolls: ${contract.reason}`)
  }

  // 步骤 2：FBM 噪声叠加（在合同评估后,避免对 reroll 状态重叠加）
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

  // 步骤 3.5：板块边界地形。汇聚边界形成山带，张裂边界形成浅裂谷。
  applyPlateBoundaryRelief(cells, width, height, boundaries, plates, { rangeWidth, riftDepth })

  // 步骤 4：轻平滑，保留模板骨架与海岸大形。
  smooth(cells, 1, 1)

  return { shapeIntent, templateName }
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
 * @deprecated Round 2 Stage 2 起被 `adjustSeaLevelTemplateAware`（在
 * `heightmap-template-aware.ts`）替代。保留为内部 helper 备用 — 行为与
 * Round 1.5 一致：step ±10 × 6 attempts = 60 max shift。
 *
 * 历史步幅：
 *   原版：       step ±12 × 4 attempts = 48 max shift
 *   Round 1：    step ±3 → ±6 × 4 attempts = 24 max shift（plan 阶段 6 要求限幅）
 *   Round 1.5：  step ±10 × 6 attempts = 60 max shift
 *
 * Round 1 退到 ±6 × 4 = 24 在 pangea / mediterranean 类高基线模板下
 * 完全拉不到目标 0.45 landRatio（实测 cc=1 pangea 0.658, cc=6
 * mediterranean 0.613）。Round 1.5 给到 60 max shift，2.4× 余量
 * 应对最坏基线。
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

