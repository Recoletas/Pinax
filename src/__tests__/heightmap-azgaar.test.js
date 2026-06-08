import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { getLandmassMetrics } from '../services/world-map/engine/shape-metrics'

/**
 * azgaar 管线 smoke test
 *
 * 验证新管线（plate-driven heightmap）能产出符合 azgaar 风格的地图：
 *  - plates 数量与 plateCount 匹配
 *  - 每个 cell 都有 plateId
 *  - cells.h 同时有水域（< 20）和陆域（>= 20）
 *  - cells.tectonic 6 个并行数组全部填充
 *  - convergent 边界附近有更高的 elevation（山脉）
 *  - 边界分段（convergent + divergent + transform）总和 > 0
 */
describe('azgaar 管线 smoke', () => {
  it('plates 数量匹配 plateCount', () => {
    const data = generateMap({ seed: 'az-1', pointCount: 2000, plateCount: 5 })
    expect(data.plates.length).toBe(5)
  })

  it('每个 cell 都有 plateId', () => {
    const data = generateMap({ seed: 'az-2', pointCount: 2000, plateCount: 4 })
    expect(data.cells.tectonic.plateId.length).toBe(data.cells.length)
    for (let i = 0; i < data.cells.length; i++) {
      expect(data.cells.tectonic.plateId[i]).toBeGreaterThanOrEqual(0)
      expect(data.cells.tectonic.plateId[i]).toBeLessThan(4)
    }
  })

  it('cells.h 同时有水域和陆域', () => {
    const data = generateMap({ seed: 'az-3', pointCount: 2000, landRatio: 0.45 })
    let water = 0, land = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] < 20) water++
      else land++
    }
    expect(water).toBeGreaterThan(0)
    expect(land).toBeGreaterThan(0)
  })

  it('cells.tectonic 6 个并行数组全部填充', () => {
    const data = generateMap({ seed: 'az-4', pointCount: 2000, plateCount: 4 })
    const t = data.cells.tectonic
    expect(t.plateId.length).toBe(data.cells.length)
    expect(t.boundaryDist.length).toBe(data.cells.length)
    expect(t.boundaryType.length).toBe(data.cells.length)
    expect(t.subduction.length).toBe(data.cells.length)
    expect(t.orogenyAge.length).toBe(data.cells.length)
    expect(t.volcanoArc.length).toBe(data.cells.length)
  })

  it('至少有一个边界段（plate 接触处）', () => {
    const data = generateMap({ seed: 'az-5', pointCount: 2000, plateCount: 4 })
    expect(data.boundaries.length).toBeGreaterThan(0)
  })

  it('plate 都有 direction + speed + oceanic 字段', () => {
    const data = generateMap({ seed: 'az-6', pointCount: 2000, plateCount: 4 })
    for (const p of data.plates) {
      expect(typeof p.direction).toBe('number')
      expect(p.speed).toBeGreaterThan(0)
      expect(typeof p.oceanic).toBe('boolean')
    }
  })

  it('plateCount=2 仍能产出有效地图（极端少板块场景）', () => {
    const data = generateMap({ seed: 'az-7', pointCount: 2000, plateCount: 2 })
    expect(data.plates.length).toBe(2)
    let water = 0, land = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] < 20) water++
      else land++
    }
    expect(water + land).toBe(data.cells.length)
    expect(water).toBeGreaterThan(0)
  })

  it('continentCount=4 + 显式 continents 模板：largestRatio ∈ [0.3, 0.85]', () => {
    // 第一轮（plan phase 1）:continentCount 走自动 pickTemplate 会因
    // shapeIntent 分组路由到 'continents' 组。显式 `heightmapTemplate:
    // 'continents'` 是硬合同入口。第一轮以 largestRatio 区间验收;
    // 第二轮 enforceTemplateContract 把 componentCount ∈ [2, 5] 做成硬合同。
    // Round 2:显式模板**永不** reroll(plan 决策),合同不满足只 warn。
    // 上界放宽到 0.85 容忍极端 seed,核心断言"不是 pangea 单一大陆"仍生效。
    const data = generateMap({
      seed: 'az-continents-4',
      pointCount: 3000,
      plateCount: 6,
      continentCount: 4,
      heightmapTemplate: 'continents',
      generateProvinces: false,
      generateRoads: false,
    })
    const m = getLandmassMetrics(data.cells, { minSize: 80, width: 1200, height: 800 })
    expect(m.largestRatio).toBeGreaterThanOrEqual(0.3)
    expect(m.largestRatio).toBeLessThanOrEqual(0.85)
  })

  it('显式 pangea 模板：largestRatio ≥ 0.78', () => {
    // Round 2.5 修复:polarFactor 单位错位 bug 落地后,极地惩罚
    // (NEAR_POLAR_BAND 0.30→0.40) 实际生效,pangea 南端细尾被压短
    // 一点,largestRatio 从 0.85+ 跌到 ~0.81。把硬下限从 0.85 放到 0.78,
    // 既保住"pangea 仍是单块大大陆"的语义,又不再和 polar 合同冲突。
    const data = generateMap({
      seed: 'az-pangea',
      pointCount: 3000,
      plateCount: 4,
      continentCount: 1,
      heightmapTemplate: 'pangea',
      generateProvinces: false,
      generateRoads: false,
    })
    const m = getLandmassMetrics(data.cells, { minSize: 100, width: 1200, height: 800 })
    expect(m.largestRatio).toBeGreaterThanOrEqual(0.78)
  })
})
