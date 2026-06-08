/**
 * 海岸线扰动：在海陆交界 cell 上叠 fbm 噪声
 *
 * 支持两级（low 大海湾/半岛 + high 局部碎边）+ 纬度缩放（高纬降噪）。
 *
 * 本文件只导出纯函数；generate.ts 在 generateHeightmap 之后调用。
 */
import type { GridCells } from './types'

const SEA_LEVEL = 20

export interface CoastParams {
  /** 噪声频率，默认 0.012 */
  noiseScale: number
  /** 噪声振幅（最大 ±），默认 6 */
  noiseAmplitude: number
  /** 纬度缩放：0=均匀,1=高纬振幅→0；默认 0（不缩放） */
  latitudeScale?: number
}

export type CoastMode = 'low' | 'high' | 'both'

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
 * 计算 cell 的高纬因子：赤道附近=0，极地=1
 *  |yNorm - 0.5| ≤ 0.3 → 0（赤道/温带无影响）
 *  |yNorm - 0.5| ≥ 0.5 → 1（极地最强）
 *  中间线性插值
 */
function polarFactor(yNorm: number): number {
  const d = Math.abs(yNorm - 0.5) - 0.3
  if (d <= 0) return 0
  return Math.min(1, d / 0.2)
}

/**
 * 收集海陆交界的陆地 cell（一次遍历，O(n)）
 */
function collectBoundaryCells(cells: GridCells, h: Uint8Array, n: number): number[] {
  const boundary: number[] = []
  for (let i = 0; i < n; i++) {
    if (h[i] < SEA_LEVEL) continue
    const nbs = cells.c[i]
    for (let k = 0; k < nbs.length; k++) {
      if (h[nbs[k]] < SEA_LEVEL) {
        boundary.push(i)
        break
      }
    }
  }
  return boundary
}

/**
 * 推算画布高度（cells.p 中 y 最大值）— perturbCoast 内部用，避免
 * 在签名里加 height 参数以保持向后兼容。
 */
function inferCanvasHeight(cells: GridCells, n: number): number {
  let h = 0
  for (let i = 0; i < n; i++) {
    const y = cells.p[i * 2 + 1]
    if (y > h) h = y
  }
  return h || 1
}

/** 内部 worker：执行一层 fbm 扰动，可被 mode='both' 复用 */
function perturbOnce(
  cells: GridCells,
  h: Uint8Array,
  boundary: number[],
  canvasH: number,
  noiseScale: number,
  baseAmplitude: number,
  latitudeScale: number,
): void {
  for (let k = 0; k < boundary.length; k++) {
    const id = boundary[k]
    if (h[id] > SEA_LEVEL + 6) continue
    let waterNeighbors = 0
    for (const nb of cells.c[id]) {
      if (h[nb] < SEA_LEVEL) waterNeighbors++
    }
    if (waterNeighbors < 2) continue
    const x = cells.p[id * 2]
    const y = cells.p[id * 2 + 1]
    const noise = fbm(x * noiseScale, y * noiseScale, 4)
    let amp = baseAmplitude
    if (latitudeScale > 0 && canvasH > 0) {
      const yNorm = y / canvasH
      const pf = polarFactor(yNorm)
      amp *= 1 - pf * latitudeScale
    }
    const delta = Math.sign(noise) * Math.min(Math.abs(noise) * amp, amp)
    h[id] = Math.max(0, Math.min(100, Math.round(h[id] + delta)))
  }
}

/**
 * 在海陆交界 cell 叠噪声扰动（仅陆地侧 cell 高度被改）
 *
 * - mode='low' : scale≈0.008, amplitude≈12 — 大海湾/半岛
 * - mode='high': scale≈0.04,  amplitude≈3  — 局部碎边
 * - mode='both': 先 low 后 high（写回 cells.h）
 *
 * latitudeScale>0 时高纬振幅按 polarFactor 线性衰减。
 * 向后兼容：当 mode 省略时按 'both' 处理（与旧 perturbCoast(cells, params) 行为一致）。
 */
export function perturbCoast(
  cells: GridCells,
  params: CoastParams,
  mode: CoastMode = 'both',
): void {
  const n = cells.length
  const { noiseScale, noiseAmplitude } = params
  const latitudeScale = params.latitudeScale ?? 0

  // 推算画布高度（一次性 O(n)）
  const canvasH = inferCanvasHeight(cells, n)

  if (mode === 'both') {
    // 第一层：低频大体形变（boundary 用原 h 找）
    const boundaryLow = collectBoundaryCells(cells, cells.h, n)
    perturbOnce(
      cells, cells.h, boundaryLow, canvasH,
      noiseScale * 0.67, noiseAmplitude * 2, latitudeScale,
    )
    // 第二层：高频碎边（用更新后的 h 重新找 boundary，含新生成的半岛/海湾边缘）
    const boundaryHigh = collectBoundaryCells(cells, cells.h, n)
    perturbOnce(
      cells, cells.h, boundaryHigh, canvasH,
      noiseScale * 3.3, noiseAmplitude * 0.5, latitudeScale,
    )
  } else if (mode === 'low') {
    const boundary = collectBoundaryCells(cells, cells.h, n)
    perturbOnce(cells, cells.h, boundary, canvasH, noiseScale, noiseAmplitude, latitudeScale)
  } else {
    // 'high'
    const boundary = collectBoundaryCells(cells, cells.h, n)
    perturbOnce(cells, cells.h, boundary, canvasH, noiseScale, noiseAmplitude, latitudeScale)
  }
}

// Round 2 修复:旧的 `reshapeCoasts` 只能对陆地 cell ±1 高度,无法改
// coastline 形状(陆地 cell 抬高不会扩张,降低也只有刚好在 20 附近
// 才会变水)。宏观海岸重塑已合并进 `heightmap-template-aware.ts` 的
// `macroReshape`(B-2 阶段),能真正翻转水/陆过渡带 cell。
