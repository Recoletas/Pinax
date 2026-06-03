/**
 * 海岸线扰动：在海陆交界 cell 上叠 fbm 噪声
 *
 * 本文件只导出纯函数；generate.ts 在经典模式之外、tectonics 之后调用。
 */
import type { GridCells } from './types'

const SEA_LEVEL = 20

interface CoastParams {
  /** 噪声频率，默认 0.012 */
  noiseScale: number
  /** 噪声振幅（最大 ±），默认 6 */
  noiseAmplitude: number
}

/** 简单确定性 hash（per-call 时用 cell 坐标） */
function hash2D(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** 分形布朗运动：多层 hash 噪声叠加 */
function fbm(x: number, y: number, octaves: number): number {
  let v = 0
  let amp = 1
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    v += amp * (hash2D(x * freq, y * freq) * 2 - 1)
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return v / max
}

/**
 * 在海陆交界 cell 叠噪声扰动（仅陆地侧 cell 高度被改）
 * - 经典模式不调用（保持 byte-for-byte 兼容）
 * - delta 用 Math.round 避免被 Int8Array 截断
 */
export function perturbCoast(cells: GridCells, params: CoastParams): void {
  const { noiseScale, noiseAmplitude } = params
  const boundaryCells: number[] = []
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < SEA_LEVEL) continue
    for (const nb of cells.c[i]) {
      if (cells.h[nb] < SEA_LEVEL) {
        boundaryCells.push(i)
        break
      }
    }
  }

  for (const id of boundaryCells) {
    const x = cells.p[id * 2]
    const y = cells.p[id * 2 + 1]
    const noise = fbm(x * noiseScale, y * noiseScale, 4)
    const delta = Math.sign(noise) * Math.min(Math.abs(noise) * noiseAmplitude, noiseAmplitude)
    cells.h[id] = Math.max(0, Math.min(100, Math.round(cells.h[id] + delta)))
  }
}
