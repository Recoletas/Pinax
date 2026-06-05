import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * 阶段 5 — 分层路网 (5 级: 主干道/港口支线/乡镇路/跨国商道/海运)
 *
 * 验证:
 *   1. 同 seed 决定性
 *   2. 4 种 road type 都有合理占比
 *   3. major 道路尽量不穿过高山 (h>70 ratio < 0.2)
 *   4. road.cells 长度 ≥ 2 (避免 A* 退化为零长)
 */

describe('road realism (阶段 5)', () => {
  it('同 seed 两次调用道路集合完全一致 (s1)', () => {
    const a = generateMap({ seed: 'realism-s1', pointCount: 1500, generateRoads: true })
    const b = generateMap({ seed: 'realism-s1', pointCount: 1500, generateRoads: true })
    expect(a.roads.length).toBe(b.roads.length)
    for (let i = 0; i < a.roads.length; i++) {
      expect(a.roads[i].type).toBe(b.roads[i].type)
      expect(a.roads[i].cells.length).toBe(b.roads[i].cells.length)
      for (let k = 0; k < a.roads[i].cells.length; k++) {
        expect(a.roads[i].cells[k]).toBe(b.roads[i].cells[k])
      }
    }
  })

  it('同 seed 两次调用道路集合完全一致 (s3)', () => {
    const a = generateMap({ seed: 'realism-s3', pointCount: 1500, generateRoads: true })
    const b = generateMap({ seed: 'realism-s3', pointCount: 1500, generateRoads: true })
    expect(a.roads.length).toBe(b.roads.length)
    for (let i = 0; i < a.roads.length; i++) {
      expect(a.roads[i].type).toBe(b.roads[i].type)
      expect(a.roads[i].cells.length).toBe(b.roads[i].cells.length)
      for (let k = 0; k < a.roads[i].cells.length; k++) {
        expect(a.roads[i].cells[k]).toBe(b.roads[i].cells[k])
      }
    }
  })

  it('5 级分层中至少出现 3 种 road type (s1)', () => {
    const data = generateMap({ seed: 'realism-s1', pointCount: 2000, generateRoads: true })
    const types = new Set(data.roads.map(r => r.type))
    expect(types.size).toBeGreaterThanOrEqual(3)
    // 验证 type 字段取值在允许范围内
    for (const t of types) {
      expect(['major', 'minor', 'trade', 'sea']).toContain(t)
    }
  })

  it('所有道路的 cells 长度 ≥ 2 (s1)', () => {
    const data = generateMap({ seed: 'realism-s1', pointCount: 1500, generateRoads: true })
    expect(data.roads.length).toBeGreaterThan(0)
    for (const r of data.roads) {
      expect(r.cells.length).toBeGreaterThanOrEqual(2)
      expect(r.points.length).toBe(r.cells.length)
    }
  })

  it('major 道路几乎不穿高山 (h>70 ratio < 0.2) (s1)', () => {
    const data = generateMap({ seed: 'realism-s1', pointCount: 2000, generateRoads: true })
    const majors = data.roads.filter(r => r.type === 'major')
    if (majors.length === 0) return  // 若该 seed 无 capital-major 道路则跳过
    let totalRatio = 0
    for (const r of majors) {
      let hCount = 0
      for (const c of r.cells) {
        if (data.cells.h[c] > 70) hCount++
      }
      totalRatio += hCount / r.cells.length
    }
    const avg = totalRatio / majors.length
    expect(avg).toBeLessThan(0.2)
  })
})
