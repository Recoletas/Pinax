import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * 阶段 4 — province 决定性 + cells.province 写回验证
 */

describe('province realism (阶段 4)', () => {
  it('同 seed 两次调用 cells.province 完全一致 (s1)', () => {
    const a = generateMap({ seed: 'realism-s1', pointCount: 1500, generateRoads: false })
    const b = generateMap({ seed: 'realism-s1', pointCount: 1500, generateRoads: false })
    expect(a.cells.province).toBeDefined()
    expect(b.cells.province).toBeDefined()
    expect(a.cells.province.length).toBe(b.cells.province.length)
    for (let i = 0; i < a.cells.province.length; i++) {
      expect(a.cells.province[i]).toBe(b.cells.province[i])
    }
  })

  it('所有 (land && state>0) cell 都有非 0 province (s1)', () => {
    const data = generateMap({ seed: 'realism-s1', pointCount: 1500, generateRoads: false })
    const cells = data.cells
    let claimed = 0
    let claimedWithProv = 0
    for (let i = 0; i < cells.length; i++) {
      if (cells.h[i] < 20) continue
      if (cells.state[i] === 0) continue
      claimed++
      if (cells.province && cells.province[i] > 0) claimedWithProv++
    }
    expect(claimed).toBeGreaterThan(0)
    expect(claimedWithProv).toBe(claimed)
  })

  it('同 seed 两次调用 cells.province 完全一致 (s3)', () => {
    const a = generateMap({ seed: 'realism-s3', pointCount: 1500, generateRoads: false })
    const b = generateMap({ seed: 'realism-s3', pointCount: 1500, generateRoads: false })
    expect(a.cells.province.length).toBe(b.cells.province.length)
    for (let i = 0; i < a.cells.province.length; i++) {
      expect(a.cells.province[i]).toBe(b.cells.province[i])
    }
  })

  it('所有 (land && state>0) cell 都有非 0 province (s3)', () => {
    const data = generateMap({ seed: 'realism-s3', pointCount: 1500, generateRoads: false })
    const cells = data.cells
    let claimed = 0
    let claimedWithProv = 0
    for (let i = 0; i < cells.length; i++) {
      if (cells.h[i] < 20) continue
      if (cells.state[i] === 0) continue
      claimed++
      if (cells.province && cells.province[i] > 0) claimedWithProv++
    }
    expect(claimed).toBeGreaterThan(0)
    expect(claimedWithProv).toBe(claimed)
  })

  it('cells.province 是 Uint16Array 类型', () => {
    const data = generateMap({ seed: 'realism-s1', pointCount: 800, generateRoads: false })
    expect(data.cells.province).toBeInstanceOf(Uint16Array)
  })
})
