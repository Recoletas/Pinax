import type { GridCells } from './types'

const SEA_LEVEL = 20
const LIGHT_X = -0.7
const LIGHT_Y = -0.7

/**
 * 预计算山影方向值。渲染阶段仍按 cell 多边形绘制，只复用这里的坡向/坡度计算。
 *
 * 输出值保留符号：正值为亮面，负值为暗面；0 表示水域或无需山影。
 */
export function computeHillshade(cells: GridCells): Float32Array {
  const shade = new Float32Array(cells.length)

  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < SEA_LEVEL) continue
    const neighbors = cells.c[i]
    if (!neighbors || neighbors.length === 0) continue

    let value = 0
    for (const nb of neighbors) {
      const dx = cells.p[nb * 2] - cells.p[i * 2]
      const dy = cells.p[nb * 2 + 1] - cells.p[i * 2 + 1]
      const len = Math.hypot(dx, dy) || 1
      value += ((cells.h[i] - cells.h[nb]) / len) * ((dx / len) * LIGHT_X + (dy / len) * LIGHT_Y)
    }
    shade[i] = value / Math.max(1, neighbors.length)
  }

  return shade
}

export function hillshadeAlpha(cells: GridCells, cellId: number, shade: number, strength = 1): number {
  return Math.min(
    0.24,
    (Math.abs(shade) * 0.14 + Math.max(0, cells.h[cellId] - 48) * 0.0016) * strength,
  )
}
