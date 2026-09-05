function clean(value) { return String(value || '').trim() }
function list(value) { return Array.isArray(value) ? value : [] }

function nodeText(node) {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  return list(node.content).map(nodeText).join('')
}

function entryTerms(entry) {
  return [...new Set([entry?.name, ...list(entry?.keys), ...list(entry?.keysSecondary)]
    .map(clean).filter((term) => term.length >= 2))]
    .sort((a, b) => b.length - a.length)
}

// 正文提及、取名建条目前的同名检查共用这一条 exact-term owner。
// 这里只返回候选，不替调用方决定“复用还是仍然新建”。
export function findWritingWorldbookEntriesByTerm(value, worldbook) {
  const needle = clean(value).toLocaleLowerCase()
  if (!needle || !worldbook?.id) return []
  return list(worldbook.entries).filter((entry) => (
    entryTerms(entry).some((term) => term.toLocaleLowerCase() === needle)
  ))
}

export function buildWritingWorldbookMentions(document, worldbook, { max = 240 } = {}) {
  if (!document || !worldbook?.id) return []
  const limit = Math.max(0, Number(max) || 0)
  if (!limit) return []
  const mentions = []
  const claimed = new Map()
  // 先在整本世界书范围按词长排序，避免短别名抢占长全称的区间。
  const groupedTerms = new Map()
  list(worldbook.entries).forEach((entry, entryIndex) => {
    for (const term of entryTerms(entry)) {
      const group = groupedTerms.get(term) || { term, entryIndex, entries: [] }
      group.entryIndex = Math.min(group.entryIndex, entryIndex)
      if (!group.entries.some((candidate) => String(candidate?.id) === String(entry?.id))) group.entries.push(entry)
      groupedTerms.set(term, group)
    }
  })
  const terms = [...groupedTerms.values()]
    .sort((left, right) => right.term.length - left.term.length || left.entryIndex - right.entryIndex)
  for (const unit of list(document.content)) {
    for (const node of list(unit?.content)) {
      const nodeId = clean(node?.attrs?.nodeId || node?.attrs?.blockId)
      const content = nodeText(node)
      if (!nodeId || !content) continue
      const occupied = claimed.get(nodeId) || []
      for (const { entries, term } of terms) {
          let cursor = 0
          while (cursor < content.length && mentions.length < limit) {
            const start = content.indexOf(term, cursor)
            if (start < 0) break
            const end = start + term.length
            cursor = end
            if (occupied.some((range) => start < range.end && end > range.start)) continue
            occupied.push({ start, end })
            const entryIds = entries.map((entry) => String(entry.id)).filter(Boolean)
            const unambiguous = entryIds.length === 1
            const entry = entries[0]
            mentions.push({
              id: `${nodeId}:${start}:${entryIds.join('|')}`,
              nodeId,
              start,
              end,
              text: term,
              worldbookId: String(worldbook.id),
              entryId: unambiguous ? entryIds[0] : '',
              entryIds,
              ambiguous: !unambiguous,
              entryType: unambiguous ? clean(entry.type) || 'general' : 'ambiguous',
              label: unambiguous ? clean(entry.name) || term : `${term} · ${entryIds.length} 个匹配`
            })
          }
      }
      claimed.set(nodeId, occupied)
      if (mentions.length >= limit) return mentions
    }
  }
  return mentions
}
