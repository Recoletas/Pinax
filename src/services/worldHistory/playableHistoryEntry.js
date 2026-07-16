// 可玩历史入口 (playable history entry)
//
// 从 geoHistory 里抽出可玩节点，压成 OpeningPage 后续可直接消费的动作列表。
// 纯函数，不触碰存储/AI/UI。动作形状对齐 playableWorldEntry.js 的
// { id, label, title, detail, command } 约定。

function safeString(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeAction(action = {}) {
  return {
    id: safeString(action.id),
    label: safeString(action.label),
    title: safeString(action.title),
    detail: safeString(action.detail),
    command: safeString(action.command)
  }
}

/**
 * buildPlayableHistoryActions(geoHistory)
 *
 * 输入 generateGeoHistory 的输出，返回按年代/发生顺序排列的可玩入口数组。
 * 每个入口自带节点元信息 + openingHook + 展开好的 actionHooks，OpeningPage 可
 * 直接渲染成「从这段历史进入」的选项，也能进一步交给 savePlayableWorldEntryIntent。
 *
 * @param {object} geoHistory
 * @returns {Array<{
 *   nodeId: string,
 *   title: string,
 *   yearLabel: string,
 *   type: string,
 *   summary: string,
 *   openingHook: string,
 *   entryIds: string[],
 *   mapBinding: object,
 *   actions: Array<{id,label,title,detail,command}>
 * }>}
 */
export function buildPlayableHistoryActions(geoHistory) {
  const nodes = Array.isArray(geoHistory?.nodes) ? geoHistory.nodes : []

  return nodes
    .filter((node) => node && node.playable)
    .map((node) => ({
      nodeId: safeString(node.id),
      title: safeString(node.title),
      yearLabel: safeString(node.yearLabel),
      type: safeString(node.type),
      summary: safeString(node.summary),
      openingHook: safeString(node.openingHook),
      entryIds: Array.isArray(node.entryIds) ? node.entryIds.map(safeString).filter(Boolean) : [],
      mapBinding: {
        siteId: safeString(node.mapBinding?.siteId),
        cellIds: Array.isArray(node.mapBinding?.cellIds) ? [...node.mapBinding.cellIds] : [],
        markerIds: Array.isArray(node.mapBinding?.markerIds) ? [...node.mapBinding.markerIds] : [],
        routeIds: Array.isArray(node.mapBinding?.routeIds) ? [...node.mapBinding.routeIds] : []
      },
      actions: Array.isArray(node.actionHooks) ? node.actionHooks.map(normalizeAction) : []
    }))
}
