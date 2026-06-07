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

const LORE_CONTEXT_TOP_N = 5
const CONTENT_PREVIEW_CHARS = 50
const NAME_POOL_LIMIT = 40
const CONSTRAINT_LIMIT = 12

const TYPE_TO_NAME_POOL = {
  organization: 'stateNames',
  location:     'burgNames',
}

const STATE_HINT_RE = /国家|王国|帝国|公国|联盟|部落|氏族|宗门|门派|教团|商会|军团|组织|势力|kingdom|empire|duchy|clan|tribe|guild|order|faction|organization/i
const LOCATION_HINT_RE = /城|镇|村|港|关|寨|都|京|郡|县|岛|要塞|堡|学院|基地|前哨|营地|遗迹|废墟|city|town|village|port|fort|fortress|academy|base|outpost|ruin/i
const RIVER_HINT_RE = /河|江|溪|川|水|瀑|湖|river|stream|brook|falls|waterfall|lake/i
const MOUNTAIN_HINT_RE = /山|岭|峰|脊|崖|谷|火山|山脉|mountain|range|peak|ridge|volcano|valley|cliff/i
const VOLCANO_HINT_RE = /火山|volcano/i
const RIDGE_HINT_RE = /脊|洋中脊|ridge/i

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
 *   loreContextBlock: string,
 *   constraints: {
 *     mountains?: Array<{name: string, cells: number[], type: 'range' | 'volcano' | 'ridge'}>,
 *     stateSeeds?: Array<{name: string, centerCell: number, radius: number}>
 *   }
 * }}
 */
export function extractMapSeedsFromWorldbook(worldbook) {
  const empty = { stateNames: [], burgNames: [], riverNames: [], loreContextBlock: '', constraints: {} }
  if (!worldbook || !Array.isArray(worldbook.entries) || worldbook.entries.length === 0) {
    return empty
  }

  const sorted = [...worldbook.entries]
    .filter(e => e && typeof e === 'object')
    .sort((a, b) => {
      const pa = ENTRY_TYPE_PRIORITY[getEntryType(a)] ?? 99
      const pb = ENTRY_TYPE_PRIORITY[getEntryType(b)] ?? 99
      if (pa !== pb) return pa - pb
      return getEntryName(a).localeCompare(getEntryName(b), 'zh-Hans-CN')
    })

  const pools = { stateNames: [], burgNames: [], riverNames: [] }
  const constraints = { mountains: [], stateSeeds: [] }
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
  const compactConstraints = {}
  if (constraints.stateSeeds.length) compactConstraints.stateSeeds = constraints.stateSeeds
  if (constraints.mountains.length) compactConstraints.mountains = constraints.mountains

  return { ...pools, loreContextBlock: buildLoreContextBlock(sorted), constraints: compactConstraints }
}

function resolveNamePool(type, haystack) {
  if (type === 'location') {
    if (RIVER_HINT_RE.test(haystack)) return 'riverNames'
    return 'burgNames'
  }
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
