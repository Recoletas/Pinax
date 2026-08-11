import { describe, expect, it } from 'vitest'
import { generateMap } from '@/services/world-map/engine'

// 条带检测回归测试（audit: 地图陆地呈水平条带分布问题）。
//
// 原理：把 cells 按 y 归一化坐标分桶（默认 20 桶），算每桶的 landRatio，
// 检测"相邻桶 landRatio 跳变"（maxJump）。条带分布的特征是某一行突然从
// 全是陆地变成全是水（高 maxJump）；自然分布的相邻桶应平滑过渡（低 maxJump）。
//
// baseline 取自 A1（softenMapEdges 边界扰动）修复后的分布。
// A1 前后对比：cc1 maxJump 0.522→0.384，cc4 0.348→0.287，cc6 0.437→0.399。

const SEA_LEVEL = 20

/**
 * 按 y 分桶算 landRatio，返回每桶比例 + 相邻桶最大跳变。
 */
function bandSignature(map, buckets = 20) {
  const counts = Array.from({ length: buckets }, () => ({ land: 0, total: 0 }))
  for (let i = 0; i < map.cells.length; i++) {
    const yFrac = map.cells.p[i * 2 + 1] / map.height
    const b = Math.min(buckets - 1, Math.floor(yFrac * buckets))
    counts[b].total++
    if (map.cells.h[i] >= SEA_LEVEL) counts[b].land++
  }
  const ratios = counts.map((c) => (c.total > 0 ? c.land / c.total : 0))
  // 全局最大相邻跳变
  let maxJump = 0
  let jumpAt = -1
  for (let i = 1; i < ratios.length; i++) {
    const j = Math.abs(ratios[i] - ratios[i - 1])
    if (j > maxJump) { maxJump = j; jumpAt = i }
  }
  // 中纬区域（bucket 5-15，y ∈ [0.25, 0.75]）的最大跳变
  let midMaxJump = 0
  for (let i = 6; i <= 15; i++) {
    const j = Math.abs(ratios[i] - ratios[i - 1])
    if (j > midMaxJump) midMaxJump = j
  }
  return { ratios, maxJump, jumpAt, midMaxJump }
}

describe('条带检测 — 陆地水平分布的自然度', () => {
  // 阈值说明：
  // - maxJump ≤ 0.45：极地边缘允许较大跳变（极地 mask 是设计行为），
  //   但不能超过 0.45（A1 前 cc1=0.522，修复后最大 0.399）。
  // - midMaxJump ≤ 0.25：中纬区域（y∈[0.25,0.75]）不应有明显条带，
  //   相邻桶 landRatio 跳变不超过 0.25。
  const MAX_JUMP_LIMIT = 0.45
  const MID_MAX_JUMP_LIMIT = 0.25

  it('cc=1（单大陆）：极地边缘跳变 ≤ 0.45，中纬无明显条带', () => {
    const map = generateMap({
      seed: 'visual-cc1', pointCount: 2000, stateCount: 4,
      continentCount: 1, plateCount: 4,
    })
    const bs = bandSignature(map)
    expect(bs.maxJump).toBeLessThanOrEqual(MAX_JUMP_LIMIT)
    expect(bs.midMaxJump).toBeLessThanOrEqual(MID_MAX_JUMP_LIMIT)
  })

  it('cc=4（多大陆）：极地边缘跳变 ≤ 0.45，中纬无明显条带', () => {
    const map = generateMap({
      seed: 'visual-cc4', pointCount: 3000, stateCount: 6,
      continentCount: 4, plateCount: 6,
    })
    const bs = bandSignature(map)
    expect(bs.maxJump).toBeLessThanOrEqual(MAX_JUMP_LIMIT)
    expect(bs.midMaxJump).toBeLessThanOrEqual(MID_MAX_JUMP_LIMIT)
  })

  it('cc=6（多大陆 + 多板块）：极地边缘跳变 ≤ 0.45，中纬无明显条带', () => {
    const map = generateMap({
      seed: 'visual-cc6', pointCount: 3000, stateCount: 8,
      continentCount: 6, plateCount: 8,
    })
    const bs = bandSignature(map)
    expect(bs.maxJump).toBeLessThanOrEqual(MAX_JUMP_LIMIT)
    expect(bs.midMaxJump).toBeLessThanOrEqual(MID_MAX_JUMP_LIMIT)
  })

  it('固定 seed 的 landRatio 逐桶分布基线（防回归）', () => {
    // 记录修复后的分布特征，任何后续"无意"改动若让条带回归会在此暴露。
    // 不断言精确值（允许微扰），只断言分布的"平滑度"特征。
    const map = generateMap({ seed: 'banding-baseline', pointCount: 2000, stateCount: 4 })
    const bs = bandSignature(map)
    // 整体应有合理的陆地量（不全水也不全陆）
    const totalLandRatio = bs.ratios.reduce((a, b) => a + b, 0) / bs.ratios.length
    expect(totalLandRatio).toBeGreaterThan(0.2)
    expect(totalLandRatio).toBeLessThan(0.7)
    // 极地两端（bucket 0 和 19）应是低陆地（极地 mask 生效）
    expect(bs.ratios[0]).toBeLessThan(0.1)
    expect(bs.ratios[19]).toBeLessThan(0.1)
    // 中纬（bucket 8-12）应有较多陆地
    const midAvg = [8, 9, 10, 11, 12].reduce((a, i) => a + bs.ratios[i], 0) / 5
    expect(midAvg).toBeGreaterThan(0.3)
  })
})
