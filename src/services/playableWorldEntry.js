import { getItem, removeItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
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
    createdAt: Date.now()
  })
}

export function getPlayableWorldEntryIntent() {
  const intent = getItem(STORAGE_KEYS.PLAYABLE_WORLD_ENTRY_INTENT)
  if (!intent?.worldbookId || !intent?.action?.command) return null
  return intent
}

export function clearPlayableWorldEntryIntent() {
  removeItem(STORAGE_KEYS.PLAYABLE_WORLD_ENTRY_INTENT)
}
