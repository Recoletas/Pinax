import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * 默认管线验证（Voronoi 种子 + FBM heightmap 重写后）
 *
 * 历史：旧"classic vs azgaar 兼容性"测试在 spec 2026-06-04 中明确被标记
 * 为"重写为默认 cfg 产生连贯地图" — 因为 `realism.level` 字段已移除，
 * 管线统一为 FBM + per-Voronoi 阈值（azgaar 风格）。
 */
describe('默认管线', () => {
  it('不传 realism 时仍产出有效地图', () => {
    const data = generateMap({ seed: 'compat-1', pointCount: 1000 })
    expect(data.cells.tectonic).toBeDefined()
    expect(data.cells.tectonic.plateId.length).toBe(data.cells.length)
    // h 必须同时有水域和陆域(否则后续气候/河流会空跑)
    let land = 0, water = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] >= 20) land++
      else water++
    }
    expect(land).toBeGreaterThan(0)
    expect(water).toBeGreaterThan(0)
    // 海岸线必须被提取出来
    expect(data.coastlines).toBeDefined()
    expect(data.coastlines.length).toBeGreaterThan(0)
  })

  it('plateCount=2 与 plateCount=6 走同一管线（无 level 分支）', () => {
    const a = generateMap({ seed: 'compat-1', pointCount: 1000, plateCount: 2 })
    const b = generateMap({ seed: 'compat-1', pointCount: 1000, plateCount: 6 })
    expect(a.cells.h.length).toBe(b.cells.h.length)
    expect(a.cells.tectonic.plateId.length).toBe(b.cells.tectonic.plateId.length)
    const aMax = Math.max(...a.cells.tectonic.plateId)
    const bMax = Math.max(...b.cells.tectonic.plateId)
    expect(aMax).toBeLessThan(2)
    expect(bMax).toBeLessThan(6)
  })
})
