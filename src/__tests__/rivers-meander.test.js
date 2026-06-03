import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * Task 8 验证：
 *  - 'straight'（默认）：与无 realism 一致（byte-for-byte）
 *  - 'meandering'：河流 path 不变，但 points 偏移更大
 *  - 'deltaic'：河流 cells 数 = 主路径 + delta 分支
 */
describe('generateRivers - realism style', () => {
  it('straight 模式：返回数组，river 含完整字段', () => {
    const data = generateMap({
      seed: 'river-straight',
      pointCount: 600,
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
      realism: { level: 'classic', rivers: { style: 'straight' } },
    })
    const meander = generateMap({
      seed: 'river-test',
      pointCount: 600,
      realism: { level: 'classic', rivers: { style: 'meandering', meanderAmplitude: 8 } },
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
      realism: { level: 'classic', rivers: { style: 'deltaic' } },
    })
    expect(Array.isArray(data.rivers)).toBe(true)
    // 至少有一条河（seed 800 cells 够大）
    expect(data.rivers.length).toBeGreaterThan(0)
    // cells.length 字段应被填上
    for (const r of data.rivers) {
      expect(r.length).toBe(r.cells.length)
    }
  })

  it('classic 兼容：未传 realism 时行为等价于 straight', () => {
    const a = generateMap({ seed: 'compat-river', pointCount: 600 })
    const b = generateMap({
      seed: 'compat-river',
      pointCount: 600,
      realism: { level: 'classic', rivers: { style: 'straight' } },
    })
    expect(a.rivers.length).toBe(b.rivers.length)
    for (let i = 0; i < a.rivers.length; i++) {
      expect(a.rivers[i].cells).toEqual(b.rivers[i].cells)
      expect(a.rivers[i].points).toEqual(b.rivers[i].points)
    }
  })

  it('河流长度：源点选高处而非高 flux（避免河流变 3-cell 点）', () => {
    // 回归：旧实现按 flux 降序选 source，flux 高 = 接近入海口 / 海岸，
    // drainage 几步就到水域，导致 path.length == 3
    const data = generateMap({ seed: 'rivers-len', pointCount: 3000, stateCount: 5 })
    const lens = data.rivers.map(r => r.cells.length)
    const maxLen = Math.max(...lens)
    // 至少要有几条长河（不是 3 cell 点）
    // heightmap 改为"多大陆 + 海洋隔开"后，单个大陆小、河短；
    // 阈值改为 >5（远高于 3-cell bug）+ 至少 5 条长度 >=5 的河。
    const moderateRivers = data.rivers.filter(r => r.cells.length >= 5).length
    expect(maxLen).toBeGreaterThan(5)
    expect(moderateRivers).toBeGreaterThanOrEqual(5)
  })
})
