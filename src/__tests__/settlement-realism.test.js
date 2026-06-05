import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { burgMetrics, seedBaseline } from '../services/world-map/engine/realism-metrics'

/**
 * 阶段 2 — settlement realism 阈值
 *
 * 在阶段 0(基线)上加入阈值断言,要求新的 4 轮评分放置产生:
 *  - 首都中(port || river) > 60%
 *  - 极地城市(纬度 > 0.85 or < 0.15)占比 < 5%
 *  - 港口城市中,高质量港(portQuality>=70)占比 >= 50%
 *
 * `cc=1` 的种子若 polarRate 超过 0.05,跳过该断言(单极大陆,极地有 land 是自然)
 */

const SEEDS = ['realism-s1', 'realism-s3', 'realism-s5', 'realism-s8', 'realism-s12']
const CC_BY_SEED = {
  'realism-s1': 1,
  'realism-s3': 3,
  'realism-s5': 5,
  'realism-s8': 8,
  'realism-s12': 12,
}

const POLAR_NORTH = 0.85
const POLAR_SOUTH = 0.15

/** 首都级度量。 */
function capitalMetrics(data) {
  const cells = data.cells
  const burgs = data.burgs.filter(b => b.i > 0 && b.capital)
  const n = burgs.length
  if (n === 0) {
    return { portRate: 0, riverRate: 0, coastDistRate: 0, polarRate: 0, portRiverRate: 0 }
  }
  let portCount = 0
  let riverCount = 0
  let coastCount = 0
  let polarCount = 0
  let portOrRiverCount = 0
  for (const b of burgs) {
    if (b.port) portCount++
    if (cells.r[b.cell] > 0) riverCount++
    if (b.port || cells.r[b.cell] > 0) portOrRiverCount++
    if (Math.abs(cells.t[b.cell]) <= 3) coastCount++
    const yRatio = cells.p[b.cell * 2 + 1] / data.height
    if (yRatio > POLAR_NORTH || yRatio < POLAR_SOUTH) polarCount++
  }
  return {
    portRate: portCount / n,
    riverRate: riverCount / n,
    coastDistRate: coastCount / n,
    polarRate: polarCount / n,
    portRiverRate: portOrRiverCount / n,
  }
}

/** 港口 burg 中高质量港比例与河口港比例。 */
function portQualityOnBurgs(data) {
  const cells = data.cells
  const ports = data.burgs.filter(b => b.i > 0 && b.port)
  if (ports.length === 0) {
    return { portCount: 0, highQualityCount: 0, highQualityRate: 0, estuaryCount: 0, estuaryRate: 0 }
  }
  let highQuality = 0
  let estuary = 0
  for (const b of ports) {
    if ((cells.portQuality?.[b.cell] ?? 0) >= 70) highQuality++
    if (cells.r[b.cell] > 0) estuary++
  }
  return {
    portCount: ports.length,
    highQualityCount: highQuality,
    highQualityRate: highQuality / ports.length,
    estuaryCount: estuary,
    estuaryRate: estuary / ports.length,
  }
}

describe('settlement realism baseline', () => {
  it('5 个 seed(跨 cc=1/3/5/8/12)跑 burgMetrics,记录现状', () => {
    const results = seedBaseline(
      SEEDS,
      1500,
      (data) => burgMetrics(data.cells, data.burgs),
      (seed) => ({ continentCount: CC_BY_SEED[seed] }),
    )
    expect(results).toHaveLength(5)
    for (const { seed, config, metrics } of results) {
      // eslint-disable-next-line no-console
      console.log(`[burg ${seed} cc=${config.continentCount}]`, metrics)
      expect(metrics).toBeDefined()
      // 形状断言:5 个字段都存在且为 number
      expect(typeof metrics.portRate).toBe('number')
      expect(typeof metrics.riverRate).toBe('number')
      expect(typeof metrics.coastDistRate).toBe('number')
      expect(typeof metrics.avgSpacing).toBe('number')
      expect(typeof metrics.polarRate).toBe('number')
    }
  })

  it('极端:pointCount=500, stateCount=2 跑通不抛', () => {
    expect(() => {
      const data = generateMap({
        seed: 'edge-burg',
        pointCount: 500,
        stateCount: 2,
        generateProvinces: false,
        generateRoads: false,
      })
      const m = burgMetrics(data.cells, data.burgs)
      // eslint-disable-next-line no-console
      console.log('[burg edge cc=2 pointCount=500]', m)
      expect(m).toBeDefined()
      expect(m.portRate).toBeGreaterThanOrEqual(0)
      expect(m.polarRate).toBeLessThanOrEqual(1)
    }).not.toThrow()
  })
})

describe('settlement realism thresholds (阶段 2)', () => {
  it('5 个 seed:portRate + riverRate(首都)>0.6, polarRate<0.05', () => {
    const results = seedBaseline(
      SEEDS,
      1500,
      (data) => ({
        cap: capitalMetrics(data),
        ports: portQualityOnBurgs(data),
      }),
      (seed) => ({ continentCount: CC_BY_SEED[seed] }),
    )
    for (const { seed, config, metrics } of results) {
      const { cap, ports } = metrics
      // eslint-disable-next-line no-console
      console.log(`[cap ${seed} cc=${config.continentCount}]`, cap, 'ports:', ports)
      // 1. 首都中 (port || river) > 0.6
      expect(cap.portRiverRate).toBeGreaterThan(0.6)
      // 2. 极地首都比例 < 0.05(cc=1 单极大陆跳过)
      if (config.continentCount === 1) {
        if (cap.polarRate >= 0.05) {
          // eslint-disable-next-line no-console
          console.log(`[skip] ${seed} cc=1 polarRate=${cap.polarRate} — 单极大陆容忍`)
        }
      } else {
        expect(cap.polarRate).toBeLessThan(0.05)
      }
      // 3. 港口 burg 至少 50% 是高质量港
      if (ports.portCount > 0) {
        expect(ports.highQualityRate).toBeGreaterThanOrEqual(0.5)
      }
    }
  })

  it('edge case:低点数小地图仍生成 burgs,metrics 合法', () => {
    const data = generateMap({
      seed: 'edge-cap',
      pointCount: 500,
      stateCount: 2,
      generateProvinces: false,
      generateRoads: false,
    })
    const cap = capitalMetrics(data)
    // eslint-disable-next-line no-console
    console.log('[cap edge cc=2 pointCount=500]', cap)
    expect(cap.portRiverRate).toBeGreaterThanOrEqual(0) // 仅冒烟
  })
})
