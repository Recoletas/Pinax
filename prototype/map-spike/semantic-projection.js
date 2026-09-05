/**
 * P1.5 重做：写作语义投影 —— 把作者语义确定性绑定到真实生成结果。
 *
 * 输入是真实引擎生成的 VoronoiMapData + 其 MapDocument v2 投影；
 * 输出只是"哪些真实 feature 承载当前场/章节引用/状态"，不提供任何
 * 大陆、海岸、河流、区域面几何（几何全部来自生成管线）。
 * 室内地点没有真实坐标：只输出详情面包屑，不伪造第二个锚点。
 */

/**
 * @param {{
 *   document: object,   // MapDocument v2（真实生成投影）
 *   legacy: object,     // VoronoiMapData
 * }} input
 * @returns {{
 *   stateLabels: Array<{ id, stateId, text, anchor:[number,number], areaRank }>,
 *   sceneAnchorId: string,           // 当前场锚点（真实聚落 settlement:<i>）
 *   chapterRefIds: string[],         // 2-4 个章节相关真实聚落
 *   hiddenStatusIds: Array<{ id, status }>,  // candidate/stale/conflict：世界档完全隐藏
 *   breadcrumbs: Array<{ anchorId: string, chain: string[] }>,
 * }}
 */
export function buildSemanticProjection({ document, legacy }) {
  // ── 真实数据排序（全部确定性，无随机）──
  const burgs = (legacy.burgs || []).filter((b) => b.i > 0 && Number.isFinite(b.x))
  const burgById = new Map(burgs.map((b) => [b.i, b]))
  const states = [...(legacy.states || [])].filter((s) => s && s.name).sort((a, b) => b.cells - a.cells)

  // 区域名（世界档 2-4 个）：按面积取前 3，锚点 = 成员 cell 质心
  const cellState = legacy.cells.state
  const cellP = legacy.cells.p
  const cellH = legacy.cells.h
  const stateLabels = []
  for (const [rank, s] of states.slice(0, 3).entries()) {
    // 锚点 = 该国离海岸最深的陆地 cell（cells.t 为正=内陆深度），
    // 保证国名一定落在陆地上，群岛国家也不会漂到海面
    let bestI = -1
    let bestT = -1
    for (let i = 0; i < cellState.length; i++) {
      if (cellState[i] !== s.i) continue
      const h = cellH[i]
      const t = legacy.cells.t ? legacy.cells.t[i] : 0
      if (h >= 20 && t > bestT) {
        bestT = t
        bestI = i
      }
    }
    if (bestI < 0) continue
    // 多候选锚点：主锚 = 离海岸最深 cell；备选 = 深内陆 cell 质心、全陆质心。
    // 国名避让优先移动国名（试备选锚点），绝不移动真实城市锚点。
    const deep = []
    let maxT = bestT
    for (let i = 0; i < cellState.length; i++) {
      if (cellState[i] === s.i && cellH[i] >= 20 && legacy.cells.t[i] >= maxT * 0.7) {
        deep.push([cellP[i * 2], cellP[i * 2 + 1]])
      }
    }
    const deepCentroid = deep.length
      ? [deep.reduce((a, c) => a + c[0], 0) / deep.length, deep.reduce((a, c) => a + c[1], 0) / deep.length]
      : null
    const anchors = [[cellP[bestI * 2], cellP[bestI * 2 + 1]]]
    if (deepCentroid && Math.hypot(deepCentroid[0] - anchors[0][0], deepCentroid[1] - anchors[0][1]) > 30) {
      anchors.push(deepCentroid)
    }
    // 全陆质心（与最深点距离足够远时作为备选）
    let allLand = deep
    if (allLand.length) {
      const c = [allLand.reduce((a, c) => a + c[0], 0) / allLand.length, allLand.reduce((a, c) => a + c[1], 0) / allLand.length]
      if (anchors.every((a) => Math.hypot(c[0] - a[0], c[1] - a[1]) > 30)) anchors.push(c)
    }
    stateLabels.push({
      id: `state:${s.i}`,
      stateId: s.i,
      text: s.name,
      anchor: anchors[0],
      alternativeAnchors: anchors.slice(1),
      areaRank: rank,
    })
  }

  // 当前场锚点：最大国家的首都（真实聚落）
  const topState = states[0]
  const sceneBurg = topState ? burgById.get(topState.capital) : null
  const sceneAnchorId = sceneBurg ? `settlement:${sceneBurg.i}` : (burgs[0] ? `settlement:${burgs[0].i}` : null)

  // 章节引用（2-4 个）：另两个大国的首都 + 本国最大非首都城市
  const chapterRefIds = []
  for (const s of states.slice(1, 3)) {
    const cap = burgById.get(s.capital)
    if (cap) chapterRefIds.push(`settlement:${cap.i}`)
  }
  const topStateBurgs = topState
    ? burgs.filter((b) => b.state === topState.i && b.i !== topState.capital).sort((a, b) => b.population - a.population)
    : []
  if (topStateBurgs[0]) chapterRefIds.push(`settlement:${topStateBurgs[0].i}`)

  // candidate/stale/conflict：按人口取与上述不重叠的三个真实聚落，世界档完全隐藏
  const used = new Set([sceneAnchorId, ...chapterRefIds])
  const byPop = burgs
    .filter((b) => !used.has(`settlement:${b.i}`))
    .sort((a, b) => b.population - a.population)
  const hiddenStatusIds = [
    { id: `settlement:${byPop[0]?.i}`, status: 'candidate' },
    { id: `settlement:${byPop[1]?.i}`, status: 'stale' },
    { id: `settlement:${byPop[2]?.i}`, status: 'conflict' },
  ].filter((x) => !x.id.endsWith('null') && x.id !== 'settlement:undefined')

  // 室内地点：只产出面包屑（挂当前场锚点），无坐标
  const sceneName = sceneBurg?.name ?? ''
  const breadcrumbs = sceneAnchorId
    ? [{ anchorId: sceneAnchorId, chain: [topState?.name, sceneName, '藏剑庐'].filter(Boolean) }]
    : []

  return {
    stateLabels,
    sceneAnchorId,
    chapterRefIds,
    hiddenStatusIds,
    breadcrumbs,
  }
}
