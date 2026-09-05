/**
 * P1.5 重做：屏幕空间标签规划器（唯一碰撞权威）。
 *
 * 与旧版的本质区别：
 * - 输入是已投影到屏幕的候选（anchor 像素坐标 + 文本/图标尺寸），
 *   规划器做真实矩形碰撞，而不是"按预算取前 N 个"；
 * - 地理名与写作上下文名进入同一碰撞空间；
 * - 同一父子链在同一 zoom tier 只允许一个文字标签（层级折叠）；
 * - 图标与文字分别规划：文字被淘汰时图标保留（icon-only 降级）；
 * - 排序稳定（priority desc + 稳定 tie-break），配合 tier 双阈值迟滞不闪烁。
 *
 * 纯函数：不依赖 OL 对象。调用方负责投影与文字测量（注入 measureText）。
 */

// zoom tier 由调用方的迟滞状态机给出（resolveTier），规划器只消费 tier。

const TIER_TEXT_RULES = {
  // world：只有 state/区域名、首都、主城、上下文锚点允许文字；普通聚落 icon-only
  world: { textKinds: new Set(['state', 'capital', 'city', 'context', 'scene-merged']) },
  region: { textKinds: new Set(['state', 'capital', 'city', 'town', 'context', 'scene-merged', 'ordinary']) },
  local: { textKinds: new Set(['state', 'capital', 'city', 'town', 'village', 'ordinary', 'context', 'scene-merged']) },
}

/**
 * @param {Array<{
 *   id: string,
 *   kind: 'state'|'capital'|'city'|'town'|'village'|'ordinary'|'context',
 *   text: string,
 *   anchor: [number, number],          // 屏幕像素
 *   iconRadius: number,                // 0 表示无图标（纯文字，如 state 名）
 *   priority: number,
 *   chainId: string|null,              // 父子链 id；同链同 tier 只保留一个文字
 *   chainRank: number,                 // 链内地位（越大越接近链顶）
 *   zoomRange: [number, number],       // 允许文字的分辨率闭区间
 *   isSceneAnchor?: boolean,
 * }>} candidates
 * @param {{ tier: 'world'|'region'|'local', measureText: (text, font)=>{width:number}, fontFor?: (c)=>string, padding?: number }} ctx
 * @returns {{
 *   placed: Array<candidate & { rect: [x,y,w,h], labelRect: [x,y,w,h] }>,
 *   iconOnly: Array<candidate>,
 *   collisionRejected: Array<candidate>,
 *   zoomRejected: Array<candidate>,
 *   hierarchyFolded: Array<candidate>,
 *   sceneOwner: candidate|null,
 * }}
 */
export function planLabels(candidates, ctx) {
  const { tier, measureText } = ctx
  const rules = TIER_TEXT_RULES[tier]
  const padding = ctx.padding ?? 2

  const placed = []
  const iconOnly = []
  const collisionRejected = []
  const zoomRejected = []
  const hierarchyFolded = []
  const occupied = [] // 文字矩形 + 图标矩形共用同一碰撞空间
  const chainsWithText = new Map()

  // 稳定排序：priority 降序，再按 id 升序（同输入必同序，缩放不闪烁）
  const sorted = [...candidates].sort((a, b) =>
    b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  let sceneOwner = null

  for (const c of sorted) {
    // 1) zoom 范围：分辨率超出允许区间 → 文字淘汰（图标是否保留由调用方语义决定，这里记 iconOnly）
    const res = ctx.resolution ?? 0
    const inZoom = !c.zoomRange || (res >= c.zoomRange[0] && res <= c.zoomRange[1])
    // 文字资格 = 地理等级(kind)达标,或写作覆盖状态本身携带文字权
    // (chapter-reference/scene);两者正交,base 无覆盖时不受影响
    const overlayText = c.overlayState === 'chapter-reference' || c.overlayState === 'scene'
    const allowsText = (rules.textKinds.has(c.kind) || overlayText) && inZoom
    if (!allowsText) {
      if (!inZoom) zoomRejected.push(c)
      iconOnly.push(c)
      continue
    }

    // 2) 层级折叠：同链已有文字 → 本节点 icon-only
    if (c.chainId) {
      const existing = chainsWithText.get(c.chainId)
      if (existing !== undefined && existing !== c.id) {
        // 链内允许更高 chainRank 顶替：仅当未放置前一名（同批排序后先到先得）
        hierarchyFolded.push(c)
        iconOnly.push(c)
        continue
      }
    }

    // 3) 量矩形：备选锚点依次尝试（国名避让优先移动国名，不移动城市）
    const font = (ctx.fontFor ? ctx.fontFor(c) : '12px sans-serif')
    const measured = c.text ? measureText(c.text, font) : { width: 0 }
    const textW = Math.ceil((measured.width ?? 0)) + padding * 2
    const textH = 16 + padding
    const anchorOptions = [c.anchor, ...(c.alternativeAnchors ?? [])]
    let placement = null
    for (const anchor of anchorOptions) {
      const lx = anchor[0] - textW / 2
      const ly = c.iconRadius > 0
        ? anchor[1] - c.iconRadius - 6 - textH
        : anchor[1] - textH / 2
      const labelRect = [lx, ly, textW, textH]
      const iconRect = c.iconRadius > 0
        ? [anchor[0] - c.iconRadius - 2, anchor[1] - c.iconRadius - 2, (c.iconRadius + 2) * 2, (c.iconRadius + 2) * 2]
        : null
      // 碰撞检测带 per-candidate 边距（如国名与首都须留明确空隙），不改变存储矩形
      const pad = c.collisionPadding ?? 0
      const collides = (r) => occupied.some((o) => intersects(inflate(r, pad), o))
      if (collides(labelRect) || (iconRect && collides(iconRect))) continue
      placement = { anchor, labelRect, iconRect }
      break
    }
    if (!placement) {
      collisionRejected.push(c)
      iconOnly.push(c)
      continue
    }

    // 4) 放置
    occupied.push(placement.labelRect)
    if (placement.iconRect) occupied.push(placement.iconRect)
    if (c.chainId && !chainsWithText.has(c.chainId)) chainsWithText.set(c.chainId, c.id)
    placed.push({
      ...c,
      anchor: placement.anchor,
      rect: placement.iconRect ?? placement.labelRect,
      labelRect: placement.labelRect,
    })
    if (c.isSceneAnchor) sceneOwner = c
  }

  return { placed, iconOnly, collisionRejected, zoomRejected, hierarchyFolded, sceneOwner }
}

function inflate(r, pad) {
  return pad ? [r[0] - pad, r[1] - pad, r[2] + pad * 2, r[3] + pad * 2] : r
}

function intersects(a, b) {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]
}

/** 矩形相交面积 / 较小矩形面积（Gate 用）。 */
export function overlapRatio(a, b) {
  if (!intersects(a, b)) return 0
  const ix = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])
  const iy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])
  const inter = ix * iy
  const smaller = Math.min(a[2] * a[3], b[2] * b[3])
  return smaller > 0 ? inter / smaller : 0
}
