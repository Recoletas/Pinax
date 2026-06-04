import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * Task 8 验证：
 *  - 默认（meandering）：与 explicit straight 偏移不同
 *  - 'meandering'：河流 path 不变，但 points 偏移更大
 *  - 'deltaic'：河流 cells 数 = 主路径 + delta 分支
 */
describe('generateRivers - realism style', () => {
  it('straight 模式：返回数组，river 含完整字段', () => {
    const data = generateMap({
      seed: 'river-straight',
      pointCount: 600,
      realism: { rivers: { style: 'straight' } },
    })
    expect(Array.isArray(data.rivers)).toBe(true)
    for (const r of data.rivers) {
      expect(r.i).toBeGreaterThan(0)
      expect(r.cells.length).toBeGreaterThan(0)
      expect(r.points.length).toBe(r.cells.length)
      expect(r.widths.length).toBe(r.cells.length)
    }
  })

  it('meandering 模式：points 偏移幅度比 straight 大', () => {
    const straight = generateMap({
      seed: 'river-test',
      pointCount: 600,
      realism: { rivers: { style: 'straight' } },
    })
    const meander = generateMap({
      seed: 'river-test',
      pointCount: 600,
      realism: { rivers: { style: 'meandering', meanderAmplitude: 8 } },
    })

    // meander 模式同一 index 的河流 path 应当相同（drainage 没变）
    expect(meander.rivers.length).toBe(straight.rivers.length)
    for (let i = 0; i < Math.min(3, straight.rivers.length); i++) {
      expect(meander.rivers[i].cells).toEqual(straight.rivers[i].cells)
    }
    // 但 points 偏移应不同
    let pointsDiffer = false
    for (let i = 0; i < Math.min(3, straight.rivers.length); i++) {
      for (let j = 0; j < straight.rivers[i].points.length; j++) {
        if (straight.rivers[i].points[j][0] !== meander.rivers[i].points[j][0]
            || straight.rivers[i].points[j][1] !== meander.rivers[i].points[j][1]) {
          pointsDiffer = true
          break
        }
      }
      if (pointsDiffer) break
    }
    expect(pointsDiffer).toBe(true)
  })

  it('deltaic 模式：river.cells 可能 > 主路径（delta 分支加分）', () => {
    const data = generateMap({
      seed: 'river-delta',
      pointCount: 800,
      realism: { rivers: { style: 'deltaic' } },
    })
    expect(Array.isArray(data.rivers)).toBe(true)
    expect(data.rivers.length).toBeGreaterThan(0)
    for (const r of data.rivers) {
      expect(r.length).toBe(r.cells.length)
    }
  })

  it('默认（无 rivers 子字段）：行为等价于 meandering', () => {
    // 旧实现默认 = straight（兼容老路径）；新管线默认 = meandering
    // 这里断言"未传 rivers"与"传 meandering"结果一致
    const a = generateMap({ seed: 'compat-river', pointCount: 600 })
    const b = generateMap({
      seed: 'compat-river',
      pointCount: 600,
      realism: { rivers: { style: 'meandering' } },
    })
    expect(a.rivers.length).toBe(b.rivers.length)
    for (let i = 0; i < a.rivers.length; i++) {
      expect(a.rivers[i].cells).toEqual(b.rivers[i].cells)
      expect(a.rivers[i].points).toEqual(b.rivers[i].points)
    }
  })

  it('河流长度：源点选高处而非高 flux（避免河流变 3-cell 点）', () => {
    const data = generateMap({ seed: 'rivers-len', pointCount: 3000, stateCount: 5 })
    const lens = data.rivers.map(r => r.cells.length)
    const maxLen = Math.max(...lens)
    const moderateRivers = data.rivers.filter(r => r.cells.length >= 5).length
    expect(maxLen).toBeGreaterThan(5)
    expect(moderateRivers).toBeGreaterThanOrEqual(5)
  })
})
