import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { extractCoastlines } from '../services/world-map/engine/coastline'

/**
 * Coastline 提取质量验收
 *
 * 验证 extractCoastlines 产出合法的多边形（闭合、简单、归一化）。
 * 这些是 *契约测试*，不是性能测试 — 写算法改了就该挂。
 */

/** 多边形是否闭合：首尾点距离 < epsilon（实际生成可能舍入到 last 不同的点） */
function isClosed(poly, eps = 1e-9) {
  if (poly.length < 4) return false
  const [x0, y0] = poly[0]
  const [xn, yn] = poly[poly.length - 1]
  return Math.hypot(x0 - xn, y0 - yn) < eps
}

/** 简单多边形（无自交）：用扫描线穿过奇数次=多边形内 */
function isSimple(poly) {
  // O(n²) 段段检测 — 对测试规模（百级顶点）足够
  for (let i = 0; i < poly.length - 1; i++) {
    for (let j = i + 2; j < poly.length - 1; j++) {
      // 跳过共点连续段
      if (i === 0 && j === poly.length - 2) continue
      if (segmentsIntersect(poly[i], poly[i + 1], poly[j], poly[j + 1])) return false
    }
  }
  return true
}

function segmentsIntersect(a, b, c, d) {
  // 严格线段相交（端点相交算否 — 多边形允许首尾共享）
  const ccw = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = ccw(c, d, a)
  const d2 = ccw(c, d, b)
  const d3 = ccw(a, b, c)
  const d4 = ccw(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return false
}

function inBounds(poly) {
  for (const [x, y] of poly) {
    if (x < 0 || x > 1 || y < 0 || y > 1) return false
  }
  return true
}

function approxArea(poly) {
  // 鞋带公式（带符号）
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    s += x0 * y1 - x1 * y0
  }
  return Math.abs(s) / 2
}

describe('Coastline 提取', () => {
  it('默认管线：至少 1 个 coastline,首尾闭合', () => {
    const data = generateMap({ seed: 'c-basic', pointCount: 2000 })
    expect(data.coastlines.length).toBeGreaterThan(0)
    for (const poly of data.coastlines) {
      expect(isClosed(poly)).toBe(true)
    }
  })

  it('所有点归一化到 [0,1]', () => {
    const data = generateMap({ seed: 'c-bounds', pointCount: 2000 })
    for (const poly of data.coastlines) {
      expect(inBounds(poly)).toBe(true)
    }
  })

  it('简单多边形（无自交）', () => {
    const data = generateMap({ seed: 'c-simple', pointCount: 2000 })
    for (const poly of data.coastlines) {
      expect(isSimple(poly)).toBe(true)
    }
  })

  it('大陆面积：单大陆（cc=1）面积 > 0.05（全图 5%）', () => {
    const data = generateMap({ seed: 'c-area1', pointCount: 2000, continentCount: 1, plateCount: 4 })
    const total = data.coastlines.reduce((s, p) => s + approxArea(p), 0)
    expect(total).toBeGreaterThan(0.05)
  })

  it('大陆数量：cc=4 → ≥1 个 coastlines', () => {
    // 第一轮：continentCount=4 走自动 pickTemplate，路由到 'continents' 组。
    // 旧测试期望 ≥3 是基于旧 pickTemplate 的 4-way 池（continents/oldWorld/
    // pangea/mediterranean）会出多块大陆；新版'continents'组内 3 个模板
    // 各产生 1-2 个 coastline（合计可能仍为 1-2）。
    // 显式模板的多陆块合同由 heightmap-template-semantics.test.js 覆盖。
    const data = generateMap({ seed: 'c-cc4', pointCount: 3000, continentCount: 4, plateCount: 6 })
    expect(data.coastlines.length).toBeGreaterThanOrEqual(1)
  })

  it('手动单陆块：1 个 coastline, 闭合, 非空', () => {
    // 验证 extractCoastlines 在受控输入下也稳定
    const data = generateMap({ seed: 'c-handmade-host', pointCount: 800, continentCount: 1, plateCount: 4 })
    // 模板路径下 landmass 的枚举顺序不稳定，取最大陆块做断言。
    const cells = data.cells
    const seen = new Uint8Array(cells.length)
    let maxLandmass = 0
    for (let start = 0; start < cells.length; start++) {
      if (seen[start] || cells.h[start] < 20) continue
      const queue = [start]
      let size = 0
      seen[start] = 1
      for (let head = 0; head < queue.length; head++) {
        const c = queue[head]
        size++
        for (const n of cells.c[c]) {
          if (seen[n] || cells.h[n] < 20) continue
          seen[n] = 1
          queue.push(n)
        }
      }
      if (size > maxLandmass) maxLandmass = size
    }
    expect(maxLandmass).toBeGreaterThan(30)
    const polys = extractCoastlines(cells, data.vertices, data.width, data.height)
    expect(polys.length).toBeGreaterThanOrEqual(1)
    expect(isClosed(polys[0])).toBe(true)
    expect(polys[0].length).toBeGreaterThanOrEqual(8)
  })

  it('deterministic：同 seed → 同 coastlines', () => {
    const a = generateMap({ seed: 'c-determin', pointCount: 1500 })
    const b = generateMap({ seed: 'c-determin', pointCount: 1500 })
    expect(a.coastlines.length).toBe(b.coastlines.length)
    for (let i = 0; i < a.coastlines.length; i++) {
      expect(a.coastlines[i].length).toBe(b.coastlines[i].length)
      const [ax, ay] = a.coastlines[i][0]
      const [bx, by] = b.coastlines[i][0]
      expect(Math.abs(ax - bx)).toBeLessThan(1e-9)
      expect(Math.abs(ay - by)).toBeLessThan(1e-9)
    }
  })
})
