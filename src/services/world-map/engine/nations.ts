/**
 * 国家和城市生成
 * 城市：按适宜度评分放置
 * 国家：从首都 Dijkstra 扩张
 */

import type { GridCells, Burg, State, Culture, Province, Road } from './types'
import { BIOMES } from './climate'
import { getStateName, getCapitalName, getTownName, getCultureName, getProvinceName } from './name-pool'

const SEA_LEVEL = 20

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

/** 放置城镇 */
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

  // 收集可用的陆地单元格，按适宜度排序
  const candidates = Array.from({ length: cells.length }, (_, i) => i)
    .filter(i => cells.h[i] >= SEA_LEVEL && cells.s[i] > 5)
    .sort((a, b) => cells.s[b] * (0.5 + rng()) - cells.s[a] * (0.5 + rng()))

  if (candidates.length === 0) return burgs

  // 最小间距（避免城市太密集）
  const spacing = Math.sqrt((width * height) / (stateCount * 4))

  // 放置首都
  const placed: number[] = []
  for (const cell of candidates) {
    if (placed.length >= stateCount) break
    if (isTooClose(cells, cell, placed, spacing)) continue
    placed.push(cell)
  }

  // 首都
  for (let i = 0; i < placed.length; i++) {
    const cell = placed[i]
    const burg: Burg = {
      i: burgs.length,
      name: burgNames?.[i] || getCapitalName(i),
      cell,
      x: cells.p[cell * 2],
      y: cells.p[cell * 2 + 1],
      state: i + 1,
      capital: true,
      port: cells.harbor[cell] > 0,
      population: Math.round(cells.s[cell] * (1 + rng()) * 2),
    }

    // 港口城市移向海岸
    if (burg.port && cells.haven[cell]) {
      const haven = cells.haven[cell]
      burg.x = burg.x * 0.7 + cells.p[haven * 2] * 0.3
      burg.y = burg.y * 0.7 + cells.p[haven * 2 + 1] * 0.3
    }

    burgs.push(burg)
    cells.burg[cell] = burg.i
  }

  // 放置城镇
  const townSpacing = spacing * 0.4
  const townCount = Math.floor(candidates.length * burgDensity * 0.02)
  let townPlaced = 0
  const allBurgCells = placed.slice()

  for (const cell of candidates) {
    if (townPlaced >= townCount) break
    if (cells.burg[cell]) continue
    if (isTooClose(cells, cell, allBurgCells, townSpacing)) continue

    const burg: Burg = {
      i: burgs.length,
      name: burgNames?.[placed.length + townPlaced] || getTownName(townPlaced),
      cell,
      x: cells.p[cell * 2],
      y: cells.p[cell * 2 + 1],
      state: 0, // 稍后分配
      capital: false,
      port: cells.harbor[cell] > 0,
      population: Math.round(cells.s[cell] * (0.5 + rng())),
    }

    if (burg.port && cells.haven[cell]) {
      const haven = cells.haven[cell]
      burg.x = burg.x * 0.8 + cells.p[haven * 2] * 0.2
      burg.y = burg.y * 0.8 + cells.p[haven * 2 + 1] * 0.2
    }

    burgs.push(burg)
    cells.burg[cell] = burg.i
    allBurgCells.push(cell)
    townPlaced++
  }

  return burgs
}

/** 生成国家（从首都 Dijkstra 扩张） */
export function generateStates(
  cells: GridCells,
  burgs: Burg[],
  _stateCount: number,
  rng: () => number,
  stateNames?: string[],
): State[] {
  const states: State[] = [{ i: 0, name: '无主之地', color: '#ccc', capital: 0, expansionism: 0, cells: 0, area: 0, totalPopulation: 0 }]

  // 创建国家（每个首都一个）
  const capitals = burgs.filter(b => b.capital)
  for (let i = 0; i < capitals.length; i++) {
    const burg = capitals[i]
    const state: State = {
      i: states.length,
      name: stateNames?.[i] || getStateName(i),
      color: STATE_COLORS[i % STATE_COLORS.length],
      capital: burg.i,
      expansionism: 0.8 + rng() * 1.5,
      cells: 0,
      area: 0,
      totalPopulation: 0,
    }
    states.push(state)
    burg.state = state.i
  }

  // Dijkstra 扩张
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

/** Dijkstra 领土扩张（二叉堆 + 关闭集） */
function expandStates(cells: GridCells, states: State[], burgs: Burg[]): void {
  const n = cells.length
  // 路径代价必须保留双精度，避免 `totalCost < cost` 成立但写回 Float32 后值未变，
  // 从而把同一 cell 以等价代价重复入堆数亿次。
  const cost = new Float64Array(n).fill(Infinity)
  const diagnostics = expandStatesDiagnosticsEnabled
    ? {
        pushCount: 0,
        popCount: 0,
        staleCount: 0,
        edgeScanCount: 0,
        updateCount: 0,
        reassignmentCount: 0,
        maxHeap: 0,
        maxNeighborCount: 0,
      }
    : null

  lastExpandStatesDiagnostics = null

  // 二叉堆：cost / cell 两路平行 typed array
  const heapCap = Math.max(n, 16)
  let heapCost = new Float64Array(heapCap)
  let heapCell = new Int32Array(heapCap)
  let heapSize = 0

  function heapPush(c: number, cell: number) {
    if (heapSize >= heapCost.length) {
      // 翻倍扩容
      const newCap = heapCost.length * 2
      const newCost = new Float64Array(newCap)
      const newCell = new Int32Array(newCap)
      newCost.set(heapCost)
      newCell.set(heapCell)
      heapCost = newCost
      heapCell = newCell
    }
    let i = heapSize++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heapCost[parent] <= c) break
      heapCost[i] = heapCost[parent]
      heapCell[i] = heapCell[parent]
      i = parent
    }
    heapCost[i] = c
    heapCell[i] = cell
    if (diagnostics) {
      diagnostics.pushCount++
      if (heapSize > diagnostics.maxHeap) diagnostics.maxHeap = heapSize
    }
  }

  function heapPop() {
    const c = heapCost[0]
    const cell = heapCell[0]
    if (diagnostics) diagnostics.popCount++
    heapSize--
    if (heapSize > 0) {
      // 把"末尾"放到根，再下滤。
      // 下滤用 SWAP 而不是 MOVE：MOVE 会让 heap[i] 在子位置上保留旧值，
      // 而下滤的比较 `heapCost[l] < heapCost[smallest]` 误把旧值当作下滤基准，
      // 导致堆腐坏、产生大量重复条目。
      const lastC = heapCost[heapSize]
      const lastCell = heapCell[heapSize]
      heapCost[0] = lastC
      heapCell[0] = lastCell
      let i = 0
      while (true) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let smallest = i
        if (l < heapSize && heapCost[l] < heapCost[smallest]) smallest = l
        if (r < heapSize && heapCost[r] < heapCost[smallest]) smallest = r
        if (smallest === i) break
        const tmpC = heapCost[i]
        const tmpCell = heapCell[i]
        heapCost[i] = heapCost[smallest]
        heapCell[i] = heapCell[smallest]
        heapCost[smallest] = tmpC
        heapCell[smallest] = tmpCell
        i = smallest
      }
    }
    return { c, cell }
  }

  // 从每个首都开始
  for (const state of states) {
    if (state.i === 0) continue
    const burg = burgs[state.capital]
    if (!burg) continue

    cost[burg.cell] = 0
    cells.state[burg.cell] = state.i
    heapPush(0, burg.cell)
  }

  const maxCost = n * 0.8

  // Dijkstra 主循环
  while (heapSize > 0) {
    const { c: currentCost, cell } = heapPop()

    // stale entry 过滤（lazy decrease-key）
    if (currentCost > cost[cell]) {
      if (diagnostics) diagnostics.staleCount++
      continue
    }

    // 关闭集：从 heap 中取出的第一个匹配的 cost 即最终处理
    const stateData = states[cells.state[cell]]
    if (!stateData) continue

    const neighbors = cells.c[cell]
    if (diagnostics && neighbors.length > diagnostics.maxNeighborCount) {
      diagnostics.maxNeighborCount = neighbors.length
    }

    for (const neighbor of neighbors) {
      if (diagnostics) diagnostics.edgeScanCount++
      if (cells.h[neighbor] < SEA_LEVEL) continue // 不越过海洋

      // 计算移动成本（与原实现一致）
      const biome = BIOMES[cells.biome[neighbor]]
      let moveCost = biome.moveCost / 10

      if (cells.culture[neighbor] && cells.culture[cell] &&
          cells.culture[neighbor] !== cells.culture[cell]) {
        moveCost += 50
      }
      if (cells.s[neighbor] < 1) moveCost += 200
      if (cells.h[neighbor] > 70) moveCost += (cells.h[neighbor] - 70) * 5

      const totalCost = currentCost + moveCost / stateData.expansionism

      if (totalCost < cost[neighbor] && totalCost < maxCost) {
        if (diagnostics) {
          diagnostics.updateCount++
          if (cells.state[neighbor] > 0 && cells.state[neighbor] !== stateData.i) {
            diagnostics.reassignmentCount++
          }
        }
        cost[neighbor] = totalCost
        cells.state[neighbor] = stateData.i
        heapPush(totalCost, neighbor)
      }
    }
  }

  // 平滑：去除孤立单元格（与原实现一致，未变）
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

  if (diagnostics) lastExpandStatesDiagnostics = diagnostics
}

/** 简单文化生成（为国家扩张提供依据） */
export function generateCultures(
  cells: GridCells,
  count: number,
  rng: () => number,
): Culture[] {
  const cultures: Culture[] = [{ i: 0, name: '蛮荒', color: '#ccc', center: 0, type: 'generic', expansionism: 0 }]

  // 找到高适宜度的陆地单元格作为文化中心
  const candidates = Array.from({ length: cells.length }, (_, i) => i)
    .filter(i => cells.h[i] >= SEA_LEVEL && cells.s[i] > 10)
    .sort((a, b) => cells.s[b] - cells.s[a])

  const spacing = Math.sqrt((cells.p[0] || 1000) * 2 / count) * 3
  const placed: number[] = []

  for (const cell of candidates) {
    if (placed.length >= count) break
    if (isTooClose(cells, cell, placed, spacing)) continue

    const culture: Culture = {
      i: cultures.length,
      name: getCultureName(cultures.length - 1),
      color: STATE_COLORS[(cultures.length - 1) % STATE_COLORS.length],
      center: cell,
      type: cells.harbor[cell] > 0 ? 'naval'
        : cells.h[cell] > 60 ? 'highland'
        : cells.r[cell] > 0 ? 'river'
        : 'generic',
      expansionism: 0.5 + rng() * 1.5,
    }

    cultures.push(culture)
    placed.push(cell)
  }

  // 简单扩张：每个单元格分配到最近的文化中心
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < SEA_LEVEL) continue

    let bestCulture = 0
    let bestDist = Infinity

    for (const culture of cultures) {
      if (culture.i === 0) continue
      const dx = cells.p[i * 2] - cells.p[culture.center * 2]
      const dy = cells.p[i * 2 + 1] - cells.p[culture.center * 2 + 1]
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        bestCulture = culture.i
      }
    }

    cells.culture[i] = bestCulture
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

/** 为每个国家生成省份 */
export function generateProvinces(
  cells: GridCells,
  states: State[],
  burgs: Burg[],
  rng: () => number,
): Province[] {
  const provinces: Province[] = [{ i: 0, name: '', color: '#ccc', state: 0, capital: 0, cells: 0 }]

  // 为每个国家的每个城镇创建一个省份（Voronoi 划分）
  for (const state of states) {
    if (state.i === 0) continue

    // 找出该国家所有城镇
    const stateBurgs = burgs.filter(b => b.state === state.i && b.i > 0)
    if (stateBurgs.length === 0) continue

    // 每个城镇作为省会
    const provIds: number[] = []
    for (let bi = 0; bi < stateBurgs.length; bi++) {
      const burg = stateBurgs[bi]
      const prov: Province = {
        i: provinces.length,
        name: getProvinceName(provinces.length - 1),
        color: lightenColor(state.color, (rng() - 0.5) * 30),
        state: state.i,
        capital: burg.i,
        cells: 0,
      }
      provinces.push(prov)
      provIds.push(prov.i)
    }

    // 按最近城镇分配该国家的单元格到省份
    for (let i = 0; i < cells.length; i++) {
      if (cells.state[i] !== state.i) continue

      let bestProv = provIds[0]
      let bestDist = Infinity

      for (let pi = 0; pi < stateBurgs.length; pi++) {
        const burg = stateBurgs[pi]
        const dx = cells.p[i * 2] - burg.x
        const dy = cells.p[i * 2 + 1] - burg.y
        const dist = dx * dx + dy * dy
        if (dist < bestDist) {
          bestDist = dist
          bestProv = provIds[pi]
        }
      }

      // 使用 culture 数组临时存省份（或可加新字段，这里复用不冲突）
      // 实际上我们不修改 cells，省份信息存在 Province 对象中
      provinces[bestProv].cells++
    }
  }

  return provinces
}

/** 颜色亮度微调 */
function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount))
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount))
  return `#${(0x1000000 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1)}`
}

// ── 道路生成 ────────────────────────────────────────

/** 生成城镇之间的道路 */
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

  // 1. 主干道：每个首都连接最近的 2-3 个首都
  const capitals = activeBurgs.filter(b => b.capital)
  for (const cap of capitals) {
    const sorted = capitals
      .filter(c => c.i !== cap.i)
      .map(c => ({
        burg: c,
        dist: (c.x - cap.x) ** 2 + (c.y - cap.y) ** 2,
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2 + Math.floor(rng()))

    for (const { burg: target } of sorted) {
      // 避免重复路线（A→B 和 B→A）
      if (roads.some(r => r.type === 'major' &&
        ((r.cells[0] === cap.cell && r.cells[r.cells.length - 1] === target.cell) ||
         (r.cells[0] === target.cell && r.cells[r.cells.length - 1] === cap.cell)))) continue

      const path = findPath(cells, cap.cell, target.cell)
      if (path.length < 2) continue

      roads.push({
        i: roadId++,
        name: `${cap.name}—${target.name}`,
        type: 'major',
        cells: path,
        points: path.map(c => [cells.p[c * 2], cells.p[c * 2 + 1]] as [number, number]),
      })
    }
  }

  // 2. 支路：每个城镇连接最近的首都或大城镇
  const towns = activeBurgs.filter(b => !b.capital)
  for (const town of towns) {
    // 找最近的首都
    let nearest: Burg | null = null
    let nearDist = Infinity
    for (const cap of capitals) {
      if (cap.state !== town.state && rng() > 0.3) continue // 跨国连接概率低
      const d = (cap.x - town.x) ** 2 + (cap.y - town.y) ** 2
      if (d < nearDist) {
        nearDist = d
        nearest = cap
      }
    }

    if (!nearest) continue
    // 距离太远的跳过
    if (nearDist > (cells.length * 0.1) ** 2) continue

    const path = findPath(cells, town.cell, nearest.cell)
    if (path.length < 2 || path.length > 80) continue

    roads.push({
      i: roadId++,
      name: `${town.name}道`,
      type: 'minor',
      cells: path,
      points: path.map(c => [cells.p[c * 2], cells.p[c * 2 + 1]] as [number, number]),
    })

    if (roads.length > 60) break // 限制道路数量
  }

  // 3. 商路：连接有港口的城镇（海上贸易）
  const ports = activeBurgs.filter(b => b.port)
  for (let i = 0; i < ports.length && roads.length < 80; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      const a = ports[i], b = ports[j]
      const dist = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
      // 只连接相对近的港口
      if (dist > (cells.length * 0.15) ** 2) continue
      if (rng() > 0.4) continue // 不是所有港口都有航线

      roads.push({
        i: roadId++,
        name: `${a.name}—${b.name}航线`,
        type: 'sea',
        cells: [a.cell, b.cell],
        points: [[a.x, a.y], [b.x, b.y]],
      })
    }
  }

  return roads
}

/** A* 寻路（陆地，沿 Voronoi 邻居） — 二叉堆 + 关闭集 */
function findPath(cells: GridCells, start: number, end: number): number[] {
  if (start === end) return [start]

  const n = cells.length
  const gScore = new Float64Array(n).fill(Infinity)
  const parent = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  gScore[start] = 0

  // 二叉堆（f = g + h）
  const heapCost = new Float64Array(n)
  const heapCell = new Int32Array(n)
  let heapSize = 0

  function heapPush(c: number, cell: number) {
    let i = heapSize++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heapCost[p] <= c) break
      heapCost[i] = heapCost[p]
      heapCell[i] = heapCell[p]
      i = p
    }
    heapCost[i] = c
    heapCell[i] = cell
  }

  function heapPop() {
    const c = heapCost[0]
    const cell = heapCell[0]
    heapSize--
    if (heapSize > 0) {
      // 下滤用 SWAP 而不是 MOVE，原因同 expandStates
      const lastC = heapCost[heapSize]
      const lastCell = heapCell[heapSize]
      heapCost[0] = lastC
      heapCell[0] = lastCell
      let i = 0
      while (true) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let smallest = i
        if (l < heapSize && heapCost[l] < heapCost[smallest]) smallest = l
        if (r < heapSize && heapCost[r] < heapCost[smallest]) smallest = r
        if (smallest === i) break
        const tmpC = heapCost[i]
        const tmpCell = heapCell[i]
        heapCost[i] = heapCost[smallest]
        heapCell[i] = heapCell[smallest]
        heapCost[smallest] = tmpC
        heapCell[smallest] = tmpCell
        i = smallest
      }
    }
    return { c, cell }
  }

  const endX = cells.p[end * 2]
  const endY = cells.p[end * 2 + 1]

  // start 的 f = g(start) + h(start) = 0 + h(start)
  const hStart = Math.hypot(cells.p[start * 2] - endX, cells.p[start * 2 + 1] - endY) * 0.01
  heapPush(hStart, start)

  while (heapSize > 0) {
    const { cell } = heapPop()
    if (closed[cell]) continue
    if (cell === end) break
    closed[cell] = 1

    for (const neighbor of cells.c[cell]) {
      if (cells.h[neighbor] < SEA_LEVEL) continue // 不走水域
      if (closed[neighbor]) continue

      const biome = BIOMES[cells.biome[neighbor]]
      let moveCost = (biome?.moveCost ?? 100) / 50
      if (cells.h[neighbor] > 70) moveCost += (cells.h[neighbor] - 70) * 0.5
      if (cells.r[neighbor] > 0) moveCost *= 0.8

      const tentativeG = gScore[cell] + moveCost
      if (tentativeG < gScore[neighbor]) {
        gScore[neighbor] = tentativeG
        parent[neighbor] = cell
        const dx = cells.p[neighbor * 2] - endX
        const dy = cells.p[neighbor * 2 + 1] - endY
        const h = Math.sqrt(dx * dx + dy * dy) * 0.01
        heapPush(tentativeG + h, neighbor)
      }
    }
  }

  if (parent[end] === -1) return []
  const path: number[] = []
  let c = end
  while (c !== -1) {
    path.push(c)
    if (c === start) break
    c = parent[c]
  }
  path.reverse()
  return path
}
