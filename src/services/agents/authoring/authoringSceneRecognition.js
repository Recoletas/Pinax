// Local scene suggestions. A mention is a review candidate, not a scene fact.
function terms(entry) {
  return [...new Set([entry?.name,
    ...(Array.isArray(entry?.keys) ? entry.keys : []),
    ...(Array.isArray(entry?.keysSecondary) ? entry.keysSecondary : [])]
    .map(value => String(value || '').trim()).filter(value => value.length >= 2))]
}

export function recognizeAuthoringSceneMentions({ blocks = [], worldbook = null, projection = null } = {}) {
  const entries = (worldbook?.entries || []).filter(entry => ['character', 'location'].includes(entry?.type))
  const owners = new Map()
  for (const entry of entries) for (const term of terms(entry)) {
    const ids = owners.get(term) || new Set()
    ids.add(String(entry.id))
    owners.set(term, ids)
  }
  const alreadyPresent = new Set((projection?.presentCharacters || []).map(person => String(person.id)))
  if (projection?.viewpointCharacter?.id) alreadyPresent.add(String(projection.viewpointCharacter.id))
  const suggestions = []
  for (const entry of entries) {
    const id = String(entry.id || '')
    if (!id || (entry.type === 'character' && alreadyPresent.has(id))
      || (entry.type === 'location' && String(projection?.location?.id || '') === id)) continue
    const matchingTerms = terms(entry).filter(term => owners.get(term)?.size === 1)
    const block = blocks.find(item => matchingTerms.some(term => String(item.text || '').includes(term)))
    if (!block) continue
    const term = matchingTerms.find(value => String(block.text || '').includes(value))
    const source = String(block.text || '')
    const at = source.indexOf(term)
    suggestions.push({
      id, kind: entry.type, name: String(entry.name || term),
      excerpt: source.slice(Math.max(0, at - 24), Math.min(source.length, at + term.length + 24)),
      sourceRef: `worldbook-entry:${id}`
    })
  }
  return suggestions.slice(0, 12)
}
