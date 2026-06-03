/**
 * 国界 buffer：邻国 cell 各向内退 N 个 cell 的集合
 * 用于在国界两侧画半透明沙色（renderer 的 drawBorderlands 用）
 *
 * 算法：
 *  1. 收集所有国界边 cell（至少一个邻居 state 不同）
 *  2. BFS 沿同国扩展 width 层
 */
import type { GridCells } from './types'

interface BorderlandParams {
  /** buffer 宽度（0-3，0 = 空集） */
  width: number
}

/** 计算 borderland cell 集合（renderer 用作 stencil） */
export function computeBorderlands(
  cells: GridCells,
  params: BorderlandParams,
): Set<number> {
  const { width } = params
  if (width <= 0) return new Set()

  // Step 1: 找所有国界边（A.state != B.state）
  const borderCells = new Set<number>()
  for (let i = 0; i < cells.length; i++) {
    if (cells.state[i] === 0) continue
    for (const nb of cells.c[i]) {
      if (cells.state[nb] !== 0 && cells.state[nb] !== cells.state[i]) {
        borderCells.add(i)
        borderCells.add(nb)
        break
      }
    }
  }

  // Step 2: BFS 扩展 width 层（每个 cell 只沿同国扩展）
  const result = new Set(borderCells)
  let frontier = [...borderCells]
  for (let layer = 0; layer < width; layer++) {
    const next: number[] = []
    for (const cur of frontier) {
      const myState = cells.state[cur]
      for (const nb of cells.c[cur]) {
        if (cells.state[nb] !== myState) continue
        if (!result.has(nb)) {
          result.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  return result
}
