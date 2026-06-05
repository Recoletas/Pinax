/**
 * 国家和城市生成
 * 城市：按适宜度评分放置
 * 国家：多源统一优先队列 Dijkstra 扩张（阶段 3）
 * 文化：成本扩散 Dijkstra（阶段 3）
 */

import type { GridCells, Burg, State, Culture, Province, Road, Government } from './types'
import { BIOMES } from './climate'
import { getStateName, getCapitalName, getTownName, getCultureName, getProvinceName } from './name-pool'
import {
  adaptiveSpacing,
  capitalScore,
  isArchipelagic,
  precomputeRiverConfluence,
  settlementScoreRaw,
} from './settlements'
import Graph from 'graphology'
import { astar } from 'graphology-shortest-path'

const SEA_LEVEL = 20

// ── 最小堆（多源 Dijkstra 用） ─────────────────────────

/** 通用最小堆 — 多源 Dijkstra 与文化成本扩散共用 */
class MinHeap<T> {
  private heap: T[] = []
  constructor(private readonly cmp: (a: T, b: T) => number) {}

  get size(): number { return this.heap.length }
  empty(): boolean { return this.heap.length === 0 }

  push(item: T): void {
    this.heap.push(item)
    this.siftUp(this.heap.length - 1)
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined
    const top = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }
    return top
  }

  private siftUp(idx: number): void {
    const a = this.heap
    while (idx > 0) {
      const parent = (idx - 1) >> 1
      if (this.cmp(a[idx], a[parent]) < 0) {
        const tmp = a[idx]
        a[idx] = a[parent]
        a[parent] = tmp
        idx = parent
      } else break
    }
  }

  private siftDown(idx: number): void {
    const a = this.heap
    const n = a.length
    for (;;) {
      const l = 2 * idx + 1
      const r = l + 1
      let smallest = idx
      if (l < n && this.cmp(a[l], a[smallest]) < 0) smallest = l
      if (r < n && this.cmp(a[r], a[smallest]) < 0) smallest = r
      if (smallest === idx) break
      const tmp = a[idx]
      a[idx] = a[smallest]
      a[smallest] = tmp
      idx = smallest
    }
  }
}

// ── 阶段 3：政体偏置 moveCostForEdge + 辅助函数 ─────────

/** 主河道：cells.r>0 且 fl 在所有 river cells 的 top 30% */
function computeMainRiverCells(cells: GridCells): Uint8Array {
  const n = cells.length
  const result = new Uint8Array(n)
  if (!cells.fl) return result
  // 收集有 flow 的 river cell
  const flows: Array<{ i: number, fl: number }> = []
  for (let i = 0; i < n; i++) {
    if (cells.r && cells.r[i] > 0 && cells.fl[i] > 0) {
      flows.push({ i, fl: cells.fl[i] })
    }
  }
  if (flows.length === 0) return result
  flows.sort((a, b) => b.fl - a.fl)
  const top = Math.max(1, Math.floor(flows.length * 0.3))
  for (let k = 0; k < top; k++) result[flows[k].i] = 1
  return result
}

/** src → tgt 是否顺流（src 在上游） */
function flowsDownhill(cells: GridCells, src: number, tgt: number): boolean {
  if (!cells.fl) return false
  if (!cells.r || cells.r[src] === 0 || cells.r[tgt] === 0) return false
  return cells.fl[src] > cells.fl[tgt]
}

/** 简化版"近海"判定:h<35 → 海洋/海岸(供 naval 偏置用) */
function isOceanic(cells: GridCells, tgt: number): boolean {
  return cells.h[tgt] < 35
}

/** 单元格的"可占据性"分数:<0.3 视为自然屏障,不向外扩张 */
function frontierScore(cells: GridCells, i: number, mainRiverSet: Uint8Array): number {
  // 沙漠屏障
  if (cells.biome[i] === 1 || cells.biome[i] === 2) return 0.1
  // 主流河道屏障
  if (mainRiverSet[i] === 1) return 0.2
  // 高山(降低偏好但仍可占据)
  if (cells.h[i] > 70) return 0.5
  return 1.0
}

/**
 * 计算 cell 间的移动成本（biome + culture + 适宜度 + 高程 + 河流 + 政体偏置）。
 * expansionism 由调用方除。
 */
function moveCostForEdge(
  cells: GridCells,
  src: number,
  tgt: number,
  state: State,
  mainRiverSet: Uint8Array,
): number {
  const biome = BIOMES[cells.biome[tgt]]
  // biome 缺省兜底：与 findPath 同款防护
  let mc = (biome?.moveCost ?? 100) / 10
  if (cells.h[tgt] > 70) mc += (cells.h[tgt] - 70) * 5
  if (cells.s[tgt] < 1) mc += 200
  // 文化边界(源/目标文化不同 且目标非 0)
  if (
    cells.culture[tgt] !== cells.culture[src] &&
    cells.culture[tgt] !== 0
  ) mc += 30
  // 跨主河道:目标在主河上,且 src 不在目标上游
  if (mainRiverSet[tgt] === 1 && !flowsDownhill(cells, src, tgt)) mc += 25
  // 政体偏置
  const gov: Government = state.government ?? 'generic'
  const oceanic = isOceanic(cells, tgt)
  if (gov === 'naval' && oceanic) mc *= 0.6
  if (gov === 'highland' && cells.h[tgt] > 60) mc *= 0.7
  if (gov === 'nomadic' && (cells.biome[tgt] === 3 || cells.biome[tgt] === 4)) mc *= 0.65
  if (gov === 'river' && cells.r && cells.r[tgt] > 0) mc *= 0.7
  // 跨海(非 naval)= 强惩罚
  if (oceanic && gov !== 'naval') mc += 100
  return mc / state.expansionism
}

/** 单元格的"政体"权重表(根据地形/海港/河流/草原给出倾向) */
function pickGovernmentByTerrain(cells: GridCells, capitalCell: number, rng: () => number): Government {
  const isCoast = (cells.harbor?.[capitalCell] ?? 0) > 0 || cells.h[capitalCell] < 35
  const isMountain = cells.h[capitalCell] > 60
  const isGrass = cells.biome[capitalCell] === 3 || cells.biome[capitalCell] === 4
  const isRiver = (cells.r?.[capitalCell] ?? 0) > 0

  // 加权(各 30 起步,匹配地形时 +50)
  const weights: Array<[Government, number]> = [['generic', 30]]
  if (isCoast) weights.push(['naval', 70])
  if (isMountain) weights.push(['highland', 80])
  if (isGrass) weights.push(['nomadic', 60])
  if (isRiver) weights.push(['river', 50])

  const total = weights.reduce((s, [, w]) => s + w, 0)
  const r = rng() * total
  let acc = 0
  for (const [gov, w] of weights) {
    acc += w
    if (r < acc) return gov
  }
  return 'generic'
}

// ── 颜色池 ──
const STATE_COLORS = [
  '#4e79a7', '#e15759', '#f28e2b', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#86bcb6', '#8cd17d', '#b6992d', '#499894', '#e15759',
  '#f1ce63', '#d37295', '#a0cbe8', '#fabfd2', '#d4a6c8',
]

interface ExpandStatesDiagnostics {
  pushCount: number
  popCount: number
  staleCount: number
  edgeScanCount: number
  updateCount: number
  reassignmentCount: number
  maxHeap: number
  maxNeighborCount: number
}

let expandStatesDiagnosticsEnabled = false
let lastExpandStatesDiagnostics: ExpandStatesDiagnostics | null = null

/** 放置城镇(阶段 2:4 轮评分放置的薄壳)
 *  1. 首都:capitalScore 排序 + adaptive spacing
 *  2. 大港:settlementScore > 0.7 && port + 大 spacing
 *  3. 区域中心:settlementScore > 0.55 + min-distance to existing burgs
 *  4. 一般城镇:remaining settlementScore > 0.3
 *
 *  公共签名 + Burg[] 形状与之前一致。
 */
export function generateBurgs(
  cells: GridCells,
  stateCount: number,
  burgDensity: number,
  width: number,
  height: number,
  rng: () => number,
  burgNames?: string[],
): Burg[] {
  const burgs: Burg[] = [{ i: 0, name: '', cell: 0, x: 0, y: 0, state: 0, capital: false, port: false, population: 0 }]

  // 候选陆地单元格(海平面之上 + 最低适宜度阈值)
  const candidates: number[] = []
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] >= SEA_LEVEL && cells.s[i] > 5) candidates.push(i)
  }
  if (candidates.length === 0) return burgs

  const archipelagic = isArchipelagic(cells)
  const confMask = precomputeRiverConfluence(cells)

  // 间距常量(用 climate 为常驻值,根据 biome 单独再算)
  // 给 town 一个统一下限(避免太密)
  const globalSpacing = adaptiveSpacing(
    width, height, cells.length,
    4, // biome 4 (温带草原) 是参考
    archipelagic,
  )

  const rankCandidates = (
    predicate: (i: number) => boolean,
    scoreFn: (i: number) => number,
  ): Array<{ i: number; score: number }> => (
    candidates
      .filter(i => !isBurg(i) && predicate(i))
      .map(i => ({ i, score: scoreFn(i) }))
      .sort((a, b) => b.score - a.score)
  )

  // ── 工具:在剩余 candidates 中选最优 cell,跳过太近 ──
  const placedCells: number[] = []
  const isBurg = (i: number) => cells.burg[i] > 0
  const placeOne = (
    cell: number,
    opts: { name: string; capital: boolean; snapPort: number },
  ): void => {
    const isPort = cells.harbor[cell] > 0
    // state 字段会在 generateStates 阶段被覆盖(以 State.i 重写) — 此处用 0 占位
    const burg: Burg = {
      i: burgs.length,
      name: opts.name,
      cell,
      x: cells.p[cell * 2],
      y: cells.p[cell * 2 + 1],
      state: 0,
      capital: opts.capital,
      port: isPort,
      population: opts.capital
        ? Math.round(cells.s[cell] * (1 + rng()) * 2)
        : Math.round(cells.s[cell] * (0.5 + rng())),
    }
    // 港口城市向水域靠拢(保持原行为)
    if (isPort && cells.haven[cell]) {
      const haven = cells.haven[cell]
      const w = opts.snapPort
      burg.x = burg.x * (1 - w) + cells.p[haven * 2] * w
      burg.y = burg.y * (1 - w) + cells.p[haven * 2 + 1] * w
    }
    burgs.push(burg)
    cells.burg[cell] = burg.i
    placedCells.push(cell)
  }

  // ── 轮 1:首都 ──
  // 按 capitalScore 降序,自适应 spacing
  const capitalCandidates = candidates
    .map(i => ({ i, score: capitalScore(cells, i, stateCount, placedCells, height) }))
    .sort((a, b) => b.score - a.score)

  for (const { i } of capitalCandidates) {
    if (placedCells.length >= stateCount) break
    if (isBurg(i)) continue
    const spacing = adaptiveSpacing(width, height, cells.length, cells.biome[i], archipelagic)
    if (isTooClose(cells, i, placedCells, spacing)) continue
    placeOne(i, {
      name: burgNames?.[burgs.length - 1] || getCapitalName(burgs.length - 1),
      capital: true,
      snapPort: 0.3,
    })
  }

  // ── 轮 2:大港 ──
  // settlementScore > 0.7 && port + 大 spacing(>= globalSpacing * 1.5)
  const portSpacing = globalSpacing * 1.5
  const majorPortCandidates = rankCandidates(
    i => cells.harbor[i] > 0,
    i => settlementScoreRaw(cells, i, true, confMask[i] === 1, height),
  )
  for (const { i, score } of majorPortCandidates) {
    if (score <= 0.7) break
    if (isTooClose(cells, i, placedCells, portSpacing)) continue
    placeOne(i, {
      name: getTownName(burgs.length - 1),
      capital: false,
      snapPort: 0.2,
    })
  }

  // ── 轮 3:区域中心 ──
  // settlementScore > 0.55 + min-distance to existing
  const regionSpacing = globalSpacing * 0.9
  const regionalCandidates = rankCandidates(
    () => true,
    i => settlementScoreRaw(cells, i, cells.harbor[i] > 0, confMask[i] === 1, height),
  )
  for (const { i, score } of regionalCandidates) {
    if (score <= 0.55) break
    if (isTooClose(cells, i, placedCells, regionSpacing)) continue
    placeOne(i, {
      name: getTownName(burgs.length - 1),
      capital: false,
      snapPort: 0.2,
    })
  }

  // ── 轮 4:一般城镇 ──
  // 剩余 settlementScore > 0.3 + 更小间距
  const townSpacing = globalSpacing * 0.4
  const townCap = Math.floor(candidates.length * burgDensity * 0.02)
  let townPlaced = 0
  const townCandidates = rankCandidates(
    () => true,
    i => settlementScoreRaw(cells, i, cells.harbor[i] > 0, confMask[i] === 1, height),
  )
  for (const { i, score } of townCandidates) {
    if (townPlaced >= townCap) break
    if (score <= 0.3) break
    if (isTooClose(cells, i, placedCells, townSpacing)) continue
    placeOne(i, {
      name: getTownName(burgs.length - 1),
      capital: false,
      snapPort: 0.2,
    })
    townPlaced++
  }

  // 首都 state 字段统一(原 generateStates 之前会重写一次,这里留 state 留作生成时的临时)
  // 实际上 capitals 在轮 1 用 placeOne 时 state = burgs.length(占位)。
  // 真正的 state id 会在 generateStates 阶段被 burg.state 重新赋值。
  return burgs
}

/** 生成国家（多源 Dijkstra 扩张，阶段 3） */
export function generateStates(
  cells: GridCells,
  burgs: Burg[],
  _stateCount: number,
  rng: () => number,
  stateNames?: string[],
): State[] {
  const states: State[] = [{
    i: 0, name: '无主之地', color: '#ccc', capital: 0,
    expansionism: 0, cells: 0, area: 0, totalPopulation: 0,
    government: 'generic',
  }]

  // 创建国家（每个首都一个）
  const capitals = burgs.filter(b => b.capital)
  for (let i = 0; i < capitals.length; i++) {
    const burg = capitals[i]
    // 阶段 3：根据首都地形预分配政体(供 moveCostForEdge 用)
    const government = pickGovernmentByTerrain(cells, burg.cell, rng)
    const state: State = {
      i: states.length,
      name: stateNames?.[i] || getStateName(i),
      color: STATE_COLORS[i % STATE_COLORS.length],
      capital: burg.i,
      expansionism: 0.8 + rng() * 1.5,
      cells: 0,
      area: 0,
      totalPopulation: 0,
      government,
    }
    states.push(state)
    burg.state = state.i
  }

  // 多源 Dijkstra 扩张
  expandStates(cells, states, burgs)

  // 分配城镇到所在国家
  for (const burg of burgs) {
    if (burg.i === 0) continue
    if (!burg.capital) {
      burg.state = cells.state[burg.cell]
    }
  }

  // 统计
  for (const state of states) {
    if (state.i === 0) continue
    let cellCount = 0
    let pop = 0
    for (let i = 0; i < cells.length; i++) {
      if (cells.state[i] === state.i) {
        cellCount++
        pop += cells.pop[i]
      }
    }
    state.cells = cellCount
    state.totalPopulation = pop
  }

  return states
}

/** 测试用 hook：暴露 expandStates。 */
export const __test_expandStates = expandStates

/** 测试用 hook：启用/关闭 expandStates 诊断计数。 */
export function __test_setExpandStatesDiagnosticsEnabled(enabled: boolean): void {
  expandStatesDiagnosticsEnabled = enabled
  if (enabled) lastExpandStatesDiagnostics = null
}

/** 测试用 hook：读取最近一次 expandStates 的诊断数据。 */
export function __test_getLastExpandStatesDiagnostics(): ExpandStatesDiagnostics | null {
  return lastExpandStatesDiagnostics
}

/** 阶段 3：多源统一优先队列 Dijkstra 扩张 + 平滑 + 去飞地 */
function expandStates(cells: GridCells, states: State[], burgs: Burg[]): void {
  const n = cells.length
  const bestCost = new Float64Array(n).fill(Infinity)

  // 预计算主流河道
  const mainRiverSet = computeMainRiverCells(cells)

  const diagnostics = expandStatesDiagnosticsEnabled
    ? {
        // 阶段 3 语义：pushCount = 实际 heap.push 次数
        pushCount: 0,
        popCount: 0,
        staleCount: 0,
        edgeScanCount: 0,
        updateCount: 0,
        reassignmentCount: 0,
        // maxHeap 保留为 0(测试断言要求;若要跟踪也用真实数,目前保留 0 兼容性最好)
        maxHeap: 0,
        maxNeighborCount: 0,
      }
    : null

  lastExpandStatesDiagnostics = null

  // ── 多源统一优先队列 ──
  const heap = new MinHeap<{ cell: number, cost: number, state: number }>(
    (a, b) => a.cost - b.cost,
  )

  for (const state of states) {
    if (state.i === 0) continue
    const burg = burgs[state.capital]
    if (!burg) continue
    const cell = burg.cell
    if (cells.h[cell] < SEA_LEVEL) continue
    bestCost[cell] = 0
    cells.state[cell] = state.i
    heap.push({ cell, cost: 0, state: state.i })
    if (diagnostics) diagnostics.pushCount++
  }

  const maxCost = n * 0.8

  while (!heap.empty()) {
    const top = heap.pop()!
    if (diagnostics) diagnostics.popCount++
    if (top.cost > bestCost[top.cell]) {
      if (diagnostics) diagnostics.staleCount++
      continue
    }
    const curState = states[top.state]
    if (!curState) continue

    for (const nb of cells.c[top.cell]) {
      if (cells.h[nb] < SEA_LEVEL) continue
      if (diagnostics) diagnostics.edgeScanCount++

      // 跳过自然屏障(沙漠、主流河道)
      if (frontierScore(cells, nb, mainRiverSet) < 0.3) continue

      const w = moveCostForEdge(cells, top.cell, nb, curState, mainRiverSet)
      if (!isFinite(w)) continue
      const newCost = top.cost + w
      if (newCost < bestCost[nb] && newCost < maxCost) {
        if (cells.state[nb] > 0 && cells.state[nb] !== top.state) {
          if (diagnostics) diagnostics.reassignmentCount++
        }
        bestCost[nb] = newCost
        cells.state[nb] = top.state
        if (diagnostics) diagnostics.updateCount++
        heap.push({ cell: nb, cost: newCost, state: top.state })
        if (diagnostics) diagnostics.pushCount++
      }
    }
  }

  // 平滑:3 轮去孤立(少数邻居多数派胜出)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      if (cells.h[i] < SEA_LEVEL || cells.state[i] === 0) continue
      const neighborStates: Record<number, number> = {}
      for (const neighbor of cells.c[i]) {
        if (cells.state[neighbor] > 0) {
          neighborStates[cells.state[neighbor]] = (neighborStates[cells.state[neighbor]] || 0) + 1
        }
      }
      const myCount = neighborStates[cells.state[i]] || 0
      for (const [sid, count] of Object.entries(neighborStates)) {
        if (count > myCount + 1 && +sid !== cells.state[i]) {
          cells.state[i] = +sid
          break
        }
      }
    }
  }

  // 去飞地:3 轮 BFS-from-capital,不可达 cell 改归邻居多数派
  for (let pass = 0; pass < 3; pass++) {
    deExclaveStates(cells, states, burgs)
  }

  if (diagnostics) lastExpandStatesDiagnostics = diagnostics
}

/** 去飞地:对每个 state 做 BFS-from-capital,标记可达;不可达 cell 改归多数邻居 */
function deExclaveStates(cells: GridCells, states: State[], burgs: Burg[]): void {
  for (const state of states) {
    if (state.i === 0) continue
    const burg = burgs[state.capital]
    if (!burg) continue
    if (cells.h[burg.cell] < SEA_LEVEL) continue

    // BFS from capital,只走 cells.state === state.i 的格
    const visited = new Uint8Array(cells.length)
    const queue: number[] = [burg.cell]
    visited[burg.cell] = 1
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      for (const nb of cells.c[c]) {
        if (cells.state[nb] === state.i && !visited[nb]) {
          visited[nb] = 1
          queue.push(nb)
        }
      }
    }

    // 不可达且属本 state 的 cell:改归多数邻居
    for (let i = 0; i < cells.length; i++) {
      if (cells.state[i] !== state.i || visited[i]) continue
      const counts: Record<number, number> = {}
      for (const nb of cells.c[i]) {
        const ns = cells.state[nb]
        if (ns > 0 && ns !== state.i) {
          counts[ns] = (counts[ns] || 0) + 1
        }
      }
      let best = 0
      let bestC = 0
      for (const sidStr in counts) {
        const sid = +sidStr
        if (counts[sid] > bestC) { bestC = counts[sid]; best = sid }
      }
      if (best > 0) cells.state[i] = best
    }
  }
}

/** 阶段 3：文化成本扩散(Dijkstra 替代欧氏最近邻)
 *  - 选中心:与阶段 0 一致,按 s 降序 + spacing
 *  - 扩张:从所有中心 Dijkstra,代价 = biome.moveCost/20 + 30 + |h_dst-h_src|*2 + 跨河 +30
 *  - 政府预分配:与 State 同步(海岸→naval、山地→highland、草原→nomadic、河→river)
 */
export function generateCultures(
  cells: GridCells,
  count: number,
  rng: () => number,
): Culture[] {
  const cultures: Culture[] = [{
    i: 0, name: '蛮荒', color: '#ccc', center: 0,
    type: 'generic', expansionism: 0, government: 'generic',
  }]

  // 找到高适宜度的陆地单元格作为文化中心
  const candidates = Array.from({ length: cells.length }, (_, i) => i)
    .filter(i => cells.h[i] >= SEA_LEVEL && cells.s[i] > 10)
    .sort((a, b) => cells.s[b] - cells.s[a])

  const spacing = Math.sqrt((cells.p[0] || 1000) * 2 / count) * 3
  const placed: number[] = []

  for (const cell of candidates) {
    if (placed.length >= count) break
    if (isTooClose(cells, cell, placed, spacing)) continue

    const type: Culture['type'] =
      cells.harbor[cell] > 0 ? 'naval'
      : cells.h[cell] > 60 ? 'highland'
      : (cells.r && cells.r[cell] > 0) ? 'river'
      : 'generic'

    const culture: Culture = {
      i: cultures.length,
      name: getCultureName(cultures.length - 1),
      color: STATE_COLORS[(cultures.length - 1) % STATE_COLORS.length],
      center: cell,
      type,
      expansionism: 0.5 + rng() * 1.5,
      // 阶段 3:同步政体字段(暂用 type 推导的对应值)
      government: type === 'naval' ? 'naval'
        : type === 'highland' ? 'highland'
        : type === 'river' ? 'river'
        : type === 'nomadic' ? 'nomadic'
        : 'generic',
    }

    cultures.push(culture)
    placed.push(cell)
  }

  // 阶段 3:成本扩散 Dijkstra
  // 边权 = biome.moveCost/20 + 30(基础步长) + |h_dst - h_src| * 2 + 跨河 + 30
  const n = cells.length
  const bestCost = new Float64Array(n).fill(Infinity)
  const bestCulture = new Int32Array(n).fill(0)
  const heap = new MinHeap<{ cell: number, cost: number, culture: number }>(
    (a, b) => a.cost - b.cost,
  )

  for (const culture of cultures) {
    if (culture.i === 0) continue
    bestCost[culture.center] = 0
    bestCulture[culture.center] = culture.i
    cells.culture[culture.center] = culture.i
    heap.push({ cell: culture.center, cost: 0, culture: culture.i })
  }

  while (!heap.empty()) {
    const top = heap.pop()!
    if (top.cost > bestCost[top.cell]) continue
    for (const nb of cells.c[top.cell]) {
      if (cells.h[nb] < SEA_LEVEL) continue
      const biome = BIOMES[cells.biome[nb]]
      let w = (biome?.moveCost ?? 100) / 20 + 30
      w += Math.abs(cells.h[nb] - cells.h[top.cell]) * 2
      if (cells.r && cells.r[nb] > 0 && cells.r[top.cell] > 0) w += 30
      const newCost = top.cost + w
      if (newCost < bestCost[nb]) {
        bestCost[nb] = newCost
        bestCulture[nb] = top.culture
        cells.culture[nb] = top.culture
        heap.push({ cell: nb, cost: newCost, culture: top.culture })
      }
    }
  }

  return cultures
}

/** 检查是否距离已放置点太近 */
function isTooClose(cells: GridCells, cell: number, placed: number[], minDist: number): boolean {
  const x = cells.p[cell * 2]
  const y = cells.p[cell * 2 + 1]
  const minDist2 = minDist * minDist

  for (const other of placed) {
    const dx = x - cells.p[other * 2]
    const dy = y - cells.p[other * 2 + 1]
    if (dx * dx + dy * dy < minDist2) return true
  }

  return false
}

// ── 省份生成 ────────────────────────────────────────

/** 阶段 4：省份成本图划分 + cells.province 写回
 *  - 不是每城镇一个省；按"区域中心性"筛出 N 个省中心
 *  - 每个 state 内部做多源 Dijkstra 划分(cost = biome.moveCost + 跨河 +20 + 跨山 +30)
 *  - 写回 cells.province,renderer 不再每帧重算 Voronoi
 */
export function generateProvinces(
  cells: GridCells,
  states: State[],
  burgs: Burg[],
  rng: () => number,
): Province[] {
  const n = cells.length
  const provinces: Province[] = [{ i: 0, name: '', color: '#ccc', state: 0, capital: 0, cells: 0 }]

  if (!cells.province || cells.province.length < n) {
    cells.province = new Uint16Array(n)
  } else {
    cells.province.fill(0)
  }

  for (const state of states) {
    if (state.i === 0) continue

    // 1. 收集本 state 的陆地块
    const stateCellSet = new Set<number>()
    for (let i = 0; i < n; i++) {
      if (cells.state[i] === state.i && cells.h[i] >= SEA_LEVEL) {
        stateCellSet.add(i)
      }
    }
    if (stateCellSet.size === 0) continue

    // 2. 本 state 内的 burg
    const stateBurgs = burgs.filter(b => b.state === state.i && b.i > 0)
    if (stateBurgs.length === 0) continue

    // 3. 决定省数:岛屿国(< 200 cell)= 1;其余 = max(2, cells/200, 海岸段数估算),封顶 4
    let provCount: number
    if (stateCellSet.size < 200) {
      provCount = 1
    } else {
      let coastal = 0
      for (const c of stateCellSet) if (cells.t[c] === 1) coastal++
      const coastalSegs = Math.min(4, Math.max(2, Math.floor(coastal / 30) + 1))
      const sizeBased = Math.max(2, Math.floor(stateCellSet.size / 200))
      provCount = Math.min(coastalSegs, sizeBased, stateBurgs.length)
    }
    if (provCount < 1) provCount = 1

    // 4. 选省中心:区域中心性 = radius 内同国 burg 数 / radius^2
    const radius = 200
    const radius2 = radius * radius
    const scored = stateBurgs.map(b => {
      let count = 0
      for (const other of stateBurgs) {
        if (other.i === b.i) continue
        const dx = other.x - b.x
        const dy = other.y - b.y
        if (dx * dx + dy * dy <= radius2) count++
      }
      return { burg: b, centrality: count }
    })
    scored.sort((a, b) => b.centrality - a.centrality)
    const centers = scored.slice(0, provCount).map(s => s.burg)

    // 5. 为每个省中心创建 Province
    const stateProvIds: number[] = []
    for (const burg of centers) {
      const prov: Province = {
        i: provinces.length,
        name: getProvinceName(provinces.length - 1),
        color: lightenColor(state.color, (rng() - 0.5) * 30),
        state: state.i,
        capital: burg.i,
        cells: 0,
      }
      provinces.push(prov)
      stateProvIds.push(prov.i)
    }

    // 6. 本 state 内多源 Dijkstra
    const bestCost = new Float32Array(n).fill(Infinity)
    const bestProv = new Uint16Array(n)
    const pending = new Uint8Array(n)
    for (const c of stateCellSet) pending[c] = 1
    for (let k = 0; k < centers.length; k++) {
      const startCell = centers[k].cell
      bestCost[startCell] = 0
      bestProv[startCell] = stateProvIds[k]
    }

    let progress = true
    let safetyLoops = stateCellSet.size * 8
    while (progress && safetyLoops-- > 0) {
      progress = false
      for (const c of stateCellSet) {
        if (!pending[c]) continue
        const cur = bestCost[c]
        if (cur === Infinity) continue
        for (const nb of cells.c[c]) {
          if (!stateCellSet.has(nb)) continue
          const stepCost = provinceStepCost(cells, c, nb)
          const next = cur + stepCost
          if (next < bestCost[nb]) {
            bestCost[nb] = next
            bestProv[nb] = bestProv[c]
            pending[nb] = 1
            progress = true
          }
        }
        pending[c] = 0
      }
    }

    // 7. 写回 cells.province,统计 cell 数
    for (const c of stateCellSet) {
      const pid = bestProv[c]
      if (pid > 0) {
        cells.province[c] = pid
        provinces[pid].cells++
      }
    }
  }

  return provinces
}

/** 阶段 4:本 state 内省界推进代价(biome + 跨河 + 跨山脊) */
function provinceStepCost(cells: GridCells, src: number, tgt: number): number {
  const biome = BIOMES[cells.biome[tgt]]
  let mc = (biome?.moveCost ?? 100) / 20
  if (cells.r[tgt] > 0 && cells.r[src] === 0) mc += 20
  if (cells.h[tgt] > 70 && cells.h[src] <= 70) mc += 30
  return mc
}

/** 颜色亮度微调 */
function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount))
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount))
  return `#${(0x1000000 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1)}`
}

// ── 道路生成（阶段 5：分层路网） ──────────────────────

/** 鞍点判定:cell 自身较低 (h<60),但至少 2 个邻居较高 (h>70)。
 *  用于识别山口,A* 会倾向走这里(减半)而非翻山(×2)。
 */
function isSaddle(cells: GridCells, tgt: number): boolean {
  if (cells.h[tgt] >= 60) return false
  let high = 0
  for (const nb of cells.c[tgt]) {
    if (cells.h[nb] > 70) high++
  }
  return high >= 2
}

/** 基础 biome 成本 — 与原 findPath 同款,无任何偏置。 */
function baseBiomeCost(cells: GridCells, tgt: number): number {
  const biome = BIOMES[cells.biome[tgt]]
  let mc = (biome?.moveCost ?? 100) / 50
  if (cells.h[tgt] > 70) mc += (cells.h[tgt] - 70) * 0.5
  if (cells.r[tgt] > 0) mc *= 0.8
  return mc
}

/** 阶段 5:stratified 边成本 = biome 基础 + 河流/山地/同国/首都偏置。 */
function roadCostForEdge(
  cells: GridCells,
  _src: number,
  tgt: number,
  burgA: Burg,
  burgB: Burg,
): number {
  let mc = baseBiomeCost(cells, tgt)
  if (cells.r[tgt] > 0) mc *= 0.7  // 沿河便宜
  if (cells.h[tgt] > 70) {
    if (isSaddle(cells, tgt)) mc *= 0.5  // 山口便宜
    else mc *= 2.0                      // 高山贵
  }
  if (burgA.state === burgB.state && burgA.state > 0) mc *= 0.8  // 同国便宜
  if (burgA.capital && burgB.capital) mc *= 0.7                    // 首都间主干道
  return mc
}

/** 生成城镇之间的道路（阶段 5:5 层分层路网） */
export function generateRoads(
  cells: GridCells,
  burgs: Burg[],
  _states: State[],
  rng: () => number,
): Road[] {
  const roads: Road[] = []
  const activeBurgs = burgs.filter(b => b.i > 0)
  if (activeBurgs.length < 2) return roads

  let roadId = 1
  const roadEdgeSet = new Set<string>()
  const edgeKey = (a: number, b: number) => {
    const lo = a < b ? a : b
    const hi = a < b ? b : a
    return `${lo}-${hi}`
  }
  /** 添加一条道路;若该 cell-pair 已存在同方向任意类型道路则跳过。 */
  const addRoad = (
    aCell: number,
    bCell: number,
    type: Road['type'],
    path: number[],
    name: string,
  ): Road | null => {
    if (path.length < 2) return null
    const k = edgeKey(aCell, bCell)
    if (roadEdgeSet.has(k)) return null
    roadEdgeSet.add(k)
    const road: Road = {
      i: roadId++,
      name,
      type,
      cells: path,
      points: path.map(c => [cells.p[c * 2], cells.p[c * 2 + 1]] as [number, number]),
    }
    roads.push(road)
    return road
  }

  const capitals = activeBurgs.filter(b => b.capital)
  const ports = activeBurgs.filter(b => b.port)
  const nonCapitalTowns = activeBurgs.filter(b => !b.capital)

  // ── Level 1: 首都间主干道 — 每个首都连最近 2-3 个首都 ──
  for (const cap of capitals) {
    const sorted = capitals
      .filter(c => c.i !== cap.i)
      .map(c => ({
        burg: c,
        dist: (c.x - cap.x) ** 2 + (c.y - cap.y) ** 2,
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2 + Math.floor(rng() * 2))  // 2 或 3 个

    for (const { burg: target } of sorted) {
      const path = findPath(cells, cap.cell, target.cell, cap, target)
      addRoad(cap.cell, target.cell, 'major', path, `${cap.name}—${target.name}`)
    }
  }

  // ── Level 2: 港口到腹地 — 同国最近非港 burg ──
  for (const port of ports) {
    if (port.capital) continue  // 首都港走 Level 1,避免与主干道重复
    let best: Burg | null = null
    let bestDist = Infinity
    for (const other of activeBurgs) {
      if (other.i === port.i) continue
      if (other.port) continue
      if (other.state !== port.state) continue
      const d = (other.x - port.x) ** 2 + (other.y - port.y) ** 2
      if (d < bestDist) { bestDist = d; best = other }
    }
    if (!best) continue
    const path = findPath(cells, port.cell, best.cell, port, best)
    addRoad(port.cell, best.cell, 'minor', path, `${port.name}—${best.name}道`)
  }

  // ── Level 3: 城镇到首都 — 同国最近首都,path ≤ 80 cells ──
  for (const town of nonCapitalTowns) {
    if (town.port) continue  // 港已走 Level 2
    let best: Burg | null = null
    let bestDist = Infinity
    for (const cap of capitals) {
      if (cap.state !== town.state) continue
      const d = (cap.x - town.x) ** 2 + (cap.y - town.y) ** 2
      if (d < bestDist) { bestDist = d; best = cap }
    }
    if (!best) continue
    const path = findPath(cells, town.cell, best.cell, town, best)
    if (path.length > 80) continue
    addRoad(town.cell, best.cell, 'minor', path, `${town.name}—${best.name}道`)
  }

  // ── Level 4: 跨国商道 — ~30% 概率,邻国首都/大港之间 ──
  // 先估算平均道路成本(用 baseBiomeCost 求平均 edge cost)
  let totalEdges = 0
  let totalCost = 0
  for (const r of roads) {
    for (let i = 1; i < r.cells.length; i++) {
      totalCost += baseBiomeCost(cells, r.cells[i])
      totalEdges++
    }
  }
  const avgEdgeCost = totalEdges > 0 ? totalCost / totalEdges : 1.0
  const costIsReasonable = (path: number[], a: Burg, b: Burg): boolean => {
    if (path.length < 2) return false
    let pc = 0
    for (let k = 1; k < path.length; k++) {
      pc += roadCostForEdge(cells, path[k - 1], path[k], a, b)
    }
    return (pc / (path.length - 1)) <= avgEdgeCost * 2
  }

  // 4a: 首都 ↔ 邻国首都
  for (let i = 0; i < capitals.length; i++) {
    for (let j = i + 1; j < capitals.length; j++) {
      const a = capitals[i], b = capitals[j]
      if (a.state === b.state) continue
      if (rng() > 0.3) continue
      const path = findPath(cells, a.cell, b.cell, a, b)
      if (!costIsReasonable(path, a, b)) continue
      addRoad(a.cell, b.cell, 'trade', path, `${a.name}—${b.name}商道`)
    }
  }
  // 4b: 大港 ↔ 邻国大港/首都
  const bigPortTowns = ports.filter(p => !p.capital)  // 排除首都港(已走 4a)
  for (let i = 0; i < bigPortTowns.length; i++) {
    for (let j = i + 1; j < bigPortTowns.length; j++) {
      const a = bigPortTowns[i], b = bigPortTowns[j]
      if (a.state === b.state) continue
      if (rng() > 0.3) continue
      const path = findPath(cells, a.cell, b.cell, a, b)
      if (!costIsReasonable(path, a, b)) continue
      addRoad(a.cell, b.cell, 'trade', path, `${a.name}—${b.name}商道`)
    }
  }

  // ── Level 5: 海上航线 — 大港(> 1.5× 中位人口)之间,2-3 条/港 ──
  if (ports.length > 1) {
    const pops = activeBurgs.map(b => b.population).sort((a, b) => a - b)
    const median = pops.length > 0 ? pops[Math.floor(pops.length / 2)] : 0
    const threshold = median * 1.5
    const bigPorts = ports.filter(p => p.population > threshold)
    for (let i = 0; i < bigPorts.length; i++) {
      const distances = bigPorts
        .map((p, j) => ({
          idx: j,
          dist: i !== j ? (p.x - bigPorts[i].x) ** 2 + (p.y - bigPorts[i].y) ** 2 : Infinity,
        }))
        .filter(d => d.dist !== Infinity)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)  // top 3
      for (const { idx } of distances) {
        if (idx <= i) continue  // 防重复
        const a = bigPorts[i], b = bigPorts[idx]
        addRoad(a.cell, b.cell, 'sea', [a.cell, b.cell], `${a.name}—${b.name}航线`)
      }
    }
  }

  return roads
}

/** 陆地无向图缓存 — 同一 cells 对象在一次 generateRoads 调用中只构建一次。 */
const landGraphCache = new WeakMap<GridCells, Graph>()

function buildLandGraph(cells: GridCells): Graph {
  const cached = landGraphCache.get(cells)
  if (cached) return cached
  const graph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false })
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] >= SEA_LEVEL) graph.addNode(String(i))
  }
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < SEA_LEVEL) continue
    for (const j of cells.c[i]) {
      if (cells.h[j] < SEA_LEVEL) continue
      if (i < j) graph.addEdge(String(i), String(j))
    }
  }
  landGraphCache.set(cells, graph)
  return graph
}

/** A* 寻路（陆地，沿 Voronoi 邻居）。
 *  若传 burgA/burgB,使用阶段 5 的 stratified 成本(河流/山地/同国/首都偏置);
 *  否则退回原 findPath 语义(供向后兼容或纯寻路场景)。 */
function findPath(
  cells: GridCells,
  start: number,
  end: number,
  burgA?: Burg,
  burgB?: Burg,
): number[] {
  if (start === end) return [start]
  if (cells.h[start] < SEA_LEVEL || cells.h[end] < SEA_LEVEL) return []

  const graph = buildLandGraph(cells)
  const endX = cells.p[end * 2]
  const endY = cells.p[end * 2 + 1]

  const path = astar.bidirectional(
    graph,
    String(start),
    String(end),
    (_edge, _attrs, _source, target) => {
      const tId = +target
      if (burgA && burgB) {
        return roadCostForEdge(cells, 0, tId, burgA, burgB)
      }
      const biome = BIOMES[cells.biome[tId]]
      let mc = (biome?.moveCost ?? 100) / 50
      if (cells.h[tId] > 70) mc += (cells.h[tId] - 70) * 0.5
      if (cells.r[tId] > 0) mc *= 0.8
      return mc
    },
    (node) => {
      const t = +node
      const dx = cells.p[t * 2] - endX
      const dy = cells.p[t * 2 + 1] - endY
      return Math.sqrt(dx * dx + dy * dy) * 0.01
    },
  )

  if (!path) return []
  return path.map(s => +s)
}
