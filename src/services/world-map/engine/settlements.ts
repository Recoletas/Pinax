/**
 * 城市/首都评分与放置 (阶段 2)
 *
 * 纯函数模块 — 接受 cells,返回标量评分,不做任何修改。
 * 4 轮放置由 nations.ts 的 generateBurgs 编排,这里只负责"打分"。
 *
 * 信号来源(均已就绪于 burg 阶段):
 *   - cells.s        : rankCells 写的 0~100 适宜度
 *   - cells.r        : 河流 id
 *   - cells.fl       : 流量(浮点)
 *   - cells.harbor   : 相邻水域数
 *   - cells.haven    : 最近水域 cell id
 *   - cells.portQuality (features.ts 写入的 0~100 端口质量)
 *   - cells.biome    : BIOMES[i].habitability 用于农业
 *   - cells.h, cells.t: 高度与到海岸距离
 *   - cells.f        : feature id(可查 features[type])
 */

import type { GridCells, Feature, BiomeDef } from './types'
import { BIOMES } from './climate'

const SEA_LEVEL = 20
const POLAR_NORTH = 0.85
const POLAR_SOUTH = 0.15

const DESERT_BIOMES = new Set<number>([1, 2]) // 热带沙漠、寒带荒漠
const HOSTILE_BIOMES = new Set<number>([9, 10, 11]) // 针叶林、苔原、冰川
const HABITABLE_BIOMES = new Set<number>([3, 4, 5, 6, 7, 8]) // 草原~雨林

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** 0..1:BIOMES[id].habitability/100。biome 缺失返回 0。 */
export function habitabilityOfBiome(biomeId: number): number {
  const biome: BiomeDef | undefined = BIOMES[biomeId]
  if (!biome) return 0
  return clamp(biome.habitability / 100, 0, 1)
}

/** 极端环境罚分(0..0.7):极地/高山/沙漠/孤岛 */
export function extremePenalty(cells: GridCells, i: number, height: number): number {
  if (height <= 0) return 0
  // 1. 极地
  const yRatio = cells.p[i * 2 + 1] / height
  if (yRatio > POLAR_NORTH || yRatio < POLAR_SOUTH) {
    return 0.7
  }
  // 2. 高山
  if (cells.h[i] > 70) {
    return 0.5
  }
  // 3. 沙漠
  const biomeId = cells.biome[i]
  if (DESERT_BIOMES.has(biomeId)) {
    return 0.4
  }
  // 4. 孤岛:相邻陆地 ≤ 2 且非海岸(t > 2) — 实际很少触发,先保留 hook
  return 0
}

/** 0..1:读 cells.portQuality(已在 features.ts 预计算) */
export function portQualityValue(cells: GridCells, i: number): number {
  if (!cells.portQuality) return 0
  return cells.portQuality[i] / 100
}

/** 是否靠近海峡(细长水道):harbor 计数 ≥ 3 近似为"被水域包围" */
export function isNearStrait(cells: GridCells, i: number): boolean {
  return cells.harbor[i] >= 3
}

/** 中心性:在陆块内越深(t 越大)分越高(限 1.0) */
export function centrality(cells: GridCells, i: number): number {
  const t = cells.t[i]
  if (t <= 0) return 0
  return clamp(t / 8, 0, 1)
}

/** 河流汇流:cell 在河道上，且至少 2 个不相邻方向的邻居也含河道。 */
export function isRiverConfluence(cells: GridCells, i: number): boolean {
  if (!cells.r || cells.r[i] === 0) return false
  const riverNeighbors: number[] = []
  const nbs = cells.c[i]
  for (let k = 0; k < nbs.length; k++) {
    if (cells.r[nbs[k]] > 0) riverNeighbors.push(nbs[k])
  }
  if (riverNeighbors.length < 2) return false

  const cx = cells.p[i * 2]
  const cy = cells.p[i * 2 + 1]
  for (let a = 0; a < riverNeighbors.length; a++) {
    const na = riverNeighbors[a]
    const ax = cells.p[na * 2] - cx
    const ay = cells.p[na * 2 + 1] - cy
    const aLen = Math.hypot(ax, ay) || 1
    for (let b = a + 1; b < riverNeighbors.length; b++) {
      const nb = riverNeighbors[b]
      const bx = cells.p[nb * 2] - cx
      const by = cells.p[nb * 2 + 1] - cy
      const bLen = Math.hypot(bx, by) || 1
      const dot = (ax * bx + ay * by) / (aLen * bLen)
      if (dot < 0.35) return true
    }
  }
  return false
}

/** 无 clamp 的原始 settlementScore(用于 ranking — 高分 cell 应胜出低分 cell,不能被 clamp 抹平)
 *  返回值可能 > 1(端口+河流+好 habitability 的 cell)。
 */
export function settlementScoreRaw(
  cells: GridCells,
  i: number,
  port: boolean,
  riverConfluence: boolean,
  height: number,
): number {
  const s = (cells.s[i] ?? 0) / 100
  const river = riverConfluence ? 1.0 : (cells.r[i] > 0 ? 0.4 : 0)
  const harbor = port ? portQualityValue(cells, i) : 0
  const coastPlain = port && cells.h[i] < 35 ? 0.6 : 0
  const transport = (cells.harbor[i] >= 2 ? 0.5 : 0) + (isNearStrait(cells, i) ? 0.4 : 0)
  const agriculture = habitabilityOfBiome(cells.biome[i])
  const penalty = extremePenalty(cells, i, height)
  return (
    s * 1.0
    + river * 1.5
    + harbor * 1.0
    + coastPlain * 0.8
    + transport * 0.6
    + agriculture * 0.7
    - penalty * 2.0
  )
}

/** 0..1:cell 适合人类聚落的综合分(clamp 后,供外部使用)。 */
export function settlementScore(
  cells: GridCells,
  i: number,
  port: boolean,
  riverConfluence: boolean,
  height: number,
): number {
  return clamp(
    settlementScoreRaw(cells, i, port, riverConfluence, height),
    0, 1,
  )
}

/** 首都分(ranking 用,无 clamp)
 *  - 用 raw 基础分(不抹平端口 vs 河道内陆的差异)
 *  - 中心性偏置 0.3(plan)
 *  - 距离现有首都"够远"由 generateBurgs 的 isTooClose 控
 */
export function capitalScore(
  cells: GridCells,
  i: number,
  stateCount: number,
  placedCapitals: number[],
  height: number,
): number {
  void stateCount
  void placedCapitals
  const port = cells.harbor[i] > 0
  const base = settlementScoreRaw(cells, i, port, isRiverConfluence(cells, i), height)
  return base * 0.7 + centrality(cells, i) * 0.3
}

// ── 自适应 spacing ────────────────────────────────────

/** biome 密度(每 100 个 cell 期望 burg 数),用于 spacing = sqrt(area * 100 / (density * n)) */
export function densityPerHundred(biomeId: number, archipelagic: boolean): number {
  if (HOSTILE_BIOMES.has(biomeId) || DESERT_BIOMES.has(biomeId)) return 0.1
  if (archipelagic) return 0.8
  return 0.5
}

/** 估算"地图是否群岛":最大陆块 / 总陆地 < 0.7 */
export function isArchipelagic(cells: GridCells): boolean {
  const n = cells.length
  const seen = new Uint8Array(n)
  let totalLand = 0
  let maxLand = 0
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
    totalLand += size
    if (size > maxLand) maxLand = size
  }
  if (totalLand === 0) return false
  return maxLand / totalLand < 0.7
}

/** 像素单位 spacing(基于 area / (density * n) 反推) */
export function adaptiveSpacing(
  width: number,
  height: number,
  numCells: number,
  biomeId: number,
  archipelagic: boolean,
): number {
  const density = densityPerHundred(biomeId, archipelagic)
  if (density <= 0) return Math.sqrt(width * height) // 兜底
  const area = width * height
  // target_burgs = density * numCells / 100
  // spacing = sqrt(area / target_burgs)
  return Math.sqrt((area * 100) / (density * numCells))
}

/** 河流汇流加速判定(批量预算用,O(n) 一遍) */
export function precomputeRiverConfluence(cells: GridCells): Uint8Array {
  const n = cells.length
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (isRiverConfluence(cells, i)) mask[i] = 1
  }
  return mask
}

// 显式 re-export Feature(供 generateBurgs 用,若需要) — 占位
export type { Feature }
