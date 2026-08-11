/**
 * Worldbook → Voronoi 地图配置桥接(Layer 0:薄数据搬运)
 *
 * 设计原则:
 * - 纯规则,无 LLM 调用,0 推理成本
 * - 绕过 matchWorldbookEntries(后者依赖 chatHistory 关键词匹配,首生成时 scanText 为空)
 * - 按 ENTRY_TYPE_PRIORITY 截断,不被选择性激活条件影响
 * - 命名风格检测 / 内容摘要 / cellId 推断一律不做(LLM 在 prompt L179 已处理)
 */

import { ENTRY_TYPE_ALIASES, ENTRY_TYPE_PRIORITY } from '../worldbookContextBuilder'
import { isPlaceOverviewEntry } from '../../../shared/placeEntryContract.js'
import { BIOMES } from '../world-map/engine/climate'

const LORE_CONTEXT_TOP_N = 5
const CONTENT_PREVIEW_CHARS = 50
const NAME_POOL_LIMIT = 80
const LOCATION_SEED_LIMIT = 80
const CONSTRAINT_LIMIT = 12

const TYPE_TO_NAME_POOL = {
  organization: 'stateNames',
}

const STATE_HINT_RE = /国家|王国|帝国|公国|联盟|部落|氏族|宗门|门派|教团|商会|军团|组织|势力|kingdom|empire|duchy|clan|tribe|guild|order|faction|organization/i
const LOCATION_HINT_RE = /城|镇|村|港|关|寨|都|京|郡|县|岛|要塞|堡|学院|基地|前哨|营地|遗迹|废墟|city|town|village|port|fort|fortress|academy|base|outpost|ruin/i
const RIVER_HINT_RE = /河|江|溪|川|水|瀑|湖|river|stream|brook|falls|waterfall|lake/i
const MOUNTAIN_HINT_RE = /山|岭|峰|脊|崖|谷|火山|山脉|mountain|range|peak|ridge|volcano|valley|cliff/i
const VOLCANO_HINT_RE = /火山|volcano/i
const RIDGE_HINT_RE = /脊|洋中脊|ridge/i
const LOCATION_TYPE_RE = /location|place|landmark|city|town|village|port|fortress|ruin/i
const GENERIC_LOCATION_ENTRY_RE = /^(地理环境|地理概述|地理总述|地理|地形与区域|geography|geography overview)$/i
// Zero-width lookahead keeps overlapping candidates. This matters for prose
// such as “除了教廷城、学城……还有许多大小城镇”: a consuming regexp would
// swallow the first real name with the surrounding sentence and never revisit
// the inner “除了” boundary.
const PORT_MARKER_RE = /港|码头|海湾|渡口|port|harbor|harbour|dock/i
const FORTRESS_MARKER_RE = /要塞|城堡|关隘|关口|寨|堡|前哨|fort|castle|stronghold|outpost/i
const RUIN_MARKER_RE = /遗迹|废墟|旧址|残垣|ruin|wreck/i
const ACADEMY_MARKER_RE = /学院|学宫|研究所|academy|school|institute/i
const SECT_MARKER_RE = /宗门|门派|教团|神殿|寺|道观|sect|order|temple|shrine/i
const REGION_HINT_RE = /大陆|地区|区域|盆地|平原|荒原|森林|沙漠|群岛|半岛|region|basin|plain|frontier|forest|desert|archipelago|peninsula/i
const CAPITAL_HINT_RE = /首都|王都|皇都|京城|都城|capital/i
const VILLAGE_HINT_RE = /村|村庄|村落|屯|village|hamlet/i
const TOWN_HINT_RE = /镇|集镇|town/i
const CITY_HINT_RE = /城|都市|city/i
const COAST_HINT_RE = /沿海|海岸|海湾|港口|码头|渡口|port|harbou?r|coast|dock/i
const FOREST_HINT_RE = /森林|林地|树海|林间|forest|woodland/i
const DESERT_HINT_RE = /沙漠|荒漠|沙海|desert|badland/i
const REMOTE_SITE_HINT_RE = /遗迹|废墟|地下城|地牢|洞穴|矿山|矿洞|孤岛|秘境|ruin|dungeon|cave|mine|island/i
const ROUTE_HINT_RE = /商道|道路|驿道|路线|通道|航线|route|road|trail|passage|trade/i
const RIVER_TYPE_RE = /river|stream|brook|lake|water|河|江|溪|川|湖|瀑/i
const RELATION_KIND_ALIASES = new Map([
  ['parent', 'parent'], ['inside', 'parent'], ['within', 'parent'], ['belongs-to-region', 'parent'],
  ['位于', 'parent'], ['隶属', 'parent'], ['包含于', 'parent'],
  ['state', 'state'], ['country', 'state'], ['belongs-to-state', 'state'], ['所属国家', 'state'], ['所属势力', 'state'],
  ['same-state', 'same-state'], ['same-country', 'same-state'], ['同国', 'same-state'], ['同属', 'same-state'],
  ['different-state', 'different-state'], ['different-country', 'different-state'], ['异国', 'different-state'], ['敌对国', 'different-state'],
  ['adjacent', 'adjacent'], ['neighbor', 'adjacent'], ['neighbour', 'adjacent'], ['相邻', 'adjacent'], ['邻接', 'adjacent'],
  ['river', 'river'], ['on-river', 'river'], ['river-through', 'river'], ['沿河', 'river'], ['流经', 'river'],
  ['route', 'route'], ['road', 'route'], ['connected', 'route'], ['connects', 'route'], ['通往', 'route'], ['连接', 'route'],
])

function getEntryName(entry) {
  if (typeof entry?.name === 'string' && entry.name.trim()) return entry.name.trim()
  if (Array.isArray(entry?.keys)) {
    const key = entry.keys.find(k => String(k || '').trim())
    if (key) return String(key).trim()
  }
  return ''
}

function getEntryType(entry) {
  const raw = typeof entry?.type === 'string' && entry.type.trim()
    ? entry.type.trim().toLowerCase()
    : 'general'
  return ENTRY_TYPE_ALIASES[raw] || raw
}

function getEntryContent(entry) {
  return typeof entry?.content === 'string' ? entry.content : ''
}

/**
 * @param {object|null|undefined} worldbook
 * @returns {{
 *   stateNames: string[],
 *   burgNames: string[],
 *   riverNames: string[],
 *   locations: Array<{id: string, name: string, content: string}>,
 *   loreContextBlock: string,
 *   constraints: {
 *     mountains?: Array<{name: string, cells: number[], type: 'range' | 'volcano' | 'ridge'}>,
 *     stateSeeds?: Array<{name: string, centerCell: number, radius: number}>
 *   }
 * }}
 */
export function extractMapSeedsFromWorldbook(worldbook) {
  const empty = { stateNames: [], burgNames: [], riverNames: [], locations: [], loreContextBlock: '', constraints: {} }
  if (!worldbook || typeof worldbook !== 'object') {
    return empty
  }

  const sorted = [...(Array.isArray(worldbook.entries) ? worldbook.entries : [])]
    .filter(e => e && typeof e === 'object')
    .sort((a, b) => {
      const pa = ENTRY_TYPE_PRIORITY[getEntryType(a)] ?? 99
      const pb = ENTRY_TYPE_PRIORITY[getEntryType(b)] ?? 99
      if (pa !== pb) return pa - pb
      return getEntryName(a).localeCompare(getEntryName(b), 'zh-Hans-CN')
    })

  const pools = { stateNames: [], burgNames: [], riverNames: [], locations: [] }
  const constraints = { mountains: [], stateSeeds: [] }
  const locationCandidates = collectWorldbookLocationEntries(worldbook)
  for (const entry of sorted) {
    const name = getEntryName(entry)
    if (!name) continue
    const type = getEntryType(entry)
    const haystack = `${name}\n${getEntryContent(entry)}`
    const pool = resolveNamePool(type, haystack)
    if (pool) pushUnique(pools[pool], name, NAME_POOL_LIMIT)
    if (isStateSeedCandidate(type, haystack)) {
      constraints.stateSeeds.push({ name, centerCell: 0, radius: 0 })
    }
    if (isMountainCandidate(type, haystack)) {
      constraints.mountains.push({ name, cells: [], type: resolveMountainType(haystack) })
    }
  }

  if (constraints.stateSeeds.length > CONSTRAINT_LIMIT) {
    constraints.stateSeeds = constraints.stateSeeds.slice(0, CONSTRAINT_LIMIT)
  }
  if (constraints.mountains.length > CONSTRAINT_LIMIT) {
    constraints.mountains = constraints.mountains.slice(0, CONSTRAINT_LIMIT)
  }
  for (const location of locationCandidates) {
    if (!pools.locations.some(existing => existing.id === location.id)) {
      pools.locations.push({
        id: location.id,
        name: location.name,
        content: getEntryContent(location).replace(/\s+/g, ' ').trim().slice(0, 220)
      })
      if (pools.locations.length > LOCATION_SEED_LIMIT) pools.locations.pop()
    }
  }
  const compactConstraints = {}
  if (constraints.stateSeeds.length) compactConstraints.stateSeeds = constraints.stateSeeds
  if (constraints.mountains.length) compactConstraints.mountains = constraints.mountains

  return { ...pools, loreContextBlock: buildLoreContextBlock(sorted), constraints: compactConstraints }
}

/**
 * 将世界书中明确的地点条目绑定到已经生成的地图上。
 *
 * 地图引擎只负责生成地形和临时地图对象，世界书才是故事地点的来源。因此
 * 这里不把地点交给 LLM 猜坐标：先匹配同名对象，再按明确地理条件产生待确认
 * 候选；没有合理候选时保持未绑定，也不会覆盖手动标记。
 *
 * @param {object|null|undefined} worldbook
 * @param {object|null|undefined} mapData
 * @param {Array<object>} existingMarkers
 * @returns {Array<object>}
 */
export function buildWorldbookLocationMarkers(worldbook, mapData, existingMarkers = [], supplementalLocations = []) {
  const currentMarkers = Array.isArray(existingMarkers) ? existingMarkers : []
  const worldbookId = String(worldbook?.id || '').trim()
  const worldbookEntries = collectWorldbookLocationEntries(worldbook)
  // Geography-store supplements are provisional map data, not formal places.
  // Keep the parameter for callers on older surfaces, but never promote it.
  void supplementalLocations
  const entries = worldbookEntries
  const derivedMarkers = []
  const occupied = currentMarkers
    .filter(marker => marker?.bindingMethod !== 'fallback')
    .map(marker => ({ x: Number(marker.x), y: Number(marker.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))

  for (const entry of entries) {
    const entryId = String(entry.id || '').trim()
    const name = getEntryName(entry)
    if (!entryId || !name) continue

    const source = entry.__markerSource === 'geography' ? 'geography' : 'worldbook'
    const sourceEntryId = `${source}:${entryId}`
    const existing = currentMarkers.find(marker => (
      (!marker?.worldbookId || String(marker.worldbookId) === worldbookId)
      && (
        String(marker?.sourceEntryId || '') === sourceEntryId
        || (source === 'worldbook' && String(marker?.worldbookEntryId || '') === entryId)
      )
    ))
    const haystack = `${name}\n${getEntryContent(entry)}`
    const point = resolveWorldbookLocationPoint(
      name,
      entryId,
      mapData,
      existing,
      entry,
      occupied,
      [...currentMarkers, ...derivedMarkers],
    )
    if (!point) continue

    const binding = resolveMarkerBinding(entry, name, entryId, mapData, existing, point)

    const marker = {
      ...(existing || {}),
      id: existing?.id || `${source}-location:${entryId}`,
      name,
      x: point.x,
      y: point.y,
      type: resolveWorldbookMarkerType(haystack),
      importance: Number(existing?.importance) || 4,
      note: buildLocationNote(entry),
      source,
      sourceEntryId,
      ...(source === 'worldbook' && worldbookId ? { worldbookId } : {}),
      bindingStatus: binding.status,
      bindingMethod: binding.method,
      bindingReason: binding.reason,
      ...(Number.isInteger(point.cellId) ? { cellId: point.cellId } : {}),
      ...(point.mapObjectId ? { mapObjectId: point.mapObjectId } : {}),
      ...(source === 'worldbook' && entry.__worldbookEntryId
        ? { worldbookEntryId: entry.__worldbookEntryId }
        : {}),
      userAdded: false,
    }
    derivedMarkers.push(marker)
    occupied.push({ x: marker.x, y: marker.y })
  }

  const manualMarkers = currentMarkers.filter(marker => (
    marker?.source !== 'worldbook' && marker?.source !== 'geography' && !marker?.sourceEntryId && !marker?.worldbookEntryId
  ))
  return [...manualMarkers, ...derivedMarkers]
}

/**
 * Build the reviewable worldbook place inventory used by the map workbench.
 * Unmatched authored places remain in the inventory without a visible point.
 */
export function buildWorldbookPlaceInventory(worldbook, { mapData = null, markers = [] } = {}) {
  const entries = collectWorldbookLocationEntries(worldbook)
  const normalizedMarkers = Array.isArray(markers) ? markers : []
  return entries.map((entry) => {
    const entryId = String(entry.__worldbookEntryId || entry.id || '').trim()
    const name = getEntryName(entry)
    const marker = normalizedMarkers.find((candidate) => (
      (entryId && String(candidate?.worldbookEntryId || '') === entryId)
      || String(candidate?.sourceEntryId || '') === `worldbook:${entry.id}`
      || normalizeMapName(candidate?.name) === normalizeMapName(name)
    )) || null
    const binding = resolveMarkerBinding(entry, name, entry.id, mapData, marker)
    const explicit = Boolean(entry.__worldbookEntryId)
    return {
      id: entry.id,
      entryId: explicit ? entryId : '',
      name,
      aliases: collectPlaceAliases(entry, name),
      kind: resolvePlaceKind(entry),
      content: getEntryContent(entry),
      source: entry.__placeSource || (explicit ? 'explicit' : 'provisional'),
      evidence: String(entry.__placeEvidence || '').trim(),
      relationRefs: Array.isArray(entry.__relationRefs) ? entry.__relationRefs : [],
      relationSummary: summarizeLocationRelations(entry.__relationRefs),
      markerId: marker?.id || '',
      marker,
      mapRef: marker ? { markerIds: [marker.id], x: Number(marker.x), y: Number(marker.y) } : null,
      status: binding.status,
      matchMethod: binding.method,
      matchReason: binding.reason,
      canFormalize: !explicit && entry.__placeSource === 'provisional',
      canConfirm: explicit && Boolean(marker),
      canClear: explicit && Boolean(entry.mapBinding || marker?.bindingStatus === 'confirmed'),
      sourceRevision: String(worldbook?.updatedAt || worldbook?.id || 'unknown')
    }
  })
}

/**
 * Map-generated settlements are spatial proposals, not authored facts. They
 * stay separate until the user deliberately promotes one into the worldbook.
 */
export function buildMapNativePlaceInventory(mapData, worldbook, markers = []) {
  const authoredNames = new Set()
  for (const entry of collectWorldbookLocationEntries(worldbook)) {
    for (const name of [getEntryName(entry), ...collectPlaceAliases(entry, getEntryName(entry))]) {
      const normalized = normalizeMapName(name)
      if (normalized) authoredNames.add(normalized)
    }
  }
  const markerByObject = new Map((Array.isArray(markers) ? markers : [])
    .filter((marker) => marker?.mapObjectId)
    .map((marker) => [String(marker.mapObjectId), marker]))
  const states = Array.isArray(mapData?.states) ? mapData.states : []

  return (Array.isArray(mapData?.burgs) ? mapData.burgs : [])
    .filter((burg) => burg?.i > 0 && String(burg.name || '').trim())
    .map((burg) => {
      const marker = markerByObject.get(`burg:${burg.i}`) || null
      const formallyLinked = Boolean(marker?.worldbookEntryId)
      const population = Math.max(0, Number(burg.population) || 0)
      const kind = burg.capital
        ? 'capital'
        : burg.port
          ? 'port'
          : population <= 8 ? 'village' : population <= 28 ? 'town' : 'city'
      const stateName = String(states[Number(burg.state)]?.name || '').trim()
      const alreadyAuthored = authoredNames.has(normalizeMapName(burg.name))
      return {
        id: `map-native:burg:${burg.i}`,
        mapObjectId: `burg:${burg.i}`,
        name: String(burg.name).trim(),
        kind,
        x: Number(burg.x),
        y: Number(burg.y),
        cellId: Number.isInteger(Number(burg.cell)) ? Number(burg.cell) : undefined,
        stateId: Number(burg.state) || 0,
        stateName,
        population,
        port: Boolean(burg.port),
        status: formallyLinked || alreadyAuthored ? 'linked' : marker ? 'previewed' : 'map-only',
        linkedMarkerId: marker?.id || '',
        canPromote: !marker && !alreadyAuthored,
      }
    })
    .sort((a, b) => (
      Number(b.kind === 'capital') - Number(a.kind === 'capital')
      || b.population - a.population
      || a.name.localeCompare(b.name, 'zh-Hans-CN')
    ))
}

/**
 * 地图原生地点的 kind → 中文标签（供 inventory 展示与 promote 描述共用）。
 */
export function mapNativeKindLabel(kind) {
  return ({ capital: '首都', port: '港口', city: '城市', town: '城镇', village: '村落' })[kind] || '聚落'
}

/**
 * 为 promoteNativePlace 生成富信息描述（audit B2）。
 * 原 promote 只写"X是一处城镇。位于Y。"，信息密度低；
 * 现从 place + mapData 提取人口规模/港口/国家/地理特征/沿河等上下文，
 * 组装成 2-4 句自然描述。
 *
 * @param {object} place - buildMapNativePlaceInventory 返回的 place 项
 * @param {object} mapData - VoronoiMapData（用于查 biome / 河流）
 * @returns {string} 组装后的 content
 */
export function describeNativePlaceForPromotion(place, mapData) {
  if (!place?.name) return ''
  const kindLabel = mapNativeKindLabel(place.kind)
  const facts = [`${place.name}是一处${kindLabel}。`]

  // 人口规模描述
  const pop = Number(place.population) || 0
  if (place.kind === 'capital') {
    facts.push('为一国之都，人口稠密、商旅云集。')
  } else if (pop >= 28) {
    facts.push('城池颇具规模，人丁兴旺。')
  } else if (pop >= 8) {
    facts.push('是一处熙攘的集镇。')
  } else {
    facts.push('是一处宁静的小村落。')
  }

  // 所属国家
  if (place.stateName) {
    facts.push(`隶属${place.stateName}。`)
  }

  // 港口
  if (place.port) {
    facts.push('临近可通航水域，具备港口之利。')
  }

  // 地理特征（biome）+ 沿河
  const cellId = Number(place.cellId)
  if (Number.isInteger(cellId) && mapData?.cells) {
    const biomeId = Number(mapData.cells.biome?.[cellId])
    const biome = Number.isFinite(biomeId) ? BIOMES[biomeId] : null
    if (biome?.name && biome.id !== 0) {
      facts.push(`地处${biome.name}。`)
    }
    // 沿河：cells.r[cellId] > 0 表示有河流经过
    const riverId = Number(mapData.cells.r?.[cellId])
    if (Number.isFinite(riverId) && riverId > 0) {
      facts.push('畔河而建。')
    }
  }

  return facts.join('')
}

/**
 * Compile only confirmed worldbook bindings into map-engine constraints.
 * Provisional names extracted from prose remain reviewable, but must never
 * silently become hard geometry on the next generation.
 */
export function compileWorldbookMapConstraints(worldbook, { mapData = null } = {}) {
  const constraints = { locations: [], anchors: [], rivers: [], routes: [] }
  const report = { compiled: [], deferred: [], invalid: [] }
  for (const entry of collectWorldbookLocationEntries(worldbook)) {
    const entryId = String(entry.__worldbookEntryId || '').trim()
    const binding = entry?.mapBinding
    const name = getEntryName(entry)
    const kind = resolvePlaceKind(entry)
    if (!entryId || binding?.status !== 'confirmed') continue
    const identity = { id: entryId, name, kind }
    const x = Number(binding.x)
    const y = Number(binding.y)
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) {
      report.invalid.push({ ...identity, reason: '已确认绑定缺少有效画布坐标' })
      continue
    }
    const relationRefs = Array.isArray(entry.__relationRefs) ? entry.__relationRefs : []
    const aliases = collectPlaceAliases(entry, name)
    const hard = resolveLocationHardConstraints(entry, kind)
    if (kind === 'river') {
      constraints.rivers.push({
        name,
        sourceCell: resolveNearestMapCell(mapData, x, y),
        sourceX: x,
        sourceY: y,
        mouthHint: getEntryContent(entry).slice(0, 120),
      })
      report.compiled.push({ ...identity, target: 'river' })
      continue
    }
    if (kind === 'route') {
      const relationNames = relationRefs.map((reference) => String(reference?.name || '').trim()).filter(Boolean)
      constraints.routes.push({
        name,
        from: relationNames[0],
        to: relationNames[1],
        sourceX: x,
        sourceY: y,
      })
      report.compiled.push({ ...identity, target: 'route' })
      continue
    }
    if (kind === 'region' || kind === 'state') {
      constraints.anchors.push({ id: entryId, name, aliases, kind, x, y })
      report.compiled.push({ ...identity, target: 'anchor' })
      continue
    }
    constraints.locations.push({
      id: entryId,
      name,
      aliases,
      kind,
      x,
      y,
      hard,
      relationRefs: relationRefs.map((reference) => ({
        id: reference?.id ? String(reference.id) : undefined,
        name: String(reference?.name || '').trim(),
        ...(reference?.relation ? { relation: reference.relation } : {}),
      })).filter((reference) => reference.name),
    })
    report.compiled.push({ ...identity, target: 'location' })

    for (const reference of relationRefs.filter((item) => item?.relation === 'route')) {
      constraints.routes.push({
        name: `${name}—${reference.name}`,
        from: name,
        to: reference.name,
        sourceX: x,
        sourceY: y,
      })
    }
  }
  return { constraints, report }
}

function isWorldbookLocationEntry(entry) {
  const type = getEntryType(entry)
  if (type === 'location') return true
  // 兼容旧导入数据：部分版本把地点类型保存成 place/landmark 等原始值。
  return LOCATION_TYPE_RE.test(String(entry?.type || ''))
}

/**
 * Collect concrete place names already present in worldbook-owned data.
 * Besides explicit location entries, imports and history can keep a place as
 * a relation or a geoHistory placeRef. Those references are still authored
 * facts and should become map markers instead of being left invisible.
 */
export function collectWorldbookLocationEntries(worldbook) {
  const entries = Array.isArray(worldbook?.entries)
    ? worldbook.entries.filter(entry => entry && typeof entry === 'object')
    : []
  const entriesById = new Map(entries
    .filter(entry => String(entry.id || '').trim())
    .map(entry => [String(entry.id).trim(), entry]))
  const result = []
  const seenNames = new Set()
  const seenIds = new Set()

  const add = (candidate, { worldbookEntryId = '', source = '', relationRefs = [], evidence = '' } = {}) => {
    const name = String(candidate?.name || '').replace(/\s+/g, ' ').trim()
    if (!name) return
    const nameKey = normalizeMapName(name)
    if (!nameKey || seenNames.has(nameKey)) return
    const id = String(candidate?.id || '').trim() || `reference:${stableHash(name)}`
    if (seenIds.has(id)) return
    seenNames.add(nameKey)
    seenIds.add(id)
    result.push({
      ...candidate,
      id,
      name,
      type: 'location',
      content: getEntryContent(candidate),
      __markerSource: 'worldbook',
      ...(source ? { __placeSource: source } : {}),
      ...(relationRefs.length ? { __relationRefs: relationRefs } : {}),
      ...(evidence ? { __placeEvidence: evidence } : {}),
      ...(worldbookEntryId ? { __worldbookEntryId: worldbookEntryId } : {})
    })
  }

  // Explicit location entries own the name. Generic geography prose is only a
  // fallback source and must never shadow a maintained structured entry.
  for (const entry of entries.filter((candidate) => isWorldbookLocationEntry(candidate) && !isGenericLocationEntry(candidate))) {
    const entryId = String(entry.id || '').trim()
    add(entry, {
      worldbookEntryId: entryId,
      source: 'explicit',
      relationRefs: collectEntryLocationRelations(entry, entriesById),
    })
  }

  for (const owner of entries) {
    const ownerId = String(owner.id || owner.name || 'entry').trim()
    for (const rawReference of Array.isArray(owner.relations?.locations) ? owner.relations.locations : []) {
      const reference = normalizeLocationReference(rawReference)
      const target = reference.id ? entriesById.get(reference.id) : null
      if (target && isWorldbookLocationEntry(target)) {
        add(target, { worldbookEntryId: String(target.id).trim(), source: 'relation' })
        continue
      }
      if (!reference.name) continue
      add({
        id: `relation:${stableHash(`${ownerId}:${reference.name}`)}`,
        name: reference.name,
        content: `由世界书条目「${getEntryName(owner) || ownerId}」引用。`
      }, {
        source: 'relation',
        relationRefs: [{ ownerId, name: reference.name, id: reference.id }]
      })
    }
  }

  const geoHistory = worldbook?.geoHistory && typeof worldbook.geoHistory === 'object'
    ? worldbook.geoHistory
    : {}
  for (const placeRef of Array.isArray(geoHistory.placeRefs) ? geoHistory.placeRefs : []) {
    const reference = normalizeLocationReference(placeRef)
    if (!reference.name) continue
    add({
      id: `geo-history:${reference.id || stableHash(reference.name)}`,
      name: reference.name,
      content: String(placeRef?.description || placeRef?.summary || '').trim()
    }, { source: 'geo-history' })
  }
  for (const node of Array.isArray(geoHistory.nodes) ? geoHistory.nodes : []) {
    const reference = normalizeLocationReference(node?.placeRef || node?.mapBinding || node)
    if (!reference.name) continue
    add({
      id: `geo-history-node:${String(node?.id || stableHash(reference.name)).trim()}`,
      name: reference.name,
      content: String(node?.summary || node?.description || '').trim()
    }, { source: 'geo-history' })
  }

  return result
}

function isGenericLocationEntry(entry) {
  return isPlaceOverviewEntry(entry)
}

function normalizeLocationReference(raw) {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const value = String(raw).trim()
    return { id: value, name: value, relation: '' }
  }
  if (!raw || typeof raw !== 'object') return { id: '', name: '', relation: '' }
  const id = String(raw.targetId || raw.placeId || raw.siteId || raw.locationId || raw.id || '').trim()
  const name = String(
    raw.targetName
      || raw.name
      || raw.title
      || raw.locationName
      || raw.city
      || raw.currentCity
      || raw.scene
      || raw.currentScene
      || ''
  ).replace(/\s+/g, ' ').trim()
  const relation = normalizeLocationRelationKind(
    raw.relationType || raw.relation || raw.linkType || raw.edgeType || raw.kind || raw.type
  )
  return { id, name, relation }
}

function collectEntryLocationRelations(entry, entriesById) {
  const refs = []
  const append = (raw, forcedRelation = '') => {
    const reference = normalizeLocationReference(raw)
    if (forcedRelation) reference.relation = forcedRelation
    const target = reference.id ? entriesById.get(reference.id) : null
    if (!reference.name && target) reference.name = getEntryName(target)
    if (!reference.name || !reference.relation) return
    const key = `${reference.relation}:${normalizeMapName(reference.id || reference.name)}`
    if (refs.some((item) => `${item.relation}:${normalizeMapName(item.id || item.name)}` === key)) return
    refs.push(reference)
  }

  for (const raw of Array.isArray(entry?.relations?.locations) ? entry.relations.locations : []) append(raw)
  append(entry?.parentRef || entry?.parentLocation || entry?.parentRegion || entry?.region, 'parent')
  append(entry?.factionRef || entry?.country || entry?.state || entry?.mapBinding?.country || entry?.mapBinding?.currentCountry, 'state')
  append(entry?.metadata?.place?.parentRef, 'parent')
  append(entry?.metadata?.place?.factionRef, 'state')
  return refs.slice(0, 16)
}

function normalizeLocationRelationKind(value) {
  const key = String(value || '')
    .trim()
    .toLocaleLowerCase('zh-Hans-CN')
    .replace(/[\s_]+/g, '-')
  return RELATION_KIND_ALIASES.get(key) || ''
}

function summarizeLocationRelations(relations) {
  const labels = {
    parent: '归属', state: '国家', 'same-state': '同国', 'different-state': '异国',
    adjacent: '相邻', river: '沿河', route: '通路',
  }
  return (Array.isArray(relations) ? relations : [])
    .filter((item) => item?.relation && item?.name)
    .slice(0, 3)
    .map((item) => `${labels[item.relation] || item.relation}：${item.name}`)
    .join(' · ')
}

function resolveWorldbookMarkerType(haystack) {
  if (PORT_MARKER_RE.test(haystack)) return 'port'
  if (FORTRESS_MARKER_RE.test(haystack)) return 'fortress'
  if (RUIN_MARKER_RE.test(haystack)) return 'ruin'
  if (ACADEMY_MARKER_RE.test(haystack)) return 'academy'
  if (SECT_MARKER_RE.test(haystack)) return 'sect'
  if (CAPITAL_HINT_RE.test(haystack)) return 'capital'
  if (VILLAGE_HINT_RE.test(haystack)) return 'village'
  if (TOWN_HINT_RE.test(haystack)) return 'town'
  if (CITY_HINT_RE.test(haystack)) return 'city'
  return 'custom'
}

function buildLocationNote(entry) {
  const content = getEntryContent(entry).replace(/\s+/g, ' ').trim()
  if (!content) return '来自世界书地点条目'
  const normalized = content.replace(/^来自世界书[：:]\s*(?=来自世界书)/, '')
  const note = /^来自世界书(?:[「『].*?[」』])?[：:]/.test(normalized)
    ? normalized
    : `来自世界书：${normalized}`
  return `${note.slice(0, 180)}${note.length > 180 ? '…' : ''}`
}

function collectPlaceAliases(entry, name) {
  const values = [
    ...(Array.isArray(entry?.aliases) ? entry.aliases : []),
    ...(Array.isArray(entry?.keys) ? entry.keys : []),
    ...(Array.isArray(entry?.keysSecondary) ? entry.keysSecondary : [])
  ]
  const seen = new Set([normalizeMapName(name)])
  return values
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter((value) => {
      const key = normalizeMapName(value)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
}

function resolvePlaceKind(entry) {
  const type = getEntryType(entry)
  const rawType = String(entry?.type || '').trim().toLowerCase()
  const name = getEntryName(entry)
  const content = getEntryContent(entry)
  const nameAndType = `${rawType}\n${type}\n${name}`
  const haystack = `${nameAndType}\n${content}`

  // Prefer the explicit entry type and the place name. A village description
  // may mention a nearby river or road without turning the village into one.
  if (/^(?:river|stream|lake|waterway)$/.test(rawType)) return 'river'
  if (/^(?:route|road|trail|passage)$/.test(rawType)) return 'route'
  if (/^(?:region|continent|basin|plain|forest|desert)$/.test(rawType)) return 'region'
  if (/^(?:city|town|village|port|fortress)$/.test(rawType)) return 'burg'
  if (/^(?:ruin|dungeon|cave|mine|landmark)$/.test(rawType)) return 'site'
  if (type === 'organization') return 'state'
  if (REMOTE_SITE_HINT_RE.test(name)) return 'site'
  if (LOCATION_HINT_RE.test(name)) return 'burg'
  if (RIVER_TYPE_RE.test(name)) return 'river'
  if (ROUTE_HINT_RE.test(name)) return 'route'
  if (REGION_HINT_RE.test(name)) return 'region'
  if (STATE_HINT_RE.test(nameAndType)) return 'state'
  if (LOCATION_HINT_RE.test(haystack)) return 'burg'
  if (RIVER_TYPE_RE.test(haystack)) return 'river'
  if (ROUTE_HINT_RE.test(haystack)) return 'route'
  if (REGION_HINT_RE.test(haystack)) return 'region'
  return 'site'
}

function resolveLocationHardConstraints(entry, kind) {
  const haystack = `${getEntryName(entry)}\n${getEntryContent(entry)}`
  if (kind === 'river') return ['river']
  if (/水上|水域|湖心|lake|water/i.test(haystack)) return ['water']
  if (/岛屿|岛上|island/i.test(haystack)) return ['land']
  if (/沿海|海岸|海湾|港口|码头|渡口|port|harbor|coast/i.test(haystack)) return ['land', 'coast']
  return ['land']
}

function resolveNearestMapCell(mapData, x, y) {
  const points = mapData?.cells?.p
  const count = Number(mapData?.cells?.length) || 0
  if (!points || count <= 0) return -1
  let nearest = -1
  let distance = Infinity
  for (let cell = 0; cell < count; cell += 1) {
    const dx = Number(points[cell * 2]) - x
    const dy = Number(points[cell * 2 + 1]) - y
    const nextDistance = dx * dx + dy * dy
    if (nextDistance < distance) {
      distance = nextDistance
      nearest = cell
    }
  }
  return nearest
}

function resolveMarkerBinding(entry, name, entryId, mapData, existing, point = null) {
  const saved = entry?.mapBinding
  if (saved?.status === 'confirmed' && Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y))) {
    return { status: 'confirmed', method: 'manual', reason: '世界书已保存确认绑定' }
  }
  if (existing?.bindingStatus === 'confirmed') {
    return { status: 'confirmed', method: existing.bindingMethod || 'manual', reason: '地图标记已确认' }
  }
  if (
    existing?.bindingStatus === 'auto-matched'
    && existing?.bindingMethod !== 'fallback'
    && existing?.mapObjectId
  ) {
    return {
      status: 'auto-matched',
      method: existing.bindingMethod || 'relation',
      reason: existing.bindingReason || '已根据地理条件找到候选对象，待确认',
    }
  }
  const normalizedName = normalizeMapName(name)
  const aliases = collectPlaceAliases(entry, name).map(normalizeMapName)
  const matchingBurg = (Array.isArray(mapData?.burgs) ? mapData.burgs : [])
    .find((burg) => {
      if (!(burg?.i > 0)) return false
      const burgName = normalizeMapName(burg?.name)
      return burgName === normalizedName || aliases.includes(burgName)
    })
  if (matchingBurg) {
    return {
      status: 'auto-matched',
      method: aliases.includes(normalizeMapName(matchingBurg.name)) ? 'alias' : 'exact',
      reason: '已找到同名或别名聚落'
    }
  }
  if (point?.matchMethod) {
    return {
      status: 'auto-matched',
      method: point.matchMethod,
      reason: point.matchReason || '已根据地理条件找到候选对象，待确认',
    }
  }
  return { status: 'unbound', method: 'fallback', reason: '尚未找到满足地理条件的地图对象' }
}

function resolveWorldbookLocationPoint(name, entryId, mapData, existing, entry = {}, occupied = [], visibleMarkers = []) {
  const saved = entry?.mapBinding
  if (Number.isFinite(Number(saved?.x)) && Number.isFinite(Number(saved?.y))) {
    return {
      x: Number(saved.x),
      y: Number(saved.y),
      ...(Number.isInteger(Number(saved.cellId)) ? { cellId: Number(saved.cellId) } : {}),
      ...(saved.mapObjectId ? { mapObjectId: String(saved.mapObjectId) } : {}),
    }
  }
  if (
    existing?.bindingMethod !== 'fallback'
    && Number.isFinite(Number(existing?.x))
    && Number.isFinite(Number(existing?.y))
  ) {
    return { x: Number(existing.x), y: Number(existing.y) }
  }

  const normalizedName = normalizeMapName(name)
  const aliases = collectPlaceAliases(entry, name).map(normalizeMapName)
  const matchingBurg = (Array.isArray(mapData?.burgs) ? mapData.burgs : [])
    .find((burg) => {
      if (!(burg?.i > 0)) return false
      const burgName = normalizeMapName(burg?.name)
      return burgName === normalizedName || aliases.includes(burgName)
    })
  if (matchingBurg && Number.isFinite(Number(matchingBurg.x)) && Number.isFinite(Number(matchingBurg.y))) {
    return {
      x: Number(matchingBurg.x),
      y: Number(matchingBurg.y),
      cellId: Number(matchingBurg.cell),
      mapObjectId: `burg:${matchingBurg.i}`,
    }
  }

  return resolveGeographicMapCandidate(entry, mapData, occupied, visibleMarkers)
}

function resolveGeographicMapCandidate(entry, mapData, occupied, visibleMarkers) {
  const kind = resolvePlaceKind(entry)
  if (kind === 'burg') return resolveBurgCandidate(entry, mapData, occupied, visibleMarkers)
  if (kind === 'river') return resolveRiverCandidate(entry, mapData, occupied)
  if (kind === 'route') return resolveRoadCandidate(entry, mapData, occupied)
  if (kind === 'state' || kind === 'region') return resolveNamedStateCandidate(entry, mapData, occupied)
  return resolveTerrainSiteCandidate(entry, mapData, occupied)
}

function resolveBurgCandidate(entry, mapData, occupied, visibleMarkers) {
  const cells = mapData?.cells
  const burgs = Array.isArray(mapData?.burgs) ? mapData.burgs : []
  if (!cells?.p || !cells?.h || burgs.length <= 1) return null
  const text = `${getEntryName(entry)}\n${getEntryContent(entry)}`
  const wantsCoast = COAST_HINT_RE.test(text)
  const wantsRiver = /沿河|河畔|河岸|河谷|临河|riverside|riverbank|river valley/i.test(text)
  const wantsMountain = MOUNTAIN_HINT_RE.test(text)
  const wantsForest = FOREST_HINT_RE.test(text)
  const wantsDesert = DESERT_HINT_RE.test(text)
  const wantsCapital = CAPITAL_HINT_RE.test(text)
  const wantsVillage = VILLAGE_HINT_RE.test(text)
  const stateTargets = (Array.isArray(entry?.__relationRefs)
    ? entry.__relationRefs
    : collectEntryLocationRelations(entry, new Map()))
    .filter((reference) => reference.relation === 'state')
    .map((reference) => normalizeMapName(reference.name))
  const states = Array.isArray(mapData?.states) ? mapData.states : []
  const targetStateIds = new Set(states
    .filter((state) => state?.i > 0 && stateTargets.includes(normalizeMapName(state.name)))
    .map((state) => Number(state.i)))
  let best = null
  for (const burg of burgs) {
    if (!(burg?.i > 0) || !Number.isInteger(Number(burg.cell))) continue
    const cell = Number(burg.cell)
    const x = Number(burg.x)
    const y = Number(burg.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || cells.h[cell] < 20 || positionOccupied(occupied, x, y)) continue
    if (wantsCoast && !(burg.port || cells.harbor?.[cell] > 0)) continue
    if (wantsVillage && !wantsCoast && burg.port) continue
    if (wantsRiver && !(cells.r?.[cell] > 0)) continue
    if (wantsMountain && cells.h[cell] < 42) continue
    if (wantsForest && ![5, 6, 7, 8, 9].includes(Number(cells.biome?.[cell]))) continue
    if (wantsDesert && ![1, 2].includes(Number(cells.biome?.[cell]))) continue

    let score = Math.max(0, Number(cells.s?.[cell]) || 0) * 0.6
    score += Math.log2(Math.max(1, Number(burg.population) || 1) + 1) * 6
    if (wantsCapital) score += burg.capital ? 80 : -35
    if (wantsVillage) score += burg.capital
      ? -90
      : 60 - Math.log2(Math.max(1, Number(burg.population) || 1) + 1) * 12
    if (wantsCoast && burg.port) score += 35
    if (wantsRiver && cells.r?.[cell] > 0) score += 30
    if (wantsMountain) score += Math.min(30, (cells.h[cell] - 40) * 1.2)
    if (targetStateIds.size) score += targetStateIds.has(Number(burg.state || cells.state?.[cell])) ? 55 : -55
    score += scoreRelationProximity(entry, burg, mapData, visibleMarkers)
    score += (stableHash(`${mapData?.seed || 'map'}:${entry.id}:${burg.i}`) % 1000) / 10000
    if (!best || score > best.score) best = { burg, score }
  }
  if (!best) return null
  const reasons = []
  if (wantsCapital) reasons.push('都城层级')
  else if (wantsVillage) reasons.push('村落层级')
  if (wantsCoast) reasons.push('沿海/港口')
  if (wantsRiver) reasons.push('沿河')
  if (wantsMountain) reasons.push('山地')
  if (wantsForest) reasons.push('森林生境')
  if (wantsDesert) reasons.push('荒漠生境')
  if (targetStateIds.size) reasons.push('所属国家')
  return {
    x: Number(best.burg.x),
    y: Number(best.burg.y),
    cellId: Number(best.burg.cell),
    mapObjectId: `burg:${best.burg.i}`,
    matchMethod: 'relation',
    matchReason: `按${reasons.join('、') || '聚落适宜度'}匹配候选聚落「${best.burg.name}」，待确认`,
  }
}

function resolveRiverCandidate(entry, mapData, occupied) {
  const rivers = Array.isArray(mapData?.rivers) ? mapData.rivers : []
  const aliases = new Set([getEntryName(entry), ...collectPlaceAliases(entry, getEntryName(entry))].map(normalizeMapName))
  const ranked = rivers
    .filter((river) => Array.isArray(river?.points) && river.points.length > 1)
    .map((river) => ({ river, exact: aliases.has(normalizeMapName(river.name)), length: river.cells?.length || river.points.length }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.length - a.length || Number(a.river.i) - Number(b.river.i))
  for (const item of ranked) {
    const point = item.river.points[Math.floor(item.river.points.length / 2)]
    if (!point || positionOccupied(occupied, Number(point[0]), Number(point[1]))) continue
    const cellId = item.river.cells?.[Math.floor(item.river.cells.length / 2)]
    return {
      x: Number(point[0]), y: Number(point[1]),
      ...(Number.isInteger(cellId) ? { cellId } : {}),
      mapObjectId: `river:${item.river.i}`,
      matchMethod: item.exact ? 'exact' : 'relation',
      matchReason: item.exact ? '已找到同名或别名河流' : `已匹配当前地图的主要河道「${item.river.name}」，待确认`,
    }
  }
  return null
}

function resolveRoadCandidate(entry, mapData, occupied) {
  const roads = Array.isArray(mapData?.roads) ? mapData.roads : []
  const aliases = new Set([getEntryName(entry), ...collectPlaceAliases(entry, getEntryName(entry))].map(normalizeMapName))
  const ranked = roads
    .filter((road) => Array.isArray(road?.points) && road.points.length > 1)
    .map((road) => ({ road, exact: aliases.has(normalizeMapName(road.name)), length: road.cells?.length || road.points.length }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.length - a.length || Number(a.road.i) - Number(b.road.i))
  for (const item of ranked) {
    const point = item.road.points[Math.floor(item.road.points.length / 2)]
    if (!point || positionOccupied(occupied, Number(point[0]), Number(point[1]))) continue
    const cellId = item.road.cells?.[Math.floor(item.road.cells.length / 2)]
    return {
      x: Number(point[0]), y: Number(point[1]),
      ...(Number.isInteger(cellId) ? { cellId } : {}),
      mapObjectId: `road:${item.road.i}`,
      matchMethod: item.exact ? 'exact' : 'relation',
      matchReason: item.exact ? '已找到同名或别名道路' : `已匹配当前地图的主要通道「${item.road.name}」，待确认`,
    }
  }
  return null
}

function resolveNamedStateCandidate(entry, mapData, occupied) {
  const states = Array.isArray(mapData?.states) ? mapData.states : []
  const aliases = new Set([getEntryName(entry), ...collectPlaceAliases(entry, getEntryName(entry))].map(normalizeMapName))
  const state = states.find((candidate) => candidate?.i > 0 && aliases.has(normalizeMapName(candidate.name)))
  const burg = state ? mapData?.burgs?.[state.capital] : null
  if (!burg || positionOccupied(occupied, Number(burg.x), Number(burg.y))) return null
  return {
    x: Number(burg.x), y: Number(burg.y), cellId: Number(burg.cell),
    mapObjectId: `state:${state.i}`,
    matchMethod: 'exact',
    matchReason: '已找到同名国家及其首府',
  }
}

function resolveTerrainSiteCandidate(entry, mapData, occupied) {
  const cells = mapData?.cells
  const text = `${getEntryName(entry)}\n${getEntryContent(entry)}`
  const wantsMountain = MOUNTAIN_HINT_RE.test(text)
  const wantsForest = FOREST_HINT_RE.test(text)
  const wantsDesert = DESERT_HINT_RE.test(text)
  const wantsRemoteSite = REMOTE_SITE_HINT_RE.test(text)
  if (!cells?.p || !cells?.h || (!wantsMountain && !wantsForest && !wantsDesert && !wantsRemoteSite)) return null
  const width = Number(mapData?.width) || 1200
  const height = Number(mapData?.height) || 800
  const burgs = (Array.isArray(mapData?.burgs) ? mapData.burgs : [])
    .filter((burg) => burg?.i > 0 && Number.isFinite(Number(burg.x)) && Number.isFinite(Number(burg.y)))
  let best = null
  for (let cell = 0; cell < Number(cells.length || 0); cell += 1) {
    const x = Number(cells.p[cell * 2])
    const y = Number(cells.p[cell * 2 + 1])
    if (cells.h[cell] < 20 || !Number.isFinite(x) || !Number.isFinite(y) || x < 18 || y < 18 || x > width - 18 || y > height - 18 || positionOccupied(occupied, x, y)) continue
    const biome = Number(cells.biome?.[cell])
    if (wantsMountain && cells.h[cell] < 50) continue
    if (wantsForest && ![5, 6, 7, 8, 9].includes(biome)) continue
    if (wantsDesert && ![1, 2].includes(biome)) continue
    if (wantsRemoteSite && cells.burg?.[cell] > 0) continue
    let score = wantsMountain ? Number(cells.h[cell]) * 1.2 : 0
    if (wantsForest || wantsDesert) score += 45
    if (wantsRemoteSite && burgs.length > 0) {
      const nearestBurgDistance = Math.sqrt(Math.min(...burgs.map((burg) => (
        distanceSquared(x, y, Number(burg.x), Number(burg.y))
      ))))
      score += Math.min(40, nearestBurgDistance / 10)
    }
    score += (stableHash(`${mapData?.seed || 'map'}:${entry.id}:${cell}`) % 1000) / 10000
    if (!best || score > best.score) best = { cell, x, y, score }
  }
  if (!best) return null
  return {
    x: best.x, y: best.y, cellId: best.cell,
    mapObjectId: `cell:${best.cell}`,
    matchMethod: 'relation',
    matchReason: `已按${wantsMountain ? '山地' : wantsForest ? '森林' : wantsDesert ? '荒漠' : '远离聚落'}条件找到地形候选，待确认`,
  }
}

function scoreRelationProximity(entry, burg, mapData, visibleMarkers) {
  let score = 0
  for (const reference of Array.isArray(entry?.__relationRefs) ? entry.__relationRefs : []) {
    const marker = visibleMarkers.find((candidate) => normalizeMapName(candidate?.name) === normalizeMapName(reference?.name))
    if (!marker) continue
    const distance = Math.sqrt(distanceSquared(Number(burg.x), Number(burg.y), Number(marker.x), Number(marker.y)))
    if (reference.relation === 'adjacent' || reference.relation === 'parent') score += Math.max(-35, 45 - distance / 8)
    if (reference.relation === 'same-state' || reference.relation === 'different-state') {
      const markerCell = resolveNearestMapCell(mapData, Number(marker.x), Number(marker.y))
      const sameState = markerCell >= 0 && Number(mapData?.cells?.state?.[markerCell]) === Number(burg.state || mapData?.cells?.state?.[burg.cell])
      score += reference.relation === 'same-state' ? (sameState ? 45 : -45) : (sameState ? -45 : 45)
    }
  }
  return score
}

function positionOccupied(occupied, x, y) {
  return occupied.some((point) => distanceSquared(Number(point.x), Number(point.y), x, y) < 24 * 24)
}

function normalizeMapName(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-Hans-CN').replace(/[\s·・_-]+/g, '')
}

function stableHash(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

function resolveNamePool(type, haystack) {
  if (type === 'location') return null
  if (TYPE_TO_NAME_POOL[type]) return TYPE_TO_NAME_POOL[type]
  return null
}

function isStateSeedCandidate(type, haystack) {
  return type === 'organization' || STATE_HINT_RE.test(haystack)
}

function isMountainCandidate(type, haystack) {
  return type === 'location' && MOUNTAIN_HINT_RE.test(haystack)
}

function resolveMountainType(haystack) {
  if (VOLCANO_HINT_RE.test(haystack)) return 'volcano'
  if (RIDGE_HINT_RE.test(haystack)) return 'ridge'
  return 'range'
}

function pushUnique(target, value, limit) {
  const name = String(value || '').trim()
  if (!name) return
  const normalized = name.toLocaleLowerCase('zh-Hans-CN')
  if (target.some(existing => String(existing).toLocaleLowerCase('zh-Hans-CN') === normalized)) return
  if (target.length >= limit) return
  target.push(name)
}

function buildLoreContextBlock(sortedEntries) {
  const top = sortedEntries.slice(0, LORE_CONTEXT_TOP_N)
  if (top.length === 0) return ''
  const lines = top.map(e => {
    const name = getEntryName(e) || '未命名'
    const type = getEntryType(e)
    const preview = getEntryContent(e).slice(0, CONTENT_PREVIEW_CHARS)
    return `  [${type}] ${name}: ${preview}`
  })
  return `【世界书关键条目】\n${lines.join('\n')}\n`
}
