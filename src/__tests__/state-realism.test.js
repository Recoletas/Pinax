import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { stateMetrics, seedBaseline } from '../services/world-map/engine/realism-metrics'

/**
 * 阶段 3 — state realism 阈值
 *
 * 阶段 0(已存):只 console.log,无阈值
 * 阶段 3(本测试):
 *   - 多源 Dijkstra + 政体偏置 + 文化扩散 落地后,
 *   - connectivityRate 平均 > 0.95(每 state BFS 覆盖 > 95%)
 *   - exclaveCount 总和 < 2(5 个 seed 合计)
 *   - gini 平均 < 0.5(state 面积分布)
 *
 * 阶段 3 不动 capitalCentroidDist —— 阶段 4/5 的自然边界优化后才有意义
 */

const SEEDS = ['realism-s1', 'realism-s3', 'realism-s5', 'realism-s8', 'realism-s12']
const CC_BY_SEED = {
  'realism-s1': 1,
  'realism-s3': 3,
  'realism-s5': 5,
  'realism-s8': 8,
  'realism-s12': 12,
}

/** 极简占位 cells(满足 GridCells 形状,但数据空)— 用于"无主之地"分支 */
function makeEmptyCells() {
  return {
    length: 0,
    p: new Float64Array(0),
    c: [],
    v: [],
    b: new Uint8Array(0),
    h: new Uint8Array(0),
    t: new Int8Array(0),
    f: new Uint16Array(0),
    temp: new Int8Array(0),
    prec: new Uint8Array(0),
    biome: new Uint8Array(0),
    r: new Uint16Array(0),
    fl: new Float32Array(0),
    s: new Float32Array(0),
    pop: new Float32Array(0),
    culture: new Uint16Array(0),
    state: new Uint16Array(0),
    burg: new Uint16Array(0),
    haven: new Uint16Array(0),
    harbor: new Uint8Array(0),
  }
}

describe('state realism baseline', () => {
  it('5 个 seed(跨 cc=1/3/5/8/12)跑 stateMetrics,记录现状', () => {
    const results = seedBaseline(
      SEEDS,
      1500,
      (data) => stateMetrics(data.cells, data.states, data.burgs),
      (seed) => ({ continentCount: CC_BY_SEED[seed] }),
    )
    expect(results).toHaveLength(5)
    for (const { seed, config, metrics } of results) {
      // eslint-disable-next-line no-console
      console.log(`[state ${seed} cc=${config.continentCount}]`, metrics)
      expect(metrics).toBeDefined()
      expect(typeof metrics.connectivityRate).toBe('number')
      expect(typeof metrics.exclaveCount).toBe('number')
      expect(typeof metrics.gini).toBe('number')
      expect(typeof metrics.capitalCentroidDist).toBe('number')
    }
  })

  it('state=0(无主之地):stateMetrics 正确处理,connectivityRate=0', () => {
    const cells = /** @type {any} */ (makeEmptyCells())
    const m = stateMetrics(cells, [], [])
    expect(m.connectivityRate).toBe(0)
    expect(m.exclaveCount).toBe(0)
    expect(m.gini).toBe(0)
    expect(m.capitalCentroidDist).toBe(0)
    // eslint-disable-next-line no-console
    console.log('[state empty]', m)
  })
})

describe('state realism 阶段 3 阈值', () => {
  it('连通率/飞地/Gini 全部达标', () => {
    const results = seedBaseline(
      SEEDS,
      1500,
      (data) => stateMetrics(data.cells, data.states, data.burgs),
      (seed) => ({ continentCount: CC_BY_SEED[seed] }),
    )

    let totalExclave = 0
    let totalConn = 0
    let totalGini = 0
    for (const { seed, config, metrics } of results) {
      // eslint-disable-next-line no-console
      console.log(`[stage3 ${seed} cc=${config.continentCount}]`, metrics)
      totalExclave += metrics.exclaveCount
      totalConn += metrics.connectivityRate
      totalGini += metrics.gini
    }
    const avgConn = totalConn / results.length
    const avgGini = totalGini / results.length

    // 阶段 3 验收阈值
    expect(avgConn).toBeGreaterThan(0.95)
    expect(totalExclave).toBeLessThan(2)
    expect(avgGini).toBeLessThan(0.5)
  })
})
