/**
 * 模板合同评估 + reroll（Round 2 Stage 5）
 *
 * 合同定义:14 模板 × 形状合同。每个 template 有其目标几何(largestRatio /
 * componentCount / 中心水域 / 极地陆地带等)。
 *
 * 评估:用 `getLandmassMetrics` 算 largestRatio / componentCount;
 *      中心水域 / 极地陆地带用 cell 坐标直查。
 *
 * reroll:不满足时,在 `TEMPLATE_GROUPS[intent]` 组内换其它模板。
 *  - 显式模板**永不** reroll（合同不满足只 warn + metric, 不偷换）
 *  - 自动模板 reroll 用 sub-RNG（不影响主世界 determinism）
 *  - 最多 reroll 3 次;3 次都不满足则接受当前结果 + warn log
 *
 * 调用方:`generateHeightmap` 内部、applyTemplate 完成后
 */
import type { GridCells, HeightmapTemplate } from './types'
import { getLandmassMetrics, type LandmassMetrics } from './shape-metrics'
import { getLandmassMetrics as getLandmassMetrics2 } from './shape-metrics'
import { parseTemplate, type TemplateOp } from './parseTemplate'
import {
  HEIGHTMAP_TEMPLATES,
  TEMPLATE_GROUPS,
  pickTemplateInGroup,
  type TemplateShapeIntent,
} from './heightmap-templates'

export interface ContractResult {
  met: boolean
  reason: string
  metrics: LandmassMetrics
}

export interface ContractInput {
  cells: GridCells
  width: number
  height: number
  templateName: HeightmapTemplate
  shapeIntent: TemplateShapeIntent
  explicit: boolean
  ops?: TemplateOp[]  // 解析后的模板 ops(可选,避免重复 parse)
}

const MED_CENTER_X_FRAC = 0.30  // 中心水域占 x 的中心 30%
const MED_CENTER_Y_FRAC = 0.30  // 中心水域占 y 的中心 30%
const MED_CENTER_WATER_RATIO = 0.50
const MED_POLAR_BAND_Y = 0.30  // 上下 30% 为陆地带边界

/**
 * 评估指定模板的合同。`cells.h` 是 applyTemplate 完成后的状态。
 * 不修改 cells,只读。
 */
export function evaluateContract(input: ContractInput): ContractResult {
  const { cells, width, height, templateName, ops } = input
  const metrics = getLandmassMetrics2(cells, { minSize: 50, width, height })
  const templateOps = ops ?? parseTemplate(HEIGHTMAP_TEMPLATES[templateName].template)

  const check = checkContract(templateName, templateOps, metrics, cells, width, height)
  return { met: check.met, reason: check.reason, metrics }
}

interface CheckResult { met: boolean; reason: string }

function checkContract(
  templateName: HeightmapTemplate,
  ops: TemplateOp[],
  metrics: LandmassMetrics,
  cells: GridCells,
  width: number,
  height: number,
): CheckResult {
  switch (templateName) {
    case 'pangea':
      return pangeaContract(metrics)
    case 'continents':
      return continentsContract(metrics)
    case 'oldWorld':
      return oldWorldContract(metrics, ops)
    case 'mediterranean':
      return mediterraneanContract(metrics, cells, width, height)
    case 'archipelago':
      return archipelagoContract(metrics)
    case 'shattered':
      return shatteredContract(metrics)
    case 'highIsland':
      return highIslandContract(metrics)
    case 'lowIsland':
      return lowIslandContract(metrics)
    case 'atoll':
      return atollContract(metrics)
    case 'peninsula':
      return peninsulaContract(metrics)
    case 'isthmus':
      return isthmusContract(metrics)
    case 'volcano':
      return volcanoContract(metrics)
    case 'taklamakan':
      return taklamakanContract(metrics)
    case 'fractious':
      return fractiousContract(metrics)
    default:
      return { met: true, reason: `unknown template ${templateName}` }
  }
}

// ── 14 模板合同 ──────────────────────────────────────────

function pangeaContract(m: LandmassMetrics): CheckResult {
  if (m.largestRatio < 0.70) return { met: false, reason: `pangea largestRatio=${m.largestRatio.toFixed(3)} < 0.70` }
  if (m.componentCount > 3) return { met: false, reason: `pangea componentCount=${m.componentCount} > 3` }
  return { met: true, reason: 'pangea single dominant landmass' }
}

function continentsContract(m: LandmassMetrics): CheckResult {
  if (m.componentCount < 2 || m.componentCount > 5) {
    return { met: false, reason: `continents componentCount=${m.componentCount} not in [2, 5]` }
  }
  if (m.largestRatio > 0.65) return { met: false, reason: `continents largestRatio=${m.largestRatio.toFixed(3)} > 0.65` }
  return { met: true, reason: 'continents 2-5 distinct landmasses, no single dominant' }
}

function oldWorldContract(m: LandmassMetrics, _ops: TemplateOp[]): CheckResult {
  if (m.largestRatio < 0.35 || m.largestRatio > 0.65) {
    return { met: false, reason: `oldWorld largestRatio=${m.largestRatio.toFixed(3)} not in [0.35, 0.65]` }
  }
  return { met: true, reason: 'oldWorld split with dominant but not overwhelming' }
}

function mediterraneanContract(m: LandmassMetrics, cells: GridCells, width: number, height: number): CheckResult {
  // 1. 中心 30%×30% 区域水域 cell > 50%（不能全填死）
  const xLo = width * (0.5 - MED_CENTER_X_FRAC / 2)
  const xHi = width * (0.5 + MED_CENTER_X_FRAC / 2)
  const yLo = height * (0.5 - MED_CENTER_Y_FRAC / 2)
  const yHi = height * (0.5 + MED_CENTER_Y_FRAC / 2)
  let centerTotal = 0, centerWater = 0
  for (let i = 0; i < cells.length; i++) {
    const x = cells.p[i * 2], y = cells.p[i * 2 + 1]
    if (x < xLo || x > xHi || y < yLo || y > yHi) continue
    centerTotal++
    if (cells.h[i] < 20) centerWater++
  }
  const centerWaterRatio = centerTotal > 0 ? centerWater / centerTotal : 0
  if (centerWaterRatio < MED_CENTER_WATER_RATIO) {
    return { met: false, reason: `mediterranean center water=${centerWaterRatio.toFixed(3)} < ${MED_CENTER_WATER_RATIO}` }
  }
  // 2. 上下陆地带存在(y < 0.3 或 y > 0.7 的陆地 cell > 0)
  let polarBandLand = 0
  for (let i = 0; i < cells.length; i++) {
    const y = cells.p[i * 2 + 1]
    if (cells.h[i] < 20) continue
    if (y < height * MED_POLAR_BAND_Y || y > height * (1 - MED_POLAR_BAND_Y)) polarBandLand++
  }
  if (polarBandLand === 0) return { met: false, reason: 'mediterranean no polar land band' }
  // 3. largestRatio ≤ 0.6
  if (m.largestRatio > 0.60) return { met: false, reason: `mediterranean largestRatio=${m.largestRatio.toFixed(3)} > 0.60` }
  return { met: true, reason: 'mediterranean center water + polar land + no single dominant' }
}

function archipelagoContract(m: LandmassMetrics): CheckResult {
  if (m.componentCount < 3) return { met: false, reason: `archipelago componentCount=${m.componentCount} < 3` }
  if (m.largestRatio > 0.35) return { met: false, reason: `archipelago largestRatio=${m.largestRatio.toFixed(3)} > 0.35` }
  return { met: true, reason: 'archipelago multi-island, no dominant' }
}

function shatteredContract(m: LandmassMetrics): CheckResult {
  if (m.componentCount < 5) return { met: false, reason: `shattered componentCount=${m.componentCount} < 5` }
  if (m.largestRatio > 0.25) return { met: false, reason: `shattered largestRatio=${m.largestRatio.toFixed(3)} > 0.25` }
  return { met: true, reason: 'shattered many small fragments' }
}

function highIslandContract(m: LandmassMetrics): CheckResult {
  if (m.componentCount < 3) return { met: false, reason: `highIsland componentCount=${m.componentCount} < 3` }
  if (m.largestRatio > 0.45) return { met: false, reason: `highIsland largestRatio=${m.largestRatio.toFixed(3)} > 0.45` }
  return { met: true, reason: 'highIsland multi-island with one slightly larger' }
}

function lowIslandContract(m: LandmassMetrics): CheckResult {
  if (m.componentCount < 3) return { met: false, reason: `lowIsland componentCount=${m.componentCount} < 3` }
  if (m.largestRatio > 0.30) return { met: false, reason: `lowIsland largestRatio=${m.largestRatio.toFixed(3)} > 0.30` }
  return { met: true, reason: 'lowIsland spread small islands' }
}

function atollContract(m: LandmassMetrics): CheckResult {
  if (m.componentCount < 4) return { met: false, reason: `atoll componentCount=${m.componentCount} < 4` }
  if (m.largestRatio > 0.35) return { met: false, reason: `atoll largestRatio=${m.largestRatio.toFixed(3)} > 0.35` }
  return { met: true, reason: 'atoll multi-tiny-island' }
}

function peninsulaContract(m: LandmassMetrics): CheckResult {
  if (m.largestRatio < 0.40) return { met: false, reason: `peninsula largestRatio=${m.largestRatio.toFixed(3)} < 0.40` }
  if (m.largestRatio > 0.995) return { met: false, reason: `peninsula largestRatio=${m.largestRatio.toFixed(3)} > 0.995` }
  return { met: true, reason: 'peninsula single dominant landmass with coastal articulation' }
}

function isthmusContract(m: LandmassMetrics): CheckResult {
  if (m.largestRatio < 0.50) return { met: false, reason: `isthmus largestRatio=${m.largestRatio.toFixed(3)} < 0.50` }
  if (m.largestRatio > 0.70) return { met: false, reason: `isthmus largestRatio=${m.largestRatio.toFixed(3)} > 0.70` }
  if (m.secondRatio < 0.05 || m.secondRatio > 0.20) {
    return { met: false, reason: `isthmus secondRatio=${m.secondRatio.toFixed(3)} not in [0.05, 0.20]` }
  }
  return { met: true, reason: 'isthmus main landmass + secondary narrow strip' }
}

function volcanoContract(m: LandmassMetrics): CheckResult {
  if (m.largestRatio < 0.15) return { met: false, reason: `volcano largestRatio=${m.largestRatio.toFixed(3)} < 0.15` }
  if (m.largestRatio > 0.55) return { met: false, reason: `volcano largestRatio=${m.largestRatio.toFixed(3)} > 0.55` }
  return { met: true, reason: 'volcano central island moderate size' }
}

function taklamakanContract(m: LandmassMetrics): CheckResult {
  if (m.largestRatio < 0.55) return { met: false, reason: `taklamakan largestRatio=${m.largestRatio.toFixed(3)} < 0.55` }
  return { met: true, reason: 'taklamakan desertified large landmass' }
}

function fractiousContract(m: LandmassMetrics): CheckResult {
  if (m.largestRatio > 0.50) return { met: false, reason: `fractious largestRatio=${m.largestRatio.toFixed(3)} > 0.50` }
  return { met: true, reason: 'fractious broken-up land' }
}

// ── Reroll 编排 ──────────────────────────────────────────

export interface RerollResult {
  templateName: HeightmapTemplate
  attempts: number
  met: boolean
  lastReason: string
}

/**
 * 在 `TEMPLATE_GROUPS[intent]` 组内 reroll 最多 `maxAttempts` 次。
 *
 * 不满足的 contract 会触发重选(consume templateRng),回滚 cells.h 到
 * applyTemplate 之前的 snapshot,再调 applyTemplate 一次。
 *
 * 显式模板的 contract 不满足时 **不** reroll(只 warn)。
 *
 * @param cells          applyTemplate 后的 cells(会被修改 / 回滚)
 * @param heightSnapshot applyTemplate 之前的 cells.h snapshot
 * @param width          canvas width
 * @param height         canvas height
 * @param intent         形状 intent(决定 TEMPLATE_GROUPS 用哪个组)
 * @param explicit       是否显式模板
 * @param startTemplate  初始模板名
 * @param landRatio      landRatio(供 pickTemplateInGroup 加权)
 * @param templateRngAt  函数 (attempt) => templateRng,生成对应 attempt 的 sub-RNG
 * @param applyTpl       applyTemplate 函数(避免循环依赖)
 * @param maxAttempts    最大 reroll 次数(默认 3)
 */
export function rerollUntilContractMet(args: {
  cells: GridCells
  heightSnapshot: Uint8Array
  width: number
  height: number
  intent: TemplateShapeIntent
  explicit: boolean
  startTemplate: HeightmapTemplate
  templateRngAt: (attempt: number) => () => number
  applyTpl: (cells: GridCells, width: number, height: number, templateName: HeightmapTemplate, templateRng: () => number) => void
  maxAttempts?: number
}): RerollResult {
  const max = args.maxAttempts ?? 3
  let templateName = args.startTemplate
  let attempts = 0
  let lastReason = ''
  let met = true

  while (attempts < max) {
    const contract = evaluateContract({
      cells: args.cells,
      width: args.width,
      height: args.height,
      templateName,
      shapeIntent: args.intent,
      explicit: args.explicit,
    })
    if (contract.met) {
      return { templateName, attempts, met: true, lastReason: contract.reason }
    }
    lastReason = contract.reason
    // 显式模板:永不 reroll,只记录原因
    if (args.explicit) {
      console.warn(`[enforceTemplateContract] explicit=${templateName} contract NOT met: ${contract.reason}`)
      return { templateName, attempts, met: false, lastReason }
    }
    // 自动模板:reroll 选同组内其它模板
    attempts++
    args.cells.h.set(args.heightSnapshot)
    const next = pickTemplateInGroup(args.intent, 0.45, args.templateRngAt(attempts))
    if (next === templateName) {
      // 同组内唯一(例 'single' 只有 pangea)— 没有 reroll 余地
      console.warn(`[enforceTemplateContract] intent=${args.intent} only has ${templateName}; no reroll candidate`)
      return { templateName, attempts, met: false, lastReason }
    }
    templateName = next
    const rng = args.templateRngAt(attempts)
    args.applyTpl(args.cells, args.width, args.height, templateName, rng)
  }
  // 3 次都失败
  console.warn(`[enforceTemplateContract] ${attempts} rerolls exhausted, accepting ${templateName}: ${lastReason}`)
  return { templateName, attempts, met: false, lastReason }
}
