import { describe, it, expect } from 'vitest'
import { perturbCoast } from '../services/world-map/engine/coast'
import { makeCells } from './helpers/cells'

/**
 * 构造 1 块近岸低地在 cell 5，其余为水域（10 cells 链式邻居）。
 * 当前 perturbCoast 只扰动接近 SEA_LEVEL 的海岸 cell，高内陆山地不动。
 */
function makeIsland() {
  const cells = makeCells(10)
  cells.h.fill(0)
  cells.h[5] = 24
  return cells
}

describe('perturbCoast', () => {
  it('海陆交界 cell 高度被扰动', () => {
    const cells = makeIsland()
    const before = Array.from(cells.h)
    perturbCoast(cells, { noiseScale: 0.012, noiseAmplitude: 6 })
    let changed = false
    for (let i = 0; i < cells.h.length; i++) {
      if (cells.h[i] !== before[i]) { changed = true; break }
    }
    expect(changed).toBe(true)
  })

  it('远海 cell 不被扰动', () => {
    const cells = makeIsland()
    const before = Array.from(cells.h)
    perturbCoast(cells, { noiseScale: 0.012, noiseAmplitude: 6 })
    // cell 0,1,2,3,7,8,9 远离陆地（无陆地邻居），应保持 0
    for (const i of [0, 1, 2, 3, 7, 8, 9]) {
      expect(cells.h[i]).toBe(before[i])
    }
  })

  it('纯海陆交界 cell 数量 = 1（cell 5 是唯一的陆地）', () => {
    const cells = makeIsland()
    perturbCoast(cells, { noiseScale: 0.012, noiseAmplitude: 6 })
    // cell 5 高度应被噪声扰动（不再恰好为 24），但其它 cell 保持 0
    expect(cells.h[5]).not.toBe(0)
    expect(cells.h[5]).toBeGreaterThanOrEqual(0)
    expect(cells.h[5]).toBeLessThanOrEqual(100)
  })
})
