/**
 * 纯函数的标注布局(碰撞 + 优先级)。
 * 与 Canvas 解耦：renderer 用 ctx.measureText 算出每个候选位置的 AABB，
 * 这里只做"按优先级贪心放置、AABB 冲突跳过、force 项强制放"。
 */

export interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface LabelSlot {
  /** 用于碰撞检测的(已含 padding 的)AABB */
  rect: Rect
  /** 实际绘制锚点(textAlign/textBaseline 对应的画布坐标) */
  x: number
  y: number
}

export interface LabelItem<K> {
  key: K
  /** 越大越先放置;放完后其 AABB 会占据空间,挤掉后低优先级的 */
  priority: number
  /** 为 true 时,即使全部候选都冲突也强制放在 candidates[0](首都/作者地点用) */
  force?: boolean
  /** 按偏好升序排好的候选(最佳在前) */
  candidates: LabelSlot[]
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

export function overlapsAny(a: Rect, list: Rect[]): boolean {
  for (const b of list) {
    if (overlaps(a, b)) return true
  }
  return false
}

export function padRect(r: Rect, pad: number): Rect {
  return { minX: r.minX - pad, minY: r.minY - pad, maxX: r.maxX + pad, maxY: r.maxY + pad }
}

/**
 * 按优先级降序贪心放置;每个 item 取第一个不与已占空间冲突的候选;
 * force 项冲突时强制放第一个候选;非 force 项冲突则跳过。
 * occupied 是预先占用的空间(如国名),会被所有后续 item 避让。
 */
export function placeLabels<K>(items: LabelItem<K>[], occupied: Rect[] = []): Map<K, LabelSlot> {
  const sorted = [...items].sort((a, b) => b.priority - a.priority)
  const occ = occupied.length ? [...occupied] : []
  const placed = new Map<K, LabelSlot>()
  for (const item of sorted) {
    if (!item.candidates.length) continue
    let choice: LabelSlot | null = null
    for (const slot of item.candidates) {
      if (!overlapsAny(slot.rect, occ)) {
        choice = slot
        break
      }
    }
    if (!choice && item.force) choice = item.candidates[0]
    if (!choice) continue
    placed.set(item.key, choice)
    occ.push(choice.rect)
  }
  return placed
}
