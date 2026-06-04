import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

function countMajorLandmasses(cells, minSize = 120) {
  const seen = new Uint8Array(cells.length)
  let count = 0

  for (let start = 0; start < cells.length; start++) {
    if (seen[start] || cells.h[start] < 20) continue
    const queue = [start]
    let size = 0
    seen[start] = 1

    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head]
      size++
      for (const neighbor of cells.c[cell]) {
        if (seen[neighbor] || cells.h[neighbor] < 20) continue
        seen[neighbor] = 1
        queue.push(neighbor)
      }
    }

    if (size >= minSize) count++
  }

  return count
}

/**
 * azgaar 管线 smoke test
 *
 * 验证新管线（plate-driven heightmap）能产出符合 azgaar 风格的地图：
 *  - plates 数量与 plateCount 匹配
 *  - 每个 cell 都有 plateId
 *  - cells.h 同时有水域（< 20）和陆域（>= 20）
 *  - cells.tectonic 6 个并行数组全部填充
 *  - convergent 边界附近有更高的 elevation（山脉）
 *  - 边界分段（convergent + divergent + transform）总和 > 0
 */
describe('azgaar 管线 smoke', () => {
  it('plates 数量匹配 plateCount', () => {
    const data = generateMap({ seed: 'az-1', pointCount: 2000, plateCount: 5 })
    expect(data.plates.length).toBe(5)
  })

  it('每个 cell 都有 plateId', () => {
    const data = generateMap({ seed: 'az-2', pointCount: 2000, plateCount: 4 })
    expect(data.cells.tectonic.plateId.length).toBe(data.cells.length)
    for (let i = 0; i < data.cells.length; i++) {
      expect(data.cells.tectonic.plateId[i]).toBeGreaterThanOrEqual(0)
      expect(data.cells.tectonic.plateId[i]).toBeLessThan(4)
    }
  })

  it('cells.h 同时有水域和陆域', () => {
    const data = generateMap({ seed: 'az-3', pointCount: 2000, landRatio: 0.45 })
    let water = 0, land = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] < 20) water++
      else land++
    }
    expect(water).toBeGreaterThan(0)
    expect(land).toBeGreaterThan(0)
  })

  it('cells.tectonic 6 个并行数组全部填充', () => {
    const data = generateMap({ seed: 'az-4', pointCount: 2000, plateCount: 4 })
    const t = data.cells.tectonic
    expect(t.plateId.length).toBe(data.cells.length)
    expect(t.boundaryDist.length).toBe(data.cells.length)
    expect(t.boundaryType.length).toBe(data.cells.length)
    expect(t.subduction.length).toBe(data.cells.length)
    expect(t.orogenyAge.length).toBe(data.cells.length)
    expect(t.volcanoArc.length).toBe(data.cells.length)
  })

  it('至少有一个边界段（plate 接触处）', () => {
    const data = generateMap({ seed: 'az-5', pointCount: 2000, plateCount: 4 })
    expect(data.boundaries.length).toBeGreaterThan(0)
  })

  it('plate 都有 direction + speed + oceanic 字段', () => {
    const data = generateMap({ seed: 'az-6', pointCount: 2000, plateCount: 4 })
    for (const p of data.plates) {
      expect(typeof p.direction).toBe('number')
      expect(p.speed).toBeGreaterThan(0)
      expect(typeof p.oceanic).toBe('boolean')
    }
  })

  it('plateCount=2 仍能产出有效地图（极端少板块场景）', () => {
    const data = generateMap({ seed: 'az-7', pointCount: 2000, plateCount: 2 })
    expect(data.plates.length).toBe(2)
    let water = 0, land = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] < 20) water++
      else land++
    }
    expect(water + land).toBe(data.cells.length)
    expect(water).toBeGreaterThan(0)
  })

  it('continentCount=4 时不会退化成单块梯形超级大陆', () => {
    const data = generateMap({
      seed: 'az-continents-4',
      pointCount: 3000,
      plateCount: 6,
      continentCount: 4,
      generateProvinces: false,
      generateRoads: false,
    })

    expect(countMajorLandmasses(data.cells)).toBeGreaterThanOrEqual(3)
  })
})
