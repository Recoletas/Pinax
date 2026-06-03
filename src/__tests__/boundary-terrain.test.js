import { describe, it, expect } from 'vitest'
import {
  applyConvergentRange,
  applyDivergentRift,
  applyTransformShear,
  applyVolcanicArc,
} from '../services/world-map/engine/boundary-terrain'
import { makeCells } from './helpers/cells.js'

describe('applyConvergentRange', () => {
  it('沿 boundary spine 抬高 cells.h', () => {
    const cells = makeCells(20)
    const seg = { cellsA: [5, 6, 7], cellsB: [10, 11, 12], normalX: 1, normalY: 0 }
    const before = cells.h[5]
    applyConvergentRange(cells, seg, { peakHeight: 50, rangeWidth: 3, rng: () => 0.5 })
    expect(cells.h[5]).toBeGreaterThan(before)
  })

  it('rangeWidth 越大影响范围越广', () => {
    const cells1 = makeCells(30)
    const cells2 = makeCells(30)
    const seg = { cellsA: [10, 11, 12], cellsB: [15, 16, 17], normalX: 1, normalY: 0 }
    applyConvergentRange(cells1, seg, { peakHeight: 50, rangeWidth: 1 })
    applyConvergentRange(cells2, seg, { peakHeight: 50, rangeWidth: 5 })
    // cells2 中离 boundary 较远的 cell 受影响更大
    const farCell1 = 13
    const farCell2 = 13
    expect(cells2.h[farCell2]).toBeGreaterThan(cells1.h[farCell1])
  })
})

describe('applyDivergentRift', () => {
  it('boundary spine cell 高度下降', () => {
    const cells = makeCells(20)
    const before = cells.h[5]
    applyDivergentRift(cells, { cellsA: [5], cellsB: [10], normalX: 1, normalY: 0 }, { riftDepth: 25 })
    expect(cells.h[5]).toBeLessThan(before)
  })
})

describe('applyTransformShear', () => {
  it('boundary cell 高度变化 ≤ 3', () => {
    const cells = makeCells(20)
    const before = cells.h[5]
    applyTransformShear(cells, { cellsA: [5], cellsB: [10], normalX: 1, normalY: 0 }, () => 0.5)
    expect(Math.abs(cells.h[5] - before)).toBeLessThanOrEqual(3)
  })
})

describe('applyVolcanicArc', () => {
  it('在 inland offset 处产生 volcano cell', () => {
    const cells = makeCells(50)
    cells.volcano = new Uint8Array(50)
    // Pre-populate cells.tectonic so applyVolcanicArc can pick inland neighbors
    cells.tectonic = {
      plateId: new Int16Array(50),
      boundaryDist: new Uint8Array(50).fill(255),
      boundaryType: new Uint8Array(50),
      subduction: new Uint8Array(50),
      orogenyAge: new Uint8Array(50),
      volcanoArc: new Uint8Array(50),
    }
    const seg = { cellsA: [20, 21, 22], cellsB: [25, 26, 27], normalX: 1, normalY: 0 }
    applyVolcanicArc(cells, seg, 0, { offsetCell: 4, peakHeight: 35, rng: () => 0.3 })
    const hasVolcano = Array.from(cells.volcano).some(v => v > 0)
    expect(hasVolcano).toBe(true)
  })
})
