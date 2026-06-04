import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'

/**
 * 默认管线验证（azgaar 重写后）
 *
 * Plan 调整：旧"classic vs azgaar 兼容性"测试已无意义（`realism.level` 字段被移除，
 * 管线统一为 azgaar 风格）。改为验证"默认 config → 仍产出有效地图"。
 */
describe('默认管线', () => {
  it('不传 realism 时 tectonic 已填，volcano 未填（避免污染老路径）', () => {
    const cfg = { seed: 'compat-1', pointCount: 1000 }
    const data = generateMap(cfg)
    expect(data.cells.tectonic).toBeDefined()
    expect(data.cells.tectonic.plateId.length).toBe(data.cells.length)
    expect(data.cells.volcano).toBeUndefined()
  })

  it('plateCount=2 与 plateCount=6 走同一管线（无 level 分支）', () => {
    const a = generateMap({ seed: 'compat-1', pointCount: 1000, plateCount: 2 })
    const b = generateMap({ seed: 'compat-1', pointCount: 1000, plateCount: 6 })
    // 两者都应成功生成（h/tectonic 都被填充）
    expect(a.cells.h.length).toBe(b.cells.h.length)
    expect(a.cells.tectonic.plateId.length).toBe(b.cells.tectonic.plateId.length)
    // plate 数不同 → plateId 取值范围不同
    const aMax = Math.max(...a.cells.tectonic.plateId)
    const bMax = Math.max(...b.cells.tectonic.plateId)
    expect(aMax).toBeLessThan(2)
    expect(bMax).toBeLessThan(6)
  })
})
