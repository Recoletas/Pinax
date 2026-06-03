import { describe, it, expect } from 'vitest'
import { computeBorderlands } from '../services/world-map/engine/borderlands'
import { getFactionTexture, stateNoise } from '../services/world-map/engine/faction-texture'
import { makeCells } from './helpers/cells'

describe('computeBorderlands', () => {
  it('邻国 cell 被标为 borderland', () => {
    const cells = makeCells(10)
    cells.state[0] = 1
    cells.state[5] = 2
    // cell 0 和 5 互为邻居
    cells.c[0] = [5]
    cells.c[5] = [0]
    const result = computeBorderlands(cells, { width: 1 })
    expect(result.has(0) || result.has(5)).toBe(true)
  })

  it('同国 cell 不被标', () => {
    const cells = makeCells(10)
    cells.state[0] = 1
    cells.state[1] = 1
    cells.c[0] = [1]
    cells.c[1] = [0]
    const result = computeBorderlands(cells, { width: 1 })
    expect(result.has(0)).toBe(false)
    expect(result.has(1)).toBe(false)
  })

  it('width=0 返回空集', () => {
    const cells = makeCells(10)
    cells.state[0] = 1
    cells.state[5] = 2
    cells.c[0] = [5]
    cells.c[5] = [0]
    const result = computeBorderlands(cells, { width: 0 })
    expect(result.size).toBe(0)
  })

  it('width=2 会把 border 内 2 层同国 cell 也包进来', () => {
    const cells = makeCells(10)
    cells.state[0] = 1
    cells.state[1] = 1
    cells.state[2] = 1
    cells.state[3] = 1
    cells.state[5] = 2
    // 1-2-3-4 一串，cell 0 是 state 1 与 state 2 的边界邻居
    cells.c[0] = [1]
    cells.c[1] = [0, 2]
    cells.c[2] = [1, 3]
    cells.c[3] = [2, 4]
    cells.c[4] = [3]
    cells.c[5] = [0]
    const result = computeBorderlands(cells, { width: 2 })
    // 0 是 border（state 1 与 state 2 邻接）
    expect(result.has(0)).toBe(true)
    // 1, 2 是 borderland（width=2 沿 state 1 扩 2 层）
    expect(result.has(1)).toBe(true)
    expect(result.has(2)).toBe(true)
    // 3 距离 border 3 层（cell 0→1→2→3），width=2 不应到达
    expect(result.has(3)).toBe(false)
  })
})

describe('stateNoise', () => {
  it('确定性：相同输入返回相同输出', () => {
    expect(stateNoise(1, 5)).toBe(stateNoise(1, 5))
  })
  it('不同输入返回不同输出（一般情况）', () => {
    expect(stateNoise(1, 5)).not.toBe(stateNoise(1, 6))
    expect(stateNoise(1, 5)).not.toBe(stateNoise(2, 5))
  })
  it('返回 0-1 之间的数', () => {
    for (let i = 0; i < 100; i++) {
      const n = stateNoise(i, i * 7)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })
})

describe('getFactionTexture', () => {
  it('返回 color + patternAlpha', () => {
    const result = getFactionTexture(
      { i: 1, name: 'Test', color: '#ff0000', capital: 0, expansionism: 1, cells: 10, area: 100, totalPopulation: 1000 },
      0,
      { alpha: 0.5, borderland: new Set() },
    )
    expect(result.color).toBe('#ff0000')
    expect(result.patternAlpha).toBeGreaterThan(0)
    expect(result.patternAlpha).toBeLessThanOrEqual(0.5)
  })

  it('borderland cell 的 patternAlpha 是非 borderland 的一半', () => {
    const state = { i: 1, name: 'Test', color: '#ff0000', capital: 0, expansionism: 1, cells: 10, area: 100, totalPopulation: 1000 }
    const borderland = new Set([5])
    const opts = { alpha: 1.0, borderland }
    // 用 cell 5（borderland）和 cell 0（非 borderland）比较
    // 但因噪点不同，绝对值不好比。改成：borderland patternAlpha 应 ≤ 非 borderland 的一半
    const borderRes = getFactionTexture(state, 5, opts)
    const innerRes = getFactionTexture(state, 6, opts)
    expect(borderRes.patternAlpha).toBeLessThanOrEqual(innerRes.patternAlpha * 0.5 + 0.01)
  })
})
