import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { getLandmassMetrics } from '../services/world-map/engine/shape-metrics'

/**
 * Heightmap 质量验收（template-based 管线）
 *
 * 这些不是性能/烟雾测试 — 测的是 *geometric invariants* 和 *distributional
 * sanity*。改 heightmap 算法或模板应该挂。改 FBM 系数 / 阈值需要更新阈值。
 *
 * Round 1.5（2026-06-07）：
 * - 把"landRatio 在合理区间"测试从 largestRatio 换成真 landRatio。
 *   旧测试名字叫 landRatio，实际断 largestRatio，导致 snapshot 出现
 *   cc=1: 0.658 / cc=6: 0.613 这种严重偏离仍能绿。Round 1.5 强制
 *   `adjustSeaLevel` 实际命中目标 0.45（容差 ±0.07 即 0.40-0.52）。
 * - 阈值收紧到 [0.40, 0.52] 是因为 adjustSeaLevel 现在 ±10 × 6 attempts
 *   给了 60 max shift，绝大多数模板应能命中。
 */

function computeLandRatio(cells) {
  let land = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] >= 20) land++
  }
  return land / cells.length
}

function countLandWithOceanBiome(cells) {
  let count = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] >= 20 && cells.biome[i] === 0) count++
  }
  return count
}

describe('Heightmap 质量', () => {
  it('deterministic：同 seed 两次 h 完全相同', () => {
    const a = generateMap({ seed: 'q-determin', pointCount: 1500 })
    const b = generateMap({ seed: 'q-determin', pointCount: 1500 })
    for (let i = 0; i < a.cells.length; i++) {
      expect(a.cells.h[i]).toBe(b.cells.h[i])
    }
  })

  it('landRatio 命中目标 0.45 ±0.05（真 landRatio，不是 largestRatio）', () => {
    // 5 个 seed 跑默认 landRatio=0.45，全部应在 [0.40, 0.52] 之间
    // 这才是用户在视觉层能接受的"地图"。
    const seeds = ['q-ratio-1', 'q-ratio-2', 'q-ratio-3', 'q-ratio-4', 'q-ratio-5']
    const results = []
    for (const seed of seeds) {
      const data = generateMap({ seed, pointCount: 3000, landRatio: 0.45 })
      const actual = computeLandRatio(data.cells)
      const m = getLandmassMetrics(data.cells, { minSize: 100, width: 1200, height: 800 })
      results.push({ seed, actual, largestRatio: m.largestRatio, componentCount: m.componentCount })
      // eslint-disable-next-line no-console
      console.log(`  baseline[default ${seed}]:`, { actual: actual.toFixed(3), largestRatio: m.largestRatio.toFixed(3), componentCount: m.componentCount })
      expect(actual).toBeGreaterThanOrEqual(0.40)
      expect(actual).toBeLessThanOrEqual(0.52)
    }
  })

  it('landRatio 极端值 0.15 / 0.85 也能大致命中（容差放宽，记录基线）', () => {
    // Round 1.5 验证：adjustSeaLevel 在两端也能"大致"命中。
    // 极端目标（0.15 自动走 archipelago / 0.85 自动走 special）的模板基线
    // 本身就偏离目标，adjustSeaLevel 只能"大致"拉回，不强求精确。
    for (const target of [0.15, 0.85]) {
      const data = generateMap({ seed: `q-extreme-${target}`, pointCount: 3000, landRatio: target })
      const actual = computeLandRatio(data.cells)
      // eslint-disable-next-line no-console
      console.log(`  baseline[extreme ${target}]:`, { actual: actual.toFixed(3) })
      // 极端值容差放宽到 ±0.15：archipelago 模板的"大量水域"基线 + FBM
      // 噪声可能导致 ±10 个百分点偏差；fractious（special）等高基线
      // 模板可能无法拉到 0.85。这是软断言，目的是防止回归到 0% 或 100%。
      expect(actual).toBeGreaterThan(0.05)
      expect(actual).toBeLessThan(0.95)
    }
  })

  it('高 landRatio 不允许陆地保留 ocean biome（防止蓝色大陆）', () => {
    for (const target of [0.75, 0.85, 0.9]) {
      for (let i = 0; i < 5; i++) {
        const data = generateMap({
          seed: `q-blue-land-${target}-${i}`,
          pointCount: 1200,
          landRatio: target,
          stateCount: 3,
          generateProvinces: false,
          generateRoads: false,
        })
        expect(countLandWithOceanBiome(data.cells), `target=${target} seed=${i}`).toBe(0)
      }
    }
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
