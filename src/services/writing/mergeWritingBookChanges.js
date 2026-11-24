// A page may keep an editor open while another page saves, imports or deletes.
// Compare the page to its own last accepted snapshot. A chapter is an atomic
// record: its Markdown, structured document and revision must move together.
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const byId = records => new Map(records.map(row => [String(row.id), row]))

function mergeRecords(original, edited, latest, update) {
  const before = byId(original), after = byId(edited), current = byId(latest)
  for (const [id, old] of before) {
    const next = after.get(id), fresh = current.get(id)
    if (same(old, next) || same(next, fresh)) continue
    if (!next) {
      if (!same(fresh, old)) return null
      current.delete(id)
    } else if (!update && same(fresh, old)) current.set(id, next)
    else {
      if (!fresh || !update) return null
      const merged = update(old, next, fresh)
      if (!merged) return null
      current.set(id, merged)
    }
  }
  for (const [id, next] of after) {
    if (before.has(id)) continue
    if (current.has(id) && !same(current.get(id), next)) return null
    current.set(id, next)
  }
  const common = id => before.has(id) && after.has(id) && current.has(id)
  const originalOrder = [...before.keys()].filter(common)
  const editedOrder = [...after.keys()].filter(common)
  const latestIds = latest.map(row => String(row.id)).filter(id => current.has(id))
  const latestOrder = latestIds.filter(common)
  if (!same(originalOrder, editedOrder)) {
    if (!same(latestOrder, originalOrder) && !same(latestOrder, editedOrder)) return null
    let offset = 0
    for (let i = 0; i < latestIds.length; i++) if (common(latestIds[i])) latestIds[i] = editedOrder[offset++]
  }
  // Anchor page insertions to their nearest following surviving row.
  const order = [...after.keys()]
  let insertAt = latestIds.length
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    if (!current.has(id)) continue
    const index = latestIds.indexOf(id)
    if (index >= 0) insertAt = index
    else latestIds.splice(insertAt, 0, id)
  }
  return latestIds.map(id => current.get(id))
}

export function mergeWritingBookChanges(original, edited, latest, preserveOutlineBookId = '') {
  return mergeRecords(original, edited, latest, (old, next, fresh) => {
    const chapters = mergeRecords(old.chapters || [], next.chapters || [], fresh.chapters || [])
    if (!chapters) return null
    const result = { ...fresh, chapters }
    for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (key === 'chapters' || key === 'explorationDocuments' || key === 'outlineEdges') continue
      if (key === 'outlineNodes' && String(next.id) !== String(preserveOutlineBookId)) continue
      if (same(old[key], next[key]) || same(next[key], fresh[key])) continue
      if (key !== 'updatedAt' && !same(old[key], fresh[key])) return null
      if (key in next) result[key] = next[key]
      else delete result[key]
    }
    return result
  })
}
