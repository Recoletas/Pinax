/**
 * 气候系统：温度、降水量、生态群落
 * 接入风场、洋流、雨影效应
 * 使用空间网格索引避免 O(n²) 循环
 */

import type { GridCells, BiomeDef, WindData, OceanCurrent } from './types'

/** 生态群落定义 — 标准等高线地形图配色 */
export const BIOMES: BiomeDef[] = [
  { id: 0, name: '海洋',       color: '#6baed6', habitability: 0,   moveCost: 10 },
  { id: 1, name: '热带沙漠',   color: '#e8d5a3', habitability: 4,   moveCost: 200 },
  { id: 2, name: '寒带荒漠',   color: '#c9b98a', habitability: 10,  moveCost: 150 },
  { id: 3, name: '热带草原',   color: '#c6e2a0', habitability: 22,  moveCost: 60 },
  { id: 4, name: '温带草原',   color: '#a8d86e', habitability: 30,  moveCost: 50 },
  { id: 5, name: '热带季风林', color: '#6abf5b', habitability: 50,  moveCost: 70 },
  { id: 6, name: '温带落叶林', color: '#3da33d', habitability: 100, moveCost: 70 },
  { id: 7, name: '热带雨林',   color: '#1e8a1e', habitability: 80,  moveCost: 80 },
  { id: 8, name: '温带雨林',   color: '#2d8c2d', habitability: 90,  moveCost: 90 },
  { id: 9, name: '针叶林',     color: '#4a7a3b', habitability: 12,  moveCost: 200 },
  { id: 10, name: '苔原',      color: '#b8c9a0', habitability: 4,   moveCost: 1000 },
  { id: 11, name: '冰川',      color: '#eaf0f6', habitability: 0,   moveCost: 5000 },
  { id: 12, name: '湿地',      color: '#7fb5a0', habitability: 12,  moveCost: 150 },
]

/**
 * 生态群落查找矩阵
 * 行: 湿润度 (0=干燥, 4=湿润)
 * 列: 温度 (0=热, 25=冷)
 */
const BIOME_MATRIX: number[][] = [
  [1, 1, 1, 1, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10, 10, 11, 11, 11, 11],
  [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 11, 11, 11, 11],
  [5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11],
  [5, 5, 7, 7, 7, 7, 6, 6, 6, 6, 6, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 11, 11, 11, 11],
  [7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 11, 11, 11, 11],
]

// ── 空间网格索引 ────────────────────────────────────

/** 简单空间网格，用于 O(1) 最近邻查找 */
class SpatialGrid {
  private cellSize: number
  private cols: number
  private rows: number
  private buckets: number[][]
  private px: Float64Array
  private py: Float64Array

  constructor(cells: GridCells, width: number, height: number) {
    this.cellSize = Math.max(width, height) / 30
    this.cols = Math.ceil(width / this.cellSize) + 1
    this.rows = Math.ceil(height / this.cellSize) + 1
    this.buckets = Array.from({ length: this.cols * this.rows }, () => [])
    this.px = cells.p // 引用，不拷贝
    this.py = cells.p

    for (let i = 0; i < cells.length; i++) {
      const col = Math.floor(cells.p[i * 2] / this.cellSize)
      const row = Math.floor(cells.p[i * 2 + 1] / this.cellSize)
      const idx = row * this.cols + col
      if (idx >= 0 && idx < this.buckets.length) {
        this.buckets[idx].push(i)
      }
    }
  }

  /** 查找距离 (x, y) 最近的单元格索引 */
  findNearest(x: number, y: number): number {
    const col = Math.floor(x / this.cellSize)
    const row = Math.floor(y / this.cellSize)
    let best = -1
    let bestDist = Infinity

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr
        const c = col + dc
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue
        const bucket = this.buckets[r * this.cols + c]
        for (let k = 0; k < bucket.length; k++) {
          const idx = bucket[k]
          const dx = this.px[idx * 2] - x
          const dy = this.py[idx * 2 + 1] - y
          const d = dx * dx + dy * dy
          if (d < bestDist) { bestDist = d; best = idx }
        }
      }
    }
    return best
  }

  /** 查找 (x, y) 附近 maxDist 像素内的所有陆地单元格 */
  findNearbyLand(x: number, y: number, maxDist: number, cells: GridCells): number[] {
    const col = Math.floor(x / this.cellSize)
    const row = Math.floor(y / this.cellSize)
    const maxCells = Math.ceil(maxDist / this.cellSize) + 1
    const result: number[] = []
    const maxDist2 = maxDist * maxDist

    for (let dr = -maxCells; dr <= maxCells; dr++) {
      for (let dc = -maxCells; dc <= maxCells; dc++) {
        const r = row + dr
        const c = col + dc
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue
        const bucket = this.buckets[r * this.cols + c]
        for (let k = 0; k < bucket.length; k++) {
          const idx = bucket[k]
          if (cells.h[idx] < 20) continue
          const dx = this.px[idx * 2] - x
          const dy = this.py[idx * 2 + 1] - y
          if (dx * dx + dy * dy <= maxDist2) {
            result.push(idx)
          }
        }
      }
    }
    return result
  }
}

// ── 温度 ────────────────────────────────────────────

/**
 * 计算温度
 * 接入洋流影响和风场热输送
 */
export function calculateTemperature(
  cells: GridCells,
  width: number,
  height: number,
  wind: WindData,
  oceanCurrents: OceanCurrent[],
  temperatureShift = 0,
): void {
  const n = cells.length
  const grid = new SpatialGrid(cells, width, height)

  // 基础温度
  const baseTemp = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const y = cells.p[i * 2 + 1]
    const lat = Math.abs(y / height - 0.5) * 2
    let temp = 30 - lat * 55

    const h = cells.h[i]
    if (h >= 20) temp -= (h - 20) * 0.4

    if (Math.abs(cells.t[i]) <= 2 && cells.t[i] > 0) {
      temp = temp * 0.9 + 15 * 0.1
    }

    baseTemp[i] = temp
  }

  // 洋流影响：用空间网格只查找洋流点附近的陆地单元格
  for (const current of oceanCurrents) {
    if (current.points.length < 2) continue
    const effect = current.type === 'warm' ? 5 : -5
    const maxDist = 50 // 像素

    for (const [px, py] of current.points) {
      const nearby = grid.findNearbyLand(px, py, maxDist, cells)
      for (const i of nearby) {
        const dx = cells.p[i * 2] - px
        const dy = cells.p[i * 2 + 1] - py
        const dist = Math.sqrt(dx * dx + dy * dy)
        const factor = 1 - dist / maxDist
        baseTemp[i] += effect * factor * current.strength
      }
    }
  }

  // 风场热输送：用空间网格 O(1) 查找
  for (let i = 0; i < n; i++) {
    if (cells.h[i] < 20) continue

    const wx = wind.wx[i]
    const wy = wind.wy[i]
    if (Math.abs(wx) < 0.01 && Math.abs(wy) < 0.01) continue

    // 沿风向回溯找来源温度
    let sourceTemp = baseTemp[i]
    const cx = cells.p[i * 2] - wx * 30
    const cy = cells.p[i * 2 + 1] - wy * 30

    const bestIdx = grid.findNearest(cx, cy)
    if (bestIdx >= 0) {
      sourceTemp = baseTemp[bestIdx]
    }

    baseTemp[i] = baseTemp[i] * 0.7 + sourceTemp * 0.3
  }

  // 写入
  for (let i = 0; i < n; i++) {
    cells.temp[i] = Math.round(baseTemp[i] + temperatureShift)
  }
}

// ── 降水 ────────────────────────────────────────────

/**
 * 计算降水量
 * 接入风场：迎风坡多雨，背风坡干燥（雨影效应）
 */
export function calculatePrecipitation(
  cells: GridCells,
  width: number,
  height: number,
  wind: WindData,
  factor = 1.0,
  rng: () => number,
): void {
  const n = cells.length
  const grid = new SpatialGrid(cells, width, height)

  for (let i = 0; i < n; i++) {
    const y = cells.p[i * 2 + 1]
    const lat = Math.abs(y / height - 0.5) * 2

    // 基础降水
    let prec = 0
    if (lat < 0.3) prec = 70 + rng() * 20
    else if (lat < 0.5) prec = 25 + rng() * 25
    else if (lat < 0.7) prec = 45 + rng() * 25
    else prec = 15 + rng() * 15

    // 沿海效应
    if (cells.t[i] > 0 && cells.t[i] <= 3) {
      prec += 15
    }

    // 风场驱动的降水
    const wx = wind.wx[i]
    const wy = wind.wy[i]
    const ws = wind.ws[i]

    if (cells.h[i] >= 20 && (Math.abs(wx) > 0.01 || Math.abs(wy) > 0.01)) {
      let hasWaterSource = false
      let hasRainShadow = false
      let waterDist = 0

      const stepSize = 12
      let cx = cells.p[i * 2]
      let cy = cells.p[i * 2 + 1]

      for (let step = 0; step < 8; step++) {
        cx -= wx * stepSize
        cy -= wy * stepSize

        if (cx < 0 || cx >= width || cy < 0 || cy >= height) break

        // 用空间网格 O(1) 查找
        const bestIdx = grid.findNearest(cx, cy)
        if (bestIdx < 0) break

        if (cells.h[bestIdx] < 20) {
          hasWaterSource = true
          waterDist = step
          break
        }

        if (cells.h[bestIdx] > 60 && step < 5) {
          hasRainShadow = true
        }
      }

      if (hasWaterSource) {
        const moistureBonus = (1 - waterDist / 8) * 30 * ws
        prec += moistureBonus
        if (cells.h[i] > 50) {
          prec += (cells.h[i] - 50) * 0.4
        }
      } else if (hasRainShadow) {
        prec *= 0.45
      }
    }

    // 海洋蒸发加成
    if (cells.t[i] > 0 && cells.t[i] <= 2 && cells.h[i] >= 20) {
      prec += 10 * (1 + ws * 0.5)
    }

    cells.prec[i] = Math.min(255, Math.max(0, Math.round(prec * factor)))
  }
}

// ── 生态群落 ────────────────────────────────────────

/** 指定生态群落 */
export function assignBiomes(cells: GridCells): void {
  for (let i = 0; i < cells.length; i++) {
    const h = cells.h[i]
    const temp = cells.temp[i]
    const prec = cells.prec[i]

    if (h < 20) { cells.biome[i] = 0; continue }
    if (temp < -5) { cells.biome[i] = 11; continue }
    if (temp >= 25 && prec < 20 && cells.r[i] === 0) { cells.biome[i] = 1; continue }

    const moisture = prec + (cells.fl[i] > 0 ? Math.min(cells.fl[i] / 10, 20) : 0)
    if (moisture > 80 && h < 30) { cells.biome[i] = 12; continue }

    const moistureIdx = Math.min(Math.floor(moisture / 25), 4)
    const tempIdx = Math.min(Math.max(Math.floor((25 - temp)), 0), 25)
    cells.biome[i] = BIOME_MATRIX[moistureIdx][tempIdx]
  }
}

/** 计算单元格适宜度评分 */
export function rankCells(cells: GridCells): void {
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < 20) { cells.s[i] = 0; continue }

    const biome = BIOMES[cells.biome[i]]
    let score = biome.habitability

    if (cells.r[i] > 0) score += 15
    if (cells.harbor[i] > 0) score += 10
    if (cells.h[i] > 70) score -= (cells.h[i] - 70) * 2
    if (cells.t[i] > 0 && cells.t[i] <= 3) score += 5

    cells.s[i] = Math.max(0, score)
  }
}
