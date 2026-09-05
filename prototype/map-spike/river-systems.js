/**
 * P1.6A：世界档河流系统选择（纯函数）。
 *
 * 不是"最长 6-12 条线段"：按河网汇流关系把河流归并为入海系统
 * （干流 = 无父河流的河口主干；支流汇入干流），按系统总流量
 * （成员长度之和）取前 N 个系统。世界档只绘各系统干流，
 * 支流留给 region/local（P1.6B）。
 */

/**
 * @param {Array<{i:number, parent?:number, cells:number[], points:[number,number][]}>} rivers
 * @param {{ minSystems?: number, maxSystems?: number }} [opts]
 * @returns {{
 *   trunks: Array<{ id:number, points:[number,number][], systemLength:number, memberCount:number, width:number }>,
 *   systemCount: number,
 * }}
 */
export function selectRiverSystems(rivers, opts = {}) {
  const minSystems = opts.minSystems ?? 6
  const maxSystems = opts.maxSystems ?? 12
  const byId = new globalThis.Map(rivers.map((r) => [r.i, r]))
  const lengthOf = (r) => r.length ?? r.cells?.length ?? r.points?.length ?? 1

  // 汇流树：parent 指向汇入的河流；根 = 无父/父不存在（出海口干流）
  const rootOf = (r) => {
    let cur = r
    const seen = new Set([r.i])
    while (cur.parent && byId.has(cur.parent) && !seen.has(cur.parent)) {
      seen.add(cur.parent)
      cur = byId.get(cur.parent)
    }
    return cur
  }

  const systems = new globalThis.Map()
  for (const r of rivers) {
    const root = rootOf(r)
    if (!systems.has(root.i)) systems.set(root.i, { root, total: 0, members: 0 })
    const sys = systems.get(root.i)
    sys.total += lengthOf(r)
    sys.members++
  }

  const ranked = [...systems.values()].sort((a, b) => b.total - a.total)
  // 数量目标 6-12：流量达标（≥ 最大系统流量的 12%）的系统才入选
  const cutoff = ranked.length ? ranked[0].total * 0.12 : 0
  const chosen = ranked.filter((sys) => sys.total >= cutoff).slice(0, maxSystems)
  while (chosen.length < Math.min(minSystems, ranked.length)) {
    const next = ranked[chosen.length]
    if (!next) break
    chosen.push(next)
  }

  // 局部密度配额（屏幕空间近似，用数据坐标网格）：同一局部区域最多 2 个系统的
  // 干流中点，避免多条干流挤成一团；世界档允许少画，不为凑满而画满。
  const GRID = 300
  const quota = new globalThis.Map()
  const kept = []
  for (const sys of chosen) {
    const pts = sys.root.points ?? []
    if (!pts.length) continue
    const mid = pts[Math.floor(pts.length / 2)]
    const key = `${Math.floor(mid[0] / GRID)}:${Math.floor(mid[1] / GRID)}`
    const count = quota.get(key) ?? 0
    if (count >= 2) continue
    quota.set(key, count + 1)
    kept.push(sys)
  }

  const maxLength = kept.length ? Math.max(...kept.map((k) => k.total)) : 1
  return {
    systemCount: systems.size,
    trunks: kept.map((sys) => ({
      id: sys.root.i,
      points: sys.root.points ?? [],
      systemLength: sys.total,
      memberCount: sys.members,
      // 干流宽度随系统规模，整体收细（1.1-2.1px）
      width: 1.1 + Math.min(1.0, (sys.total / maxLength) * 1.0),
      midPoint: (sys.root.points ?? [])[Math.floor((sys.root.points ?? []).length / 2)] ?? null,
    })),
  }
}
