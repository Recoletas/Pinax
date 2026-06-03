import { describe, it, expect } from 'vitest'
import { computeTectonicData } from '../services/world-map/engine/tectonic-data'
import { makeCells } from './helpers/cells.js'

describe('computeTectonicData', () => {
  it('初始化 6 个并行数组，长度 = cells.length', () => {
    const cells = makeCells(10)
    const plateId = new Int16Array(10) // 全 0 板块
    const result = computeTectonicData(cells, plateId, [])
    expect(result.plateId.length).toBe(10)
    expect(result.boundaryDist.length).toBe(10)
    expect(result.boundaryType.length).toBe(10)
    expect(result.subduction.length).toBe(10)
    expect(result.orogenyAge.length).toBe(10)
    expect(result.volcanoArc.length).toBe(10)
  })

  it('boundary cell 的 boundaryType 正确', () => {
    const cells = makeCells(6)
    const plateId = new Int16Array([0, 0, 0, 1, 1, 1])
    const result = computeTectonicData(cells, plateId, [
      { type: 'convergent', plateA: 0, plateB: 1, cellIds: [0, 1, 2, 3, 4, 5] }
    ])
    expect(result.boundaryType[0]).toBe(1)  // convergent
    expect(result.boundaryType[3]).toBe(1)
  })

  it('内陆 cell 的 boundaryDist >= 1（BFS 扩散）', () => {
    // 10 cells 链式邻居，中间 cell 4 与 cell 5 是 boundary（0 cell 远端）
    const cells = makeCells(10)
    const plateId = new Int16Array(10)
    const result = computeTectonicData(cells, plateId, [
      { type: 'transform', plateA: 0, plateB: 1, cellIds: [4, 5] }
    ])
    // cell 0 距离边界 4 是 4 步
    expect(result.boundaryDist[0]).toBeGreaterThanOrEqual(1)
    // 至少有一个非 boundary cell 的距离 >= 1
    const maxDist = Math.max(...result.boundaryDist)
    expect(maxDist).toBeGreaterThan(0)
  })
})
