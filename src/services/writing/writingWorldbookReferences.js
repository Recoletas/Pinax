function clean(value) { return String(value || '').trim() }

function revision(value) { return clean(value) }

export function normalizeWritingWorldbookReference(reference) {
  if (!reference || typeof reference !== 'object') return null
  const kind = clean(reference.kind)
  const worldbookId = clean(reference.worldbookId)
  const entryId = clean(reference.entryId)
  if (kind !== 'worldbook-entry' || !worldbookId || !entryId) return null
  return {
    kind,
    worldbookId,
    entryId,
    entryRevision: revision(reference.entryRevision),
    labelSnapshot: clean(reference.labelSnapshot),
    source: clean(reference.source) || 'authoring-setting-inspector'
  }
}

export function normalizeWritingWorldbookReferences(references) {
  const seen = new Set()
  return (Array.isArray(references) ? references : []).map(normalizeWritingWorldbookReference).filter((reference) => {
    if (!reference) return false
    const key = `${reference.worldbookId}:${reference.entryId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function resolveWritingWorldbookReference(reference, worldbook) {
  const normalized = normalizeWritingWorldbookReference(reference)
  if (!normalized) return null
  if (!worldbook || clean(worldbook.id) !== normalized.worldbookId) return { ...normalized, status: 'missing' }
  const entry = (worldbook.entries || []).find((item) => clean(item?.id) === normalized.entryId)
  if (!entry) return { ...normalized, status: 'missing' }
  const currentRevision = revision(entry?.metadata?.updatedAt)
  return {
    ...normalized,
    label: clean(entry.name) || normalized.labelSnapshot || '未命名设定',
    status: normalized.entryRevision && currentRevision && normalized.entryRevision !== currentRevision ? 'stale' : 'resolved',
    entry
  }
}
