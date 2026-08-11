/**
 * 地图引擎共享数学工具（audit-pass2-plan Phase C1）。
 *
 * 收敛原先散落在 heightmap / heightmap-templates / heightmap-template-aware /
 * coast / settlements 中的 byte-identical 实现。所有函数行为与原内联版本
 * 完全一致 —— 替换为纯引用，不改变任何数值，避免破坏 map-seed determinism。
 */

import type { GridCells } from './types'

/**
 * 将 v 限制在 [min, max] 区间。
 * 等价于原 heightmap.ts / settlements.ts / heightmap-template-aware.ts 的 clamp，
 * 以及 heightmap-templates.ts 的 clampCoord（参数名不同，语义一致）。
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * 推算画布高度（cells.p 中 y 的最大值），用于把像素 y 归一化为 0..1。
 * 空集时返回 1，避免除零。与原 coast.ts / heightmap-template-aware.ts 实现一致。
 */
export function inferCanvasHeight(cells: GridCells, n: number): number {
  let h = 0
  for (let i = 0; i < n; i++) {
    const y = cells.p[i * 2 + 1]
    if (y > h) h = y
  }
  return h || 1
}
