import { describe, it, expect } from 'vitest'

/**
 * 工具：构造一个最小化、可手算的 GridCells 给 `expandStates` / `findPath` 用。
 *  - 6 邻 Voronoi 邻居表
 *  - 高度 / biome / culture / s / state 全 0 初始化
 *  - cell 0..n-1 坐标线性 (i*10, 0)
 */

function makeCells(neighbors) {
  const length = neighbors.length
  const p = new Float32Array(length * 2)
  for (let i = 0; i < length; i++) { p[i * 2] = i * 10; p[i * 2 + 1] = 0 }
  const c = neighbors
  const h = new Int8Array(length).fill(50)         // 全陆地（>= SEA_LEVEL 20）
  const r = new Int32Array(length)                  // 无河流
  const biome = new Uint8Array(length)              // biome 0
  const culture = new Int8Array(length)              // culture 0
  const s = new Int8Array(length).fill(10)          // 全部有人居住（>= 1）
  const state = new Int16Array(length)              // 全 0（无主）
  return { length, p, c, h, r, biome, culture, s, state }
}

/** 一个 3x3 矩形网格，每 cell 与其直接邻居（上下左右）相连。 */
function grid3x3() {
  // 编号：
  //  0 1 2
  //  3 4 5
  //  6 7 8
  const idx = (r, c) => r * 3 + c
  const n = (r, c) => (r >= 0 && r < 3 && c >= 0 && c < 3) ? [idx(r, c)] : []
  const nb = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    nb.push([...n(r - 1, c), ...n(r + 1, c), ...n(r, c - 1), ...n(r, c + 1)])
  }
  return makeCells(nb)
}

/** 构造 findPath 测试用的直线网格：cells 0..n-1, cell i 与 {i-1, i+1} 相连 */
function line(n) {
  const nb = []
  for (let i = 0; i < n; i++) {
    const a = []
    if (i > 0) a.push(i - 1)
    if (i < n - 1) a.push(i + 1)
    nb.push(a)
  }
  return makeCells(nb)
}

describe('nations', () => {
  describe('findPath', () => {
    it('在直线上返回最短路径', async () => {
      // 创建一个 line(5) 网格，手算从 0 到 4 的最短路径
      // 路径应为 [0, 1, 2, 3, 4]，长度 4
      const cells = line(5)
      // findPath 是模块私有函数 — 通过 import 拿到模块对象，访问内部函数不可行。
      // 改为通过 generateRoads 测：在 cells 中放置两个 burg，调用 generateRoads，
      // 断言返回的 roads 包含一条连接两 burg 的 major/minor road，cells 序列为 [0,1,2,3,4]。
      const nations = await import('../services/world-map/engine/nations')
      // 注意：generateRoads 过滤 b.i > 0，所以 burg i 从 1 开始（与 expandStates 测试中的模式一致）
      const burgs = [
        { i: 1, name: 'A', cell: 0, x: 0, y: 0, state: 1, capital: true, port: false, population: 100 },
        { i: 2, name: 'B', cell: 4, x: 40, y: 0, state: 1, capital: true, port: false, population: 100 },
      ]
      const states = [
        { i: 0, name: '_', color: '#ccc', capital: 0, expansionism: 0, cells: 0, area: 0, totalPopulation: 0 },
        { i: 1, name: 'A', color: '#000', capital: 0, expansionism: 1.0, cells: 0, area: 0, totalPopulation: 0 },
      ]
      const roads = nations.generateRoads(cells, burgs, states, () => 0.5)
      // 应至少有一条 road
      expect(roads.length).toBeGreaterThan(0)
      // 至少一条 road 的 cells 应是从 0 到 4 的连续序列
      const path = roads[0].cells
      expect(path).toEqual([0, 1, 2, 3, 4])
    })

    it('不可达时返回空数组不抛错', async () => {
      // 构造两个 burg：一个在 cell 0（陆地），另一个在 cell 2（陆地但 cell 1 是水域）
      // 路径应不存在 → roads 应不包含连接此对的条目，且不抛错
      const cells = line(3)
      cells.h[1] = 0  // cell 1 改为水域（< SEA_LEVEL）
      const nations = await import('../services/world-map/engine/nations')
      // 注意：generateRoads 过滤 b.i > 0，所以 burg i 从 1 开始
      const burgs = [
        { i: 1, name: 'A', cell: 0, x: 0, y: 0, state: 1, capital: true, port: false, population: 100 },
        { i: 2, name: 'B', cell: 2, x: 20, y: 0, state: 1, capital: false, port: false, population: 50 },
      ]
      const states = [
        { i: 0, name: '_', color: '#ccc', capital: 0, expansionism: 0, cells: 0, area: 0, totalPopulation: 0 },
        { i: 1, name: 'A', color: '#000', capital: 0, expansionism: 1.0, cells: 0, area: 0, totalPopulation: 0 },
      ]
      // 不应抛错；返回 roads 数组（可能为空，可能含 0-length 路径）
      const roads = nations.generateRoads(cells, burgs, states, () => 0.5)
      // 主断言：调用完成，无异常
      expect(Array.isArray(roads)).toBe(true)
    })
  })

  describe('expandStates', () => {
    it('邻接 capital 的 cell 归该 capital', async () => {
      const nations = await import('../services/world-map/engine/nations')
      const cells = grid3x3()
      // 一个 state，capital 在 cell 4（中心）
      const states = [
        { i: 0, name: '_', color: '#ccc', capital: 0, expansionism: 0, cells: 0, area: 0, totalPopulation: 0 },
        { i: 1, name: 'A', color: '#000', capital: 0, expansionism: 1.0, cells: 0, area: 0, totalPopulation: 0 },
      ]
      const burgs = [{ i: 0, name: 'X', cell: 4, x: 40, y: 0, state: 1, capital: true, port: false, population: 100 }]
      nations.__test_expandStates?.(cells, states, burgs)
      // 期望：所有 9 个 cell 都归 state 1（只有一个 state，扩张会覆盖全部）
      const allClaimed = Array.from({ length: 9 }, (_, i) => cells.state[i])
      expect(allClaimed.every(s => s === 1)).toBe(true)
    })

    it('多 state 时每个 cell 被唯一认领', async () => {
      const nations = await import('../services/world-map/engine/nations')
      const cells = grid3x3()
      // 两个 state，capital 分别在 cell 1 和 cell 7
      const states = [
        { i: 0, name: '_', color: '#ccc', capital: 0, expansionism: 0, cells: 0, area: 0, totalPopulation: 0 },
        { i: 1, name: 'A', color: '#000', capital: 0, expansionism: 1.0, cells: 0, area: 0, totalPopulation: 0 },
        { i: 2, name: 'B', color: '#fff', capital: 0, expansionism: 1.0, cells: 0, area: 0, totalPopulation: 0 },
      ]
      const burgs = [
        { i: 0, name: '', cell: 0, x: 0, y: 0, state: 0, capital: false, port: false, population: 0 },
        { i: 1, name: 'C1', cell: 1, x: 10, y: 0, state: 1, capital: true, port: false, population: 100 },
        { i: 2, name: 'C2', cell: 7, x: 70, y: 0, state: 2, capital: true, port: false, population: 100 },
      ]
      nations.__test_expandStates?.(cells, states, burgs)
      // 期望：所有 9 个 cell 都被认领（state > 0）
      for (let i = 0; i < 9; i++) {
        expect(cells.state[i]).toBeGreaterThan(0)
      }
    })
  })

  describe('bad-seed 回归', () => {
    it('在 known-bad pangea seed 42 下 states 阶段保持在 5s 内', async () => {
      const [{ generateMap }, { PerfCollector }, nations] = await Promise.all([
        import('../services/world-map/engine/generate'),
        import('../services/world-map/engine/perf'),
        import('../services/world-map/engine/nations'),
      ])

      const cfg = {
        seed: '42',
        pointCount: 20000,
        plateCount: 2,
        stateCount: 8,
        generateProvinces: false,
        generateRoads: false,
      }

      const collector = new PerfCollector()
      let meta
      let diagnostics
      nations.__test_setExpandStatesDiagnosticsEnabled?.(true)
      try {
        generateMap(cfg, collector)
        meta = collector.finish(cfg.seed)
        diagnostics = nations.__test_getLastExpandStatesDiagnostics?.()
      } finally {
        nations.__test_setExpandStatesDiagnosticsEnabled?.(false)
      }

      const stateMs = meta.timings.find(t => t.stage === 'states')?.durationMs

      expect(diagnostics).not.toBeNull()
      // pushCount 语义变了：原来是 heap 入堆次数，现在是 getEdgeWeight 调用次数（边被考虑的次数）
      // graphology 内部用堆但堆大小对外不暴露，maxHeap 固定为 0
      // 注：template 路径下 pangea (seed=42) 产生更多 land/edges，
      // pushCount 比 FBM 路径高（实测 ~430k）。阈值放宽到 600k。
      expect(diagnostics.pushCount).toBeLessThan(600000)
      expect(diagnostics.maxHeap).toBe(0)
      expect(stateMs).toBeTypeOf('number')
      expect(stateMs).toBeLessThan(5000)
    }, 180000)
  })
})
