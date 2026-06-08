import { describe, expect, it } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

describe('hillshade cache', () => {
  it('生成地图时写入 cells.hillshade', () => {
    const data = generateMap({ seed: 'hillshade-cache', pointCount: 800, generateRoads: false })
    expect(data.cells.hillshade).toBeInstanceOf(Float32Array)
    expect(data.cells.hillshade.length).toBe(data.cells.length)
  })

  it('同 seed 的 hillshade 输出稳定', () => {
    const a = generateMap({ seed: 'hillshade-deterministic', pointCount: 800, generateRoads: false })
    const b = generateMap({ seed: 'hillshade-deterministic', pointCount: 800, generateRoads: false })
    expect(Array.from(a.cells.hillshade)).toEqual(Array.from(b.cells.hillshade))
  })
})
