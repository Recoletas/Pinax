import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * Heightmap 质量验收（azgaar 风格管线）
 *
 * 这些不是性能/烟雾测试 — 测的是 *shapes of distributions* 和 *geometric invariants*
 * 应该长期稳定。只有当 heightmap 算法或 FBM 系数改了才需要更新阈值。
 */

function hHistogram(cells, bins = 10) {
  const counts = new Array(bins).fill(0)
  for (let i = 0; i < cells.length; i++) {
    const b = Math.min(bins - 1, Math.floor(cells.h[i] / (100 / bins)))
    counts[b]++
  }
  return counts
}

function bimodalityScore(counts) {
  // 找两个最高峰（0~40 范围, 60~100 范围）。若两峰都明显大于中段,
  // 则认为双峰性达标。返回 0~1, 1 = 完全双峰。
  const half = Math.floor(counts.length / 2)
  const low = Math.max(...counts.slice(0, half))
  const mid = Math.max(...counts.slice(half - 1, half + 1))
  const high = Math.max(...counts.slice(half))
  const peaks = low + high
  if (peaks === 0) return 0
  // 用中段高度作为"谷深"指标；中段越低，分数越高
  return Math.max(0, 1 - mid / ((low + high) / 2))
}

function meanH(cells, indices) {
  let s = 0
  for (const i of indices) s += cells.h[i]
  return s / Math.max(1, indices.length)
}

function edgeVsCenterH(cells, width, height) {
  const edge = []
  const center = []
  for (let i = 0; i < cells.length; i++) {
    const x = cells.p[i * 2] / width
    const y = cells.p[i * 2 + 1] / height
    const dEdge = Math.min(x, y, 1 - x, 1 - y)  // 离最近边的归一化距离
    if (dEdge < 0.1) edge.push(i)
    else if (dEdge > 0.35) center.push(i)
  }
  return { edgeMean: meanH(cells, edge), centerMean: meanH(cells, center) }
}

function countMajorLandmasses(cells, minSize = 80) {
  const seen = new Uint8Array(cells.length)
  let count = 0
  for (let start = 0; start < cells.length; start++) {
    if (seen[start] || cells.h[start] < 20) continue
    const queue = [start]
    seen[start] = 1
    let size = 0
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head]
      size++
      for (const n of cells.c[cell]) {
        if (seen[n] || cells.h[n] < 20) continue
        seen[n] = 1
        queue.push(n)
      }
    }
    if (size >= minSize) count++
  }
  return count
}

describe('Heightmap 质量', () => {
  it('双峰性：陆/海分离清晰', () => {
    const data = generateMap({ seed: 'q-bimodal', pointCount: 2000, landRatio: 0.45 })
    const counts = hHistogram(data.cells, 10)
    const score = bimodalityScore(counts)
    // 旧 classic 模式：单调倾斜, 双峰性 ≈ 0
    // 新 azgaar 管线：海陆分明, 双峰性 > 0.4
    expect(score).toBeGreaterThan(0.4)
  })

  it('无 rim：边缘平均高程 ≤ 中心（边缘遮罩生效）', () => {
    const data = generateMap({ seed: 'q-rim', pointCount: 2000 })
    const { edgeMean, centerMean } = edgeVsCenterH(data.cells, data.width, data.height)
    // 边缘遮罩把边缘压到接近 0, 中心保留 FBM 高度
    // 允许 0~5 的容差（旧管线 rim 让边缘比中心高）
    expect(edgeMean).toBeLessThan(centerMean + 5)
    expect(edgeMean).toBeLessThan(30)
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

  it('deterministic：同 seed 两次 h 完全相同', () => {
    const a = generateMap({ seed: 'q-determin', pointCount: 1500 })
    const b = generateMap({ seed: 'q-determin', pointCount: 1500 })
    for (let i = 0; i < a.cells.length; i++) {
      expect(a.cells.h[i]).toBe(b.cells.h[i])
    }
  })

  it('continentCount 控制陆块数：cc=1 → 1 块, cc=6 → ≥3 块', () => {
    const c1 = generateMap({ seed: 'q-cc1', pointCount: 2000, continentCount: 1, plateCount: 4 })
    const c6 = generateMap({ seed: 'q-cc6', pointCount: 3000, continentCount: 6, plateCount: 8 })
    expect(countMajorLandmasses(c1.cells)).toBe(1)
    // cc=6 → 至少 3 个 Voronoi 区域（per-Voronoi threshold 保证环分开）
    // BFS 看到的"陆块"数可能更少（板块边界会把相邻区域的边缘 cell 焊起来），
    // 但 coastlines 数组长度才是下游 outline 用的真信号。
    expect(c6.coastlines.length).toBeGreaterThanOrEqual(3)
  })

  it('板块信号：convergent 边界附近 cell 平均 h 显著高于全图平均', () => {
    const data = generateMap({ seed: 'q-tectonic', pointCount: 3000, plateCount: 6 })
    const t = data.cells.tectonic
    let near = 0, nearSum = 0, farSum = 0
    for (let i = 0; i < data.cells.length; i++) {
      const dist = t.boundaryDist[i]
      const h = data.cells.h[i]
      if (dist < 5 && t.boundaryType[i] === 1) {  // convergent
        near++; nearSum += h
      } else {
        farSum += h
      }
    }
    const nearMean = nearSum / Math.max(1, near)
    const farMean = farSum / data.cells.length
    // 山脉在 convergent 边界：near 应明显高
    expect(near).toBeGreaterThan(0)
    expect(nearMean).toBeGreaterThan(farMean + 5)
  })
})
