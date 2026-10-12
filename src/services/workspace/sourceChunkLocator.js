// Archive offsets refer to normalized source text, measured in JS UTF-16 units.
export function sourceChunkLocator(chunk, sourceId, occurrence = 0) {
  const refs = (chunk?.sourceRefs || []).filter(item => String(item.sourceId) === String(sourceId))
    .sort((a, b) => Number(a.locator?.start || 0) - Number(b.locator?.start || 0))
  const ref = refs[occurrence]
  if (ref?.locator) return { ...ref.locator }
  if (occurrence > 0) return null
  if (String(chunk?.sourceId) === String(sourceId)) return chunk.locator ? { ...chunk.locator } : null
  // Legacy chunks without ownership metadata are already scoped by chunkIds.
  if (!chunk?.sourceId && !chunk?.sourceRefs?.length) return chunk?.locator ? { ...chunk.locator } : null
  return null
}
