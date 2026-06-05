import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * Heightmap 质量验收（template-based 管线）
 *
 * 这些不是性能/烟雾测试 — 测的是 *geometric invariants* 和 *distributional
 * sanity*。改 heightmap 算法或模板应该挂。改 FBM 系数 / 阈值需要更新阈值。
 *
 * 之前 FBM 版本的 6 个测试已废弃（bimodality / no-rim / cc→coastline 计数
 * 是 FBM 假设，不适用于 template 路径）。保留这 3 个对两条管线都成立的
 * invariant。
 */

describe('Heightmap 质量', () => {
  it('deterministic：同 seed 两次 h 完全相同', () => {
    const a = generateMap({ seed: 'q-determin', pointCount: 1500 })
    const b = generateMap({ seed: 'q-determin', pointCount: 1500 })
    for (let i = 0; i < a.cells.length; i++) {
      expect(a.cells.h[i]).toBe(b.cells.h[i])
    }
  })

  it('landRatio 准确：±5%', () => {
    const data = generateMap({ seed: 'q-ratio', pointCount: 3000, landRatio: 0.45 })
    let land = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] >= 20) land++
    }
    const actual = land / data.cells.length
    expect(actual).toBeGreaterThan(0.40)
    expect(actual).toBeLessThan(0.50)
  })

  it('板块边界存在：convergent 边界 cell 数量 > 0', () => {
    // 注：旧 template 路径下，模板自身的 `Range` 操作在随机位置放山，
    // 不一定对齐板块边界。所以这里只测"边界有被分类"，不测山的分布。
    const data = generateMap({ seed: 'q-tectonic', pointCount: 3000, plateCount: 6 })
    const t = data.cells.tectonic
    let convergent = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (t.boundaryType[i] === 1) convergent++
    }
    expect(convergent).toBeGreaterThan(0)
  })
})
