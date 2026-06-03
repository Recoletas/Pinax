import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { computeBorderlands } from '../services/world-map/engine/borderlands'
import { renderMap } from '../services/world-map/engine/renderer'
import { createCanvas } from './helpers/canvas'

/**
 * Phase 4 视觉/性能验收（headless 版）
 *
 * Plan 要求：
 * - 山脉沿板块脊线（cells.tectonic.boundaryType 反映出来）
 * - 海岸有起伏（azgaar 模式 cells.t 多样性 > classic）
 * - 河流弯曲（meandering 风格路径 max-curvature > straight）
 * - 国界 buffer 可见（borderland cell 数量 > 0）
 * - realism.classic 输出与老路径一致（test 已在 realism-classic-compat 覆盖）
 *
 * 性能：
 * - azgaar 20000 cells < 10s
 */

function stats(tectonic) {
  let convergent = 0, divergent = 0, transform = 0
  for (let i = 0; i < tectonic.boundaryType.length; i++) {
    const t = tectonic.boundaryType[i]
    if (t === 1) convergent++
    else if (t === 2) divergent++
    else if (t === 3) transform++
  }
  return { convergent, divergent, transform, total: tectonic.boundaryType.length }
}

function coastSignature(cells) {
  // 沿 coast (|t| <= 6) 的 h 值方差
  // classic 模式：海陆分界整齐，方差小
  // azgaar 模式：fbm 噪声扰动，海岸 h 值起伏大
  const hs = []
  for (let i = 0; i < cells.length; i++) {
    if (Math.abs(cells.t[i]) <= 6) hs.push(cells.h[i])
  }
  if (hs.length < 2) return { variance: 0, n: hs.length }
  const mean = hs.reduce((a, b) => a + b, 0) / hs.length
  const variance = hs.reduce((acc, v) => acc + (v - mean) ** 2, 0) / hs.length
  return { variance, n: hs.length }
}

function maxH(cells) {
  let m = 0
  for (let i = 0; i < cells.length; i++) if (cells.h[i] > m) m = cells.h[i]
  return m
}

function countVolcano(cells) {
  if (!cells.volcano) return 0
  let n = 0
  for (let i = 0; i < cells.volcano.length; i++) if (cells.volcano[i] > 0) n++
  return n
}

function riverCurvature(rivers) {
  // 测试河流路径相对 source→mouth 直线的"摆动幅度"
  // meander 模式下，每个 point 都有 perpendicular offset
  if (rivers.length === 0) return 0
  let total = 0
  let counted = 0
  for (const r of rivers) {
    if (!r.points || r.points.length < 3) continue
    const [sx, sy] = r.points[0]
    const [mx, my] = r.points[r.points.length - 1]
    const lineLen = Math.hypot(mx - sx, my - sy)
    if (lineLen < 1) continue
    // 对每个内部点算到 source→mouth 直线的垂直距离
    let maxDev = 0
    for (let i = 1; i < r.points.length - 1; i++) {
      const [px, py] = r.points[i]
      // 直线 ax + by + c = 0: 标准化 (mx-sx, my-sy) → 法线 (my-sy, -(mx-sx))
      const nx = my - sy, ny = -(mx - sx)
      const nLen = Math.hypot(nx, ny) || 1
      const dist = Math.abs((px - sx) * nx + (py - sy) * ny) / nLen
      if (dist > maxDev) maxDev = dist
    }
    // 归一化到 line 长度 → 单位长度的最大摆动
    total += maxDev / lineLen
    counted++
  }
  return counted > 0 ? total / counted : 0
}

describe('视觉/性能验收', () => {
  it('classic 模式：tectonic 数据填充且 boundary 分类完整', () => {
    const data = generateMap({ seed: 'verify-classic', pointCount: 2000, stateCount: 4, realism: { level: 'classic' } })
    expect(data.cells.tectonic).toBeDefined()
    const s = stats(data.cells.tectonic)
    expect(s.total).toBeGreaterThan(0)
    // classic 模式主要靠 1 个大板块，boundary 较少
    expect(s.convergent + s.divergent + s.transform).toBeGreaterThan(0)
  })

  it('azgaar 模式：火山更多 + 海岸 h 起伏更大', () => {
    const classic = generateMap({ seed: 'verify-cmp', pointCount: 2000, stateCount: 4, realism: { level: 'classic' } })
    const azgaar = generateMap({ seed: 'verify-cmp', pointCount: 2000, stateCount: 4, realism: { level: 'azgaar' } })
    // 1. 火山数 > 0（applyVolcanicArc）
    expect(countVolcano(azgaar.cells)).toBeGreaterThan(0)
    expect(countVolcano(classic.cells)).toBe(0)
    // 2. 海岸 h 方差 > 1.5x classic（perturbCoast fbm 噪声）
    const cs = coastSignature(classic.cells)
    const as = coastSignature(azgaar.cells)
    expect(as.variance).toBeGreaterThan(cs.variance * 1.5)
  })

  it('azgaar 模式：高海拔 cell 数 ≥ classic（applyConvergentRange 加高峰）', () => {
    const classic = generateMap({ seed: 'verify-peak', pointCount: 2000, stateCount: 4, realism: { level: 'classic' } })
    const azgaar = generateMap({ seed: 'verify-peak', pointCount: 2000, stateCount: 4, realism: { level: 'azgaar' } })
    // 计算 h > 80 的 cell 数
    function countHigh(cells) {
      let n = 0
      for (let i = 0; i < cells.length; i++) if (cells.h[i] > 80) n++
      return n
    }
    // azgaar 模式把山峰推得更高，高海拔 cell 至少不能更少
    expect(countHigh(azgaar.cells)).toBeGreaterThanOrEqual(countHigh(classic.cells))
  })

  it('meandering 河流：垂直摆动幅度（相对 source→mouth 线）> straight', () => {
    const straight = generateMap({ seed: 'verify-river', pointCount: 2000, stateCount: 4, realism: { level: 'azgaar', rivers: { style: 'straight' } } })
    const meander = generateMap({ seed: 'verify-river', pointCount: 2000, stateCount: 4, realism: { level: 'azgaar', rivers: { style: 'meandering', meanderAmplitude: 4 } } })
    const sCurv = riverCurvature(straight.rivers)
    const mCurv = riverCurvature(meander.rivers)
    // meander 模式应该有可见的垂直摆动（> 0.1 单位长度）
    expect(mCurv).toBeGreaterThan(0.1)
    // meander 摆动幅度 > straight
    expect(mCurv).toBeGreaterThan(sCurv)
  })

  it('borderland 约束：state 邻接 cell 标记', () => {
    const data = generateMap({ seed: 'verify-border', pointCount: 2000, stateCount: 4, realism: { level: 'azgaar' } })
    const borderland = computeBorderlands(data.cells, { width: 1 })
    // 多 state 地图，相邻 state 必有 borderland
    expect(borderland.size).toBeGreaterThan(0)
  })

  it('renderMap 6 preset 全部成功调用（视觉管道不抛错）', () => {
    for (const preset of ['topographic', 'parchment', 'watercolor', 'dark', 'clean', 'atlas']) {
      const data = generateMap({ seed: `v-${preset}`, pointCount: 500, stateCount: 3, realism: { level: 'azgaar' } })
      const canvas = createCanvas(800, 600)
      expect(() => renderMap(canvas, data, { stylePreset: preset })).not.toThrow()
    }
  })

  it('性能：azgaar 20000 cells < 10s', () => {
    const t0 = Date.now()
    generateMap({
      seed: 'perf-azgaar',
      pointCount: 20000,
      stateCount: 8,
      realism: { level: 'azgaar' },
    })
    const t1 = Date.now()
    expect(t1 - t0).toBeLessThan(10_000)
  }, 15_000)

  it('性能：classic 20000 cells < 5s（与 master 性能对齐）', () => {
    const t0 = Date.now()
    generateMap({
      seed: 'perf-classic',
      pointCount: 20000,
      stateCount: 8,
      realism: { level: 'classic' },
    })
    const t1 = Date.now()
    expect(t1 - t0).toBeLessThan(5_000)
  }, 10_000)
})
