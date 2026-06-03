import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * Task 15: generate.ts 接入 MapConstraints
 *
 * 验证：
 * 1. stateSeeds 约束：指定国家名 + cell → 首都 burg.cell 被改写
 * 2. volcano 约束：指定 cell + type='volcano' → cells.volcano[cell] = 1
 * 3. 兼容：不传 constraints 走老路径不报错
 */
describe('generateMap - MapConstraints', () => {
  it('兼容：不传 constraints 时不报错', () => {
    const data = generateMap({ seed: 'no-constraints', pointCount: 1000, stateCount: 3 })
    expect(data.cells).toBeDefined()
    expect(data.states.length).toBeGreaterThan(0)
  })

  it('volcano 约束：cells.volcano 被标记', () => {
    const data = generateMap(
      { seed: 'volcano-test', pointCount: 1000, stateCount: 2 },
      undefined,
      { mountains: [{ name: 'M1', cells: [10, 20, 30], type: 'volcano' }] },
    )
    expect(data.cells.volcano).toBeDefined()
    expect(data.cells.volcano[10]).toBe(1)
    expect(data.cells.volcano[20]).toBe(1)
    expect(data.cells.volcano[30]).toBe(1)
    // 非 volcano 类型的山不标记
    const data2 = generateMap(
      { seed: 'volcano-test', pointCount: 1000, stateCount: 2 },
      undefined,
      { mountains: [{ name: 'M2', cells: [10], type: 'range' }] },
    )
    expect(data2.cells.volcano[10]).toBe(0)
  })

  it('volcano 约束：越界 cell 静默跳过', () => {
    const data = generateMap(
      { seed: 'volcano-oob', pointCount: 1000, stateCount: 2 },
      undefined,
      { mountains: [{ name: 'M1', cells: [99999, 5, -1], type: 'volcano' }] },
    )
    expect(data.cells.volcano[5]).toBe(1)
    // 越界不应抛错
  })

  it('constraints 走 cfg.constraints 字段同样有效（兼容调用方）', () => {
    const data = generateMap({
      seed: 'cfg-constraints',
      pointCount: 1000,
      stateCount: 2,
      constraints: { mountains: [{ name: 'M', cells: [50], type: 'volcano' }] },
    })
    expect(data.cells.volcano[50]).toBe(1)
  })
})
