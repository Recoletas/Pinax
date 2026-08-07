import type { Burg, GridCells, MapConstraintReport, MapConstraints, River, Road, State } from './types'

type LocationConstraint = NonNullable<MapConstraints['locations']>[number]

const SEA_LEVEL = 20

function normalize(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase('zh-Hans-CN').replace(/[\s·・_-]+/g, '')
}

function aliasesOf(location: { name?: string; aliases?: string[] }): string[] {
  return [location.name, ...(location.aliases || [])].map(normalize).filter(Boolean)
}

function nameMatches(value: unknown, location: { name?: string; aliases?: string[] }): boolean {
  const candidate = normalize(value)
  return Boolean(candidate && aliasesOf(location).includes(candidate))
}

function cellMatches(cells: GridCells, cell: number, hard: string[] = []): boolean {
  if (cell < 0 || cell >= cells.length) return false
  const requirements = hard.map(normalize)
  if (requirements.includes('water') && cells.h[cell] >= SEA_LEVEL) return false
  if (requirements.includes('land') && cells.h[cell] < SEA_LEVEL) return false
  if (requirements.includes('coast') && !(cells.harbor?.[cell] > 0)) return false
  if (requirements.includes('river') && !(cells.r?.[cell] > 0)) return false
  return true
}

function distanceSquared(cells: GridCells, cell: number, x: number, y: number): number {
  const dx = cells.p[cell * 2] - x
  const dy = cells.p[cell * 2 + 1] - y
  return dx * dx + dy * dy
}

function findTargetCell(cells: GridCells, location: LocationConstraint, occupied: Set<number>): number {
  const x = Number(location.x)
  const y = Number(location.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1
  const hard = Array.isArray(location.hard) ? location.hard : []
  let best = -1
  let bestDistance = Infinity
  for (let cell = 0; cell < cells.length; cell += 1) {
    if (occupied.has(cell) || !cellMatches(cells, cell, hard)) continue
    const distance = distanceSquared(cells, cell, x, y)
    if (distance < bestDistance) {
      best = cell
      bestDistance = distance
    }
  }
  return best
}

function setBurgCell(cells: GridCells, burg: Burg, cell: number): void {
  if (burg.cell >= 0 && burg.cell < cells.length && cells.burg[burg.cell] === burg.i) {
    cells.burg[burg.cell] = 0
  }
  burg.cell = cell
  burg.x = cells.p[cell * 2]
  burg.y = cells.p[cell * 2 + 1]
  burg.port = cells.harbor?.[cell] > 0
  cells.burg[cell] = burg.i
}

function pushReport(
  report: MapConstraintReport,
  bucket: 'satisfied' | 'relaxed' | 'impossible',
  location: { id?: string; name: string; kind?: string },
  reason: string,
  cellId?: number,
): void {
  report[bucket].push({ ...location, reason, ...(cellId !== undefined ? { cellId } : {}) })
}

/**
 * 将已确认的世界书地点约束落到生成后的城市/地点单元格上。
 * 不强行重塑地形：如果硬约束与当前地图冲突，就进入 impossible 报告。
 */
export function applyLocationConstraints(
  cells: GridCells,
  burgs: Burg[],
  constraints: MapConstraints | undefined,
  report: MapConstraintReport,
): void {
  const locations = Array.isArray(constraints?.locations) ? constraints.locations : []
  const occupied = new Set(burgs.filter((burg) => burg.i > 0).map((burg) => burg.cell))

  for (const location of locations) {
    const identity = { id: location.id, name: location.name, kind: location.kind }
    if (!location.id || !location.name || !Number.isFinite(Number(location.x)) || !Number.isFinite(Number(location.y))) {
      pushReport(report, 'impossible', identity, '地点绑定缺少有效坐标')
      continue
    }
    if (Array.isArray(location.hard) && location.hard.map(normalize).includes('water')) {
      // Burgs are land settlements in the current engine. Keeping a confirmed
      // water location as impossible is safer than silently placing a city in
      // a lake or sea and making the map contradict the worldbook.
      pushReport(report, 'impossible', identity, '当前引擎不创建水上聚落，保留为待支持的水域地点')
      continue
    }
    const existing = burgs.find((burg) => burg.i > 0 && nameMatches(burg.name, location))
    if (existing) occupied.delete(existing.cell)
    const target = findTargetCell(cells, location, occupied)
    if (target < 0) {
      if (existing) occupied.add(existing.cell)
      pushReport(report, 'impossible', identity, '当前地图没有满足硬约束的可用陆地单元格')
      continue
    }

    if (existing) {
      setBurgCell(cells, existing, target)
      occupied.add(target)
      pushReport(report, 'satisfied', identity, '已将同名聚落移动到确认绑定位置', target)
      continue
    }

    const burg: Burg = {
      i: burgs.length,
      name: location.name,
      cell: target,
      x: cells.p[target * 2],
      y: cells.p[target * 2 + 1],
      state: 0,
      capital: false,
      port: cells.harbor?.[target] > 0,
      population: Math.max(1, Math.round(cells.s[target] || 1)),
    }
    burgs.push(burg)
    cells.burg[target] = burg.i
    occupied.add(target)
    pushReport(report, 'satisfied', identity, '已按世界书地点绑定创建地图聚落', target)
  }
}

export function evaluateRiverConstraints(
  rivers: River[],
  constraints: MapConstraints | undefined,
  report: MapConstraintReport,
): void {
  for (const river of constraints?.rivers || []) {
    const matched = rivers.find((candidate) => nameMatches(candidate.name, river))
    if (matched) {
      pushReport(report, 'satisfied', { name: river.name, kind: 'river' }, '已找到同名河流', matched.source)
    } else {
      pushReport(report, 'relaxed', { name: river.name, kind: 'river' }, '当前生成结果没有同名河流，保留为待重生成约束')
    }
  }
}

function findBurg(burgs: Burg[], reference: { id?: string; name?: string; aliases?: string[] }): Burg | undefined {
  return burgs.find((burg) => burg.i > 0 && nameMatches(burg.name, reference))
}

function findState(states: State[], name: string): State | undefined {
  const target = normalize(name)
  return states.find((state) => state.i > 0 && normalize(state.name) === target)
}

function mapDiagonal(cells: GridCells): number {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let cell = 0; cell < cells.length; cell += 1) {
    const x = cells.p[cell * 2]
    const y = cells.p[cell * 2 + 1]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return Math.hypot(maxX - minX, maxY - minY) || 1
}

function relationIdentity(location: LocationConstraint, target: string, kind: string) {
  return { id: location.id, name: `${location.name} → ${target}`, kind }
}

/**
 * 核验已确认地点之间的有限拓扑关系。确认坐标属于作者数据，本阶段不会
 * 为了迁就随机国界而暗中改写它；冲突会明确进入 relaxed/impossible 报告。
 */
export function evaluateLocationTopologyConstraints(
  cells: GridCells,
  burgs: Burg[],
  states: State[],
  rivers: River[],
  constraints: MapConstraints | undefined,
  report: MapConstraintReport,
): void {
  const locations = constraints?.locations || []
  const anchors = constraints?.anchors || []
  const diagonal = mapDiagonal(cells)

  for (const location of locations) {
    const owner = findBurg(burgs, location)
    for (const reference of location.relationRefs || []) {
      if (!reference.relation) continue
      const identity = relationIdentity(location, reference.name, reference.relation)
      if (!owner) {
        pushReport(report, 'impossible', identity, '关系起点没有对应的地图地点')
        continue
      }

      if (reference.relation === 'state') {
        const targetState = findState(states, reference.name)
        if (!targetState) pushReport(report, 'relaxed', identity, '地图中没有同名国家，保留世界书归属关系')
        else if (owner.state === targetState.i) pushReport(report, 'satisfied', identity, '地点位于指定国家', owner.cell)
        else pushReport(report, 'relaxed', identity, `随机国界与世界书不一致；当前落在「${states[owner.state]?.name || '无归属'}」`, owner.cell)
        continue
      }

      const targetLocation = locations.find((candidate) => (
        (reference.id && candidate.id === reference.id) || nameMatches(reference.name, candidate)
      ))
      const targetAnchor = anchors.find((candidate) => (
        (reference.id && candidate.id === reference.id) || nameMatches(reference.name, candidate)
      ))
      const target = targetLocation ? findBurg(burgs, targetLocation) : undefined

      if (reference.relation === 'river') {
        const namedRiver = rivers.find((river) => normalize(river.name) === normalize(reference.name))
        const touchesRiver = Boolean(cells.r?.[owner.cell] > 0)
        if (namedRiver && (namedRiver.cells.includes(owner.cell) || touchesRiver)) {
          pushReport(report, 'satisfied', identity, '地点与指定河流发生空间接触', owner.cell)
        } else {
          pushReport(report, 'relaxed', identity, namedRiver ? '指定河流存在，但当前河道未经过该地点' : '地图中没有同名河流')
        }
        continue
      }

      if (reference.relation === 'route') continue
      if (!target && !targetAnchor) {
        pushReport(report, 'impossible', identity, '关系目标尚未确认地图绑定')
        continue
      }

      if (reference.relation === 'same-state' || reference.relation === 'different-state') {
        if (!target) {
          pushReport(report, 'impossible', identity, '国家关系需要两个可定位地点')
          continue
        }
        const same = owner.state > 0 && owner.state === target.state
        const expected = reference.relation === 'same-state' ? same : !same
        pushReport(
          report,
          expected ? 'satisfied' : 'relaxed',
          identity,
          expected ? '生成国界满足世界书关系' : '生成国界与世界书关系不一致',
          owner.cell,
        )
        continue
      }

      const targetX = target?.x ?? targetAnchor?.x
      const targetY = target?.y ?? targetAnchor?.y
      const distance = Math.hypot(owner.x - Number(targetX), owner.y - Number(targetY))
      const limit = diagonal * (reference.relation === 'adjacent' ? 0.16 : 0.28)
      const closeEnough = distance <= limit
      const sameState = !target || owner.state === 0 || target.state === 0 || owner.state === target.state
      const satisfied = closeEnough && (reference.relation !== 'parent' || sameState)
      pushReport(
        report,
        satisfied ? 'satisfied' : 'relaxed',
        identity,
        satisfied
          ? (reference.relation === 'parent' ? '地点位于归属区域附近' : '地点间距满足相邻关系')
          : (reference.relation === 'parent' && !sameState ? '归属地点被随机国界分隔' : '地点间距超过关系建议范围'),
        owner.cell,
      )
    }
  }
}

export function evaluateRouteConstraints(
  roads: Road[],
  constraints: MapConstraints | undefined,
  report: MapConstraintReport,
): void {
  for (const route of constraints?.routes || []) {
    const routeName = normalize(route.name)
    const from = normalize(route.from)
    const to = normalize(route.to)
    const matched = roads.find((road) => {
      const name = normalize(road.name)
      return name === routeName || (from && to && name.includes(from) && name.includes(to))
    })
    if (matched) {
      pushReport(report, 'satisfied', { name: route.name, kind: 'route' }, '已找到匹配道路', matched.i)
    } else {
      pushReport(report, 'relaxed', { name: route.name, kind: 'route' }, '当前生成结果没有匹配道路，保留为待重生成约束')
    }
  }
}
