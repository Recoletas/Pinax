/**
 * 地图语义提取器（历史系统底层纯函数）
 *
 * 从 `generateMap()` 输出的 `VoronoiMapData` 中提取可供历史系统
 * (Dwarf Fortress 风格)使用的地理语义点。**不修改**地图生成算法,
 * 只消费地图结果。
 *
 * 类别:
 *   - tradeHubs        贸易枢纽(港口 / 首都 / 多道路汇聚的城镇)
 *   - borderCrossings  边界跨越点(道路横跨国境 / 政体边界)
 *   - frontierZones    边境荒域(国家边界附近低人口薄带)
 *   - isolatedSites    孤悬据点(无道路可达 / 单点聚落)
 *   - fertileRegions   沃土区域(高宜居性 + 沿河)
 *   - hostileRegions   凶土区域(高海拔 / 沙漠 / 苔原 / 冰川)
 *   - strategicRoutes  战略通道(跨国长商道 / 海运线)
 *   - riverMouths      河口城镇(河流入海口 + 港口)
 *   - mountainPasses   山口通道(道路穿山低隙)
 *
 * 约束:
 *   - 纯函数:不依赖 DOM / localStorage / AI
 *   - 同 seed mapData 下输出稳定(IDs / 顺序 / score)
 *   - 输入空 / 缺字段时安全降级(返回空数组, 不抛错)
 *
 * @module services/worldHistory/mapSemantics
 */

// ── 内部常量 ────────────────────────────────────────────

/** 沙漠/苔原/冰川/寒带荒漠/针叶林 — 计入 hostile 比例 */
const HOSTILE_BIOMES = new Set([1, 2, 9, 10, 11])

/** 落叶林/温带雨林/季风林/雨林/草原 — 计入 fertile 比例 */
const FERTILE_BIOMES = new Set([3, 4, 5, 6, 7, 8])

/** "water" 二值化: h < 20 或 t < 0 视作水域 */
const SEA_LEVEL = 20

/** 道路半径(拓扑格数): 视为"可达"的判定阈值 */
const ROAD_REACH_RADIUS = 3

/** 簇内最大 cells(防 BFS 爆炸) */
const MAX_CLUSTER_CELLS = 200

/** 每类 site 的最大返回数 */
const MAX_PER_CATEGORY = 50

// ── 工具函数 ────────────────────────────────────────────

/**
 * 安全读取 cells 平行数组(防御性: 字段缺失则返回 fallback)。
 */
function readTyped(arr, i, fallback = 0) {
  if (!arr) return fallback
  if (i < 0 || i >= arr.length) return fallback
  return arr[i]
}

function isLandCell(cells, i) {
  return readTyped(cells.h, i, 0) >= SEA_LEVEL
}

function isWaterCell(cells, i) {
  return readTyped(cells.h, i, 0) < SEA_LEVEL
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

function sortCellIds(ids) {
  return [...ids].sort((a, b) => a - b)
}

/**
 * 在 cells.c 邻接图上做有限 BFS 簇提取, 收集满足 predicate 的邻接 cells。
 * 避免跨水 / 跨山等硬边界 — 簇判定时不传 predicate(只连通性), 但
 * 收集时用 predicate 过滤。
 */
function bfsCluster(cells, startId, predicate, maxSize = MAX_CLUSTER_CELLS) {
  const seen = new Set()
  const stack = [startId]
  const result = []
  while (stack.length > 0 && result.length < maxSize) {
    const cur = stack.pop()
    if (seen.has(cur)) continue
    seen.add(cur)
    if (cur < 0 || cur >= cells.length) continue
    if (predicate && !predicate(cur)) continue
    result.push(cur)
    const neighbors = cells.c?.[cur] || []
    for (const n of neighbors) {
      if (!seen.has(n)) stack.push(n)
    }
  }
  return result
}

/**
 * 计算一组 cells 的"连通性带" — 用 cells.c 邻接 BFS 扩展, 但允许
 * 簇外最多 1 层 grace(以合并相邻的破碎子簇)。用于 fertile/hostile 大区。
 */
function expandWithGrace(cells, seedIds, predicate, maxSize = MAX_CLUSTER_CELLS) {
  if (seedIds.length === 0) return []
  const seen = new Set(seedIds)
  const queue = [...seedIds]
  const out = []
  let grace = Math.floor(maxSize * 0.1) // 10% 配额用于 grace
  while (queue.length > 0 && out.length < maxSize) {
    const cur = queue.shift()
    if (predicate(cur)) out.push(cur)
    const neighbors = cells.c?.[cur] || []
    for (const n of neighbors) {
      if (seen.has(n)) continue
      seen.add(n)
      // grace 配额用于跨 predicate 边界 1 次, 让相邻子簇不孤立
      const allow = predicate(n) || (grace > 0 && isLandCell(cells, n))
      if (allow) {
        queue.push(n)
        if (!predicate(n)) grace--
      }
    }
  }
  return out
}

// ── 路径 1: tradeHubs / riverMouths / isolatedSites ──────

function scoreTradeHub(cells, burg) {
  let score = 30
  const reasons = []

  if (burg.capital) {
    score += 20
    reasons.push('首都')
  }
  if (burg.port) {
    score += 25
    reasons.push('港口')
  }

  // 人口归一(以当前地图 max pop 为基)
  // 注意: mapData 一次性传入, 不会在循环内变, 所以先取 max 再算
  if (burg.population > 0) {
    score += clamp(Math.log2(burg.population + 1) * 4, 0, 25)
    reasons.push(`人口 ${burg.population.toFixed(0)}`)
  }

  // 港口质量加成
  const pq = readTyped(cells.portQuality, burg.cell, 0)
  if (pq > 50) {
    score += 10
    reasons.push(`港口质量 ${pq}`)
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons }
}

function extractTradeHubs(mapData, precomputed) {
  const { cells, burgs, maxPop } = precomputed
  if (!burgs || burgs.length === 0) return []
  const result = []
  for (const burg of burgs) {
    if (burg.i === 0) continue // placeholder
    if (!isLandCell(cells, burg.cell)) continue
    const { score, reasons } = scoreTradeHub(cells, burg)
    // 只保留 score ≥ 50 的真枢纽
    if (score < 50) continue
    const cellIds = sortCellIds([burg.cell])
    const title = burg.capital
      ? `${burg.name}（首都）`
      : burg.port
        ? `${burg.name}（港）`
        : `${burg.name}`
    result.push({
      id: `tradeHub:${burg.i}`,
      type: 'tradeHub',
      title,
      score,
      cellIds,
      markerIds: [`burg:${burg.i}`],
      reasons,
      keywords: ['trade', 'hub', burg.capital ? 'capital' : '', burg.port ? 'port' : ''].filter(Boolean),
    })
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 路径 2: riverMouths ──────────────────────────────────

function extractRiverMouths(mapData, precomputed) {
  const { cells, burgs, rivers } = precomputed
  if (!rivers || rivers.length === 0) return []
  // 预建 burg.cell → burg 索引
  const cellToBurg = new Map()
  for (const b of burgs) {
    if (b.i > 0) cellToBurg.set(b.cell, b)
  }
  const result = []
  for (const river of rivers) {
    if (!river.mouth || river.mouth <= 0) continue
    // 长度阈值: 至少 5 cells
    const length = river.cells?.length || 0
    if (length < 5) continue
    let score = 30
    const reasons = [`河长 ${length} 格`]
    // 河口有 burg?
    const mouthBurg = cellToBurg.get(river.mouth)
    if (mouthBurg) {
      score += 30
      reasons.push(`河口城镇 ${mouthBurg.name}`)
    }
    // 港口质量
    const pq = readTyped(cells.portQuality, river.mouth, 0)
    if (pq > 40) {
      score += 20
      reasons.push(`港口质量 ${pq}`)
    }
    // 流量
    const flow = readTyped(cells.fl, river.mouth, 0)
    if (flow > 100) {
      score += 10
      reasons.push(`流量 ${flow.toFixed(0)}`)
    }
    // 长度 bonus
    score += clamp(Math.log2(length) * 5, 0, 20)
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    const cellIds = sortCellIds([river.mouth])
    const title = mouthBurg
      ? `${river.name}（${mouthBurg.name} 河口）`
      : `${river.name} 河口`
    const markerIds = [`river:${river.i}`]
    if (mouthBurg) markerIds.push(`burg:${mouthBurg.i}`)
    result.push({
      id: `riverMouth:${river.i}`,
      type: 'riverMouth',
      title,
      score,
      cellIds,
      markerIds,
      reasons,
      keywords: ['river-mouth', 'port', mouthBurg ? 'coastal' : 'inland'].filter(Boolean),
    })
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 路径 3: borderCrossings ──────────────────────────────

function extractBorderCrossings(mapData, precomputed) {
  const { cells, states, roads } = precomputed
  if (!roads || roads.length === 0) return []
  if (!states || states.length <= 1) return []
  const result = []
  // 跨州/跨国道路 = 沿线 cells.state 出现 ≥ 2 个不同 state id
  for (const road of roads) {
    if (!road.cells || road.cells.length < 2) continue
    const statesOnRoad = new Set()
    for (const c of road.cells) {
      const s = readTyped(cells.state, c, 0)
      if (s > 0) statesOnRoad.add(s)
    }
    if (statesOnRoad.size < 2) continue
    let score = 30
    const reasons = []
    score += Math.min(20, (statesOnRoad.size - 1) * 10)
    reasons.push(`跨越 ${statesOnRoad.size} 个国家`)
    if (road.type === 'major') {
      score += 20
      reasons.push('主干道')
    } else if (road.type === 'trade') {
      score += 15
      reasons.push('商道')
    } else if (road.type === 'sea') {
      score += 10
      reasons.push('海运')
    }
    // 道路长度
    score += clamp(Math.log2(road.cells.length) * 4, 0, 15)
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    // 标记跨越点: 道路中第一个 state 切换的 cell
    const crossingCells = []
    let prevState = 0
    for (const c of road.cells) {
      const s = readTyped(cells.state, c, 0)
      if (prevState !== 0 && s !== 0 && s !== prevState) {
        crossingCells.push(c)
      }
      if (s !== 0) prevState = s
    }
    if (crossingCells.length === 0) continue
    const title = `${road.name || `${road.type} 道路`}（${road.type}）`
    result.push({
      id: `borderCrossing:${road.i}`,
      type: 'borderCrossing',
      title,
      score,
      cellIds: sortCellIds(crossingCells),
      markerIds: [`road:${road.i}`],
      reasons,
      keywords: ['border', 'crossing', road.type],
    })
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 路径 4: frontierZones ────────────────────────────────

function extractFrontierZones(mapData, precomputed) {
  const { cells, states } = precomputed
  if (!states || states.length < 2) return []
  // 收集所有 cells 上有"邻接其他 state"的 land cell
  const frontierCells = []
  const seenFrontier = new Set()
  for (let i = 0; i < cells.length; i++) {
    if (!isLandCell(cells, i)) continue
    const s = readTyped(cells.state, i, 0)
    if (s === 0) continue
    const neighbors = cells.c?.[i] || []
    let touchesOtherState = false
    for (const n of neighbors) {
      const ns = readTyped(cells.state, n, 0)
      if (ns > 0 && ns !== s) {
        touchesOtherState = true
        break
      }
    }
    if (touchesOtherState && !seenFrontier.has(i)) {
      seenFrontier.add(i)
      frontierCells.push(i)
    }
  }
  if (frontierCells.length === 0) return []
  // BFS 聚簇
  const visited = new Set()
  const clusters = []
  for (const seed of frontierCells) {
    if (visited.has(seed)) continue
    const cluster = bfsCluster(cells, seed, (c) => {
      if (!isLandCell(cells, c)) return false
      const s = readTyped(cells.state, c, 0)
      if (s === 0) return false
      // 簇成员 = 邻接至少 1 个其他 state
      const neighbors = cells.c?.[c] || []
      for (const n of neighbors) {
        const ns = readTyped(cells.state, n, 0)
        if (ns > 0 && ns !== s) {
          return true
        }
      }
      return false
    }, MAX_CLUSTER_CELLS)
    for (const c of cluster) visited.add(c)
    if (cluster.length >= 5) clusters.push(cluster)
  }
  // 计算每簇分数: 邻接 state 数 + 簇 size + 是否低人口
  const result = []
  let clusterIdx = 0
  for (const cluster of clusters) {
    if (cluster.length < 5) continue
    let score = 25
    const reasons = []
    const stateSet = new Set()
    let lowPopCount = 0
    let totalPop = 0
    for (const c of cluster) {
      const s = readTyped(cells.state, c, 0)
      if (s > 0) stateSet.add(s)
      const p = readTyped(cells.pop, c, 0)
      totalPop += p
      if (p < 0.5) lowPopCount++
    }
    score += Math.min(30, (stateSet.size - 1) * 15)
    reasons.push(`邻接 ${stateSet.size} 个国家`)
    if (lowPopCount / cluster.length > 0.6) {
      score += 20
      reasons.push('人口稀少')
    }
    if (cluster.length > 50) {
      score += 10
      reasons.push(`绵延 ${cluster.length} 格`)
    }
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    result.push({
      id: `frontierZone:${clusterIdx}`,
      type: 'frontierZone',
      title: `边境荒域 ${clusterIdx + 1}`,
      score,
      cellIds: sortCellIds(cluster),
      markerIds: [...stateSet].map((s) => `state:${s}`),
      reasons,
      keywords: ['frontier', 'borderland', 'wild'],
    })
    clusterIdx++
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 路径 5: isolatedSites ────────────────────────────────

function extractIsolatedSites(mapData, precomputed) {
  const { cells, burgs, roads, stateBurgCount } = precomputed
  if (!burgs || burgs.length === 0) return []
  if (!roads || roads.length === 0) return [] // 没有道路 = 全部都孤立, 无信息量
  // 预建 road cell 集合
  const roadCellSet = new Set()
  for (const r of roads) {
    if (!r.cells) continue
    for (const c of r.cells) roadCellSet.add(c)
  }
  const result = []
  for (const burg of burgs) {
    if (burg.i === 0) continue
    if (!isLandCell(cells, burg.cell)) continue
    // BFS 半径 = ROAD_REACH_RADIUS, 看是否能命中 roadCellSet
    const visited = new Set()
    const queue = [burg.cell]
    let foundRoad = false
    let nearestRoadDist = Infinity
    while (queue.length > 0) {
      const cur = queue.shift()
      if (visited.has(cur)) continue
      visited.add(cur)
      if (roadCellSet.has(cur)) {
        foundRoad = true
        nearestRoadDist = Math.min(nearestRoadDist, visited.size - 1)
        break
      }
      if (visited.size > ROAD_REACH_RADIUS * 6) break // 防止无路时无限 BFS
      const neighbors = cells.c?.[cur] || []
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n)
      }
    }
    // 已经在路上 = 一定连通
    if (roadCellSet.has(burg.cell)) {
      foundRoad = true
      nearestRoadDist = 0
    }
    if (foundRoad && nearestRoadDist <= ROAD_REACH_RADIUS) continue
    let score = 25
    const reasons = []
    if (!foundRoad) {
      score += 30
      reasons.push('道路不可达')
    } else {
      score += 15
      reasons.push(`距最近道路 ${nearestRoadDist} 格`)
    }
    // 单点聚落: 该 state 只有这一个 burg
    const burgCount = stateBurgCount.get(burg.state) || 0
    if (burgCount === 1) {
      score += 20
      reasons.push('该国唯一城镇')
    }
    // 港口悖论: 港口但没路 = 海上孤岛
    if (burg.port && !foundRoad) {
      score += 10
      reasons.push('孤岛港口')
    }
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    const cellIds = sortCellIds([burg.cell])
    const title = `${burg.name}（孤悬）`
    const markerIds = [`burg:${burg.i}`]
    if (burg.state > 0) markerIds.push(`state:${burg.state}`)
    result.push({
      id: `isolatedSite:${burg.i}`,
      type: 'isolatedSite',
      title,
      score,
      cellIds,
      markerIds,
      reasons,
      keywords: ['isolated', burg.port ? 'remote-port' : 'remote', 'frontier'],
    })
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 路径 6: fertileRegions / hostileRegions ──────────────

function summarizeCells(cells, ids) {
  if (ids.length === 0) return { meanHabitability: 0, meanH: 0, meanTemp: 0, meanPop: 0, biomeCounts: {} }
  let hab = 0
  let h = 0
  let temp = 0
  let pop = 0
  const biomeCounts = {}
  for (const c of ids) {
    const b = readTyped(cells.biome, c, 0)
    biomeCounts[b] = (biomeCounts[b] || 0) + 1
    // habitability 字段 (cells.s) 是 0-100 适宜度
    hab += readTyped(cells.s, c, 0)
    h += readTyped(cells.h, c, 0)
    temp += readTyped(cells.temp, c, 0)
    pop += readTyped(cells.pop, c, 0)
  }
  return {
    meanHabitability: hab / ids.length,
    meanH: h / ids.length,
    meanTemp: temp / ids.length,
    meanPop: pop / ids.length,
    biomeCounts,
  }
}

function extractFertileRegions(mapData, precomputed) {
  const { cells, rivers } = precomputed
  // 收集"种子 cell": habitability 高的 land cells
  const seeds = []
  for (let i = 0; i < cells.length; i++) {
    if (!isLandCell(cells, i)) continue
    const s = readTyped(cells.s, i, 0)
    if (s >= 55) seeds.push(i)
  }
  if (seeds.length === 0) return []
  // 河流 cell 集合
  const riverCellSet = new Set()
  for (const r of rivers) {
    if (!r.cells) continue
    for (const c of r.cells) riverCellSet.add(c)
  }
  // BFS 簇
  const visited = new Set()
  const clusters = []
  for (const seed of seeds) {
    if (visited.has(seed)) continue
    const cluster = bfsCluster(cells, seed, (c) => {
      if (!isLandCell(cells, c)) return false
      return readTyped(cells.s, c, 0) >= 50
    }, MAX_CLUSTER_CELLS)
    for (const c of cluster) visited.add(c)
    if (cluster.length >= 8) clusters.push(cluster)
  }
  const result = []
  let idx = 0
  for (const cluster of clusters) {
    const stats = summarizeCells(cells, cluster)
    if (stats.meanHabitability < 50) continue
    let score = 25
    const reasons = []
    if (stats.meanHabitability > 70) {
      score += 25
      reasons.push(`宜居度 ${stats.meanHabitability.toFixed(0)}`)
    } else {
      score += 10
      reasons.push(`宜居度 ${stats.meanHabitability.toFixed(0)}`)
    }
    if (stats.meanTemp > 5) {
      score += 10
      reasons.push(`均温 ${stats.meanTemp.toFixed(1)}°C`)
    }
    if (stats.meanPop > 1) {
      score += 10
      reasons.push(`人口密集 ${stats.meanPop.toFixed(1)}`)
    }
    // 沿河 bonus
    const onRiver = cluster.some((c) => riverCellSet.has(c))
    if (onRiver) {
      score += 15
      reasons.push('沿河')
    }
    // 簇 size bonus
    if (cluster.length > 100) {
      score += 10
      reasons.push(`连片 ${cluster.length} 格`)
    }
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    // 统计 fertile biomes 占比
    let fertileCount = 0
    for (const [b, n] of Object.entries(stats.biomeCounts)) {
      if (FERTILE_BIOMES.has(Number(b))) fertileCount += n
    }
    const fertileRatio = fertileCount / cluster.length
    result.push({
      id: `fertileRegion:${idx}`,
      type: 'fertileRegion',
      title: `沃土 ${idx + 1}`,
      score,
      cellIds: sortCellIds(cluster),
      markerIds: [],
      reasons,
      keywords: ['fertile', onRiver ? 'riverine' : 'plains', `biome-ratio-${(fertileRatio * 100).toFixed(0)}`],
    })
    idx++
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

function extractHostileRegions(mapData, precomputed) {
  const { cells } = precomputed
  // 种子 cell: 高海拔 / 严寒 / 沙漠 / 苔原 / 冰川
  const seeds = []
  for (let i = 0; i < cells.length; i++) {
    if (!isLandCell(cells, i)) continue
    const h = readTyped(cells.h, i, 0)
    const biome = readTyped(cells.biome, i, 0)
    if (h >= 60 || HOSTILE_BIOMES.has(biome)) {
      seeds.push(i)
    }
  }
  if (seeds.length === 0) return []
  const visited = new Set()
  const clusters = []
  for (const seed of seeds) {
    if (visited.has(seed)) continue
    const cluster = bfsCluster(cells, seed, (c) => {
      if (!isLandCell(cells, c)) return false
      const h = readTyped(cells.h, c, 0)
      const biome = readTyped(cells.biome, c, 0)
      return h >= 55 || HOSTILE_BIOMES.has(biome)
    }, MAX_CLUSTER_CELLS)
    for (const c of cluster) visited.add(c)
    if (cluster.length >= 8) clusters.push(cluster)
  }
  const result = []
  let idx = 0
  for (const cluster of clusters) {
    const stats = summarizeCells(cells, cluster)
    let hostileCount = 0
    for (const [b, n] of Object.entries(stats.biomeCounts)) {
      if (HOSTILE_BIOMES.has(Number(b))) hostileCount += n
    }
    const hostileRatio = hostileCount / cluster.length
    if (stats.meanH < 55 && hostileRatio < 0.5) continue
    let score = 25
    const reasons = []
    if (stats.meanH > 65) {
      score += 25
      reasons.push(`高海拔 ${stats.meanH.toFixed(0)}`)
    } else {
      score += 10
      reasons.push(`平均海拔 ${stats.meanH.toFixed(0)}`)
    }
    if (stats.meanTemp < 0) {
      score += 15
      reasons.push(`严寒 ${stats.meanTemp.toFixed(1)}°C`)
    }
    if (hostileRatio > 0.5) {
      score += 20
      reasons.push(`凶土占比 ${(hostileRatio * 100).toFixed(0)}%`)
    }
    if (stats.meanPop < 0.5) {
      score += 10
      reasons.push('人迹罕至')
    }
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    // 选取簇中 elevation 最低 + 邻接非 hostile 的 cell 作"山口候选"
    let passCandidate = -1
    let passH = Infinity
    for (const c of cluster) {
      const h = readTyped(cells.h, c, 0)
      if (h < passH) {
        passH = h
        passCandidate = c
      }
    }
    const cellIds = sortCellIds(cluster)
    const markerIds = passCandidate >= 0 ? [`pass-cell:${passCandidate}`] : []
    result.push({
      id: `hostileRegion:${idx}`,
      type: 'hostileRegion',
      title: `凶土 ${idx + 1}`,
      score,
      cellIds,
      markerIds,
      reasons,
      keywords: ['hostile', stats.meanH > 65 ? 'highland' : 'wasteland', `hostile-ratio-${(hostileRatio * 100).toFixed(0)}`],
    })
    idx++
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 路径 7: strategicRoutes ──────────────────────────────

function extractStrategicRoutes(mapData, precomputed) {
  const { cells, burgs, states, roads } = precomputed
  if (!roads || roads.length === 0) return []
  if (!burgs || burgs.length === 0) return []
  const cellToBurg = new Map()
  for (const b of burgs) {
    if (b.i > 0) cellToBurg.set(b.cell, b)
  }
  // 候选: 长路 + 跨国
  const result = []
  for (const road of roads) {
    if (!road.cells || road.cells.length < 8) continue
    // 沿线 burg
    const burgsOnRoad = []
    for (const c of road.cells) {
      const b = cellToBurg.get(c)
      if (b) burgsOnRoad.push(b)
    }
    // 沿线 state
    const statesOnRoad = new Set()
    for (const c of road.cells) {
      const s = readTyped(cells.state, c, 0)
      if (s > 0) statesOnRoad.add(s)
    }
    let score = 25
    const reasons = []
    // 长度
    score += clamp(Math.log2(road.cells.length) * 6, 0, 25)
    reasons.push(`全长 ${road.cells.length} 格`)
    if (statesOnRoad.size >= 2) {
      score += 15
      reasons.push(`跨越 ${statesOnRoad.size} 个国家`)
    }
    if (road.type === 'trade') {
      score += 15
      reasons.push('商道')
    } else if (road.type === 'major') {
      score += 10
      reasons.push('主干道')
    } else if (road.type === 'sea') {
      score += 12
      reasons.push('海运线')
    }
    if (burgsOnRoad.length >= 3) {
      score += 10
      reasons.push(`串联 ${burgsOnRoad.length} 个城镇`)
    }
    // 跨海特别
    let crossesWater = false
    for (const c of road.cells) {
      if (isWaterCell(cells, c)) {
        crossesWater = true
        break
      }
    }
    if (crossesWater) {
      score += 8
      reasons.push('跨水域')
    }
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    const cellIds = sortCellIds(road.cells)
    const title = road.name && road.name.length > 0
      ? road.name
      : `${road.type === 'sea' ? '海运' : road.type === 'trade' ? '商道' : '主道'} ${road.i}`
    result.push({
      id: `strategicRoute:${road.i}`,
      type: 'strategicRoute',
      title,
      score,
      cellIds,
      markerIds: [`road:${road.i}`, ...burgsOnRoad.map((b) => `burg:${b.i}`)],
      reasons,
      keywords: ['route', road.type, crossesWater ? 'crosses-water' : 'overland'],
    })
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 路径 8: mountainPasses ───────────────────────────────

function extractMountainPasses(mapData, precomputed) {
  const { cells, roads } = precomputed
  if (!roads || roads.length === 0) return []
  // 候选: 道路穿越高海拔格(h>55), 且两端低海拔
  const result = []
  for (const road of roads) {
    if (!road.cells || road.cells.length < 4) continue
    if (road.type === 'sea') continue
    // 找穿越高点
    let maxH = 0
    let maxIdx = -1
    let startH = readTyped(cells.h, road.cells[0], 0)
    let endH = readTyped(cells.h, road.cells[road.cells.length - 1], 0)
    for (let k = 0; k < road.cells.length; k++) {
      const h = readTyped(cells.h, road.cells[k], 0)
      if (h > maxH) {
        maxH = h
        maxIdx = k
      }
    }
    if (maxH < 55) continue // 不算翻山
    // 山口: 局部低洼, 至少一端不算高
    const startLow = startH < maxH - 15
    const endLow = endH < maxH - 15
    if (!startLow && !endLow) continue // 整条路都在山上, 不是"口"
    // 计算"saddle": 沿路最高点附近最低 cell
    let saddleH = maxH
    let saddleIdx = maxIdx
    for (let k = Math.max(0, maxIdx - 2); k <= Math.min(road.cells.length - 1, maxIdx + 2); k++) {
      const h = readTyped(cells.h, road.cells[k], 0)
      if (h < saddleH) {
        saddleH = h
        saddleIdx = k
      }
    }
    // 至少 30 的高差才算山口
    const relief = maxH - Math.min(startH, endH)
    if (relief < 30) continue
    let score = 30
    const reasons = []
    reasons.push(`高差 ${relief} 格`)
    if (road.type === 'major') {
      score += 25
      reasons.push('主干道穿山')
    } else if (road.type === 'trade') {
      score += 18
      reasons.push('商道穿山')
    } else {
      score += 10
      reasons.push(`${road.type} 穿山`)
    }
    // 高度越高, 山口越稀缺
    if (maxH > 70) {
      score += 15
      reasons.push(`峰顶 ${maxH}`)
    } else {
      score += 5
    }
    score = Math.round(clamp(score, 0, 100))
    if (score < 50) continue
    const saddleCell = road.cells[saddleIdx]
    // 山口 cell + 周围邻接 1 格(让 UI 看得见一点)
    const nearby = new Set([saddleCell])
    for (const n of (cells.c?.[saddleCell] || [])) nearby.add(n)
    const cellIds = sortCellIds([...nearby])
    const title = `山口 ${road.name && road.name.length > 0 ? road.name : `#${road.i}`}`
    result.push({
      id: `mountainPass:${road.i}`,
      type: 'mountainPass',
      title,
      score,
      cellIds,
      markerIds: [`road:${road.i}`],
      reasons,
      keywords: ['pass', 'mountain', 'saddle'],
    })
  }
  result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return result.slice(0, MAX_PER_CATEGORY)
}

// ── 主入口 ──────────────────────────────────────────────

/**
 * 从 generateMap() 输出的 mapData 中提取历史系统可用的地理语义点。
 *
 * 纯函数: 同样输入 → 同样输出, 无副作用。
 *
 * @param {object|null|undefined} mapData VoronoiMapData
 * @param {object} [options]
 * @param {number} [options.maxPerCategory=50] 单类返回上限
 * @param {boolean} [options.includeEmpty=false] 是否包含 0 score 类别
 * @returns {{
 *   tradeHubs: object[],
 *   borderCrossings: object[],
 *   frontierZones: object[],
 *   isolatedSites: object[],
 *   fertileRegions: object[],
 *   hostileRegions: object[],
 *   strategicRoutes: object[],
 *   riverMouths: object[],
 *   mountainPasses: object[],
 *   meta: { cells: number, burgs: number, roads: number, rivers: number, states: number }
 * }}
 */
export function extractMapSemantics(mapData, options = {}) {
  const empty = makeEmptyResult()
  if (!mapData || typeof mapData !== 'object') return empty
  const { cells, burgs, roads, rivers, states, features } = mapData
  if (!cells || typeof cells.length !== 'number' || cells.length === 0) {
    return empty
  }
  const maxPerCategory = options.maxPerCategory || MAX_PER_CATEGORY
  // 预计算
  const precomputed = {
    cells,
    burgs: burgs || [],
    roads: roads || [],
    rivers: rivers || [],
    states: states || [],
    features: features || [],
    maxPop: computeMaxPop(burgs),
    stateBurgCount: computeStateBurgCount(burgs),
  }
  const tradeHubs = extractTradeHubs(mapData, precomputed).slice(0, maxPerCategory)
  const riverMouths = extractRiverMouths(mapData, precomputed).slice(0, maxPerCategory)
  const borderCrossings = extractBorderCrossings(mapData, precomputed).slice(0, maxPerCategory)
  const frontierZones = extractFrontierZones(mapData, precomputed).slice(0, maxPerCategory)
  const isolatedSites = extractIsolatedSites(mapData, precomputed).slice(0, maxPerCategory)
  const fertileRegions = extractFertileRegions(mapData, precomputed).slice(0, maxPerCategory)
  const hostileRegions = extractHostileRegions(mapData, precomputed).slice(0, maxPerCategory)
  const strategicRoutes = extractStrategicRoutes(mapData, precomputed).slice(0, maxPerCategory)
  const mountainPasses = extractMountainPasses(mapData, precomputed).slice(0, maxPerCategory)
  return {
    tradeHubs,
    borderCrossings,
    frontierZones,
    isolatedSites,
    fertileRegions,
    hostileRegions,
    strategicRoutes,
    riverMouths,
    mountainPasses,
    meta: {
      cells: cells.length,
      burgs: precomputed.burgs.length,
      roads: precomputed.roads.length,
      rivers: precomputed.rivers.length,
      states: precomputed.states.length,
    },
  }
}

function makeEmptyResult() {
  return {
    tradeHubs: [],
    borderCrossings: [],
    frontierZones: [],
    isolatedSites: [],
    fertileRegions: [],
    hostileRegions: [],
    strategicRoutes: [],
    riverMouths: [],
    mountainPasses: [],
    meta: { cells: 0, burgs: 0, roads: 0, rivers: 0, states: 0 },
  }
}

function computeMaxPop(burgs) {
  if (!burgs) return 0
  let max = 0
  for (const b of burgs) {
    if (b.population > max) max = b.population
  }
  return max || 1
}

function computeStateBurgCount(burgs) {
  const m = new Map()
  if (!burgs) return m
  for (const b of burgs) {
    if (b.i === 0) continue
    m.set(b.state, (m.get(b.state) || 0) + 1)
  }
  return m
}

/**
 * 便捷导出: 取所有 site 的扁平清单(便于一次性消费 / 索引)。
 *
 * @param {object} semanticsResult extractMapSemantics() 的返回值
 * @returns {object[]}
 */
export function flattenSemantics(semanticsResult) {
  if (!semanticsResult) return []
  const out = []
  const order = [
    'tradeHubs',
    'borderCrossings',
    'frontierZones',
    'isolatedSites',
    'fertileRegions',
    'hostileRegions',
    'strategicRoutes',
    'riverMouths',
    'mountainPasses',
  ]
  for (const cat of order) {
    const list = semanticsResult[cat]
    if (!Array.isArray(list)) continue
    for (const site of list) out.push(site)
  }
  return out
}

/**
 * 便捷导出: 按 type 过滤 site。
 *
 * @param {object} semanticsResult
 * @param {string|string[]} types
 * @returns {object[]}
 */
export function filterSemantics(semanticsResult, types) {
  const all = flattenSemantics(semanticsResult)
  if (!types) return all
  const typeSet = new Set(Array.isArray(types) ? types : [types])
  return all.filter((s) => typeSet.has(s.type))
}
