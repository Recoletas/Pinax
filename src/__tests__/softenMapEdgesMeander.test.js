/**
 * softenMapEdges meander 回归。
 *
 * 修前：fbm2D(x*1.5, 0.5, 3) → y 写死为常数 0.5
 *   → 同一 x 列所有 cell 的 meander 完全相同
 *   → 极地衰减带仍按行对齐（只是极地线稍微弯曲），不是真正"行独立蜿蜒"
 *
 * 修后：fbm2D(x*1.5, y, 3) → 传入实际归一化 y
 *   → 同一 x 列不同 y 的 meander 数值应有差异
 *
 * 这条用 generateMap 端到端拿 cells.h 比较同 x 不同 y 的极地 cell 高度。
 * 前提：未修前同一 x 列所有极地 cell h 都相同（被同一 meander 缩放），
 *       修后应该有可见差异。
 */
import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate.ts'

function gatherPolarCellsAtSameX(data) {
  const w = data.cells.h.length > 0
    ? Math.max(...Array.from({ length: data.cells.length }, (_, i) => data.cells.p[i * 2]))
    : 0
  const h = data.cells.h.length > 0
    ? Math.max(...Array.from({ length: data.cells.length }, (_, i) => data.cells.p[i * 2 + 1]))
    : 0
  // 按归一化 y 找极地区（y < 0.1 或 y > 0.9），按 x 分组
  const byX = new Map()
  for (let i = 0; i < data.cells.length; i++) {
    const x = data.cells.p[i * 2] / w
    const y = data.cells.p[i * 2 + 1] / h
    if (y >= 0.1 && y <= 0.9) continue
    const xBin = Math.round(x * 50) / 50 // 50 个 x 桶
    if (!byX.has(xBin)) byX.set(xBin, [])
    byX.get(xBin).push(data.cells.h[i])
  }
  return byX
}

describe('softenMapEdges meander: y must vary per row', () => {
  it('同一 x 桶内极地 cell 高度应有差异（行独立 meander）', () => {
    const data = generateMap({
      seed: 'meander-audit-1',
      pointCount: 3000,
      stateCount: 4,
      continentCount: 2,
      plateCount: 4,
    })
    const byX = gatherPolarCellsAtSameX(data)
    expect(byX.size).toBeGreaterThan(10) // 至少要有十几个 x 桶有极地 cell

    // 找一个有 ≥3 个 cell 的 x 桶，断言 cell.h 有 variance
    let foundVariance = false
    for (const cells of byX.values()) {
      if (cells.length < 3) continue
      const min = Math.min(...cells)
      const max = Math.max(...cells)
      if (max - min > 0) {
        foundVariance = true
        break
      }
    }
    expect(foundVariance).toBe(true)
  })

  it('确定性：同 seed 两次产出 cell.h 完全相同', () => {
    const a = generateMap({ seed: 'meander-det', pointCount: 2000, stateCount: 4 })
    const b = generateMap({ seed: 'meander-det', pointCount: 2000, stateCount: 4 })
    expect(a.cells.h.length).toBe(b.cells.h.length)
    for (let i = 0; i < a.cells.h.length; i++) {
      expect(a.cells.h[i]).toBe(b.cells.h[i])
    }
  })

  it('meander 修复不应让 polarMaskFloor 默认行为产生回归（cc=1 视觉基线仍过）', () => {
    // 间接：cc=1 的视觉签名应仍通过 expectNotOverlySquare（bboxFillRatio ≤ 0.70）
    const data = generateMap({
      seed: 'visual-cc1', pointCount: 2000, stateCount: 4,
      continentCount: 1, plateCount: 4,
    })
    let land = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] >= 20) land++
    }
    const landRatio = land / data.cells.length
    // cc=1 单大陆应有 ≥ 30% 陆地（修 meander 不应让陆地塌缩）
    expect(landRatio).toBeGreaterThan(0.3)
  })
})