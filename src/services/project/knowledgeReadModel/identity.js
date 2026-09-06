/**
 * knowledgeReadModel/identity.js — entity identity for the read-only
 * knowledge model (v1).
 *
 * Frozen v1 semantics:
 * - Formal entity identity is {worldbookId, entryId} (place identity v2 keeps
 *   the same pair; map object ids are spatial references only).
 * - Legacy runtime ids (encountered characters, `place:{wb}:{map}:{site}`
 *   strings) are separate namespaces. Aliases resolve ONLY through explicit
 *   mappings carried by the snapshot; same-name never merges identities and
 *   no third location-id scheme is invented.
 * - A ref that names another project is `denied`, not "not found": the
 *   result must not hint at whether such an entity exists elsewhere.
 */

export function worldbookEntityKey(worldbookId, entryId) {
  return `wbentry:${worldbookId}:${entryId}`
}

export function runtimeCharacterKey(projectId, characterId) {
  return `runtime-char:${projectId}:${characterId}`
}

export function geoNodeKey(worldbookId, nodeId) {
  return `geonode:${worldbookId}:${nodeId}`
}

/**
 * Build the explicit alias index from an authorized snapshot. Sources of
 * mappings (all explicit, no name guessing):
 * - location entries: their own name + `aliases` array
 * - geoHistory `placeRefs` + `entryBindings`: the generator's explicit
 *   node→entry binding lets a legacy `place:{wb}:{map}:{site}` id resolve to
 *   the bound narrative identity. No binding → the alias stays unmapped.
 */
export function buildAliasIndex(snapshot) {
  const index = {
    byKey: new Map(),
    nameToKeys: new Map(),
    aliasToKeys: new Map(),
    legacyPlaceToKeys: new Map()
  }
  const worldbookId = snapshot.worldbook.id
  const entries = Array.isArray(snapshot.worldbook.entries) ? snapshot.worldbook.entries : []
  for (const entry of entries) {
    const key = worldbookEntityKey(worldbookId, entry.id)
    index.byKey.set(key, {
      key,
      kind: 'worldbook-entry',
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : '',
      type: entry.type,
      entry
    })
  }
  for (const entry of entries) {
    const key = worldbookEntityKey(worldbookId, entry.id)
    const names = new Set()
    if (typeof entry.name === 'string' && entry.name.trim()) names.add(entry.name.trim())
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : []
    for (const alias of aliases) {
      if (typeof alias === 'string' && alias.trim()) names.add(alias.trim())
    }
    for (const name of names) {
      const bucket = index.nameToKeys.get(name) ?? []
      bucket.push(key)
      index.nameToKeys.set(name, bucket)
    }
  }
  const geoHistory = snapshot.geoHistory
  if (geoHistory && typeof geoHistory === 'object') {
    const bindingsByNode = new Map()
    const entryBindings = Array.isArray(geoHistory.entryBindings) ? geoHistory.entryBindings : []
    for (const binding of entryBindings) {
      if (binding && typeof binding.nodeId === 'string' && Array.isArray(binding.entryIds)) {
        bindingsByNode.set(binding.nodeId, binding.entryIds)
      }
    }
    const placeRefs = Array.isArray(geoHistory.placeRefs) ? geoHistory.placeRefs : []
    for (const placeRef of placeRefs) {
      if (!placeRef || typeof placeRef.placeId !== 'string') continue
      const boundEntryIds = new Set()
      const nodes = Array.isArray(geoHistory.nodes) ? geoHistory.nodes : []
      for (const node of nodes) {
        if (!node || !placeRef.siteId || node.mapBinding?.siteId !== placeRef.siteId) continue
        if (node.placeRef && node.placeRef.placeId !== placeRef.placeId) continue
        for (const entryId of bindingsByNode.get(node.id) ?? []) boundEntryIds.add(entryId)
      }
      if (boundEntryIds.size === 0) continue
      const keys = [...boundEntryIds].map((entryId) => worldbookEntityKey(worldbookId, entryId))
      index.legacyPlaceToKeys.set(placeRef.placeId, keys)
    }
  }
  return index
}

/**
 * Resolve entity refs against the snapshot. Per-ref outcome:
 * - {status:'resolved', key, entity}
 * - {status:'ambiguous', candidates}  (authorized same-name identities; the
 *   caller may disambiguate by id — never merged here)
 * - {status:'unresolved'}             (not present in authorized data)
 * - {status:'denied', reason}         (cross-project; fails closed)
 */
export function resolveEntityRef(ref, snapshot, aliasIndex) {
  if (ref.projectId !== undefined && ref.projectId !== snapshot.project.id) {
    return { status: 'denied', reason: 'cross-project-ref' }
  }
  const worldbookId = snapshot.worldbook.id
  if (ref.kind === 'worldbook-entry') {
    const key = worldbookEntityKey(worldbookId, ref.id)
    const entity = aliasIndex.byKey.get(key)
    if (!entity) return { status: 'unresolved' }
    return { status: 'resolved', key, entity }
  }
  if (ref.kind === 'geo-history-node') {
    const key = geoNodeKey(worldbookId, ref.id)
    const nodes = Array.isArray(snapshot.geoHistory?.nodes) ? snapshot.geoHistory.nodes : []
    const node = nodes.find((item) => item && item.id === ref.id)
    if (!node) return { status: 'unresolved' }
    return {
      status: 'resolved',
      key,
      entity: { key, kind: 'geo-history-node', id: ref.id, node }
    }
  }
  if (ref.kind === 'runtime-character') {
    const key = runtimeCharacterKey(snapshot.project.id, ref.id)
    const characters = Array.isArray(snapshot.runtime?.encounteredCharacters)
      ? snapshot.runtime.encounteredCharacters
      : []
    const character = characters.find((item) => item && item.id === ref.id)
    if (!character) return { status: 'unresolved' }
    return {
      status: 'resolved',
      key,
      entity: { key, kind: 'runtime-character', id: ref.id, character }
    }
  }
  if (ref.kind === 'runtime-place') {
    // Legacy runtime place ids resolve only through the explicit geoHistory
    // chain (placeRef.placeId → node → entryBindings). Unmapped legacy ids
    // are reported as such, never coerced into a new identity.
    const keys = aliasIndex.legacyPlaceToKeys.get(ref.id)
    if (keys && keys.length === 1) {
      const entity = aliasIndex.byKey.get(keys[0])
      if (entity) return { status: 'resolved', key: keys[0], entity }
    }
    if (keys && keys.length > 1) {
      return { status: 'ambiguous', candidates: keys.map((key) => ({ key })) }
    }
    return { status: 'unresolved', reason: 'legacy-alias-unmapped' }
  }
  return { status: 'unresolved' }
}

/**
 * Exact-name lookup used for disambiguation flows only. Returns all
 * authorized keys sharing the name (worldbook entries); runtime characters
 * are a different namespace and are listed separately.
 */
export function findCandidatesByName(name, snapshot, aliasIndex) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) return { entries: [], runtimeCharacters: [] }
  const entries = (aliasIndex.nameToKeys.get(trimmed) ?? []).map((key) => ({
    key,
    kind: 'worldbook-entry',
    id: aliasIndex.byKey.get(key)?.id,
    name: aliasIndex.byKey.get(key)?.name,
    type: aliasIndex.byKey.get(key)?.type
  }))
  const runtimeCharacters = (Array.isArray(snapshot.runtime?.encounteredCharacters)
    ? snapshot.runtime.encounteredCharacters
    : []
  ).filter((character) => character && character.name === trimmed)
    .map((character) => ({
      key: runtimeCharacterKey(snapshot.project.id, character.id),
      kind: 'runtime-character',
      id: character.id,
      name: character.name
    }))
  return { entries, runtimeCharacters }
}

/**
 * Resolve the perspective character ref. A character perspective requires the
 * character to exist inside the authorized snapshot; refs pointing at other
 * projects are denied, unknown ids are unresolved (never "does not exist"
 * beyond this snapshot).
 */
export function resolvePerspectiveCharacter(perspective, snapshot, aliasIndex) {
  if (!perspective || perspective.viewer !== 'character') return { ok: true, character: null }
  const resolution = resolveEntityRef(perspective.characterRef, snapshot, aliasIndex)
  if (resolution.status === 'denied') return { ok: false, reason: resolution.reason }
  if (resolution.status !== 'resolved') return { ok: false, reason: 'perspective-entity-unknown' }
  if (resolution.entity.kind !== 'runtime-character') {
    return { ok: false, reason: 'perspective-entity-unknown' }
  }
  return { ok: true, character: resolution.entity }
}
