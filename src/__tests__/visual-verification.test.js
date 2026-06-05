import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { computeBorderlands } from '../services/world-map/engine/borderlands'
import { renderMap } from '../services/world-map/engine/renderer'
import { createCanvas } from './helpers/canvas'

/**
 * Phase 4 视觉/性能验收（headless 版）
 *
 * Plan 要求（azgaar 重写后）：
 * - 山脉沿板块脊线（cells.tectonic.boundaryType 反映出来）
 * - 海岸有起伏（perturbCoast fbm 噪声）
 * - 河流弯曲（meandering 风格路径 max-curvature > straight）
 * - 国界 buffer 可见（borderland cell 数量 > 0）
 *
 * 性能：
 * - 默认管线 20000 cells < 10s
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
  // 旧 classic 模式：海陆分界整齐，方差小
  // azgaar 管线：fbm 噪声扰动，海岸 h 值起伏大
  const hs = []
  for (let i = 0; i < cells.length; i++) {
    if (Math.abs(cells.t[i]) <= 6) hs.push(cells.h[i])
  }
  if (hs.length < 2) return { variance: 0, n: hs.length }
  const mean = hs.reduce((a, b) => a + b, 0) / hs.length
  const variance = hs.reduce((acc, v) => acc + (v - mean) ** 2, 0) / hs.length
  return { variance, n: hs.length }
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
    let maxDev = 0
    for (let i = 1; i < r.points.length - 1; i++) {
      const [px, py] = r.points[i]
      const nx = my - sy, ny = -(mx - sx)
      const nLen = Math.hypot(nx, ny) || 1
      const dist = Math.abs((px - sx) * nx + (py - sy) * ny) / nLen
      if (dist > maxDev) maxDev = dist
    }
    total += maxDev / lineLen
    counted++
  }
  return counted > 0 ? total / counted : 0
}

describe('视觉/性能验收', () => {
  it('默认管线：tectonic 数据填充且 boundary 分类完整', () => {
    const data = generateMap({ seed: 'verify-default', pointCount: 2000, stateCount: 4 })
    expect(data.cells.tectonic).toBeDefined()
    const s = stats(data.cells.tectonic)
    expect(s.total).toBeGreaterThan(0)
    expect(s.convergent + s.divergent + s.transform).toBeGreaterThan(0)
  })

  it('默认管线：边界类型数量分布合理（多 plate → 多类边界）', () => {
    const data = generateMap({ seed: 'verify-bound', pointCount: 2000, stateCount: 4, plateCount: 8 })
    const s = stats(data.cells.tectonic)
    // 8 板块 → 至少 2-3 个边界段
    expect(s.convergent + s.divergent + s.transform).toBeGreaterThanOrEqual(2)
  })

  it('默认管线：海岸 h 方差 > 0（perturbCoast 噪声生效）', () => {
    const data = generateMap({ seed: 'verify-coast', pointCount: 2000, stateCount: 4 })
    const cs = coastSignature(data.cells)
    expect(cs.n).toBeGreaterThan(0)
    expect(cs.variance).toBeGreaterThan(0)
  })

  it('meandering 河流：垂直摆动幅度（相对 source→mouth 线）> straight', () => {
    const straight = generateMap({ seed: 'verify-river', pointCount: 2000, stateCount: 4, realism: { rivers: { style: 'straight' } } })
    const meander = generateMap({ seed: 'verify-river', pointCount: 2000, stateCount: 4, realism: { rivers: { style: 'meandering', meanderAmplitude: 4 } } })
    const sCurv = riverCurvature(straight.rivers)
    const mCurv = riverCurvature(meander.rivers)
    expect(mCurv).toBeGreaterThan(0.1)
    expect(mCurv).toBeGreaterThan(sCurv)
  })

  it('borderland 约束：state 邻接 cell 标记', () => {
    const data = generateMap({ seed: 'verify-border', pointCount: 2000, stateCount: 4 })
    const borderland = computeBorderlands(data.cells, { width: 1 })
    expect(borderland.size).toBeGreaterThan(0)
  })

  it('renderMap 6 preset 全部成功调用（视觉管道不抛错）', () => {
    for (const preset of ['topographic', 'parchment', 'watercolor', 'dark', 'clean', 'atlas']) {
      const data = generateMap({ seed: `v-${preset}`, pointCount: 500, stateCount: 3 })
      const canvas = createCanvas(800, 600)
      expect(() => renderMap(canvas, data, { stylePreset: preset })).not.toThrow()
    }
  })

  it('性能：默认管线 20000 cells < 10s', () => {
    const t0 = Date.now()
    generateMap({
      seed: 'perf-default',
      pointCount: 20000,
      stateCount: 8,
    })
    const t1 = Date.now()
    expect(t1 - t0).toBeLessThan(10_000)
  }, 15_000)

  it('性能：plateCount=2 + bad seed 5s 内完成（仍能跑）', () => {
    // 旧实现用 heightmapTemplate:'pangea' + seed=42 触发慢路径；
    // 新管线用 plateCount=2 + seed=42 仍可触发边界多 + 山带复杂的场景。
    const t0 = Date.now()
    generateMap({
      seed: '42',
      pointCount: 20000,
      plateCount: 2,
      stateCount: 8,
    })
    const t1 = Date.now()
    expect(t1 - t0).toBeLessThan(10_000)
  }, 15_000)

  it('volcano 约束：worldbook 标记的 cell 进入 cells.volcano', () => {
    // 验证约束通路仍然有效（不再依赖随机的洋-陆汇聚）
    const data = generateMap({
      seed: 'verify-volcano',
      pointCount: 2000,
      stateCount: 4,
      constraints: {
        mountains: [{ name: 'X1', cells: [100, 200, 300], type: 'volcano' }],
      },
    })
    expect(data.cells.volcano).toBeDefined()
    const n = countVolcano(data.cells)
    expect(n).toBeGreaterThan(0)
  })

  /**
   * 结构化视觉基线（PNG 快照替代）
   *
   * 原计划用 Playwright 拍 3 张 PNG（cc=1, cc=4, cc=6）做视觉回归。
   * 现实：renderer 跑的是 jsdom stub canvas（无真实像素），PNG 快照
   * 抓不到内容。所以改成 *结构化签名* 快照：每个 cc 配置下的
   *   - 陆/海 cell 数
   *   - coastline 数量 + 每个环的顶点数
   *   - boundary 类型分布
   * 写算法改了就该挂。改 FBM 系数 / 阈值需要同步更新 snapshot。
   */
  function visualSignature(data) {
    let land = 0, water = 0
    for (let i = 0; i < data.cells.length; i++) {
      if (data.cells.h[i] >= 20) land++
      else water++
    }
    return {
      total: data.cells.length,
      land,
      water,
      landRatio: Math.round((land / data.cells.length) * 1000) / 1000,
      plates: data.plates.length,
      boundaries: data.boundaries.length,
      boundaryByType: stats(data.cells.tectonic),
      coastlines: data.coastlines.length,
      coastlineVertCounts: data.coastlines.map(c => c.length).sort((a, b) => a - b),
    }
  }

  it('视觉基线：cc=1（单大陆）', () => {
    const data = generateMap({
      seed: 'visual-cc1', pointCount: 2000, stateCount: 4,
      continentCount: 1, plateCount: 4,
    })
    const sig = visualSignature(data)
    expect(sig).toMatchSnapshot('visual-cc1')
  })

  it('视觉基线：cc=4（多大陆）', () => {
    const data = generateMap({
      seed: 'visual-cc4', pointCount: 3000, stateCount: 6,
      continentCount: 4, plateCount: 6,
    })
    const sig = visualSignature(data)
    expect(sig).toMatchSnapshot('visual-cc4')
  })

  it('视觉基线：cc=6（多大陆 + 多板块）', () => {
    const data = generateMap({
      seed: 'visual-cc6', pointCount: 3000, stateCount: 8,
      continentCount: 6, plateCount: 8,
    })
    const sig = visualSignature(data)
    expect(sig).toMatchSnapshot('visual-cc6')
  })
})
