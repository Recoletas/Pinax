/**
 * 国家底色 + per-state hashed 噪点 + 边缘淡化
 *
 * 给定一个 state，返回用于渲染该国家领土的 color + pattern alpha
 */
import type { State } from './types'

export interface FactionTextureOptions {
  /** 整体 alpha（0-1） */
  alpha: number
  /** borderland cell 集合（用于边缘淡化） */
  borderland: Set<number>
}

export interface FactionTextureResult {
  color: string
  patternAlpha: number
}

/** 给定 state + cell，返回该 cell 的渲染参数 */
export function getFactionTexture(
  state: State,
  cellId: number,
  options: FactionTextureOptions,
): FactionTextureResult {
  const baseColor = state.color
  // 边缘淡化：borderland cell alpha 减半
  const isBorderland = options.borderland.has(cellId)
  // 噪点：per-state 派生确定性噪点
  const noise = stateNoise(state.i, cellId)
  const patternAlpha = (isBorderland ? options.alpha * 0.5 : options.alpha) * (0.7 + noise * 0.3)
  return { color: baseColor, patternAlpha }
}

/** per-state 噪点（确定性，由 stateId + cellId hash） */
export function stateNoise(stateId: number, cellId: number): number {
  const h = Math.sin(stateId * 12.9898 + cellId * 78.233) * 43758.5453
  return h - Math.floor(h)
}
