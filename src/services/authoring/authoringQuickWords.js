import { getWritingDocumentMarkdown } from '../writing/writingDocumentSchema.js'

const STOP_CHARS = new Set('的了是在把被和与也都就而又这那一个我们你们他们她们它们着过'.split(''))

function text(value) { return String(value || '').trim() }
function list(value) { return Array.isArray(value) ? value : [] }
function unique(values) { return [...new Set(values.map(text).filter((value) => value.length >= 2 && value.length <= 18))] }

function entryTerms(entry) {
  return unique([entry?.name, ...list(entry?.keys), ...list(entry?.keysSecondary)])
}

function excerpt(value, fallback) {
  const normalized = text(value).replace(/\s+/g, ' ')
  return normalized ? (normalized.length > 40 ? `${normalized.slice(0, 40)}…` : normalized) : fallback
}

function extractedTerms(document, occupied = new Set(), limit = 16) {
  const source = getWritingDocumentMarkdown(document)
  const counts = new Map()
  const add = (value, weight = 1) => {
    const normalized = text(value)
    if (normalized.length < 2 || normalized.length > 12 || occupied.has(normalized)) return
    counts.set(normalized, (counts.get(normalized) || 0) + weight)
  }
  for (const match of source.matchAll(/[《「【“]([^》」】”\n]{2,12})[》」】”]/gu)) add(match[1], 4)
  for (const match of source.matchAll(/\b[A-Z][A-Za-z'-]{2,18}\b/g)) add(match[0], 3)
  const runs = source.match(/[\p{Script=Han}]{2,18}/gu) || []
  for (const run of runs) {
    for (const size of [4, 3, 2]) {
      for (let index = 0; index + size <= run.length; index += 1) {
        const term = run.slice(index, index + size)
        if ([...term].some((char) => STOP_CHARS.has(char))) continue
        add(term)
      }
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, limit)
    .map(([value, count]) => ({
      id: `extracted:${value}`,
      text: value,
      label: value,
      sourceKind: 'extracted',
      sourceId: '',
      typeLabel: '正文提取',
      summary: `本章出现 ${count} 次`,
      frequency: count
    }))
}

export function buildAuthoringQuickWordCatalog({ worldbook = null, document = null } = {}) {
  const byText = new Map()
  for (const entry of list(worldbook?.entries)) {
    const sourceKind = entry?.type === 'character' ? 'character' : 'setting'
    for (const term of entryTerms(entry)) {
      if (byText.has(term)) continue
      byText.set(term, {
        id: `${sourceKind}:${entry.id}:${term}`,
        text: term,
        label: term,
        sourceKind,
        sourceId: String(entry.id || ''),
        typeLabel: sourceKind === 'character' ? '角色' : '设定',
        summary: excerpt(entry.content || entry.text, sourceKind === 'character' ? '世界书角色' : '世界书设定')
      })
    }
  }
  const occupied = new Set(byText.keys())
  const extracted = document ? extractedTerms(document, occupied) : []
  const catalog = [...byText.values(), ...extracted]
  return Object.freeze(catalog.map((item) => Object.freeze(item)))
}

export function resolveAuthoringQuickWordSuggestions({
  catalog = [],
  enabledIds = [],
  recentIds = [],
  prefix = '',
  limit = 6
} = {}) {
  const needle = text(prefix)
  if (!needle) return []
  const enabled = new Set(enabledIds.map(String))
  const recentRank = new Map(recentIds.map((id, index) => [String(id), index]))
  return catalog
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => enabled.has(String(item.id)) && item.text !== needle && item.text.startsWith(needle))
    .sort((left, right) => {
      const leftRank = recentRank.get(String(left.item.id))
      const rightRank = recentRank.get(String(right.item.id))
      if (leftRank != null || rightRank != null) {
        if (leftRank == null) return 1
        if (rightRank == null) return -1
        if (leftRank !== rightRank) return leftRank - rightRank
      }
      return left.index - right.index
    })
    .slice(0, Math.max(0, Number(limit) || 0))
    .map(({ item }) => item)
}

export function resolveAuthoringQuickWordPrefix(selection = {}, catalog = [], enabledIds = []) {
  if (selection?.empty !== true) return ''
  const source = String(selection?.currentNodeText || '').slice(0, Math.max(0, Number(selection?.cursorLocalOffset) || 0))
  const tail = source.match(/[\p{L}\p{N}'-]{1,12}$/u)?.[0] || ''
  if (!tail) return ''
  const enabled = new Set(enabledIds.map(String))
  for (let size = Math.min(8, tail.length); size >= 1; size -= 1) {
    const prefix = tail.slice(-size)
    if (catalog.some((item) => enabled.has(String(item.id)) && item.text.startsWith(prefix) && item.text !== prefix)) return prefix
  }
  return ''
}
