import { getItem, removeItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeIdList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item !== null && item !== undefined)
    : []
}

function normalizePlaceRef(raw) {
  if (!raw || typeof raw !== 'object') return null
  const placeId = normalizeText(raw.placeId)
  if (!placeId) return null
  return {
    placeId,
    worldbookId: normalizeText(raw.worldbookId),
    mapId: normalizeText(raw.mapId),
    siteId: normalizeText(raw.siteId),
    name: normalizeText(raw.name || raw.title),
    semanticType: normalizeText(raw.semanticType || raw.type),
    cellIds: normalizeIdList(raw.cellIds),
    markerIds: normalizeIdList(raw.markerIds),
    routeIds: normalizeIdList(raw.routeIds)
  }
}

function entryType(entry) {
  return normalizeText(entry?.type).toLowerCase()
}

function entryName(entry) {
  return normalizeText(entry?.name || entry?.keys?.[0])
}

function getEntries(source) {
  return Array.isArray(source?.entries) ? source.entries : []
}

function getEntryNames(source, type, limit = 4) {
  return getEntries(source)
    .filter((entry) => entryType(entry) === type)
    .map(entryName)
    .filter(Boolean)
    .slice(0, limit)
}

function entryMatches(entry, patterns = []) {
  const haystack = [
    entry?.name,
    ...(Array.isArray(entry?.keys) ? entry.keys : []),
    entry?.content
  ].map(normalizeText).join(' ')

  return patterns.some((pattern) => haystack.includes(pattern))
}

function findEntryName(source, type, patterns = [], fallback = '') {
  const matched = getEntries(source)
    .filter((entry) => entryType(entry) === type)
    .find((entry) => entryMatches(entry, patterns))

  return entryName(matched) || fallback
}

export function extractPlayableOpeningHook(source) {
  const direct = normalizeText(source?.openingHook)
  if (direct) return direct

  const text = String(source?.worldDescription || source?.description || '')
  const match = text.match(/开场困境[:：]\s*([^\n]+)/)
  if (match?.[1]) return normalizeText(match[1])

  return ''
}

export function buildPlayableWorldActionHooks(source) {
  const locations = getEntryNames(source, 'location', 6)
  const factions = getEntryNames(source, 'organization', 4)
  const events = getEntryNames(source, 'event', 4)
  const quests = getEntryNames(source, 'quest', 3)
  const items = getEntryNames(source, 'item', 3)
  const openingHook = extractPlayableOpeningHook(source)

  const firstLocation = locations[0] || '第一个异常地点'
  const clockTowerLocation = findEntryName(source, 'location', ['钟楼'], firstLocation)
  const campLocation = findEntryName(source, 'location', ['难民营'], findEntryName(source, 'location', ['灰墙', '难民'], firstLocation))
  const accountLocation = findEntryName(
    source,
    'location',
    ['码头'],
    findEntryName(source, 'location', ['仓库', '账'], locations[1] || firstLocation)
  )
  const testimonyLocation = campLocation !== firstLocation ? campLocation : (findEntryName(source, 'location', ['灰墙', '难民'], locations[2] || locations[1] || firstLocation))
  const firstFaction = factions[0] || '最先介入的势力'
  const secondFaction = factions[1] || firstFaction
  const firstEvent = events[0] || quests[0] || '开场异常'
  const accountEvent = findEntryName(
    source,
    'event',
    ['夜账'],
    findEntryName(source, 'event', ['燃料', '行会', '账'], events[1] || firstEvent)
  )
  const testimonyEvent = findEntryName(source, 'event', ['难民', '灰墙', '巡骑'], events[1] || firstEvent)
  const testimonyCharacter = findEntryName(source, 'character', ['苔娜', '难民', '证词'], '')
  const firstItem = items[0] || '关键线索'

  const firstSceneDetail = `从「${firstEvent}」入手，要求 GM 给停摆时刻、值守记录和当晚失踪名单三类证据词。`

  return [
    {
      id: 'trace-first-evidence',
      label: '先去钟楼查痕迹',
      title: clockTowerLocation,
      detail: firstSceneDetail,
      command: `我先前往${clockTowerLocation}，调查${firstEvent}，并要求 GM 给出三类证据词：停摆时刻、值守记录、失踪名单。${openingHook ? `我会特别留意：${openingHook}` : ''}`
    },
    {
      id: 'pressure-faction',
      label: '夜访码头核夜账',
      title: accountLocation,
      detail: `把「${firstFaction}」和「${secondFaction}」的利益冲突摆到桌面上。`,
      command: `我前往${accountLocation}核对${accountEvent}，要求${firstFaction}说明账面矛盾，并观察${secondFaction}会如何反应。`
    },
    {
      id: 'follow-dangerous-lead',
      label: '找证人问雾军',
      title: testimonyLocation,
      detail: `沿着「${testimonyEvent}」追到「${testimonyLocation}」，让 GM 立刻给出代价。`,
      command: `我去${testimonyLocation}${testimonyCharacter ? `找${testimonyCharacter}` : `追查${firstItem}`}，确认${testimonyEvent}的第一手证词；同时要求 GM 写出代价（失去证人 / 失去账本窗口 / 失去巡骑追踪时机三选一）。`
    }
  ]
}

function normalizeHistoryNode(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  const id = normalizeText(raw.id || raw.historyNodeId)
  if (!id) return null
  const priorFacts = Array.isArray(raw.priorFacts)
    ? raw.priorFacts.map(normalizeText).filter(Boolean)
    : []
  const unresolvedHooks = Array.isArray(raw.unresolvedHooks)
    ? raw.unresolvedHooks.map(normalizeText).filter(Boolean)
    : []
  const mapBinding = (() => {
    const mb = raw.mapBinding && typeof raw.mapBinding === 'object' ? raw.mapBinding : null
    if (!mb) return null
    const country = normalizeText(mb.country || mb.currentCountry)
    const city = normalizeText(mb.city || mb.currentCity)
    const scene = normalizeText(mb.scene || mb.currentScene || mb.title)
    const placeId = normalizeText(mb.placeId)
    const siteId = normalizeText(mb.siteId)
    const cellIds = normalizeIdList(mb.cellIds)
    const markerIds = normalizeIdList(mb.markerIds)
    const routeIds = normalizeIdList(mb.routeIds)
    if (!country && !city && !scene && !placeId && !siteId && !cellIds.length && !markerIds.length && !routeIds.length) return null
    const normalized = { country, city, scene }
    if (placeId) normalized.placeId = placeId
    if (siteId) normalized.siteId = siteId
    if (cellIds.length) normalized.cellIds = cellIds
    if (markerIds.length) normalized.markerIds = markerIds
    if (routeIds.length) normalized.routeIds = routeIds
    return normalized
  })()
  const placeRef = normalizePlaceRef(raw.placeRef)
  const factionRelations = (() => {
    const fr = raw.factionRelations && typeof raw.factionRelations === 'object' ? raw.factionRelations : null
    if (!fr) return null
    const out = {}
    for (const [name, value] of Object.entries(fr)) {
      const key = normalizeText(name)
      if (!key) continue
      const num = Number(value)
      if (!Number.isFinite(num)) continue
      out[key] = num
    }
    return Object.keys(out).length ? out : null
  })()
  const participants = Array.isArray(raw.participants)
    ? raw.participants.map(normalizeText).filter(Boolean)
    : []
  const entryIds = Array.isArray(raw.entryIds)
    ? raw.entryIds.map(normalizeText).filter(Boolean)
    : []
  const normalized = {
    id,
    title: normalizeText(raw.title),
    priorFacts,
    unresolvedHooks,
    participants,
    entryIds,
    mapBinding,
    factionRelations
  }
  if (placeRef) normalized.placeRef = placeRef
  return normalized
}

export function savePlayableWorldEntryIntent(intent = {}) {
  const action = intent.action || null
  if (!intent.worldbookId || !action?.command) return false
  return setItem(STORAGE_KEYS.PLAYABLE_WORLD_ENTRY_INTENT, {
    worldbookId: String(intent.worldbookId),
    worldbookName: normalizeText(intent.worldbookName),
    presetId: normalizeText(intent.presetId),
    presetName: normalizeText(intent.presetName),
    action: {
      id: normalizeText(action.id),
      label: normalizeText(action.label),
      title: normalizeText(action.title),
      detail: normalizeText(action.detail),
      command: normalizeText(action.command)
    },
    historyNode: normalizeHistoryNode(intent.historyNode),
    createdAt: Date.now()
  })
}

export function getPlayableWorldEntryIntent() {
  const intent = getItem(STORAGE_KEYS.PLAYABLE_WORLD_ENTRY_INTENT)
  if (!intent?.worldbookId || !intent?.action?.command) return null
  const normalized = normalizeHistoryNode(intent.historyNode)
  return normalized ? { ...intent, historyNode: normalized } : intent
}

export function clearPlayableWorldEntryIntent() {
  removeItem(STORAGE_KEYS.PLAYABLE_WORLD_ENTRY_INTENT)
}

/**
 * consumePlayableWorldHistoryIntent(intent)
 * Pure helper: given a playable world intent, return the runtime patches a
 * consumer (OpeningPage.vue / gameStore.applyHistoryInit) should apply when
 * seeding a fresh session that was entered from a prior history node.
 *
 * Returns null when the intent carries no historyNode — callers can short
 * circuit and behave exactly like a non-history entry.
 *
 * Shape (all fields optional, only present when relevant):
 *   {
 *     historyNode,                 // canonical normalized history node
 *     worldMapPatch: { currentCountry?, currentCity?, currentScene? } | null,
 *     plotJournalEntry,            // 1 entry marked source: 'history-node-init'
 *     factionRelationsPatch,       // { [name]: score }
 *     runtimeEvent,                // display_event envelope
 *     stateDeltaOps                // state_delta ops targeting allowlisted roots
 *   }
 */
export function consumePlayableWorldHistoryIntent(intent = null) {
  if (!intent || typeof intent !== 'object') return null
  const historyNode = normalizeHistoryNode(intent.historyNode)
  if (!historyNode) return null

  const worldMapPatch = historyNode.mapBinding
    ? {
        currentCountry: historyNode.mapBinding.country || '',
        currentCity: historyNode.mapBinding.city || '',
        currentScene: historyNode.mapBinding.scene || ''
      }
    : null
  const canonicalPlaceId = historyNode.placeRef?.placeId || historyNode.mapBinding?.placeId
  if (worldMapPatch && canonicalPlaceId) worldMapPatch.placeId = canonicalPlaceId

  const summaryParts = []
  if (historyNode.title) summaryParts.push(`从「${historyNode.title}」进入`)
  if (historyNode.mapBinding?.scene) summaryParts.push(`现场：${historyNode.mapBinding.scene}`)
  if (historyNode.priorFacts.length) summaryParts.push(`已知：${historyNode.priorFacts.join('、')}`)
  const summary = summaryParts.join('。') || `从历史节点 ${historyNode.id} 进入`

  const plotJournalEntry = {
    summary,
    participants: historyNode.participants,
    locations: historyNode.mapBinding?.scene ? [historyNode.mapBinding.scene] : [],
    keyChoices: [],
    unresolvedHooks: historyNode.unresolvedHooks
  }
  if (canonicalPlaceId) plotJournalEntry.placeIds = [canonicalPlaceId]

  const factionRelationsPatch = historyNode.factionRelations
    ? { ...historyNode.factionRelations }
    : null

  const runtimeEvent = {
    type: 'display_event',
    source: 'runtime',
    payload: {
      kind: 'history-node-init',
      historyNodeId: historyNode.id,
      title: historyNode.title,
      mapBinding: historyNode.mapBinding,
      priorFactsCount: historyNode.priorFacts.length,
      unresolvedHooksCount: historyNode.unresolvedHooks.length,
      contextual: false
    }
  }

  const stateDeltaOps = []
  if (factionRelationsPatch) {
    for (const [name, value] of Object.entries(factionRelationsPatch)) {
      stateDeltaOps.push({ op: 'set', path: 'factionRelations', value: { [name]: value } })
    }
  }

  return {
    historyNode,
    worldMapPatch,
    plotJournalEntry,
    factionRelationsPatch,
    runtimeEvent,
    stateDeltaOps
  }
}

// ─────────────────────────────────────────────────────────────
// Window 3: geoHistory → 开场页可玩历史节点入口
// geoHistory 容器由 worldStore.normalizeWorldbook 归一化为 { nodes: [...] }
// 或 null。节点字段由历史/地图窗口的生成器产出，这里容错读取，既支持
// 展示所需的富字段（yearLabel / summary / locationHint / playable），也
// 兼容 normalizeHistoryNode 的运行时子集（priorFacts / mapBinding 等）。
// ─────────────────────────────────────────────────────────────

function normalizeStringList(value, limit = 24) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).slice(0, limit)
  }
  const single = normalizeText(value)
  return single ? [single] : []
}

function geoHistoryNodes(worldbook) {
  const geo = worldbook?.geoHistory
  if (Array.isArray(geo)) return geo
  if (Array.isArray(geo?.nodes)) return geo.nodes
  return []
}

/**
 * 把一个 geoHistory 节点归一化为开场页卡片所需的展示视图模型。
 * 仅展示字段；进入时另经 buildPlayableHistoryEntryIntent 生成运行时 intent。
 */
export function describePlayableHistoryNode(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  const id = normalizeText(raw.id || raw.historyNodeId || raw.nodeId || raw.key)
  if (!id) return null
  const title = normalizeText(raw.title || raw.name || raw.label)
  const yearLabel = normalizeText(raw.yearLabel || raw.year || raw.era || raw.date || raw.timeLabel)
  const summary = normalizeText(raw.summary || raw.description || raw.detail || raw.synopsis)
  const participants = normalizeStringList(raw.participants || raw.factions || raw.actors || raw.parties)
  const mb = raw.mapBinding && typeof raw.mapBinding === 'object' ? raw.mapBinding : null
  const locationHint = normalizeText(
    raw.locationHint
      || raw.locationName
      || raw.location
      || raw.place
      || mb?.scene
      || mb?.currentScene
      || mb?.city
      || mb?.currentCity
      || mb?.country
      || mb?.currentCountry
  )
  const playable = raw.playable === true || raw.isPlayable === true
  return { id, title, yearLabel, summary, participants, locationHint, playable }
}

/**
 * 读取一个世界书里"可进入"的历史节点（只保留 playable 且有可展示内容的）。
 * geoHistory 缺失时返回空数组 → 开场页据此隐藏历史节点区。
 */
export function getPlayableHistoryNodes(worldbook) {
  return geoHistoryNodes(worldbook)
    .map((raw) => {
      const view = describePlayableHistoryNode(raw)
      return view ? { ...view, raw } : null
    })
    .filter((node) => node && node.playable && (node.title || node.yearLabel || node.summary))
}

function buildHistoryNodeCommand(node) {
  const parts = []
  const heading = node.yearLabel
    ? `${node.yearLabel} · ${node.title || '历史节点'}`
    : (node.title || '历史节点')
  parts.push(`我从历史节点「${heading}」进入这个世界。`)
  if (node.summary) parts.push(`当前局势：${node.summary}。`)
  const priorFacts = normalizeStringList(node.priorFacts)
  if (priorFacts.length) parts.push(`已确定的前情：${priorFacts.join('；')}。`)
  if (node.participants?.length) parts.push(`相关参与方：${node.participants.join('、')}。`)
  if (node.locationHint) parts.push(`起始地点：${node.locationHint}。`)
  const unresolvedHooks = normalizeStringList(node.unresolvedHooks)
  if (unresolvedHooks.length) parts.push(`尚未解决：${unresolvedHooks.join('；')}。`)
  parts.push('请以此为开场，让我在这个时间点开始行动。')
  return parts.join('')
}

/**
 * 从一个 geoHistory 节点 + 世界书构造可存储的 intent。
 * 返回的 intent 同时携带：
 *   - action.command：进入体验页时发送的隐藏开场指令（savePlayableWorldEntryIntent 要求）。
 *   - historyNode：运行时子集（priorFacts / unresolvedHooks / participants /
 *     entryIds / mapBinding / factionRelations），与 normalizeHistoryNode 对齐，
 *     供 consumePlayableWorldHistoryIntent 消费。
 * 节点缺 id 或世界书缺 id 时返回 null。
 */
export function buildPlayableHistoryEntryIntent(worldbook, rawNode) {
  if (!worldbook?.id) return null
  if (!rawNode || typeof rawNode !== 'object') return null
  const display = describePlayableHistoryNode(rawNode)
  if (!display?.id) return null

  const command = buildHistoryNodeCommand({
    ...display,
    priorFacts: rawNode.priorFacts,
    unresolvedHooks: rawNode.unresolvedHooks
  })

  return {
    worldbookId: String(worldbook.id),
    worldbookName: normalizeText(worldbook.name),
    action: {
      id: `history-node:${display.id}`,
      label: display.title || display.yearLabel || '进入历史节点',
      title: display.title,
      detail: display.summary,
      command
    },
    // normalizeHistoryNode 会在 save 时再次归一化；这里传原始 + 展示字段即可。
    historyNode: {
      id: display.id,
      title: display.title,
      priorFacts: rawNode.priorFacts,
      unresolvedHooks: rawNode.unresolvedHooks,
      participants: rawNode.participants ?? display.participants,
      entryIds: rawNode.entryIds,
      mapBinding: rawNode.mapBinding,
      placeRef: rawNode.placeRef,
      factionRelations: rawNode.factionRelations
    }
  }
}
