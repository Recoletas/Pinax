/**
 * 计算 cells.tectonic 子结构（6 个并行数组）
 * 输入：cells + plateId（已 Voronoi 划分）+ boundaries（已分类）
 * 输出：TectonicData
 *
 * 算法：
 *  1. 标记 boundary cell → boundaryType + boundaryDist=0
 *  2. BFS 扩散 boundaryDist 至所有 cell
 *  3. 标记 subduction（convergent + subductionSide）
 *  4. orogenyAge = (plateId * 13) % 256
 *  5. volcanoArc 留 0（applyVolcanicArc 时填）
 */
import type { GridCells, TectonicData, PlateBoundary } from './types'

export function computeTectonicData(
  cells: GridCells,
  plateId: Int16Array,
  boundaries: PlateBoundary[]
): TectonicData {
  const n = cells.length
  const bd = new Uint8Array(n).fill(255)        // boundaryDist (255=internal)
  const bt = new Uint8Array(n)                  // boundaryType (0=none)
  const sub = new Uint8Array(n)                 // subduction
  const age = new Uint8Array(n)                 // orogenyAge
  const arc = new Uint8Array(n)                 // volcanoArc

  // Step 1: 标记 boundary cell
  for (const b of boundaries) {
    const btVal = b.type === 'convergent' ? 1 : b.type === 'divergent' ? 2 : 3
    for (const id of b.cellIds) {
      if (id >= 0 && id < n) {
        bt[id] = btVal
        bd[id] = 0
      }
    }
  }

  // Step 2: BFS 扩散 boundaryDist
  const queue: number[] = []
  for (let i = 0; i < n; i++) if (bd[i] === 0) queue.push(i)
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    const d = bd[cur]
    if (d >= 254) continue
    const next = d + 1
    const neighbors = cells.c[cur]
    for (let k = 0; k < neighbors.length; k++) {
      const nb = neighbors[k]
      if (bd[nb] > next) {
        bd[nb] = next
        queue.push(nb)
      }
    }
  }

  // Step 3: 标记 subduction
  for (const b of boundaries) {
    if (b.type !== 'convergent' || b.subductionSide === undefined) continue
    const subducting = b.subductionSide
    for (const id of b.cellIds) {
      if (id >= 0 && id < n && plateId[id] === subducting) sub[id] = 1
    }
  }

  // Step 4: orogenyAge（基于 plateId 派生）
  for (let i = 0; i < n; i++) {
    const pid = plateId[i]
    age[i] = (pid * 13) % 256
  }

  // Step 5: volcanoArc 默认 0（applyVolcanicArc 时填）

  return {
    plateId: new Int16Array(plateId),
    boundaryDist: bd,
    boundaryType: bt,
    subduction: sub,
    orogenyAge: age,
    volcanoArc: arc,
  }
}
