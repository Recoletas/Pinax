import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

describe('classic mode 兼容性', () => {
  it('不传 realism 时 tectonic 已填，volcano 未填（避免污染老路径）', () => {
    const cfg = { seed: 'compat-1', pointCount: 1000, heightmapTemplate: 'continents' }
    const data = generateMap(cfg)
    expect(data.cells.tectonic).toBeDefined()
    expect(data.cells.tectonic.plateId.length).toBe(data.cells.length)
    expect(data.cells.volcano).toBeUndefined()
  })

  it('realism.level=classic 等同不传（高度分布 byte-for-byte 一致）', () => {
    const a = generateMap({ seed: 'compat-1', pointCount: 1000 })
    const b = generateMap({
      seed: 'compat-1',
      pointCount: 1000,
      realism: { level: 'classic' },
    })
    expect(a.cells.h.length).toBe(b.cells.h.length)
    let sumDiff = 0
    for (let i = 0; i < a.cells.h.length; i++) {
      sumDiff += Math.abs(a.cells.h[i] - b.cells.h[i])
    }
    expect(sumDiff).toBe(0)
  })
})
