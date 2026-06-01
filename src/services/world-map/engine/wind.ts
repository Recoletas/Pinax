/**
 * 风场与洋流模拟
 * 行星风带 + 大陆偏转 + 科里奥利洋流环流
 */

import type { GridCells, Feature, WindData, OceanCurrent } from './types'

/**
 * 生成风场与洋流
 */
export function generateWindAndCurrents(
  cells: GridCells,
  width: number,
  height: number,
  features: Feature[],
  rng: () => number,
): { wind: WindData; oceanCurrents: OceanCurrent[] } {
  const n = cells.length
  const wind: WindData = {
    wx: new Float32Array(n),
    wy: new Float32Array(n),
    ws: new Float32Array(n),
  }

  // 1. 计算行星风带基础风向
  computePlanetaryWind(cells, width, height, wind)

  // 2. 大陆偏转（风遇到高山绕行）
  deflectByTerrain(cells, wind)

  // 3. 生成洋流
  const oceanCurrents = generateOceanCurrents(cells, width, height, features, wind, rng)

  return { wind, oceanCurrents }
}

/**
 * 行星风带模型
 * 简化 Hadley/Ferrel/Polar cell
 */
function computePlanetaryWind(
  cells: GridCells,
  width: number,
  height: number,
  wind: WindData,
): void {
  for (let i = 0; i < cells.length; i++) {
    const y = cells.p[i * 2 + 1]
    const lat = (y / height - 0.5) * 2 // -1=北极, 0=赤道, 1=南极
    const absLat = Math.abs(lat)

    // 基础风向：东/西分量
    let wx: number, wy: number, ws: number

    if (absLat < 0.17) {
      // 赤道无风带 (0°-15°) — 弱信风
      wx = lat > 0 ? -0.3 : 0.3  // 北半球东北信风，南半球东南信风
      wy = lat > 0 ? 0.1 : -0.1
      ws = 0.2
    } else if (absLat < 0.33) {
      // 信风带 (15°-30°)
      wx = lat > 0 ? -0.7 : 0.7
      wy = lat > 0 ? 0.15 : -0.15
      ws = 0.5
    } else if (absLat < 0.5) {
      // 副热带无风带 (30°-45°) — 过渡
      wx = lat > 0 ? 0.2 : -0.2
      wy = lat > 0 ? -0.1 : 0.1
      ws = 0.25
    } else if (absLat < 0.67) {
      // 西风带 (45°-60°)
      wx = lat > 0 ? 0.8 : -0.8
      wy = lat > 0 ? -0.15 : 0.15
      ws = 0.7
    } else if (absLat < 0.83) {
      // 副极地 (60°-75°)
      wx = lat > 0 ? 0.4 : -0.4
      wy = lat > 0 ? -0.2 : 0.2
      ws = 0.4
    } else {
      // 极地东风 (75°-90°)
      wx = lat > 0 ? -0.3 : 0.3
      wy = lat > 0 ? -0.1 : 0.1
      ws = 0.2
    }

    // 归一化风向
    const len = Math.sqrt(wx * wx + wy * wy) || 1
    wind.wx[i] = wx / len
    wind.wy[i] = wy / len
    wind.ws[i] = ws
  }
}

/**
 * 大陆偏转 — 风遇到高山绕行
 * 沿地形梯度方向偏转风向
 */
function deflectByTerrain(cells: GridCells, wind: WindData): void {
  const n = cells.length
  const tempWx = new Float32Array(n)
  const tempWy = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    tempWx[i] = wind.wx[i]
    tempWy[i] = wind.wy[i]
  }

  for (let i = 0; i < n; i++) {
    const h = cells.h[i]
    if (h < 35) continue // 只有中等以上地形才影响风向

    // 计算地形梯度（高度下降最快的方向）
    let gradX = 0, gradY = 0
    const neighbors = cells.c[i]
    for (const nb of neighbors) {
      const dx = cells.p[nb * 2] - cells.p[i * 2]
      const dy = cells.p[nb * 2 + 1] - cells.p[i * 2 + 1]
      const dh = cells.h[nb] - h
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      gradX -= dh * (dx / dist) / dist
      gradY -= dh * (dy / dist) / dist
    }

    const gradLen = Math.sqrt(gradX * gradX + gradY * gradY)
    if (gradLen < 0.5) continue

    // 归一化梯度
    const ngx = gradX / gradLen
    const ngy = gradY / gradLen

    // 偏转强度与高度成正比
    const deflectStrength = Math.min(0.8, (h - 35) / 50)

    // 风向沿地形偏转：将风向投影到切线方向
    const wx = tempWx[i]
    const wy = tempWy[i]
    // 地形法线方向的风向分量
    const dotNormal = wx * ngx + wy * ngy
    // 减去法线分量，保留切线分量
    const tangentX = wx - dotNormal * ngx
    const tangentY = wy - dotNormal * ngy
    const tLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1

    tempWx[i] = wx * (1 - deflectStrength) + (tangentX / tLen) * deflectStrength
    tempWy[i] = wy * (1 - deflectStrength) + (tangentY / tLen) * deflectStrength

    // 重新归一化
    const newLen = Math.sqrt(tempWx[i] * tempWx[i] + tempWy[i] * tempWy[i]) || 1
    tempWx[i] /= newLen
    tempWy[i] /= newLen
  }

  // 写回
  for (let i = 0; i < n; i++) {
    wind.wx[i] = tempWx[i]
    wind.wy[i] = tempWy[i]
  }
}

/**
 * 生成洋流
 * 在海洋特征中根据风场 + 科里奥利力追踪环流
 */
function generateOceanCurrents(
  cells: GridCells,
  width: number,
  height: number,
  features: Feature[],
  wind: WindData,
  rng: () => number,
): OceanCurrent[] {
  const currents: OceanCurrent[] = []
  let currentId = 0

  const oceanFeatures = features.filter(f =>
    f && (f.type === 'ocean' || f.type === 'sea') && f.cellIds.length > 50
  )

  for (const feature of oceanFeatures) {
    // 在特征内选几个起始点生成洋流
    const startCount = Math.max(1, Math.floor(feature.cellIds.length / 200))
    const starts = pickRandomCells(feature.cellIds, startCount, rng)

    for (const startCell of starts) {
      const points = traceCurrent(cells, width, height, startCell, wind, feature.cellIds, rng)
      if (points.length < 5) continue

      // 判断暖流/寒流：看洋流方向是向高纬还是低纬
      const startY = points[0][1]
      const endY = points[points.length - 1][1]
      const latChange = (endY / height - 0.5) - (startY / height - 0.5)
      // 如果从低纬流向高纬（|lat|变小）→ 暖流，反之 → 寒流
      const type: OceanCurrent['type'] = Math.abs(latChange) < 0.05
        ? (rng() > 0.5 ? 'warm' : 'cold')
        : (latChange > 0 ? 'cold' : 'warm')

      currents.push({
        i: currentId++,
        type,
        points,
        strength: 0.3 + rng() * 0.5,
      })
    }
  }

  return currents
}

/**
 * 追踪一条洋流路径
 * 从起始点出发，沿风场 + 科里奥利力方向 BFS 前进
 */
function traceCurrent(
  cells: GridCells,
  width: number,
  height: number,
  start: number,
  wind: WindData,
  featureCells: number[],
  rng: () => number,
): [number, number][] {
  const featureSet = new Set(featureCells)
  const points: [number, number][] = []
  const visited = new Set<number>()
  let current = start
  const maxSteps = 150

  for (let step = 0; step < maxSteps; step++) {
    if (visited.has(current)) break
    visited.add(current)
    points.push([cells.p[current * 2], cells.p[current * 2 + 1]])

    // 找下一个单元格：在风向 + 科里奥利偏转方向上找最深的海洋邻居
    const lat = (cells.p[current * 2 + 1] / height - 0.5) * 2
    const coriolis = lat > 0 ? 1 : -1 // 北半球右偏，南半球左偏

    // 风驱动方向 + 科里奥利偏转 90°
    const baseDirX = wind.wx[current] * 0.6 + (-wind.wy[current] * coriolis) * 0.4
    const baseDirY = wind.wy[current] * 0.6 + (wind.wx[current] * coriolis) * 0.4

    let bestNb = -1
    let bestScore = -Infinity

    for (const nb of cells.c[current]) {
      if (visited.has(nb)) continue
      if (!featureSet.has(nb)) continue // 保持在同一个海洋特征内

      const dx = cells.p[nb * 2] - cells.p[current * 2]
      const dy = cells.p[nb * 2 + 1] - cells.p[current * 2 + 1]
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const ndx = dx / dist
      const ndy = dy / dist

      // 方向匹配分
      const dot = ndx * baseDirX + ndy * baseDirY
      // 深度偏好（深水优先）
      const depthScore = -cells.h[nb] * 0.01
      const score = dot + depthScore + rng() * 0.15

      if (score > bestScore) {
        bestScore = score
        bestNb = nb
      }
    }

    if (bestNb < 0) break
    current = bestNb
  }

  return points
}

/**
 * 从数组中随机选 N 个元素
 */
function pickRandomCells(arr: number[], count: number, rng: () => number): number[] {
  const result: number[] = []
  const step = Math.max(1, Math.floor(arr.length / count))
  for (let i = 0; i < arr.length && result.length < count; i += step) {
    const idx = Math.min(i + Math.floor(rng() * step), arr.length - 1)
    result.push(arr[idx])
  }
  return result
}
