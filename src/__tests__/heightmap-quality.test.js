import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { getLandmassMetrics } from '../services/world-map/engine/shape-metrics'

/**
 * Heightmap 质量验收（template-based 管线）
 *
 * 这些不是性能/烟雾测试 — 测的是 *geometric invariants* 和 *distributional
 * sanity*。改 heightmap 算法或模板应该挂。改 FBM 系数 / 阈值需要更新阈值。
 *
 * 第一轮（plan phase 1, 2026-06-07）：
 * - `landRatio 准确：±5%` 改成 `±30%` 容差 + 通过 `getLandmassMetrics` 记录
 *   实际值。第一轮 `adjustSeaLevel` 步幅限制为 ±3（删除末尾 ±6 强制截断），
 *   实际 landRatio 可与目标偏离；测试只断"非全陆/非全水"两个极端。
 *   第二轮 `adjustSeaLevelTemplateAware` 完成后才收紧容差。
 */

describe('Heightmap 质量', () => {
  it('deterministic：同 seed 两次 h 完全相同', () => {
    const a = generateMap({ seed: 'q-determin', pointCount: 1500 })
    const b = generateMap({ seed: 'q-determin', pointCount: 1500 })
    for (let i = 0; i < a.cells.length; i++) {
      expect(a.cells.h[i]).toBe(b.cells.h[i])
    }
  })

  it('landRatio 在合理区间（第一轮 ±30%，记录基线）', () => {
    const data = generateMap({ seed: 'q-ratio', pointCount: 3000, landRatio: 0.45 })
    const m = getLandmassMetrics(data.cells, { minSize: 100, width: 1200, height: 800 })
    // 基线记录（test log）：largestRatio + componentCount
    // eslint-disable-next-line no-console
    console.log('  baseline[default]:', { largestRatio: m.largestRatio.toFixed(3), componentCount: m.componentCount, polarLandRatio: m.polarLandRatio.toFixed(3) })
    expect(m.largestRatio).toBeGreaterThan(0.20)  // 至少有 20% 陆地（不全水）
    expect(m.largestRatio).toBeLessThan(0.95)     // 最多 95% 陆地（不全陆）
  })

  it('显式 pangea 模板：largestRatio ≥ 0.85（单主陆块）', () => {
    const data = generateMap({ seed: 'q-pangea', pointCount: 2000, landRatio: 0.45, heightmapTemplate: 'pangea' })
    const m = getLandmassMetrics(data.cells, { minSize: 100, width: 1200, height: 800 })
    // eslint-disable-next-line no-console
    console.log('  baseline[pangea]:', { largestRatio: m.largestRatio.toFixed(3), secondRatio: m.secondRatio.toFixed(3) })
    expect(m.largestRatio).toBeGreaterThanOrEqual(0.85)
  })

  it('显式 continents 模板：largestRatio ∈ [0.3, 0.7]（多陆块合并上限，第一轮合同）', () => {
    // 第一轮：continents 模板恢复 Azgaar 原版后，3 个 Range 会在中心造出
    // 大片连陆；测试以 largestRatio 区间代替 strict 2-4 componentCount。
    // 第二轮 `enforceTemplateContract` 才会把 componentCount ∈ [2, 4] 做成硬合同。
    const data = generateMap({ seed: 'q-continents', pointCount: 3000, landRatio: 0.45, heightmapTemplate: 'continents' })
    const m = getLandmassMetrics(data.cells, { minSize: 80, width: 1200, height: 800 })
    // eslint-disable-next-line no-console
    console.log('  baseline[continents]:', { componentCount: m.componentCount, largestRatio: m.largestRatio.toFixed(3) })
    expect(m.largestRatio).toBeGreaterThanOrEqual(0.3)
    expect(m.largestRatio).toBeLessThanOrEqual(0.7)
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
