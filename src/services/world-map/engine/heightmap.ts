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
import { hash2D, fbmHash } from './noise'
import { clamp } from './math'

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
  heightmapSeed: string,
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
  // (此时全 0),reroll 时回滚 + 重新跑 applyTemplate + FBM + seaLevel。
  // sub-RNG 的 attempt 计数器 +1,主世界 determinism 不变。
  //
  // Round 2 修复: 原本 reroll 循环结束后会**再次**跑 FBM + softenMapEdges,
  // 导致合同评估的高度场和最终输出不是同一个状态(soften 后又被 FBM
  // 叠加、plateRelief 前被两次 soften 弱化)。现在把 post-template 跑
  // 在每次 reroll 之后,合同通过即停止,不再二次叠加。
  const heightmapSnapshot = new Uint8Array(cells.h)  // applyTemplate 前的高度场

  const pickAndApply = (attempt: number): { templateName: HeightmapTemplate; shapeIntent: TemplateShapeIntent | undefined; tplRng: () => number } => {
    const tplRng = templateRngFor(heightmapSeed, attempt)
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
  let { templateName, shapeIntent } = pickAndApply(0)

  // 单阶段 post-template:FBM 噪声 + 模板保形海陆比 remap。
  // 跑在合同评估之前(landmass 形状需要 sea level 调整过的高度场)。
  // 每次 reroll 都会**完整**重跑这一段,合同通过后不再叠加。
  //
  // P0-2 de-banding:`softenMapEdges`(极地遮罩)**不**在 reroll 循环里跑 —
  // 旧实现每次 reroll 都叠加一次极地下沉,合同循环最多 4 次,极地被压 4 遍,
  // 把所有极地陆块压成水,陆块被迫集中到中纬条带 → 视觉条带。现在改为
  // 合同通过后只跑一次(见下方 `softenMapEdges` 调用)。
  const runPostTemplate = (
    currentShapeIntent: TemplateShapeIntent | undefined,
    currentTemplateName: HeightmapTemplate,
  ) => {
    for (let i = 0; i < n; i++) {
      if (cells.h[i] <= SEA_LEVEL + 4) continue
      const x = cells.p[i * 2]
      const y = cells.p[i * 2 + 1]
      cells.h[i] += Math.round(fbmHash(x * FBM_SCALE, y * FBM_SCALE, 4) * FBM_AMP)
    }
    adjustSeaLevelTemplateAware(
      cells,
      landRatio,
      currentShapeIntent,
      currentTemplateName,
      realism?.shape?.latitudeShaping,
    )
  }
  runPostTemplate(shapeIntent, templateName)

  // 步骤 1.5：合同评估 + reroll（最多 3 次 attempt）
  const maxAttempts = templateOverride ? 1 : 4  // attempt 0 + 3 rerolls
  let contractAttempt = 0
  let contract = evaluateContract({
    cells, width, height, templateName, shapeIntent: shapeIntent ?? 'continents', explicit: !!templateOverride,
  })
  while (!contract.met && contractAttempt + 1 < maxAttempts) {
    contractAttempt++
    ;({ templateName, shapeIntent } = pickAndApply(contractAttempt))
    runPostTemplate(shapeIntent, templateName)
    contract = evaluateContract({
      cells, width, height, templateName, shapeIntent: shapeIntent ?? 'continents', explicit: !!templateOverride,
    })
  }
  if (!contract.met) {
    console.warn(`[generateHeightmap] template contract NOT met after ${contractAttempt} rerolls: ${contract.reason}`)
  }

  // P0-2 de-banding:`softenMapEdges`(极地遮罩 + 边缘衰减)**只跑一次**。
  // 旧实现把它放在 `runPostTemplate` 里,合同 reroll 循环最多 4 次,
  // 每次都叠加极地下沉 → 极地陆块被压 4 遍 → 陆地被迫集中到中纬条带。
  // 现在合同通过后只跑一次,极地遮罩不再被指数级放大。
  //
  // 同时让极地遮罩线**沿 x 蜿蜒**(P0-2a):用低频 fbm 调制极地下沉强度,
  // 不再是水平直线。`polarMaskFloor`(默认 0.28)可经 `realism.shape` 调节。
  const polarMaskFloor = clamp(realism?.shape?.polarMaskFloor ?? 0.28, 0, 1)
  softenMapEdges(cells, width, height, polarMaskFloor)

  // 合同通过(或放弃 reroll)后,直接进入板块边界地形 + 平滑。
  // **不**再叠加 FBM / 软化边缘:这两步已包含在 runPostTemplate 里,
  // 合同评估和最终输出的应是同一个高度场。Round 2 修复:之前在合同
  // 循环结束后又跑了一次 FBM + softenMapEdges,导致最终图与合同评估
  // 看到的状态不一致,且额外 soften 弱化了大陆骨架。

  // 保留 realism.tectonics 参数兼容旧配置,并用于实际板块边界地形。
  const rangeWidth = clamp(realism?.tectonics?.rangeWidth ?? 3, 1, 8)
  const riftDepth = clamp(realism?.tectonics?.riftDepth ?? 25, 5, 60)

  // 步骤 3.5：板块边界地形。汇聚边界形成山带，张裂边界形成浅裂谷。
  applyPlateBoundaryRelief(cells, width, height, boundaries, plates, { rangeWidth, riftDepth })

  // 步骤 4：轻平滑，保留模板骨架与海岸拓扑。
  // Round 2.6:旧 smooth 会跨海平面平均,把 `compactLandmassErosion`
  // 切出的窄海湾重新抬成陆地,视觉上又回到 bbox 被填满的方块大陆。
  // 这里改成同侧平滑:陆只跟陆平均,水只跟水平均,不改变海陆分类。
  smooth(cells, 1)

  return { shapeIntent, templateName }
}

// ── 工具 ────────────────────────────────────────────
// hash2D / fbm2D / clamp 收敛至 engine/noise.ts 与 engine/math.ts
// （audit-pass2-plan Phase C1/C2）。

/**
 * 边缘 + 极地遮罩。
 *
 * P0-2 de-banding:
 *  - 极地遮罩线**沿 x 蜿蜒**(不再是直线):用低频 fbm 调制极地下沉强度,
 *    让极地衰减带的边界在 x 方向起伏,打破"上下 12% 全是水"的水平条带。
 *  - `polarMaskFloor`(默认 0.28,经 `realism.shape.polarMaskFloor` 调节)
 *    替代硬编码 0.28。
 *  - 该函数**只跑一次**(在合同 reroll 循环之外),避免极地下沉被多次叠加。
 */
// 极地衰减带宽度（与 heightmap-template-aware.ts::POLAR_BAND 保持一致）。
// 注：两处独立声明而非共享 import，因为 template-aware 的 POLAR_BAND 是模块内常量，
// 此处提出常量仅为消除本函数内的硬编码 0.12。修改时请同步两处。
const POLAR_BAND = 0.12

function softenMapEdges(cells: GridCells, width: number, height: number, polarMaskFloor = 0.28): void {
  for (let i = 0; i < cells.length; i++) {
    const x = cells.p[i * 2] / width
    const y = cells.p[i * 2 + 1] / height
    const edgeDist = Math.min(x, y, 1 - x, 1 - y)
    if (edgeDist < 0.05) {
      const factor = clamp(edgeDist / 0.05, 0, 1)
      const shaped = factor * factor
      cells.h[i] = lim(Math.round(cells.h[i] * shaped))
    }

    // 条带修复：边界位置扰动。
    // 低频 fbm（~1.5 个特征横跨整图）计算一次，双重用途：
    //   - bandWarp：小幅度(±0.04)偏移 poleDist → 边界从 y=0.12 水平直线变成蜿蜒曲线
    //   - meander：大幅度(±0.35)调制 polarMaskFloor → 衰减深度起伏
    // 此前 meander 只调深度不调边界，边界仍是直线 → 上下两片整齐水带。现在双管齐下。
    const nv = fbmHash(x * 1.5, y, 3)
    const bandWarp = nv * 0.04
    const poleDist = Math.min(y, 1 - y) + bandWarp
    if (poleDist >= POLAR_BAND) continue
    const polarFactor = clamp(poleDist / POLAR_BAND, 0, 1)
    const meander = 1 + nv * 0.35
    const floor = clamp(polarMaskFloor * meander, 0, 1)
    const shaped = floor + polarFactor * polarFactor * (1 - floor)
    cells.h[i] = lim(Math.round(cells.h[i] * shaped))
  }
}

/**
 * @deprecated Round 2 Stage 2 起被 `adjustSeaLevelTemplateAware`（在
 * `heightmap-template-aware.ts`）替代。
 * 详见 audit-pass2-plan Phase B2：该函数零调用方，已删除。
 * 历史步幅记录见 git blame（step ±10 × 6 attempts = 60 max shift）。
 */

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

/** 平滑处理：Azgaar `lim((h * (fr-1) + mean + add) / fr)` 公式，fr=3。
 *
 * 保持海陆拓扑:每一 pass 先记录原始海陆分类,只用同侧邻居求均值,并把
 * 结果 clamp 回原侧。否则水格会被近岸高陆平均到 SEA_LEVEL 以上,填死
 * 前面宏观海岸重塑切出的海湾,重新形成方块大陆。
 */
function smooth(cells: GridCells, passes: number): void {
  const fr = 3
  for (let pass = 0; pass < passes; pass++) {
    const wasLand = new Uint8Array(cells.length)
    for (let i = 0; i < cells.length; i++) wasLand[i] = cells.h[i] >= SEA_LEVEL ? 1 : 0

    const newH = new Uint8Array(cells.length)
    for (let i = 0; i < cells.length; i++) {
      const neighbors = cells.c[i]
      if (neighbors.length === 0) { newH[i] = cells.h[i]; continue }
      let sum = cells.h[i]
      let count = 1
      for (const n of neighbors) {
        if (wasLand[n] !== wasLand[i]) continue
        sum += cells.h[n]
        count++
      }
      const mean = sum / count
      const newV = lim(Math.round((cells.h[i] * (fr - 1) + mean) / fr))
      newH[i] = wasLand[i] ? Math.max(SEA_LEVEL, newV) : Math.min(SEA_LEVEL - 1, newV)
    }
    cells.h.set(newH)
  }
}
